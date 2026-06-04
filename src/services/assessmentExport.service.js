import * as XLSX from "xlsx";

import { NotFoundError } from "../utils/errors.js";
import * as exportRepo from "../repositories/assessmentExport.repository.js";

/**
 * BR-28 (canon v2.2 §5.7.x) — Export nilai TA-03A + TA-03B kelas Metopel ke
 * format Template SIA xlsx (mirror layout dari
 * `guide/TemplateNilai-Kelas-JSI60143-SI-KULIAH-A-2026-05-12-15-36-38.xlsx`).
 *
 * Mapping bucket → kolom template:
 *  - Presentasi (20)         → TA-03A CPMK-01 role=supervisor
 *  - Proposal (konten) (40)  → TA-03A CPMK-02 role=supervisor
 *  - Proposal (struktur)(25) → TA-03B CPMK-02 role=default (Pengampu Metopen)
 *  - Kemampuan merespon (15) → TA-03A CPMK-03 role=supervisor
 *
 * CPMK code di-resolve via substring "01" / "02" / "03" agar tahan terhadap
 * variasi penamaan dinamis dari `metopenAssessmentAdmin` (admin bebas memilih
 * format "CPMK-01", "CPMK 01", "CP-01", dsb. selama mengandung digit kelompok
 * sesuai PDF panduan).
 */

const BUCKETS = Object.freeze({
  PRESENTASI: "presentasi",
  PROPOSAL_KONTEN: "proposalKonten",
  PROPOSAL_STRUKTUR: "proposalStruktur",
  KEMAMPUAN_RESPON: "kemampuanRespon",
});

const BUCKET_RESOLUTIONS = Object.freeze([
  { bucket: BUCKETS.PRESENTASI, codeSubstring: "01", role: "supervisor" },
  { bucket: BUCKETS.PROPOSAL_KONTEN, codeSubstring: "02", role: "supervisor" },
  { bucket: BUCKETS.PROPOSAL_STRUKTUR, codeSubstring: "02", role: "default" },
  { bucket: BUCKETS.KEMAMPUAN_RESPON, codeSubstring: "03", role: "supervisor" },
]);

const FALLBACK_BUCKETS = () => ({
  [BUCKETS.PRESENTASI]: 0,
  [BUCKETS.PROPOSAL_KONTEN]: 0,
  [BUCKETS.PROPOSAL_STRUKTUR]: 0,
  [BUCKETS.KEMAMPUAN_RESPON]: 0,
});

function classifyDetail(detail) {
  const cpmkCode = String(detail?.criteria?.cpmk?.code ?? "");
  const role = detail?.criteria?.role;
  for (const matcher of BUCKET_RESOLUTIONS) {
    if (role === matcher.role && cpmkCode.includes(matcher.codeSubstring)) {
      return matcher.bucket;
    }
  }
  return null;
}

function aggregateBuckets(scoreRecord) {
  const buckets = FALLBACK_BUCKETS();
  for (const detail of scoreRecord?.researchMethodScoreDetails ?? []) {
    const bucket = classifyDetail(detail);
    if (bucket) buckets[bucket] += detail.score ?? 0;
  }
  return buckets;
}

function emptyBuckets() {
  return {
    [BUCKETS.PRESENTASI]: null,
    [BUCKETS.PROPOSAL_KONTEN]: null,
    [BUCKETS.PROPOSAL_STRUKTUR]: null,
    [BUCKETS.KEMAMPUAN_RESPON]: null,
  };
}

