import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";

import { BadRequestError, ForbiddenError } from "../utils/errors.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { ROLES } from "../constants/roles.js";
import * as repo from "../repositories/metopenAttendance.repository.js";
import { createNotificationEventForUsers } from "./notification.service.js";

export const METOPEN_ATTENDANCE_THRESHOLD = 0.75;
export const METOPEN_ATTENDANCE_AUTO_ZERO_REASON =
  "Presensi Metopel kurang dari 75%; nilai TA-03A dan TA-03B otomatis 0 tanpa review proposal.";
export const METOPEN_ATTENDANCE_MAX_FILES = 2;

/**
 * Auto-zero may be cleared on corrective re-upload only while the thesis is
 * still in Metopel proposal phase and has not crossed promotion/release.
 * After active promotion or booking release, auto-zero stays permanent.
 */
export function canClearAttendanceAutoZeroOnEligibleReupload(thesis) {
  if (!thesis) return false;
  if (thesis.activePromotedAt) return false;
  if (thesis.isProposal === false) return false;
  if (Array.isArray(thesis.advisorRequests) && thesis.advisorRequests.length > 0) {
    return false;
  }
  return true;
}

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

/**
 * Normalize multipart input: legacy single `file` and/or `files` (1–2).
 * Dedupes identical uploads; rejects empty or more than 2 files.
 */
