import * as XLSX from "xlsx";

import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as exportRepo from "../repositories/assessmentExport.repository.js";
import { METOPEN_PERIOD_CLOSED_EXPORT_NOTE } from "../constants/metopenPeriodClose.js";

/**
 * BR-28 (canon §5.7.3) + canon §5.7.4 — Export nilai TA-03A + TA-03B kelas
 * Metopel ke format Template SIA xlsx (mirror layout dari
 * `guide/TemplateNilai-Kelas-JSI60143-SI-KULIAH-A-2026-05-12-15-36-38.xlsx`).
 *
 * Template SIA berisi 7 kolom (A..G: No, NIM, Nama, + 4 kolom skor). Tidak ada
 * kolom tambahan di luar itu (anti-pattern #24); keterangan per baris ditulis
 * sebagai cell comment pada kolom Nama, sesuai opsi canon §5.7.4.
 *
 * Pemetaan slot kolom skor → konfigurasi rubrik periode:
 *  - Presentasi          → CPMK ordinal 1, role supervisor (TA-03A)
 *  - Proposal (konten)   → CPMK ordinal 2, role supervisor (TA-03A)
 *  - Proposal (struktur) → CPMK ordinal 2, role default    (TA-03B)
 *  - Kemampuan merespon  → CPMK ordinal 3, role supervisor (TA-03A)
 *
 * Bobot baris header dan identitas kriteria per kolom dibaca dari
 * `metopen_cpmks` + `metopen_assessment_criterias` periode terkait, bukan dari
 * angka literal dan bukan dari pencocokan substring kode/nama: canon v3.3 §5.7
 * menetapkan komposisi TA-03 konfigurabel oleh Sekdep. Urutan CPMK ditentukan
 * oleh urutan kode (`orderBy code asc`) sehingga pemetaan slot bersifat ordinal.
 * Kalau konfigurasi belum ada, fallback default canon dipakai dan ditandai
 * eksplisit lewat `weightSource` / `criteriaSource` pada hasil service.
 *
 * Sel kosong vs 0: `0` adalah nilai sah di template SIA, jadi komponen yang
 * belum dinilai WAJIB ditulis sebagai sel kosong. Pembedanya adalah keberadaan
 * baris nilai (`ResearchMethodScoreDetail`) dan penanda submit per peran
 * (`supervisorScore` / `lecturerScore`), bukan besar angkanya. Auto-zero BR-28
 * tetap ditulis `0` di semua kolom karena itu nilai sah hasil aturan presensi.
 */

const COLUMNS = Object.freeze({
  PRESENTASI: "presentasi",
  PROPOSAL_KONTEN: "proposalKonten",
  PROPOSAL_STRUKTUR: "proposalStruktur",
  KEMAMPUAN_RESPON: "kemampuanRespon",
});

const SUPERVISOR_ROLE = "supervisor";
const COORDINATOR_ROLE = "default";

/** Label + bobot di sini adalah milik template SIA / canon §5.7.4: label hanya
 * dipakai sebagai teks header, bobot hanya dipakai kalau konfigurasi periode
 * belum tersedia. */
const SIA_SCORE_COLUMNS = Object.freeze([
  {
    key: COLUMNS.PRESENTASI,
    cpmkOrdinal: 0,
    role: SUPERVISOR_ROLE,
    label: "Presentasi",
    defaultWeight: 20,
  },
  {
    key: COLUMNS.PROPOSAL_KONTEN,
    cpmkOrdinal: 1,
    role: SUPERVISOR_ROLE,
    label: "Proposal (konten)",
    defaultWeight: 40,
  },
  {
    key: COLUMNS.PROPOSAL_STRUKTUR,
    cpmkOrdinal: 1,
    role: COORDINATOR_ROLE,
    label: "Proposal (struktur)",
    defaultWeight: 25,
  },
  {
    key: COLUMNS.KEMAMPUAN_RESPON,
    cpmkOrdinal: 2,
    role: SUPERVISOR_ROLE,
    label: "Kemampuan merespon",
    defaultWeight: 15,
  },
]);

const WEIGHT_SOURCE = Object.freeze({
  CONFIG: "config",
  CANON_DEFAULT: "canon-default",
});