function zeroBuckets() {
  return FALLBACK_BUCKETS();
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function sanitizeSheetName(name) {
  // Excel melarang karakter \ / ? * [ ] : dan membatasi panjang 31 karakter.
  const cleaned = String(name || "Nilai TA-03").replace(/[\\/?*\[\]:]+/g, "-");
  return cleaned.slice(0, 31) || "Nilai TA-03";
}

function sanitizeFileSegment(name) {
  const cleaned = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "Metopel";
}

function buildRowForRecord(index, record, scoreRecord) {
  const isAutoZero = Boolean(scoreRecord?.attendanceAutoZeroedAt);
  let buckets;
  let note = null;

  if (isAutoZero) {
    buckets = zeroBuckets();
    note = `Auto-zero presensi <75% (${formatPercent(record.attendancePercentage)})`;
  } else if (scoreRecord) {
    buckets = aggregateBuckets(scoreRecord);
  } else {
    buckets = emptyBuckets();
    if (record.isEligible === false) {
      note = `Belum dinilai — presensi ${formatPercent(record.attendancePercentage)} (<75%)`;
    }
  }

  return [
    index + 1,
    record.identityNumber,
    record.studentName ?? null,
    buckets[BUCKETS.PRESENTASI],
    buckets[BUCKETS.PROPOSAL_KONTEN],
    buckets[BUCKETS.PROPOSAL_STRUKTUR],
    buckets[BUCKETS.KEMAMPUAN_RESPON],
    note,
  ];
}

function buildWorkbook(attendanceImport, scoreByStudentId) {
  const records = attendanceImport.records ?? [];
  const numStudents = records.length;
  const semesterPart = attendanceImport.semesterLabel
    ? ` - Semester ${attendanceImport.semesterLabel}`
    : "";

  const aoa = [
    ["TEMPLATE NILAI"],
    ["Matakuliah", null, `${attendanceImport.courseName ?? "Metode Penelitian"}${semesterPart}`],
    ["ID Kelas", null, attendanceImport.id],
    ["Nama Kelas", null, attendanceImport.classCode ?? "-"],
    ["Jumlah Peserta", null, `${numStudents} Orang`],
    ["No", "NIM", "Nama", "CPMK 1", "CPMK 2", null, "CPMK 3", "Keterangan"],
    [null, null, null, "CP-5 IK05-01", "CP-5 IK05-02", null, "CP-5 IK05-03", null],
    [null, null, null, "Presentasi", "Proposal (konten)", "Proposal (struktur)", "Kemampuan merespon", null],
    [null, null, null, 20, 40, 25, 15, null],
  ];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const scoreRecord = record.studentId ? scoreByStudentId.get(record.studentId) ?? null : null;
    aoa.push(buildRowForRecord(i, record, scoreRecord));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge cells meniru layout template SIA + tambahan kolom Keterangan (H).
  ws["!merges"] = [
    { s: { c: 0, r: 0 }, e: { c: 7, r: 0 } },
    { s: { c: 2, r: 1 }, e: { c: 7, r: 1 } },
    { s: { c: 2, r: 2 }, e: { c: 7, r: 2 } },
    { s: { c: 2, r: 3 }, e: { c: 7, r: 3 } },
    { s: { c: 2, r: 4 }, e: { c: 7, r: 4 } },
    { s: { c: 0, r: 5 }, e: { c: 0, r: 8 } },
    { s: { c: 1, r: 5 }, e: { c: 1, r: 8 } },
    { s: { c: 2, r: 5 }, e: { c: 2, r: 8 } },
    { s: { c: 4, r: 5 }, e: { c: 5, r: 5 } },
    { s: { c: 4, r: 6 }, e: { c: 5, r: 6 } },
    { s: { c: 7, r: 5 }, e: { c: 7, r: 8 } },
  ];

  ws["!cols"] = [
    { wch: 4 },
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 40 },
  ];

  const sheetName = sanitizeSheetName(attendanceImport.classCode);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  return workbook;
}

function buildScoreIndex(scores) {
  // Multi-thesis fallback: ambil ResearchMethodScore terkini per studentId.
  // Karena `thesisId` unique tetapi 1 mahasiswa boleh punya >1 thesis,
  // utamakan score yang sudah finalize, kemudian yang paling baru di-update
  // (sudah pre-sorted oleh repository via updatedAt desc).
  const byStudent = new Map();
  for (const score of scores) {
    const sid = score.thesis?.studentId;
    if (!sid) continue;
    const existing = byStudent.get(sid);
    if (!existing) {
      byStudent.set(sid, score);
      continue;
    }
    if (!existing.isFinalized && score.isFinalized) {
      byStudent.set(sid, score);
    }
  }
  return byStudent;
}

export async function exportMetopenScoresXlsx({ attendanceImportId = null } = {}) {
  const attendanceImport = attendanceImportId
    ? await exportRepo.findAttendanceImportForExport(attendanceImportId)
    : await exportRepo.findLatestAttendanceImportForExport();

  if (!attendanceImport) {
    throw new NotFoundError(
      "Belum ada import presensi Metopel yang dapat dijadikan sumber export nilai TA-03.",
    );
  }

  const records = attendanceImport.records ?? [];
  const studentIds = [
    ...new Set(records.map((record) => record.studentId).filter(Boolean)),
  ];
  const scores = studentIds.length > 0
    ? await exportRepo.findResearchMethodScoresForStudentExport(studentIds)
    : [];

  const scoreByStudentId = buildScoreIndex(scores);
  const workbook = buildWorkbook(attendanceImport, scoreByStudentId);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `Nilai-TA-03-${sanitizeFileSegment(attendanceImport.classCode || "Metopel")}-${datePart}.xlsx`;

  return {
    buffer,
    filename,
    attendanceImportId: attendanceImport.id,
    classCode: attendanceImport.classCode ?? null,
    totalRows: records.length,
  };
}

export const __test = {
  BUCKETS,
  classifyDetail,
  aggregateBuckets,
  buildRowForRecord,
  buildScoreIndex,
  sanitizeSheetName,
  sanitizeFileSegment,
};
