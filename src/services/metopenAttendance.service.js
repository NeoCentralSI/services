import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";

import { BadRequestError, ForbiddenError } from "../utils/errors.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import * as repo from "../repositories/metopenAttendance.repository.js";

export const METOPEN_ATTENDANCE_THRESHOLD = 0.75;
export const METOPEN_ATTENDANCE_AUTO_ZERO_REASON =
  "Presensi Metopel kurang dari 75%; nilai TA-03A dan TA-03B otomatis 0 tanpa review proposal.";

const DOCUMENT_TYPE_NAME = "Presensi Metode Penelitian";
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "metopen", "attendance");

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeIdentity(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function sanitizeFileName(fileName) {
  const parsed = path.parse(fileName || "presensi-metopel.xlsx");
  const base = parsed.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "presensi-metopel";
  const ext = [".xlsx", ".xls"].includes(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : ".xlsx";
  return `${base}${ext}`;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value).replace(",", ".").replace(/[^0-9.-]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parsePercentage(value, presentCount, totalMeetings) {
  if (value == null || value === "") {
    return totalMeetings > 0 ? presentCount / totalMeetings : 0;
  }

  const numeric = toNumber(value, NaN);
  if (!Number.isFinite(numeric)) {
    return totalMeetings > 0 ? presentCount / totalMeetings : 0;
  }

  return numeric > 1 ? numeric / 100 : numeric;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const labels = row.map(normalizeText);
    const hasIdentity = labels.some((label) => label.includes("nim") || label.includes("bp"));
    const hasPresent = labels.some((label) => label === "hadir");
    const hasPercentage = labels.some((label) => label.includes("persentase") && label.includes("hadir"));
    return hasIdentity && hasPresent && hasPercentage;
  });
}

function findColumn(headers, predicate) {
  return headers.findIndex((header) => predicate(normalizeText(header)));
}

function buildColumnMap(headerRow) {
  const map = {
    identityNumber: findColumn(headerRow, (label) => label.includes("nim") || label.includes("bp")),
    studentName: findColumn(headerRow, (label) => label.includes("nama") && label.includes("mahasiswa")),
    presentCount: findColumn(headerRow, (label) => label === "hadir"),
    absentCount: findColumn(headerRow, (label) => label === "alpa"),
    sickCount: findColumn(headerRow, (label) => label === "sakit"),
    permitCount: findColumn(headerRow, (label) => label === "izin"),
    totalMeetings: findColumn(headerRow, (label) => label === "total"),
    attendancePercentage: findColumn(headerRow, (label) => label.includes("persentase") && label.includes("hadir")),
  };

  if (map.identityNumber < 0 || map.studentName < 0 || map.presentCount < 0 || map.attendancePercentage < 0) {
    throw new BadRequestError(
      "Format presensi tidak dikenali. Header wajib memuat NIM / BP, Nama Mahasiswa, Hadir, dan Persentase Hadir.",
    );
  }

  return map;
}

function getCell(row, index) {
  return index >= 0 ? row[index] : null;
}

function extractMetadataValue(rows, label) {
  const normalizedLabel = normalizeText(label);
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = String(row[i] ?? "").trim();
      const normalizedCell = normalizeText(cell);
      if (!normalizedCell.startsWith(normalizedLabel)) continue;

      const colonValue = cell.includes(":") ? cell.split(":").slice(1).join(":").trim() : "";
      if (colonValue) return colonValue;

      for (let j = i + 1; j < row.length; j += 1) {
        const next = String(row[j] ?? "").trim();
        if (next && next !== ":") return next;
      }
    }
  }
  return null;
}

