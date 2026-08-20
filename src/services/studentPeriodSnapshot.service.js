/**
 * Kelengkapan snapshot akademik per periode (`StudentAcademicYearSnapshot`).
 *
 * Sinkronisasi SIA hanya membentuk snapshot untuk periode yang sedang berjalan
 * saat sinkronisasi dijalankan. Kalau periode berganti tanpa sinkronisasi baru,
 * periode aktif berakhir tanpa satu pun snapshot dan seluruh pembaca yang
 * fail-closed (mis. roster Koordinator) ikut kosong. Modul ini menyediakan:
 *
 *  - pembacaan kelengkapan ("N dari M mahasiswa punya snapshot periode ini")
 *  - backfill idempoten dari observasi akademik terakhir di tabel `students`
 *
 * Invariant backfill:
 *  - hanya MENAMBAH baris snapshot yang belum ada, atau mengisi kolom yang masih
 *    NULL pada baris yang sudah ada
 *  - tidak pernah menimpa nilai non-NULL dan tidak pernah menghapus baris
 *  - `null` tidak pernah diartikan `false` (KC-20260731-02)
 *  - tabel `students` tidak disentuh sama sekali
 *
 * Canon ref: §5.1, BR-25, KC-20260731-02.
 */

import { NotFoundError } from "../utils/errors.js";
import {
  formatAcademicYearLabel,
  resolveOperationalAcademicYear,
} from "../helpers/academicYear.helper.js";
import {
  applyPeriodSnapshotBackfill,
  countEligibleSnapshotsForPeriod,
  countSnapshotsForPeriod,
  countStudents,
  countThesisCourseSnapshotsForPeriod,
  findAcademicYearById,
  findSnapshotStatesForPeriod,
  findStudentAcademicObservations,
} from "../repositories/studentPeriodSnapshot.repository.js";

function toPeriodSummary(academicYear) {
  return {
    id: academicYear.id,
    year: academicYear.year,
    semester: academicYear.semester,
    label: formatAcademicYearLabel(academicYear),
    isActive: academicYear.isActive ?? false,
    startDate: academicYear.startDate ?? null,
    endDate: academicYear.endDate ?? null,
  };
}

async function resolvePeriod(academicYearId) {
  if (academicYearId) {
    const academicYear = await findAcademicYearById(academicYearId);
    if (!academicYear) {
      throw new NotFoundError("Tahun ajaran tidak ditemukan.");
    }
    return academicYear;
  }

  const operational = await resolveOperationalAcademicYear();
  if (!operational) {
    throw new NotFoundError("Belum ada tahun ajaran operasional.");
  }
  return operational;
}

function latestDate(...values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => (current > latest ? current : latest));
}

/**
 * Bentuk baris snapshot dari observasi akademik terakhir milik satu mahasiswa.
 * Provenance (`source` + waktu observasi) dibawa apa adanya dari `students`,
 * bukan dikarang ulang sebagai observasi baru.
 *
 * `includeThesisCourse` default `false`. Status KRS Tugas Akhir adalah input
 * lifecycle promosi/pelepasan booking (`syncBookingActivationForStudent`), jadi
 * membawa nilai lama ke periode baru dapat melepas booking mahasiswa yang
 * sebenarnya hanya belum disinkronkan ulang. Dimensi itu hanya ikut kalau
 * operator memintanya secara eksplisit; tanpa itu kolom tetap NULL dan
 * lifecycle tetap fail-closed seperti sebelum backfill.
 */
function buildSnapshotDraft(student, academicYearId, now, { includeThesisCourse }) {
  const hasEligibility = typeof student.eligibleMetopen === "boolean";
  const hasThesisCourse =
    includeThesisCourse && typeof student.takingThesisCourse === "boolean";
  if (!hasEligibility && !hasThesisCourse) return null;

  const eligibilityCapturedAt = hasEligibility
    ? (student.metopenEligibilityUpdatedAt ?? now)
    : null;
  const thesisCourseCapturedAt = hasThesisCourse
    ? (student.thesisCourseEnrollmentUpdatedAt ?? now)
    : null;

  return {
    studentId: student.id,
    academicYearId,
    eligibleMetopen: hasEligibility ? student.eligibleMetopen : null,
    researchMethodCompleted: hasEligibility ? student.researchMethodCompleted : null,
    takingThesisCourse: hasThesisCourse ? student.takingThesisCourse : null,
    eligibilitySource: hasEligibility ? (student.metopenEligibilitySource ?? null) : null,
    eligibilityCapturedAt,
    thesisCourseSource: hasThesisCourse
      ? (student.thesisCourseEnrollmentSource ?? null)
      : null,
    thesisCourseCapturedAt,
    capturedAt: latestDate(eligibilityCapturedAt, thesisCourseCapturedAt) ?? now,
  };
}

/**
 * Patch observasi SIA/devtools ke baris snapshot periode aktif.
 *
 * - `eligibleMetopen`: first-write-wins (KC-20260731-02). Jangan timpa nilai
 *   non-NULL dari observasi kemudian.
 * - `takingThesisCourse`: selalu tulis ulang bila observasi boolean (BR-18 /
 *   KC-20260814-02). Promosi/release membaca kolom snapshot, bukan
 *   `students.takingThesisCourse`. First-write-wins di sini membekukan `false`
 *   dari sync awal dan memutus happy path pasca TA-03.
 *
 * Backfill Admin tetap memakai `buildFillPayload` (isi-NULL saja) supaya
 * kolom `students` yang mungkin stale tidak menimpa observasi SIA hidup.
 */
