import * as XLSX from "xlsx";

import prisma from "../../config/prisma.js";
import { ASSESSOR, RESEARCH_METHOD_RESULT } from "../../constants/research-method.js";
import { ROLES } from "../../constants/roles.js";
import { formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";

/**
 * Ekspor Metode Penelitian (plan 10.6: SIA only reads; data leaves NeoCentral as files).
 *
 * 1. Rekap nilai: the SIA score template kept from the old module (7 columns A..G: No, NIM,
 *    Nama + four score columns, a note per row as a comment on the name cell). Score slots map
 *    to the period's criteria by CPMK order (code) and assessor:
 *      Presentasi          → CPMK 1, pembimbing
 *      Proposal (konten)   → CPMK 2, pembimbing
 *      Proposal (struktur) → CPMK 2, koordinator
 *      Kemampuan merespon  → CPMK 3, pembimbing
 *    The header weight is the sum of the slot's criteria max scores (the template default when
 *    the period has none). An empty cell means "not scored yet"; an automatic 0 writes 0.
 * 2. Daftar judul TA yang baru lulus (new): passed, final attempts of the period with the title
 *    and supervisors, for the department to enter into SIA by hand.
 */

const SIA_SCORE_COLUMNS = Object.freeze([
  { key: "presentasi", cpmkOrdinal: 0, party: ASSESSOR.SUPERVISOR, label: "Presentasi", defaultWeight: 20 },
  { key: "proposalKonten", cpmkOrdinal: 1, party: ASSESSOR.SUPERVISOR, label: "Proposal (konten)", defaultWeight: 40 },
  { key: "proposalStruktur", cpmkOrdinal: 1, party: ASSESSOR.COORDINATOR, label: "Proposal (struktur)", defaultWeight: 25 },
  { key: "kemampuanRespon", cpmkOrdinal: 2, party: ASSESSOR.SUPERVISOR, label: "Kemampuan merespon", defaultWeight: 15 },
]);
const NAME_COLUMN_INDEX = 2;
const FIRST_DATA_ROW = 9;

async function findPeriodConfig(academicYearId) {
  const cpmks = await prisma.researchMethodCpmk.findMany({
    where: { academicYearId },
    select: {
      code: true,
      supervisorAssessmentCriterias: { select: { id: true, name: true, maxScore: true } },
      coordinatorAssessmentCriterias: { select: { id: true, name: true, maxScore: true } },
    },
  });
  return cpmks
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map((cpmk) => ({
      code: cpmk.code,
      criterias: [
        ...cpmk.supervisorAssessmentCriterias.map((c) => ({ ...c, party: ASSESSOR.SUPERVISOR })),
        ...cpmk.coordinatorAssessmentCriterias.map((c) => ({ ...c, party: ASSESSOR.COORDINATOR })),
      ],
    }))
    .filter((cpmk) => cpmk.criterias.length > 0);
}

/** Score columns: weight, criteria per column, and what the template cannot hold. */
export function buildColumnPlan(cpmks) {
  const mapped = new Set();
  const columns = SIA_SCORE_COLUMNS.map((column) => {
    const criterias = (cpmks[column.cpmkOrdinal]?.criterias ?? []).filter((c) => c.party === column.party);
    criterias.forEach((c) => mapped.add(c.id));
    const weight = criterias.reduce((sum, c) => sum + c.maxScore, 0);
    return {
      key: column.key,
      label: column.label,
      party: column.party,
      criteriaIds: new Set(criterias.map((c) => c.id)),
      weight: criterias.length > 0 && weight > 0 ? weight : column.defaultWeight,
      weightSource: criterias.length > 0 && weight > 0 ? "config" : "template-default",
    };
  });
  const unmapped = cpmks.flatMap((cpmk) => cpmk.criterias.filter((c) => !mapped.has(c.id)).map((c) => ({ ...c, cpmkCode: cpmk.code })));
  return { columns, unmapped };
}

/** Cell values of one attempt: a number when scored, empty when not yet (0 is a real score). */
export function resolveScoreCells(attempt, plan) {
  if (!attempt) return plan.columns.map(() => null);
  if (attempt.attendanceAutoZeroedAt) return plan.columns.map(() => 0);
  const details = [
    ...(attempt.supervisorDetails ?? []).map((d) => ({ ...d, party: ASSESSOR.SUPERVISOR })),
    ...(attempt.coordinatorDetails ?? []).map((d) => ({ ...d, party: ASSESSOR.COORDINATOR })),
  ];
  return plan.columns.map((column) => {
    const own = details.filter((d) => column.criteriaIds.has(d.assessmentCriteriaId));
    if (own.length > 0) return own.reduce((sum, d) => sum + d.score, 0);
    const submitted = column.party === ASSESSOR.SUPERVISOR ? attempt.supervisorScore != null : attempt.coordinatorScore != null;
    return submitted ? 0 : null;
  });
}

function percent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "-";
}