function extractLecturerNames(rows) {
  const value = extractMetadataValue(rows, "Dosen");
  if (!value) return null;
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseMetopenAttendanceWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new BadRequestError("File presensi tidak memiliki sheet");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    throw new BadRequestError(
      "Header presensi tidak ditemukan. Pastikan file memakai format report peserta kelas Metopel.",
    );
  }

  const metadataRows = rows.slice(0, headerIndex);
  const headerRow = rows[headerIndex];
  const columns = buildColumnMap(headerRow);
  const seenIdentities = new Set();

  const records = rows.slice(headerIndex + 1).flatMap((row) => {
    const identityNumber = normalizeIdentity(getCell(row, columns.identityNumber));
    if (!identityNumber || seenIdentities.has(identityNumber)) return [];
    seenIdentities.add(identityNumber);

    const studentName = String(getCell(row, columns.studentName) ?? "").trim() || null;
    const presentCount = Math.max(0, Math.round(toNumber(getCell(row, columns.presentCount))));
    const absentCount = Math.max(0, Math.round(toNumber(getCell(row, columns.absentCount))));
    const sickCount = Math.max(0, Math.round(toNumber(getCell(row, columns.sickCount))));
    const permitCount = Math.max(0, Math.round(toNumber(getCell(row, columns.permitCount))));
    const explicitTotal = Math.round(toNumber(getCell(row, columns.totalMeetings), NaN));
    const totalMeetings = Number.isFinite(explicitTotal)
      ? Math.max(0, explicitTotal)
      : presentCount + absentCount + sickCount + permitCount;
    const attendancePercentage = parsePercentage(
      getCell(row, columns.attendancePercentage),
      presentCount,
      totalMeetings,
    );

    return [{
      identityNumber,
      studentName,
      presentCount,
      absentCount,
      sickCount,
      permitCount,
      totalMeetings,
      attendancePercentage,
      isEligible: attendancePercentage >= METOPEN_ATTENDANCE_THRESHOLD,
      rawRow: {
        identityNumber,
        studentName,
        presentCount,
        absentCount,
        sickCount,
        permitCount,
        totalMeetings,
        attendancePercentage,
      },
    }];
  });

  if (records.length === 0) {
    throw new BadRequestError("Tidak ada baris mahasiswa yang dapat dibaca dari file presensi");
  }

  return {
    metadata: {
      sheetName,
      classCode: extractMetadataValue(metadataRows, "Kelas"),
      courseName: extractMetadataValue(metadataRows, "Matakuliah"),
      semesterLabel: extractMetadataValue(metadataRows, "Semester"),
      filterLabel: extractMetadataValue(metadataRows, "Filter Jenis"),
      lecturerNames: extractLecturerNames(metadataRows),
    },
    records,
  };
}

async function persistAttendanceFile(file, importId) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const fileName = `${importId}-${sanitizeFileName(file.originalname)}`;
  const absolutePath = path.join(UPLOAD_DIR, fileName);
  await fs.writeFile(absolutePath, file.buffer);

  return {
    fileName,
    filePath: path.join("uploads", "metopen", "attendance", fileName).replace(/\\/g, "/"),
    fileSize: file.size ?? file.buffer.length,
    mimeType: file.mimetype,
    fileHash: crypto.createHash("sha256").update(file.buffer).digest("hex"),
  };
}

function serializeAttendanceRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    studentId: record.studentId ?? null,
    identityNumber: record.identityNumber,
    studentName: record.studentName,
    presentCount: record.presentCount,
    absentCount: record.absentCount,
    sickCount: record.sickCount,
    permitCount: record.permitCount,
    totalMeetings: record.totalMeetings,
    attendancePercentage: record.attendancePercentage,
    isEligible: record.isEligible,
  };
}

function serializeAttendanceImport(attendanceImport) {
  if (!attendanceImport) return null;
  return {
    id: attendanceImport.id,
    academicYearId: attendanceImport.academicYearId,
    documentId: attendanceImport.documentId,
    classCode: attendanceImport.classCode,
    courseName: attendanceImport.courseName,
    semesterLabel: attendanceImport.semesterLabel,
    filterLabel: attendanceImport.filterLabel,
    lecturerNames: attendanceImport.lecturerNames,
    thresholdPercent: attendanceImport.thresholdPercent,
    totalRows: attendanceImport.totalRows,
    matchedRows: attendanceImport.matchedRows,
    eligibleRows: attendanceImport.eligibleRows,
    ineligibleRows: attendanceImport.ineligibleRows,
    autoZeroedCount: attendanceImport.autoZeroedCount,
    skippedFinalizedCount: attendanceImport.skippedFinalizedCount,
    uploadedAt: attendanceImport.uploadedAt,
    document: attendanceImport.document ?? null,
    uploadedBy: attendanceImport.uploadedBy ?? null,
    ineligibleSamples: (attendanceImport.records ?? []).map(serializeAttendanceRecord),
  };
}