const CRITERIA_SOURCE = Object.freeze({
  CONFIG: "config",
  SCORE_DETAIL: "score-detail-cpmk-ordinal",
  UNAVAILABLE: "unavailable",
});

const NAME_COLUMN_INDEX = 2;
const FIRST_DATA_ROW = 9;

function groupKey(cpmkOrdinal, role) {
  return `${cpmkOrdinal}:${role}`;
}

function sumMaxScore(criterias) {
  return criterias.reduce((total, criteria) => total + (criteria.maxScore ?? 0), 0);
}

/**
 * Kelompokkan kriteria per (ordinal CPMK, role). Input sudah terurut menurut
 * kode CPMK sehingga index array = ordinal.
 */
function groupCriteriaByOrdinalAndRole(orderedCpmks) {
  const groups = new Map();
  orderedCpmks.forEach((cpmk, ordinal) => {
    for (const criteria of cpmk.criterias ?? []) {
      const key = groupKey(ordinal, criteria.role);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(criteria);
    }
  });
  return groups;
}

function readConfigCpmks(rubricConfig) {
  return (rubricConfig ?? [])
    .map((cpmk) => ({
      code: cpmk.code,
      criterias: (cpmk.metopenAssessmentCriterias ?? []).map((criteria) => ({
        id: criteria.id,
        name: criteria.name ?? null,
        role: criteria.role,
        maxScore: criteria.maxScore ?? null,
      })),
    }))
    .filter((cpmk) => cpmk.criterias.length > 0);
}

/**
 * Fallback identitas kriteria kalau konfigurasi periode tidak terbaca: pakai
 * kriteria yang menempel pada baris nilai itu sendiri, tetap dengan urutan
 * ordinal kode CPMK (bukan pencocokan substring).
 */
function readCpmksFromScoreDetails(scores) {
  const criteriaById = new Map();
  for (const score of scores ?? []) {
    for (const detail of score.researchMethodScoreDetails ?? []) {
      const criteria = detail?.criteria;
      if (!criteria?.id || criteriaById.has(criteria.id)) continue;
      criteriaById.set(criteria.id, {
        id: criteria.id,
        name: criteria.name ?? null,
        role: criteria.role,
        maxScore: criteria.maxScore ?? null,
        cpmkCode: String(criteria.metopenCpmk?.code ?? ""),
      });
    }
  }

  const byCode = new Map();
  for (const criteria of criteriaById.values()) {
    if (!byCode.has(criteria.cpmkCode)) byCode.set(criteria.cpmkCode, []);
    byCode.get(criteria.cpmkCode).push(criteria);
  }

  return [...byCode.keys()]
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((code) => ({ code, criterias: byCode.get(code) }));
}

/**
 * Rencana kolom skor: bobot header + himpunan criteriaId per kolom, plus label
 * sumber datanya supaya fallback tidak diam-diam.
 */