export function buildRuntimeSnapshotObservationPatch(existing, observation = {}) {
  const data = {};
  const capturedAt = observation.capturedAt ?? new Date();

  if (existing.eligibleMetopen == null && typeof observation.eligibleMetopen === "boolean") {
    data.eligibleMetopen = observation.eligibleMetopen;
    data.researchMethodCompleted = observation.researchMethodCompleted ?? null;
    data.eligibilitySource = observation.eligibilitySource ?? "sia";
    data.eligibilityCapturedAt = observation.eligibilityCapturedAt ?? capturedAt;
  }

  if (typeof observation.takingThesisCourse === "boolean") {
    data.takingThesisCourse = observation.takingThesisCourse;
    data.thesisCourseSource = observation.thesisCourseSource ?? "sia";
    data.thesisCourseCapturedAt = observation.thesisCourseCapturedAt ?? capturedAt;
  }

  if (Object.keys(data).length > 0) {
    data.capturedAt = capturedAt;
  }
  return data;
}

/** Kolom mana pada baris existing yang masih NULL dan bisa diisi dari draft. */
function buildFillPayload(existing, draft) {
  const data = {};
  if (existing.eligibleMetopen == null && typeof draft.eligibleMetopen === "boolean") {
    data.eligibleMetopen = draft.eligibleMetopen;
    data.researchMethodCompleted = draft.researchMethodCompleted;
    data.eligibilitySource = draft.eligibilitySource;
    data.eligibilityCapturedAt = draft.eligibilityCapturedAt;
  }
  if (existing.takingThesisCourse == null && typeof draft.takingThesisCourse === "boolean") {
    data.takingThesisCourse = draft.takingThesisCourse;
    data.thesisCourseSource = draft.thesisCourseSource;
    data.thesisCourseCapturedAt = draft.thesisCourseCapturedAt;
  }
  return data;
}

async function buildBackfillPlan(academicYear, now, { includeThesisCourse = false } = {}) {
  const [students, snapshotStates] = await Promise.all([
    findStudentAcademicObservations(),
    findSnapshotStatesForPeriod(academicYear.id),
  ]);

  const snapshotByStudent = new Map(
    snapshotStates.map((snapshot) => [snapshot.studentId, snapshot]),
  );

  const creates = [];
  const fills = [];
  let observableStudents = 0;
  for (const student of students) {
    const draft = buildSnapshotDraft(student, academicYear.id, now, {
      includeThesisCourse,
    });
    if (!draft) continue;
    observableStudents += 1;

    const existing = snapshotByStudent.get(student.id);
    if (!existing) {
      creates.push(draft);
      continue;
    }

    const data = buildFillPayload(existing, draft);
    if (Object.keys(data).length > 0) {
      fills.push({ id: existing.id, data });
    }
  }

  return { creates, fills, observableStudents };
}

/**
 * Kelengkapan snapshot satu periode untuk permukaan Admin dan status sinkronisasi.
 */
export async function getPeriodSnapshotCoverage(academicYearId = null) {
  const academicYear = await resolvePeriod(academicYearId);
  const now = new Date();

  const [totalStudents, snapshotCount, eligibleCount, thesisCourseCount, plan] =
    await Promise.all([
      countStudents(),
      countSnapshotsForPeriod(academicYear.id),
      countEligibleSnapshotsForPeriod(academicYear.id),
      countThesisCourseSnapshotsForPeriod(academicYear.id),
      buildBackfillPlan(academicYear, now),
    ]);

  return {
    academicYear: toPeriodSummary(academicYear),
    totalStudents,
    studentsWithSnapshot: snapshotCount,
    studentsWithoutSnapshot: Math.max(totalStudents - snapshotCount, 0),
    eligibleMetopenSnapshots: eligibleCount,
    thesisCourseSnapshots: thesisCourseCount,
    observableStudents: plan.observableStudents,
    pendingCreate: plan.creates.length,
    pendingFill: plan.fills.length,
    complete: plan.creates.length === 0 && plan.fills.length === 0,
    coverageLabel: `${snapshotCount} dari ${totalStudents}`,
  };
}

/**
 * Backfill snapshot satu periode dari observasi akademik yang sudah tersimpan.
 * Default dry-run: tanpa `apply: true` tidak ada satu baris pun yang ditulis.
 */
export async function backfillPeriodSnapshots(
  academicYearId = null,
  { apply = false, includeThesisCourse = false } = {},
) {
  const academicYear = await resolvePeriod(academicYearId);
  const now = new Date();

  const before = await countSnapshotsForPeriod(academicYear.id);
  const plan = await buildBackfillPlan(academicYear, now, { includeThesisCourse });

  if (!apply) {
    return {
      academicYear: toPeriodSummary(academicYear),
      applied: false,
      includeThesisCourse,
      snapshotsBefore: before,
      snapshotsAfter: before,
      created: 0,
      filled: 0,
      plannedCreate: plan.creates.length,
      plannedFill: plan.fills.length,
    };
  }

  const result = await applyPeriodSnapshotBackfill({
    creates: plan.creates,
    fills: plan.fills,
  });
  const after = await countSnapshotsForPeriod(academicYear.id);

  return {
    academicYear: toPeriodSummary(academicYear),
    applied: true,
    includeThesisCourse,
    snapshotsBefore: before,
    snapshotsAfter: after,
    created: result.created,
    filled: result.filled,
    plannedCreate: plan.creates.length,
    plannedFill: plan.fills.length,
  };
}