function buildEligibilityPayload(status, { record = null, attendanceImport = null, message }) {
  return {
    status,
    isEligible: status === "eligible",
    thresholdPercent: attendanceImport?.thresholdPercent ?? METOPEN_ATTENDANCE_THRESHOLD,
    attendancePercentage: record?.attendancePercentage ?? null,
    presentCount: record?.presentCount ?? null,
    totalMeetings: record?.totalMeetings ?? null,
    import: attendanceImport ? serializeAttendanceImport({ ...attendanceImport, records: [] }) : null,
    record: serializeAttendanceRecord(record),
    message,
  };
}

export async function getLatestMetopenAttendanceImport() {
  const attendanceImport = await repo.findLatestAttendanceImport();
  return serializeAttendanceImport(attendanceImport);
}

export async function getAttendanceEligibilityForThesis(thesisId) {
  const attendanceImport = await repo.findLatestAttendanceImport();
  if (!attendanceImport) {
    return buildEligibilityPayload("missing_import", {
      message: "Dokumen presensi Metopel belum diunggah. Penilaian TA-03A dan TA-03B dikunci sampai presensi tersedia.",
    });
  }

  const record = await repo.findAttendanceRecordForThesis(attendanceImport.id, thesisId);
  if (!record) {
    return buildEligibilityPayload("not_found", {
      attendanceImport,
      message: "Mahasiswa tidak ditemukan pada dokumen presensi Metopel terbaru.",
    });
  }

  return buildEligibilityPayload(record.isEligible ? "eligible" : "ineligible", {
    record,
    attendanceImport: record.import,
    message: record.isEligible
      ? "Mahasiswa memenuhi syarat presensi Metopel minimal 75%."
      : METOPEN_ATTENDANCE_AUTO_ZERO_REASON,
  });
}

export async function applyAttendanceAutoZeroForThesis(thesisId, actorUserId, attendanceRecordId, options = {}) {
  const result = await repo.autoZeroResearchMethodScore({
    thesisId,
    actorUserId,
    attendanceRecordId,
    reason: METOPEN_ATTENDANCE_AUTO_ZERO_REASON,
    skipFinalized: Boolean(options.skipFinalized),
  });

  if (result.blockedFinalized) {
    throw new ForbiddenError(
      "Penilaian TA-03 sudah final sebelum presensi terbaru diproses. Auto-zero tidak diterapkan otomatis pada nilai final.",
    );
  }

  return result;
}

export async function assertAttendanceEligibleForManualReview(thesisId, actorUserId) {
  const eligibility = await getAttendanceEligibilityForThesis(thesisId);

  if (eligibility.status === "missing_import" || eligibility.status === "not_found") {
    throw new BadRequestError(eligibility.message);
  }

  if (eligibility.status === "ineligible") {
    const result = await applyAttendanceAutoZeroForThesis(
      thesisId,
      actorUserId,
      eligibility.record.id,
    );
    return { allowed: false, eligibility, scoreRecord: result.scoreRecord };
  }

  return { allowed: true, eligibility, scoreRecord: null };
}

async function findScoreableThesesForAttendanceRecords(records) {
  const studentIds = [...new Set(records.map((record) => record.studentId).filter(Boolean))];
  if (studentIds.length === 0) return [];
  return repo.findScoreableThesesByStudentIds(studentIds, CLOSED_THESIS_STATUSES);
}