export function buildColumnPlan({ rubricConfig = [], scores = [] } = {}) {
  const configCpmks = readConfigCpmks(rubricConfig);
  let criteriaSource = CRITERIA_SOURCE.CONFIG;
  let orderedCpmks = configCpmks;

  if (orderedCpmks.length === 0) {
    orderedCpmks = readCpmksFromScoreDetails(scores);
    criteriaSource = orderedCpmks.length > 0
      ? CRITERIA_SOURCE.SCORE_DETAIL
      : CRITERIA_SOURCE.UNAVAILABLE;
  }

  const groups = groupCriteriaByOrdinalAndRole(orderedCpmks);
  const mappedCriteriaIds = new Set();

  const columns = SIA_SCORE_COLUMNS.map((column) => {
    const criterias = groups.get(groupKey(column.cpmkOrdinal, column.role)) ?? [];
    const configuredWeight = sumMaxScore(criterias);
    const hasConfiguredWeight = criterias.length > 0 && configuredWeight > 0;
    for (const criteria of criterias) mappedCriteriaIds.add(criteria.id);

    return {
      key: column.key,
      label: column.label,
      role: column.role,
      cpmkOrdinal: column.cpmkOrdinal,
      criteriaIds: new Set(criterias.map((criteria) => criteria.id)),
      weight: hasConfiguredWeight ? configuredWeight : column.defaultWeight,
      weightSource: hasConfiguredWeight ? WEIGHT_SOURCE.CONFIG : WEIGHT_SOURCE.CANON_DEFAULT,
    };
  });

  const unmappedCriteria = [];
  for (const cpmk of orderedCpmks) {
    for (const criteria of cpmk.criterias) {
      if (!mappedCriteriaIds.has(criteria.id)) {
        unmappedCriteria.push({
          id: criteria.id,
          name: criteria.name,
          role: criteria.role,
          cpmkCode: cpmk.code,
        });
      }
    }
  }

  const criteriaIdToColumnKey = new Map();
  for (const column of columns) {
    for (const criteriaId of column.criteriaIds) {
      criteriaIdToColumnKey.set(criteriaId, column.key);
    }
  }

  const fallbackColumns = columns
    .filter((column) => column.weightSource === WEIGHT_SOURCE.CANON_DEFAULT)
    .map((column) => column.label);

  if (fallbackColumns.length > 0) {
    console.warn(
      "[assessmentExport] Bobot kolom template SIA memakai default canon karena konfigurasi rubrik periode belum lengkap:",
      fallbackColumns.join(", "),
    );
  }
  if (unmappedCriteria.length > 0) {
    console.warn(
      "[assessmentExport] Kriteria rubrik di luar 4 slot template SIA tidak ikut terekspor:",
      unmappedCriteria.map((criteria) => `${criteria.cpmkCode}/${criteria.role}`).join(", "),
    );
  }

  return { columns, criteriaIdToColumnKey, criteriaSource, unmappedCriteria };
}

/**
 * Agregasi skor per kolom. `detailCount` dipakai untuk memisahkan "belum
 * dinilai" (tanpa baris nilai) dari "dinilai nol" (ada baris nilai bernilai 0).
 */
function aggregateColumnScores(scoreRecord, columnPlan) {
  const totals = new Map(
    columnPlan.columns.map((column) => [column.key, { total: 0, detailCount: 0 }]),
  );

  for (const detail of scoreRecord?.researchMethodScoreDetails ?? []) {
    const columnKey = columnPlan.criteriaIdToColumnKey.get(detail?.criteria?.id);
    if (!columnKey) continue;
    const bucket = totals.get(columnKey);
    if (!bucket) continue;
    bucket.total += detail.score ?? 0;
    bucket.detailCount += 1;
  }

  return totals;
}

function isRoleSubmitted(scoreRecord, role) {
  if (!scoreRecord) return false;
  return role === SUPERVISOR_ROLE
    ? scoreRecord.supervisorScore !== null && scoreRecord.supervisorScore !== undefined
    : scoreRecord.lecturerScore !== null && scoreRecord.lecturerScore !== undefined;
}

/**
 * Nilai sel per kolom skor: angka kalau komponennya sudah dinilai, `null`
 * (sel kosong) kalau belum. Auto-zero BR-28 adalah nol sah, bukan sel kosong.
 */