function rowNote(participant) {
  const notes = [];
  const attempt = participant.attempt;
  if (attempt?.attendanceAutoZeroedAt) notes.push(`Nilai otomatis 0: presensi Metode Penelitian <75% (${percent(participant.attendancePercentage)}).`);
  else if (!attempt?.supervisorScore && !attempt?.coordinatorScore && participant.isEligible === false) {
    notes.push(`Belum dinilai, presensi ${percent(participant.attendancePercentage)} (<75%).`);
  }
  if (!participant.inAttendanceImport) notes.push("Tidak ada pada presensi periode ini; baris ditambahkan dari data penilaian.");
  return notes.length ? notes.join(" ") : null;
}

/** Participants = rows of the attendance import in force + students with an attempt of the period. */
export function buildParticipants(attendanceRecords, attempts) {
  const attemptByStudent = new Map(attempts.map((a) => [a.thesis.studentId, a]));
  const seen = new Set();
  const participants = attendanceRecords.map((record) => {
    const attempt = (record.studentId && attemptByStudent.get(record.studentId))
      || attempts.find((a) => a.thesis.student?.user?.identityNumber === record.identityNumber)
      || null;
    if (attempt) seen.add(attempt.id);
    return {
      identityNumber: record.identityNumber,
      studentName: record.student?.user?.fullName ?? record.rawRow?.studentName ?? null,
      attendancePercentage: record.attendancePercentage,
      isEligible: record.isEligible,
      inAttendanceImport: true,
      attempt,
    };
  });
  for (const attempt of attempts) {
    if (seen.has(attempt.id)) continue;
    participants.push({
      identityNumber: attempt.thesis.student?.user?.identityNumber ?? null,
      studentName: attempt.thesis.student?.user?.fullName ?? null,
      attendancePercentage: null,
      isEligible: null,
      inAttendanceImport: false,
      attempt,
    });
  }
  return participants.sort((a, b) => String(a.identityNumber ?? "~").localeCompare(String(b.identityNumber ?? "~"), "en", { numeric: true }));
}

function sheetName(name, fallback) {
  return String(name || fallback).replace(/[\\/?*[\]:]+/g, "-").slice(0, 31) || fallback;
}

function fileSegment(name) {
  return String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Metode-Penelitian";
}

async function requireYear(academicYearId) {
  if (!academicYearId) throw new BadRequestError("Periode akademik wajib dipilih agar ekspor tidak mencampur data antarperiode.");
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new NotFoundError("Periode akademik tidak ditemukan.");
  return year;
}