/**
 * F-4.2 — Dry-run preview presensi sebelum commit. Auto-zero presensi <75%
 * bersifat PERMANEN (canon §5.7.3, BR-28) dan menghapus rubrik TA-03A/B, jadi
 * Koordinator wajib diberi pratinjau daftar mahasiswa yang AKAN di-auto-zero
 * sebelum benar-benar memproses file. Fungsi ini TIDAK menulis apa pun ke DB.
 */
export async function previewMetopenAttendance(file) {
  if (!file?.buffer) {
    throw new BadRequestError("File presensi wajib diunggah");
  }

  const parsed = parseMetopenAttendanceWorkbook(file.buffer);
  const identityNumbers = parsed.records.map((record) => record.identityNumber);
  const students = await repo.findStudentsByIdentityNumbers(identityNumbers);
  const studentByIdentity = new Map(students.map((student) => [student.user.identityNumber, student]));

  const records = parsed.records.map((record) => {
    const student = studentByIdentity.get(record.identityNumber);
    return {
      ...record,
      studentId: student?.id ?? null,
      studentName: record.studentName ?? student?.user?.fullName ?? null,
    };
  });

  const matchedRows = records.filter((record) => record.studentId != null).length;
  const eligibleRows = records.filter((record) => record.isEligible).length;
  const ineligibleRows = records.length - eligibleRows;

  // Hitung dampak nyata auto-zero: hanya mahasiswa <75% yang punya thesis
  // scoreable (belum ditutup). Yang skornya sudah final akan di-skip (BR-21).
  const ineligibleMatched = records.filter((record) => !record.isEligible && record.studentId != null);
  const theses = await findScoreableThesesForAttendanceRecords(ineligibleMatched);
  const thesisByStudentId = new Map(theses.map((thesis) => [thesis.studentId, thesis]));

  const willAutoZero = [];
  const willSkipFinalized = [];
  for (const record of ineligibleMatched) {
    const thesis = thesisByStudentId.get(record.studentId);
    if (!thesis) continue; // tidak ada thesis scoreable → tidak ada yang di-zero
    const score = thesis.researchMethodScores?.[0];
    const target = {
      identityNumber: record.identityNumber,
      studentName: record.studentName,
      attendancePercentage: record.attendancePercentage,
      thesisTitle: thesis.title ?? null,
    };
    if (score?.isFinalized) {
      willSkipFinalized.push(target);
    } else {
      willAutoZero.push(target);
    }
  }

  return {
    metadata: parsed.metadata,
    thresholdPercent: METOPEN_ATTENDANCE_THRESHOLD,
    totals: {
      totalRows: records.length,
      matchedRows,
      unmatchedRows: records.length - matchedRows,
      eligibleRows,
      ineligibleRows,
      willAutoZeroCount: willAutoZero.length,
      willSkipFinalizedCount: willSkipFinalized.length,
    },
    willAutoZero,
    willSkipFinalized,
    unmatchedRows: records
      .filter((record) => record.studentId == null)
      .map((record) => ({
        identityNumber: record.identityNumber,
        studentName: record.studentName,
        attendancePercentage: record.attendancePercentage,
      })),
  };
}