export function resolveScoreCells(scoreRecord, columnPlan) {
  if (scoreRecord?.attendanceAutoZeroedAt || scoreRecord?.periodClosedAt) {
    return columnPlan.columns.map(() => 0);
  }
  if (!scoreRecord) {
    return columnPlan.columns.map(() => null);
  }

  const totals = aggregateColumnScores(scoreRecord, columnPlan);
  return columnPlan.columns.map((column) => {
    const bucket = totals.get(column.key);
    if (bucket && bucket.detailCount > 0) return bucket.total;
    return isRoleSubmitted(scoreRecord, column.role) ? 0 : null;
  });
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function buildRowNote(participant, scoreRecord) {
  const notes = [];

  if (scoreRecord?.periodClosedAt) {
    notes.push(METOPEN_PERIOD_CLOSED_EXPORT_NOTE);
  } else if (scoreRecord?.attendanceAutoZeroedAt) {
    notes.push(
      `Auto-zero presensi Metopel <75% (${formatPercent(participant.attendancePercentage)})`,
    );
  } else if (!scoreRecord && participant.isEligible === false) {
    notes.push(`Belum dinilai, presensi ${formatPercent(participant.attendancePercentage)} (<75%)`);
  }

  if (!participant.inAttendanceImport) {
    notes.push(
      "Tidak ada pada import presensi periode ini; baris ditambahkan dari data nilai TA-03.",
    );
  }

  return notes.length > 0 ? notes.join(" ") : null;
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

/**
 * Daftar peserta export = union peserta import presensi + mahasiswa yang punya
 * ResearchMethodScore pada periode itu. Peserta presensi yang belum dinilai
 * tetap ditampilkan (Koordinator memakai berkas ini untuk melihat siapa yang
 * belum dinilai), dan mahasiswa bernilai yang tidak ada di berkas presensi
 * tidak boleh hilang begitu saja karena nilainya imutabel (BR-21).
 */
export function buildParticipants(attendanceImport, scores) {
  const scoreByStudentId = new Map();
  const scoreByIdentityNumber = new Map();

  for (const score of scores ?? []) {
    // Satu mahasiswa bisa punya >1 thesis. Repository mengurutkan `updatedAt
    // desc`, jadi entri pertama adalah yang terbaru; score finalized menang.
    const studentId = score.thesis?.studentId;
    if (!studentId) continue;
    const existing = scoreByStudentId.get(studentId);
    if (!existing || (!existing.isFinalized && score.isFinalized)) {
      scoreByStudentId.set(studentId, score);
    }
  }
  for (const score of scoreByStudentId.values()) {
    const identityNumber = score.thesis?.student?.user?.identityNumber;
    if (identityNumber) scoreByIdentityNumber.set(identityNumber, score);
  }

  const participants = [];
  const seenStudentIds = new Set();
  const seenIdentityNumbers = new Set();

  for (const record of attendanceImport.records ?? []) {
    const scoreRecord = (record.studentId ? scoreByStudentId.get(record.studentId) : null)
      ?? scoreByIdentityNumber.get(record.identityNumber)
      ?? null;
    participants.push({
      identityNumber: record.identityNumber,
      studentName: record.studentName ?? null,
      attendancePercentage: record.attendancePercentage,
      isEligible: record.isEligible,
      inAttendanceImport: true,
      scoreRecord,
    });
    if (record.studentId) seenStudentIds.add(record.studentId);
    if (record.identityNumber) seenIdentityNumbers.add(record.identityNumber);
  }

  for (const [studentId, score] of scoreByStudentId) {
    if (seenStudentIds.has(studentId)) continue;
    const user = score.thesis?.student?.user ?? null;
    const identityNumber = user?.identityNumber ?? null;
    if (identityNumber && seenIdentityNumbers.has(identityNumber)) continue;
    participants.push({
      identityNumber,
      studentName: user?.fullName ?? null,
      attendancePercentage: null,
      isEligible: null,
      inAttendanceImport: false,
      scoreRecord: score,
    });
    if (identityNumber) seenIdentityNumbers.add(identityNumber);
  }

  participants.sort((a, b) => {
    if (!a.identityNumber) return 1;
    if (!b.identityNumber) return -1;
    return String(a.identityNumber).localeCompare(String(b.identityNumber), "en", {
      numeric: true,
    });
  });

  return participants;
}

function buildWorkbook(attendanceImport, participants, columnPlan) {
  const semesterPart = attendanceImport.semesterLabel
    ? ` - Semester ${attendanceImport.semesterLabel}`
    : "";

  const aoa = [
    ["TEMPLATE NILAI"],
    ["Matakuliah", null, `${attendanceImport.courseName ?? "Metode Penelitian"}${semesterPart}`],
    ["ID Kelas", null, attendanceImport.id],
    ["Nama Kelas", null, attendanceImport.classCode ?? "-"],
    ["Jumlah Peserta", null, `${participants.length} Orang`],
    ["No", "NIM", "Nama", "CPMK 1", "CPMK 2", null, "CPMK 3"],
    [null, null, null, "CP-5 IK05-01", "CP-5 IK05-02", null, "CP-5 IK05-03"],
    [null, null, null, ...columnPlan.columns.map((column) => column.label)],
    [null, null, null, ...columnPlan.columns.map((column) => column.weight)],
  ];

  const notesByRow = new Map();
  participants.forEach((participant, index) => {
    const scoreCells = resolveScoreCells(participant.scoreRecord, columnPlan);
    aoa.push([
      index + 1,
      participant.identityNumber,
      participant.studentName,
      ...scoreCells,
    ]);
    const note = buildRowNote(participant, participant.scoreRecord);
    if (note) notesByRow.set(FIRST_DATA_ROW + index, note);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Keterangan ditulis sebagai cell comment pada kolom Nama, bukan kolom
  // tambahan: template SIA hanya punya kolom A..G (canon §5.7.4).
  for (const [rowIndex, note] of notesByRow) {
    const address = XLSX.utils.encode_cell({ c: NAME_COLUMN_INDEX, r: rowIndex });
    if (!ws[address]) ws[address] = { t: "s", v: "" };
    ws[address].c = [{ a: "NeoCentral", t: note }];
    ws[address].c.hidden = true;
  }

  // Merge cells meniru layout template SIA (7 kolom, A..G).
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

  ws["!cols"] = [
    { wch: 4 },
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];

  const sheetName = sanitizeSheetName(attendanceImport.classCode);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  return workbook;
}

export async function exportMetopenScoresXlsx({
  attendanceImportId = null,
  academicYearId = null,
} = {}) {
  const normalizedAcademicYearId = typeof academicYearId === "string"
    ? academicYearId.trim()
    : "";
  if (!attendanceImportId && !normalizedAcademicYearId) {
    throw new BadRequestError(
      "academicYearId wajib diisi agar export nilai tidak mencampur data lintas periode.",
    );
  }

  const attendanceImport = attendanceImportId
    ? await exportRepo.findAttendanceImportForExport(attendanceImportId)
    : await exportRepo.findLatestAttendanceImportForExport(normalizedAcademicYearId);

  if (!attendanceImport) {
    throw new NotFoundError(
      "Belum ada import presensi Metopel yang dapat dijadikan sumber export nilai TA-03.",
    );
  }
  if (
    normalizedAcademicYearId
    && attendanceImport.academicYearId !== normalizedAcademicYearId
  ) {
    throw new BadRequestError(
      "Import presensi yang dipilih tidak berasal dari periode akademik yang diminta.",
    );
  }

  const [scores, rubricConfig] = await Promise.all([
    exportRepo.findResearchMethodScoresForPeriodExport(attendanceImport.academicYearId),
    exportRepo.findMetopenRubricConfigForExport(attendanceImport.academicYearId),
  ]);

  const columnPlan = buildColumnPlan({ rubricConfig, scores });
  const participants = buildParticipants(attendanceImport, scores);
  const workbook = buildWorkbook(attendanceImport, participants, columnPlan);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `Nilai-TA-03-${sanitizeFileSegment(attendanceImport.classCode || "Metopel")}-${datePart}.xlsx`;

  return {
    buffer,
    filename,
    attendanceImportId: attendanceImport.id,
    academicYearId: attendanceImport.academicYearId,
    classCode: attendanceImport.classCode ?? null,
    totalRows: participants.length,
    attendanceOnlyRows: participants.filter(
      (participant) => participant.inAttendanceImport && !participant.scoreRecord,
    ).length,
    scoreOnlyRows: participants.filter(
      (participant) => !participant.inAttendanceImport,
    ).length,
    criteriaSource: columnPlan.criteriaSource,
    columnWeights: columnPlan.columns.map((column) => ({
      key: column.key,
      label: column.label,
      weight: column.weight,
      weightSource: column.weightSource,
    })),
    unmappedCriteriaCount: columnPlan.unmappedCriteria.length,
  };
}

export const __test = {
  COLUMNS,
  WEIGHT_SOURCE,
  CRITERIA_SOURCE,
  SIA_SCORE_COLUMNS,
  FIRST_DATA_ROW,
  buildColumnPlan,
  resolveScoreCells,
  buildParticipants,
  buildRowNote,
  sanitizeSheetName,
  sanitizeFileSegment,
};
