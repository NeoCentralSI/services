import prisma from "../../config/prisma.js";
import { fetchSemesterEnrollments } from "../sia.client.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { assertSiaConfigured } from "../../helpers/sia-availability.helper.js";

/**
 * Academic flags per student per semester (plan 10.6, K11): whether the student takes Metode
 * Penelitian and whether the student takes Tugas Akhir in that semester. They come from SIA
 * (read only), from the Admin in Data Master → Mahasiswa (Paket P9, K36), or from DevTools, and
 * live in `student_academic_year_snapshots`. A flag the Admin set is never overwritten by the SIA
 * sync; the Admin hands it back to SIA with "Ikuti Data SIA".
 */

/** Value of `ExternalAcademicSnapshotSource`. */
export const ACADEMIC_FLAG_SOURCE = Object.freeze({ SIA: "sia", DEVTOOLS: "devtools", ADMIN: "admin" });

/**
 * Write the semester flags SIA reports for one period (`GET /enrollments` of the dummy-SIA
 * contract: nim, takesResearchMethod, takesThesis). SIA is the authority for the students it
 * lists: their flags are overwritten with source `sia`, except a flag the Admin set by hand
 * (Paket P9, K36: like a manual CPL score). Students SIA does not list keep theirs.
 * @returns {Promise<{ fetched: number, created: number, updated: number, unknownStudents: number, keptAdmin: number }>}
 */
export async function applySiaEnrollments(academicYearId, rows = [], { capturedAt = new Date(), client = prisma } = {}) {
  const valid = rows.filter((r) => r?.nim && (typeof r.takesResearchMethod === "boolean" || typeof r.takesThesis === "boolean"));
  const users = valid.length
    ? await client.user.findMany({ where: { identityNumber: { in: valid.map((r) => String(r.nim)) }, student: { isNot: null } }, select: { id: true, identityNumber: true } })
    : [];
  const userOf = new Map(users.map((u) => [u.identityNumber, u.id]));
  const existing = users.length
    ? await client.studentAcademicYearSnapshot.findMany({
      where: { academicYearId, studentId: { in: users.map((u) => u.id) } },
      select: { studentId: true, eligibilitySource: true, thesisCourseSource: true },
    })
    : [];
  const current = new Map(existing.map((e) => [e.studentId, e]));
  let created = 0;
  let updated = 0;
  let keptAdmin = 0;
  for (const row of valid) {
    const studentId = userOf.get(String(row.nim));
    if (!studentId) continue;
    const had = current.get(studentId);
    const flags = {};
    if (typeof row.takesResearchMethod === "boolean") {
      if (had?.eligibilitySource === ACADEMIC_FLAG_SOURCE.ADMIN) keptAdmin += 1;
      else flags.eligibleResearchMethod = row.takesResearchMethod;
    }
    if (typeof row.takesThesis === "boolean") {
      if (had?.thesisCourseSource === ACADEMIC_FLAG_SOURCE.ADMIN) keptAdmin += 1;
      else flags.takingThesisCourse = row.takesThesis;
    }
    if (Object.keys(flags).length === 0) continue;
    await setStudentPeriodFlags(studentId, academicYearId, flags, { source: ACADEMIC_FLAG_SOURCE.SIA, client, now: capturedAt });
    if (had) updated += 1;
    else created += 1;
  }
  return { fetched: rows.length, created, updated, unknownStudents: valid.length - users.length, keptAdmin };
}

/** The flags of one student in one semester (null fields when unknown). */
export async function getStudentPeriodFlags(studentId, academicYearId, { client = prisma } = {}) {
  if (!studentId || !academicYearId) return null;
  return client.studentAcademicYearSnapshot.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });
}

/**
 * Set flags of one student in one semester explicitly (DevTools, or a SIA read that is the
 * authority for that semester). Fields left undefined are not touched; null clears a flag.
 */
export async function setStudentPeriodFlags(
  studentId,
  academicYearId,
  { eligibleResearchMethod, takingThesisCourse } = {},
  { source = ACADEMIC_FLAG_SOURCE.DEVTOOLS, client = prisma, now = new Date() } = {},
) {
  const data = { capturedAt: now };
  if (eligibleResearchMethod !== undefined) {
    data.eligibleResearchMethod = eligibleResearchMethod;
    data.eligibilitySource = eligibleResearchMethod === null ? null : source;
    data.eligibilityCapturedAt = eligibleResearchMethod === null ? null : now;
  }
  if (takingThesisCourse !== undefined) {
    data.takingThesisCourse = takingThesisCourse;
    data.thesisCourseSource = takingThesisCourse === null ? null : source;
    data.thesisCourseCapturedAt = takingThesisCourse === null ? null : now;
  }
  return client.studentAcademicYearSnapshot.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    create: { studentId, academicYearId, ...data },
    update: data,
  });
}

/**
 * How many students have semester flags for an academic year (shown with the SIA sync status).
 * Defaults to the operational academic year.
 */