export function normalizeAttendanceUploadFiles(fileOrFiles) {
  const list = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const unique = [];
  const seen = new Set();

  for (const file of list) {
    if (!file?.buffer) continue;
    const key = `${file.originalname ?? ""}:${file.size ?? file.buffer.length}:${file.buffer.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }

  if (unique.length === 0) {
    throw new BadRequestError("File presensi wajib diunggah");
  }
  if (unique.length > METOPEN_ATTENDANCE_MAX_FILES) {
    throw new BadRequestError(
      `Maksimal ${METOPEN_ATTENDANCE_MAX_FILES} file kelas Metopel per unggahan (satu import aktif digabung).`,
    );
  }

  return unique;
}

/**
 * Pure merge of 1–2 parsed workbooks by normalized NIM.
 * Same NIM in more than one file → BadRequest with conflict list (no auto-pick %).
 */
export function mergeAttendanceParsedWorkbooks(parsedItems) {
  if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
    throw new BadRequestError("File presensi wajib diunggah");
  }
  if (parsedItems.length > METOPEN_ATTENDANCE_MAX_FILES) {
    throw new BadRequestError(
      `Maksimal ${METOPEN_ATTENDANCE_MAX_FILES} file kelas Metopel per unggahan.`,
    );
  }

  const byNim = new Map();
  const conflicts = [];

  for (const item of parsedItems) {
    const sourceFileName = item.sourceFileName ?? "presensi-metopel.xlsx";
    const sourceClassCode = item.metadata?.classCode ?? null;

    for (const record of item.records ?? []) {
      const identityNumber = normalizeIdentity(record.identityNumber);
      if (!identityNumber) continue;

      const existing = byNim.get(identityNumber);
      if (existing) {
        conflicts.push({
          identityNumber,
          studentName: record.studentName ?? existing.studentName ?? null,
          sources: [
            {
              fileName: existing.sourceFileName,
              classCode: existing.sourceClassCode,
              attendancePercentage: existing.attendancePercentage,
            },
            {
              fileName: sourceFileName,
              classCode: sourceClassCode,
              attendancePercentage: record.attendancePercentage,
            },
          ],
        });
        continue;
      }

      byNim.set(identityNumber, {
        ...record,
        identityNumber,
        sourceFileName,
        sourceClassCode,
        rawRow: {
          ...(record.rawRow ?? {}),
          sourceFileName,
          sourceClassCode,
        },
      });
    }
  }

  if (conflicts.length > 0) {
    const error = new BadRequestError(
      `Ditemukan ${conflicts.length} NIM yang muncul di lebih dari satu file kelas. Unggah ditolak; perbaiki data SIA atau unggah ulang tanpa NIM ganda.`,
    );
    error.details = { conflicts };
    throw error;
  }

  const classCodes = [...new Set(parsedItems.map((item) => item.metadata?.classCode).filter(Boolean))];
  const courseNames = [...new Set(parsedItems.map((item) => item.metadata?.courseName).filter(Boolean))];
  const semesterLabels = [...new Set(parsedItems.map((item) => item.metadata?.semesterLabel).filter(Boolean))];
  const filterLabels = [...new Set(parsedItems.map((item) => item.metadata?.filterLabel).filter(Boolean))];
  const lecturerNames = [
    ...new Set(
      parsedItems.flatMap((item) => (Array.isArray(item.metadata?.lecturerNames) ? item.metadata.lecturerNames : [])),
    ),
  ];

  return {
    metadata: {
      classCode: classCodes.length > 0 ? classCodes.join(" + ") : null,
      courseName: courseNames[0] ?? null,
      semesterLabel: semesterLabels[0] ?? null,
      filterLabel: filterLabels[0] ?? null,
      lecturerNames: lecturerNames.length > 0 ? lecturerNames : null,
    },
    records: [...byNim.values()],
    sourceFiles: parsedItems.map((item) => ({
      originalName: item.sourceFileName ?? null,
      classCode: item.metadata?.classCode ?? null,
      courseName: item.metadata?.courseName ?? null,
      semesterLabel: item.metadata?.semesterLabel ?? null,
      rowCount: item.records?.length ?? 0,
    })),
  };
}

function parseAndMergeAttendanceFiles(files) {
  const normalized = normalizeAttendanceUploadFiles(files);
  const parsedItems = normalized.map((file) => {
    const parsed = parseMetopenAttendanceWorkbook(file.buffer);
    return {
      ...parsed,
      sourceFileName: file.originalname || "presensi-metopel.xlsx",
      file,
    };
  });
  const merged = mergeAttendanceParsedWorkbooks(parsedItems);
  return { normalized, parsedItems, merged };
}

async function persistAttendanceFile(file, importId, index = 0) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const suffix = index > 0 ? `-${index + 1}` : "";
  const fileName = `${importId}${suffix}-${sanitizeFileName(file.originalname)}`;
  const absolutePath = path.join(UPLOAD_DIR, fileName);
  await fs.writeFile(absolutePath, file.buffer);

  return {
    originalName: file.originalname || fileName,
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
    academicYear: attendanceImport.academicYear ?? null,
    documentId: attendanceImport.documentId,
    classCode: attendanceImport.classCode,
    courseName: attendanceImport.courseName,
    semesterLabel: attendanceImport.semesterLabel,
    filterLabel: attendanceImport.filterLabel,
    lecturerNames: attendanceImport.lecturerNames,
    sourceFiles: attendanceImport.sourceFiles ?? null,
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

async function enrichRecordsWithStudents(records) {
  const identityNumbers = records.map((record) => record.identityNumber);
  const students = await repo.findStudentsByIdentityNumbers(identityNumbers);
  const studentByIdentity = new Map(
    students.map((student) => [normalizeIdentity(student.user.identityNumber), student]),
  );

  return records.map((record) => {
    const student = studentByIdentity.get(normalizeIdentity(record.identityNumber));
    return {
      ...record,
      studentId: student?.id ?? null,
      studentName: record.studentName ?? student?.user?.fullName ?? null,
    };
  });
}

function normalizeRequiredAcademicYearId(value) {
  const academicYearId = typeof value === "string" ? value.trim() : "";
  if (!academicYearId) {
    throw new BadRequestError(
      "academicYearId wajib diisi agar data presensi tidak tercampur lintas periode akademik.",
    );
  }
  return academicYearId;
}

async function getRequiredAcademicYear(value) {
  const academicYearId = normalizeRequiredAcademicYearId(value);
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) {
    throw new BadRequestError("Periode akademik untuk presensi tidak ditemukan.");
  }
  return academicYear;
}

async function resolveThesisAcademicYearId(thesisId) {
  const thesis = await repo.findThesisAcademicYear(thesisId);
  if (!thesis) {
    throw new BadRequestError("Data tugas akhir tidak ditemukan.");
  }

  const academicYearId = thesis.academicYearId ?? thesis.ta04AssignmentAcademicYearId;
  if (!academicYearId) {
    throw new BadRequestError(
      "Tugas akhir belum terikat ke periode akademik sehingga presensi tidak dapat ditentukan.",
    );
  }
  return academicYearId;
}

export async function getLatestMetopenAttendanceImport(academicYearIdInput) {
  const academicYear = await getRequiredAcademicYear(academicYearIdInput);
  const attendanceImport = await repo.findLatestAttendanceImport(academicYear.id);
  return serializeAttendanceImport(attendanceImport);
}

export async function getAttendanceEligibilityForThesis(thesisId) {
  const academicYearId = await resolveThesisAcademicYearId(thesisId);
  const attendanceImport = await repo.findLatestAttendanceImport(academicYearId);
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

function formatAttendancePercentLabel(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = value > 1 ? value : value * 100;
  return `${Math.round(percent * 10) / 10}%`;
}

function buildAttendanceThresholdPhrase(attendancePercentage, thresholdPercent) {
  const thresholdLabel = formatAttendancePercentLabel(thresholdPercent) ?? "75%";
  const attendanceLabel = formatAttendancePercentLabel(attendancePercentage);
  return attendanceLabel
    ? `${attendanceLabel} (di bawah ambang ${thresholdLabel})`
    : `di bawah ambang ${thresholdLabel}`;
}

function getAutoZeroSupervisorUserIds(targets) {
  return (targets?.thesisSupervisors ?? [])
    .filter((item) => [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2].includes(item.role?.name))
    .map((item) => item.lecturer?.user?.id)
    .filter(Boolean);
}

/**
 * Notifikasi auto-zero BR-28 (audit SIMPTA-FUN-019). Auto-zero permanen dan
 * menghapus rubrik, jadi mahasiswa, Pembimbing 1/2 aktif, dan aktor pemicu
 * (Koordinator Matkul Metopen saat unggah presensi) wajib diberi tahu.
 * Notifikasi bersifat final/informatif, bukan permintaan aksi, dan hanya
 * dikirim untuk penerapan auto-zero yang benar-benar baru.
 * Kegagalan notifikasi tidak boleh membatalkan auto-zero yang sudah tercatat.
 */
async function notifyAttendanceAutoZero(thesisId, actorUserId, { attendancePercentage, thresholdPercent, scoreRecord }) {
  try {
    const targets = await repo.findThesisAutoZeroNotificationTargets(thesisId);
    if (!targets) return;

    const studentUserId = targets.student?.user?.id ?? null;
    const studentName = targets.student?.user?.fullName ?? "Mahasiswa";
    const thesisTitle = targets.title ?? "proposal";
    const reasonPhrase = buildAttendanceThresholdPhrase(attendancePercentage, thresholdPercent);
    const baseData = {
      thesisId,
      scoreId: scoreRecord?.id ?? null,
      attendancePercentage: attendancePercentage ?? null,
      thresholdPercent: thresholdPercent ?? METOPEN_ATTENDANCE_THRESHOLD,
    };

    if (studentUserId) {
      await createNotificationEventForUsers(
        [studentUserId],
        {
          title: "Nilai TA-03 Otomatis 0 (Presensi Metopel)",
          message: `Presensi kelas Metode Penelitian Anda ${reasonPhrase}. Nilai TA-03A dan TA-03B untuk "${thesisTitle}" ditetapkan 0 tanpa review proposal dan bersifat final.`,
          type: "simpta_ta03_attendance_auto_zero",
          data: { ...baseData, route: "/metopel" },
        },
        { push: true },
      );
    }

    const supervisorUserIds = getAutoZeroSupervisorUserIds(targets);
    if (supervisorUserIds.length > 0) {
      await createNotificationEventForUsers(
        supervisorUserIds,
        {
          title: "TA-03 Mahasiswa Otomatis 0 (Presensi Metopel)",
          message: `Presensi kelas Metode Penelitian ${studentName} ${reasonPhrase}. Nilai TA-03A dan TA-03B untuk "${thesisTitle}" otomatis 0 dan bersifat final, sehingga tidak ada rubrik yang perlu diisi.`,
          type: "simpta_ta03_attendance_auto_zero_notice",
          data: { ...baseData, route: "/kelola/metopen/ta03a" },
        },
        { push: true },
      );
    }

    const actorNeedsNotice =
      Boolean(actorUserId) && actorUserId !== studentUserId && !supervisorUserIds.includes(actorUserId);
    if (actorNeedsNotice) {
      await createNotificationEventForUsers(
        [actorUserId],
        {
          title: "Auto-zero TA-03 Diterapkan (Presensi Metopel)",
          message: `Presensi kelas Metode Penelitian ${studentName} ${reasonPhrase}. Nilai TA-03A dan TA-03B untuk "${thesisTitle}" otomatis 0 dan bersifat final.`,
          type: "simpta_ta03_attendance_auto_zero_notice",
          data: { ...baseData, route: "/kelola/metopen/ta03b" },
        },
        { push: false },
      );
    }
  } catch (error) {
    console.error(
      "[metopenAttendance:auto_zero] gagal mengirim notifikasi:",
      { thesisId, message: error?.message ?? error },
    );
  }
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
      "Penilaian TA-03 sudah final sebelum presensi terbaru diproses. Nilai otomatis 0 tidak diterapkan pada nilai yang sudah final.",
    );
  }

  // Hanya penerapan baru yang menghasilkan notifikasi. Re-upload presensi
  // koreksi SIA tidak boleh membanjiri penerima untuk peristiwa yang sama
  // (audit SIMPTA-FUN-019 + idempotensi SIMPTA-FUN-018).
  if (!result.skipped && !result.alreadyAutoZeroed) {
    await notifyAttendanceAutoZero(thesisId, actorUserId, {
      attendancePercentage: options.attendancePercentage ?? null,
      thresholdPercent: options.thresholdPercent ?? METOPEN_ATTENDANCE_THRESHOLD,
      scoreRecord: result.scoreRecord,
    });
  }

  return result;
}

/**
 * Deferred catch-up after final proposal is set: apply auto-zero / clear
 * clearable auto-zero from the latest active import (order-independent with
 * upload-first then submit-final). Does not run on TA-04 issue.
 */
export async function reconcileAttendanceForThesis(thesisId, actorUserId = null) {
  const academicYearId = await resolveThesisAcademicYearId(thesisId);
  const attendanceImport = await repo.findLatestAttendanceImport(academicYearId);
  if (!attendanceImport) {
    return { status: "missing_import", applied: null };
  }

  const record = await repo.findAttendanceRecordForThesis(attendanceImport.id, thesisId);
  if (!record) {
    return { status: "not_found", applied: null };
  }

  const actor = actorUserId ?? attendanceImport.uploadedByUserId ?? null;

  if (!record.isEligible) {
    const result = await applyAttendanceAutoZeroForThesis(thesisId, actor, record.id, {
      skipFinalized: true,
      attendancePercentage: record.attendancePercentage,
      thresholdPercent: attendanceImport.thresholdPercent,
    });
    let applied = "auto_zeroed";
    if (result.skipped) applied = "skipped_finalized";
    else if (result.alreadyAutoZeroed) applied = "already_auto_zeroed";
    return {
      status: "ineligible",
      applied,
      recordId: record.id,
      attendancePercentage: record.attendancePercentage,
    };
  }

  const thesis = await repo.findThesisForAttendanceReconcile(thesisId);
  const score = thesis?.researchMethodScores?.[0];
  if (score?.attendanceAutoZeroedAt && canClearAttendanceAutoZeroOnEligibleReupload(thesis)) {
    await repo.clearAttendanceAutoZeroForTheses([
      { thesisId, attendanceRecordId: record.id },
    ]);
    return {
      status: "eligible",
      applied: "cleared_auto_zero",
      recordId: record.id,
      attendancePercentage: record.attendancePercentage,
    };
  }

  return {
    status: "eligible",
    applied: null,
    recordId: record.id,
    attendancePercentage: record.attendancePercentage,
  };
}

/**
 * Gate BR-28 untuk keempat titik mutasi nilai TA-03 (submit P1, co-sign P2,
 * submit Koordinator, publish final). Presensi <75% tetap memicu auto-zero,
 * lalu permintaan penilaian manual ditolak dengan `ForbiddenError` sehingga
 * error handler global membalas 403. Sebelumnya penolakan ini dibalas 200
 * dengan badan sukses sehingga klien tidak bisa membedakannya dari
 * keberhasilan (audit SIMPTA-FUN-018).
 */
export async function assertAttendanceEligibleForManualReview(thesisId, actorUserId) {
  const eligibility = await getAttendanceEligibilityForThesis(thesisId);

  if (eligibility.status === "missing_import" || eligibility.status === "not_found") {
    throw new BadRequestError(eligibility.message);
  }

  if (eligibility.status === "ineligible") {
    await applyAttendanceAutoZeroForThesis(
      thesisId,
      actorUserId,
      eligibility.record.id,
      {
        attendancePercentage: eligibility.attendancePercentage,
        thresholdPercent: eligibility.thresholdPercent,
      },
    );
    const reasonPhrase = buildAttendanceThresholdPhrase(
      eligibility.attendancePercentage,
      eligibility.thresholdPercent,
    );
    throw new ForbiddenError(
      `Presensi kelas Metode Penelitian mahasiswa ${reasonPhrase}. Nilai TA-03A dan TA-03B otomatis 0 dan bersifat final, sehingga penilaian manual tidak dapat diproses.`,
    );
  }

  return { allowed: true, eligibility, scoreRecord: null };
}

async function findScoreableThesesForAttendanceRecords(records, academicYearId) {
  const studentIds = [...new Set(records.map((record) => record.studentId).filter(Boolean))];
  if (studentIds.length === 0) return [];
  return repo.findScoreableThesesByStudentIds(
    studentIds,
    academicYearId,
    CLOSED_THESIS_STATUSES,
  );
}

/**
 * F-4.2 — Dry-run preview presensi sebelum commit. Accepts 1–2 files
 * (legacy single `file` or `files[]`). Auto-zero <75% is PERMANEN.
 */
export async function previewMetopenAttendance(fileOrFiles, academicYearIdInput) {
  const academicYear = await getRequiredAcademicYear(academicYearIdInput);
  const { merged } = parseAndMergeAttendanceFiles(fileOrFiles);
  const records = await enrichRecordsWithStudents(merged.records);

  const matchedRows = records.filter((record) => record.studentId != null).length;
  const eligibleRows = records.filter((record) => record.isEligible).length;
  const ineligibleRows = records.length - eligibleRows;

  const ineligibleMatched = records.filter((record) => !record.isEligible && record.studentId != null);
  const theses = await findScoreableThesesForAttendanceRecords(
    ineligibleMatched,
    academicYear.id,
  );
  const thesisByStudentId = new Map(theses.map((thesis) => [thesis.studentId, thesis]));

  const willAutoZero = [];
  const willSkipFinalized = [];
  for (const record of ineligibleMatched) {
    const thesis = thesisByStudentId.get(record.studentId);
    if (!thesis) continue;
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
    academicYear,
    metadata: merged.metadata,
    sourceFiles: merged.sourceFiles,
    thresholdPercent: METOPEN_ATTENDANCE_THRESHOLD,
    totals: {
      totalRows: records.length,
      matchedRows,
      unmatchedRows: records.length - matchedRows,
      eligibleRows,
      ineligibleRows,
      willAutoZeroCount: willAutoZero.length,
      willSkipFinalizedCount: willSkipFinalized.length,
      sourceFileCount: merged.sourceFiles.length,
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

export async function uploadMetopenAttendance(fileOrFiles, actorUserId, options = {}) {
  const academicYear = await getRequiredAcademicYear(options.academicYearId);
  const { normalized, merged } = parseAndMergeAttendanceFiles(fileOrFiles);
  const importId = crypto.randomUUID();

  const storedFiles = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const stored = await persistAttendanceFile(normalized[i], importId, i);
    storedFiles.push({
      ...stored,
      classCode: merged.sourceFiles[i]?.classCode ?? null,
      courseName: merged.sourceFiles[i]?.courseName ?? null,
      semesterLabel: merged.sourceFiles[i]?.semesterLabel ?? null,
      rowCount: merged.sourceFiles[i]?.rowCount ?? 0,
    });
  }

  const primaryStored = storedFiles[0];
  const enrichedRecords = await enrichRecordsWithStudents(merged.records);

  const records = enrichedRecords.map((record) => ({
    id: crypto.randomUUID(),
    importId,
    studentId: record.studentId,
    identityNumber: record.identityNumber,
    studentName: record.studentName,
    presentCount: record.presentCount,
    absentCount: record.absentCount,
    sickCount: record.sickCount,
    permitCount: record.permitCount,
    totalMeetings: record.totalMeetings,
    attendancePercentage: record.attendancePercentage,
    isEligible: record.isEligible,
    rawRow: record.rawRow,
  }));

  const matchedRows = records.filter((record) => record.studentId != null).length;
  const eligibleRows = records.filter((record) => record.isEligible).length;
  const ineligibleRows = records.length - eligibleRows;
  const created = await repo.createAttendanceImportWithRecords({
    documentTypeName: DOCUMENT_TYPE_NAME,
    documentData: {
      userId: actorUserId,
      filePath: primaryStored.filePath,
      fileName: primaryStored.fileName,
      fileSize: primaryStored.fileSize,
      mimeType: primaryStored.mimeType,
      fileHash: primaryStored.fileHash,
    },
    importData: {
      id: importId,
      academicYearId: academicYear.id,
      uploadedByUserId: actorUserId,
      classCode: merged.metadata.classCode,
      courseName: merged.metadata.courseName,
      semesterLabel: merged.metadata.semesterLabel,
      filterLabel: merged.metadata.filterLabel,
      lecturerNames: merged.metadata.lecturerNames,
      sourceFiles: storedFiles.map((file) => ({
        originalName: file.originalName,
        fileName: file.fileName,
        filePath: file.filePath,
        fileHash: file.fileHash,
        classCode: file.classCode,
        courseName: file.courseName,
        semesterLabel: file.semesterLabel,
        rowCount: file.rowCount,
      })),
      thresholdPercent: METOPEN_ATTENDANCE_THRESHOLD,
      totalRows: records.length,
      matchedRows,
      eligibleRows,
      ineligibleRows,
    },
    records,
  });

  const ineligibleRecords = await repo.findIneligibleRecordsForImport(importId);
  const theses = await findScoreableThesesForAttendanceRecords(
    ineligibleRecords,
    academicYear.id,
  );
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
      {
        skipFinalized: true,
        attendancePercentage: attendanceRecord.attendancePercentage,
        thresholdPercent: METOPEN_ATTENDANCE_THRESHOLD,
      },
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
  const eligibleTheses = await findScoreableThesesForAttendanceRecords(
    eligibleRecords,
    academicYear.id,
  );
  const eligibleByStudentId = new Map(eligibleRecords.map((record) => [record.studentId, record]));
  const autoZeroClearItems = eligibleTheses.flatMap((thesis) => {
    const score = thesis.researchMethodScores?.[0];
    const attendanceRecord = eligibleByStudentId.get(thesis.studentId);
    if (!attendanceRecord || !score?.attendanceAutoZeroedAt) return [];
    if (!canClearAttendanceAutoZeroOnEligibleReupload(thesis)) return [];

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
      sourceFileCount: storedFiles.length,
    },
    sourceFiles: storedFiles.map((file) => ({
      originalName: file.originalName,
      classCode: file.classCode,
      rowCount: file.rowCount,
    })),
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