export async function uploadMetopenAttendance(file, actorUserId, options = {}) {
  if (!file?.buffer) {
    throw new BadRequestError("File presensi wajib diunggah");
  }

  const parsed = parseMetopenAttendanceWorkbook(file.buffer);
  const importId = crypto.randomUUID();
  const storedFile = await persistAttendanceFile(file, importId);
  const identityNumbers = parsed.records.map((record) => record.identityNumber);
  const students = await repo.findStudentsByIdentityNumbers(identityNumbers);
  const studentByIdentity = new Map(students.map((student) => [student.user.identityNumber, student]));

  const records = parsed.records.map((record) => {
    const student = studentByIdentity.get(record.identityNumber);
    return {
      id: crypto.randomUUID(),
      importId,
      studentId: student?.id ?? null,
      identityNumber: record.identityNumber,
      studentName: record.studentName ?? student?.user?.fullName ?? null,
      presentCount: record.presentCount,
      absentCount: record.absentCount,
      sickCount: record.sickCount,
      permitCount: record.permitCount,
      totalMeetings: record.totalMeetings,
      attendancePercentage: record.attendancePercentage,
      isEligible: record.isEligible,
      rawRow: record.rawRow,
    };
  });

  const matchedRows = records.filter((record) => record.studentId != null).length;
  const eligibleRows = records.filter((record) => record.isEligible).length;
  const ineligibleRows = records.length - eligibleRows;
  const academicYearId = typeof options.academicYearId === "string" && options.academicYearId.trim()
    ? options.academicYearId.trim()
    : null;

  const created = await repo.createAttendanceImportWithRecords({
    documentTypeName: DOCUMENT_TYPE_NAME,
    documentData: {
      userId: actorUserId,
      filePath: storedFile.filePath,
      fileName: storedFile.fileName,
      fileSize: storedFile.fileSize,
      mimeType: storedFile.mimeType,
      fileHash: storedFile.fileHash,
    },
    importData: {
      id: importId,
      academicYearId,
      uploadedByUserId: actorUserId,
      classCode: parsed.metadata.classCode,
      courseName: parsed.metadata.courseName,
      semesterLabel: parsed.metadata.semesterLabel,
      filterLabel: parsed.metadata.filterLabel,
      lecturerNames: parsed.metadata.lecturerNames,
      thresholdPercent: METOPEN_ATTENDANCE_THRESHOLD,
      totalRows: records.length,
      matchedRows,
      eligibleRows,
      ineligibleRows,
    },
    records,
  });

  const ineligibleRecords = await repo.findIneligibleRecordsForImport(importId);
  const theses = await findScoreableThesesForAttendanceRecords(ineligibleRecords);
  const ineligibleByStudentId = new Map(ineligibleRecords.map((record) => [record.studentId, record]));

  const autoZeroedTheses = [];
  let skippedFinalizedCount = 0;
  for (const thesis of theses) {
    const attendanceRecord = ineligibleByStudentId.get(thesis.studentId);
    if (!attendanceRecord) continue;

    const result = await applyAttendanceAutoZeroForThesis(
      thesis.id,
      actorUserId,
      attendanceRecord.id,
      { skipFinalized: true },
    );
    if (result.skipped) {
      skippedFinalizedCount += 1;
      continue;
    }
    autoZeroedTheses.push({
      thesisId: thesis.id,
      thesisTitle: thesis.title,
      studentId: thesis.studentId,
      identityNumber: attendanceRecord.identityNumber,
      studentName: attendanceRecord.studentName,
      attendancePercentage: attendanceRecord.attendancePercentage,
    });
  }

  const eligibleRecords = await repo.findEligibleRecordsForImport(importId);
  const eligibleTheses = await findScoreableThesesForAttendanceRecords(eligibleRecords);
  const eligibleByStudentId = new Map(eligibleRecords.map((record) => [record.studentId, record]));
  const autoZeroClearItems = eligibleTheses.flatMap((thesis) => {
    const score = thesis.researchMethodScores?.[0];
    const attendanceRecord = eligibleByStudentId.get(thesis.studentId);
    if (!attendanceRecord || !score?.attendanceAutoZeroedAt) return [];

    return [{
      thesisId: thesis.id,
      attendanceRecordId: attendanceRecord.id,
    }];
  });
  await repo.clearAttendanceAutoZeroForTheses(autoZeroClearItems);

  const updatedImport = await repo.updateAttendanceImportCounts(importId, {
    autoZeroedCount: autoZeroedTheses.length,
    skippedFinalizedCount,
  });

  return {
    import: serializeAttendanceImport(updatedImport ?? created.import),
    totals: {
      totalRows: records.length,
      matchedRows,
      unmatchedRows: records.length - matchedRows,
      eligibleRows,
      ineligibleRows,
      autoZeroedCount: autoZeroedTheses.length,
      skippedFinalizedCount,
    },
    unmatchedRows: records
      .filter((record) => record.studentId == null)
      .map((record) => ({
        identityNumber: record.identityNumber,
        studentName: record.studentName,
        attendancePercentage: record.attendancePercentage,
      })),
    autoZeroedTheses,
  };
}