export async function getPeriodFlagCoverage(academicYearId = null, { client = prisma } = {}) {
  const academicYear = academicYearId
    ? await client.academicYear.findUnique({ where: { id: academicYearId } })
    : await client.academicYear.findFirst({ where: { isActive: true } });
  if (!academicYear) return null;
  const [totalStudents, withFlags, takingResearchMethod, takingThesisCourse] = await Promise.all([
    client.student.count(),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id } }),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id, eligibleResearchMethod: true } }),
    client.studentAcademicYearSnapshot.count({ where: { academicYearId: academicYear.id, takingThesisCourse: true } }),
  ]);
  return {
    academicYear: { id: academicYear.id, semester: academicYear.semester, year: academicYear.year },
    totalStudents,
    studentsWithFlags: withFlags,
    studentsWithoutFlags: Math.max(totalStudents - withFlags, 0),
    takingResearchMethod,
    takingThesisCourse,
  };
}

/**
 * Flags of the running semester for one student, for the user profile and the sidebar.
 * @returns {Promise<{ eligibleResearchMethod: boolean|null, takingThesisCourse: boolean|null }>}
 */
export async function getCurrentStudentFlags(studentId, { client = prisma } = {}) {
  const active = await client.academicYear.findFirst({ where: { isActive: true }, select: { id: true } });
  const row = active ? await getStudentPeriodFlags(studentId, active.id, { client }) : null;
  return {
    eligibleResearchMethod: row?.eligibleResearchMethod ?? null,
    takingThesisCourse: row?.takingThesisCourse ?? null,
  };
}

const FLAG_FIELDS = Object.freeze({
  eligibleResearchMethod: { source: "eligibilitySource", sia: "takesResearchMethod", label: "Mengambil Metode Penelitian" },
  takingThesisCourse: { source: "thesisCourseSource", sia: "takesThesis", label: "Mengambil Tugas Akhir" },
});

async function requireStudentAndYear(studentId, academicYearId, client) {
  const [student, year] = await Promise.all([
    client.student.findUnique({ where: { id: studentId }, select: { id: true, user: { select: { identityNumber: true } } } }),
    client.academicYear.findUnique({ where: { id: academicYearId } }),
  ]);
  if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan.");
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  return { student, year };
}

/**
 * Paket P9 (K36): the Admin sets "Mengambil Metode Penelitian" and/or "Mengambil Tugas Akhir" of
 * one semester in Data Master → Mahasiswa. Source `admin`, so the SIA sync keeps them. null
 * clears a flag (and its source).
 */
export async function setAdminPeriodFlags(studentId, academicYearId, input = {}, { client = prisma, now = new Date() } = {}) {
  const flags = {};
  for (const [field, meta] of Object.entries(FLAG_FIELDS)) {
    if (input[field] === undefined) continue;
    if (input[field] !== null && typeof input[field] !== "boolean") throw new BadRequestError(`${meta.label} harus Ya, Tidak, atau kosong.`);
    flags[field] = input[field];
  }
  if (Object.keys(flags).length === 0) throw new BadRequestError("Isi Mengambil Metode Penelitian dan/atau Mengambil Tugas Akhir.");
  await requireStudentAndYear(studentId, academicYearId, client);
  return setStudentPeriodFlags(studentId, academicYearId, flags, { source: ACADEMIC_FLAG_SOURCE.ADMIN, client, now });
}

/**
 * "Ikuti Data SIA" (Paket P9, K36): the flags of one semester follow SIA again. SIA is read now;
 * when it lists the student for that semester its values are written with source `sia`. When it
 * does not, the Admin's values stay but lose source `admin`, so the next sync may overwrite them.
 * @returns {Promise<{ snapshot: object|null, fromSia: boolean }>}
 */
export async function followSiaPeriodFlags(studentId, academicYearId, { client = prisma, now = new Date(), fetchEnrollments = fetchSemesterEnrollments, env = process.env } = {}) {
  // Paket P9: refused with "Sinkronisasi SIA belum tersedia." while SIA_BASE_URL is empty.
  assertSiaConfigured(env);
  const { student, year } = await requireStudentAndYear(studentId, academicYearId, client);
  let rows;
  try {
    rows = await fetchEnrollments({ academicYear: year.year, semester: year.semester });
  } catch {
    rows = null;
  }
  const row = (rows ?? []).find((r) => String(r?.nim) === String(student.user?.identityNumber));
  if (row) {
    const flags = {};
    for (const [field, meta] of Object.entries(FLAG_FIELDS)) {
      if (typeof row[meta.sia] === "boolean") flags[field] = row[meta.sia];
    }
    if (Object.keys(flags).length > 0) {
      const snapshot = await setStudentPeriodFlags(studentId, academicYearId, flags, { source: ACADEMIC_FLAG_SOURCE.SIA, client, now });
      return { snapshot, fromSia: true };
    }
  }
  const existing = await getStudentPeriodFlags(studentId, academicYearId, { client });
  if (!existing) return { snapshot: null, fromSia: false };
  const data = {};
  for (const meta of Object.values(FLAG_FIELDS)) {
    if (existing[meta.source] === ACADEMIC_FLAG_SOURCE.ADMIN) data[meta.source] = ACADEMIC_FLAG_SOURCE.SIA;
  }
  const snapshot = Object.keys(data).length
    ? await client.studentAcademicYearSnapshot.update({ where: { id: existing.id }, data })
    : existing;
  return { snapshot, fromSia: false };
}