/** Rekap nilai Metode Penelitian in the SIA template. */
export async function exportScoreRecap(academicYearId) {
  const year = await requireYear(academicYearId);
  const latest = await prisma.researchMethodAttendanceImport.findFirst({ where: { academicYearId: year.id }, orderBy: { uploadedAt: "desc" } });
  if (!latest) throw new NotFoundError("Belum ada presensi Metode Penelitian periode ini yang dapat dijadikan dasar rekap nilai.");
  const [records, attempts, cpmks] = await Promise.all([
    prisma.researchMethodAttendanceRecord.findMany({
      where: { importId: latest.id },
      include: { student: { select: { user: { select: { fullName: true } } } } },
    }),
    prisma.researchMethodAssessment.findMany({
      where: { academicYearId: year.id },
      include: {
        supervisorDetails: { select: { assessmentCriteriaId: true, score: true } },
        coordinatorDetails: { select: { assessmentCriteriaId: true, score: true } },
        thesis: { select: { studentId: true, student: { select: { user: { select: { fullName: true, identityNumber: true } } } } } },
      },
    }),
    findPeriodConfig(year.id),
  ]);
  const plan = buildColumnPlan(cpmks);
  const participants = buildParticipants(records, attempts);
  const semesterPart = latest.semesterLabel ? ` - Semester ${latest.semesterLabel}` : ` - ${formatAcademicYearLabel(year)}`;
  const aoa = [
    ["TEMPLATE NILAI"],
    ["Matakuliah", null, `${latest.courseName ?? "Metode Penelitian"}${semesterPart}`],
    ["ID Kelas", null, latest.id],
    ["Nama Kelas", null, latest.classCode ?? "-"],
    ["Jumlah Peserta", null, `${participants.length} Orang`],
    ["No", "NIM", "Nama", "CPMK 1", "CPMK 2", null, "CPMK 3"],
    [null, null, null, "CP-5 IK05-01", "CP-5 IK05-02", null, "CP-5 IK05-03"],
    [null, null, null, ...plan.columns.map((c) => c.label)],
    [null, null, null, ...plan.columns.map((c) => c.weight)],
  ];
  const notes = new Map();
  participants.forEach((participant, index) => {
    aoa.push([index + 1, participant.identityNumber, participant.studentName, ...resolveScoreCells(participant.attempt, plan)]);
    const note = rowNote(participant);
    if (note) notes.set(FIRST_DATA_ROW + index, note);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const [row, note] of notes) {
    const address = XLSX.utils.encode_cell({ c: NAME_COLUMN_INDEX, r: row });
    if (!ws[address]) ws[address] = { t: "s", v: "" };
    ws[address].c = [{ a: "NeoCentral", t: note }];
    ws[address].c.hidden = true;
  }
  ws["!merges"] = [
    { s: { c: 0, r: 0 }, e: { c: 6, r: 0 } },
    { s: { c: 2, r: 1 }, e: { c: 6, r: 1 } },
    { s: { c: 2, r: 2 }, e: { c: 6, r: 2 } },
    { s: { c: 2, r: 3 }, e: { c: 6, r: 3 } },
    { s: { c: 2, r: 4 }, e: { c: 6, r: 4 } },
    { s: { c: 0, r: 5 }, e: { c: 0, r: 8 } },
    { s: { c: 1, r: 5 }, e: { c: 1, r: 8 } },
    { s: { c: 2, r: 5 }, e: { c: 2, r: 8 } },
    { s: { c: 4, r: 5 }, e: { c: 5, r: 5 } },
    { s: { c: 4, r: 6 }, e: { c: 5, r: 6 } },
  ];
  ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName(latest.classCode, "Nilai Metode Penelitian"));
  if (plan.unmapped.length) {
    console.warn("[research-method:export] kriteria di luar empat kolom templat SIA tidak ikut terekspor:", plan.unmapped.map((c) => `${c.cpmkCode}/${c.party}`).join(", "));
  }
  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    fileName: `Rekap-Nilai-Metode-Penelitian-${fileSegment(latest.classCode || formatAcademicYearLabel(year))}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    rows: participants.length,
  };
}

/** Daftar judul TA mahasiswa yang lulus Metode Penelitian pada periode itu (for SIA, by hand). */
export async function exportPassedTitles(academicYearId) {
  const year = await requireYear(academicYearId);
  const attempts = await prisma.researchMethodAssessment.findMany({
    where: { academicYearId: year.id, isFinalized: true, result: RESEARCH_METHOD_RESULT.PASSED },
    select: {
      finalScore: true,
      finalizedAt: true,
      thesis: {
        select: {
          title: true,
          student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
          thesisSupervisors: {
            where: { status: "active", role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
            select: { role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } } },
          },
        },
      },
    },
  });
  const rows = attempts
    .map((a) => {
      const by = (role) => a.thesis.thesisSupervisors.find((s) => s.role?.name === role)?.lecturer?.user ?? null;
      const p1 = by(ROLES.PEMBIMBING_1);
      const p2 = by(ROLES.PEMBIMBING_2);
      return {
        nim: a.thesis.student?.user?.identityNumber ?? "-",
        name: a.thesis.student?.user?.fullName ?? "-",
        title: a.thesis.title ?? "-",
        p1: p1?.fullName ?? "-",
        p1Nip: p1?.identityNumber ?? "-",
        p2: p2?.fullName ?? "-",
        p2Nip: p2?.identityNumber ?? "-",
        finalScore: a.finalScore,
        finalizedAt: a.finalizedAt,
      };
    })
    .sort((a, b) => a.nim.localeCompare(b.nim, "en", { numeric: true }));
  const label = formatAcademicYearLabel(year);
  const aoa = [
    [`Daftar Judul Tugas Akhir Lulus Metode Penelitian ${label}`],
    [],
    ["No", "NIM", "Nama", "Judul Tugas Akhir", "Pembimbing 1", "NIP Pembimbing 1", "Pembimbing 2", "NIP Pembimbing 2", "Nilai Akhir", "Tanggal Final"],
    ...rows.map((r, i) => [i + 1, r.nim, r.name, r.title, r.p1, r.p1Nip, r.p2, r.p2Nip, r.finalScore, r.finalizedAt ? r.finalizedAt.toISOString().slice(0, 10) : "-"]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { c: 0, r: 0 }, e: { c: 9, r: 0 } }];
  ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 30 }, { wch: 60 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, "Judul Lulus");
  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    fileName: `Judul-TA-Lulus-Metode-Penelitian-${fileSegment(label)}.xlsx`,
    rows: rows.length,
  };
}
