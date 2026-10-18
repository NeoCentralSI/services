import { randomUUID } from "crypto";

import { ATTENDANCE_AUTO_ZERO_REASON, ATTENDANCE_THRESHOLD, MAX_ATTENDANCE_FILES } from "../../constants/research-method.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { normalizeHeader, readSheetRows } from "../../helpers/spreadsheet.helper.js";
import { attendanceImportDir, removeFile, storeFile } from "../../helpers/thesis-proposal-file.helper.js";
import * as repo from "../../repositories/research-method/attendance.repository.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";

/**
 * Presensi Metode Penelitian (plan 10.5): imported from the attendance application's export,
 * never from SIA. The old module's rules are kept: first sheet, a header row with NIM/BP, Hadir
 * and Persentase Hadir; a percentage above 1 is read as percent; eligible when `>= 75%`; up to
 * two class files merged by NIM, a NIM in two files refuses the upload; preview writes nothing;
 * an upload stores its files and rows, sets 0 for attempts of the period that are not final
 * (after the final proposal exists), skips finalized ones, and reopens an automatic 0 when a
 * corrected file meets the threshold while the thesis is still in the proposal phase.
 */

const { normalizeIdentity } = repo;

// Paket P9: the sheet reader and header normalizer are shared with the semester-flag import.
const normalizeText = normalizeHeader;

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(String(value).replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parsePercentage(value, presentCount, totalMeetings) {
  const numeric = value == null || value === "" ? NaN : toNumber(value, NaN);
  if (!Number.isFinite(numeric)) return totalMeetings > 0 ? presentCount / totalMeetings : 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const labels = row.map(normalizeText);
    return labels.some((l) => l.includes("nim") || l.includes("bp"))
      && labels.some((l) => l === "hadir")
      && labels.some((l) => l.includes("persentase") && l.includes("hadir"));
  });
}

function buildColumnMap(headerRow) {
  const find = (predicate) => headerRow.findIndex((h) => predicate(normalizeText(h)));
  const map = {
    identityNumber: find((l) => l.includes("nim") || l.includes("bp")),
    studentName: find((l) => l.includes("nama") && l.includes("mahasiswa")),
    presentCount: find((l) => l === "hadir"),
    absentCount: find((l) => l === "alpa"),
    sickCount: find((l) => l === "sakit"),
    permitCount: find((l) => l === "izin"),
    totalMeetings: find((l) => l === "total"),
    attendancePercentage: find((l) => l.includes("persentase") && l.includes("hadir")),
  };
  if (map.identityNumber < 0 || map.studentName < 0 || map.presentCount < 0 || map.attendancePercentage < 0) {
    throw new BadRequestError("Format presensi tidak dikenali. Header wajib memuat NIM / BP, Nama Mahasiswa, Hadir, dan Persentase Hadir.");
  }
  return map;
}

function metadataValue(rows, label) {
  const wanted = normalizeText(label);
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = String(row[i] ?? "").trim();
      if (!normalizeText(cell).startsWith(wanted)) continue;
      const afterColon = cell.includes(":") ? cell.split(":").slice(1).join(":").trim() : "";
      if (afterColon) return afterColon;
      for (let j = i + 1; j < row.length; j += 1) {
        const next = String(row[j] ?? "").trim();
        if (next && next !== ":") return next;
      }
    }
  }
  return null;
}

/** One class file: metadata and one row per NIM (the first row of a NIM wins). */
export function parseAttendanceWorkbook(buffer) {
  const rows = readSheetRows(buffer, {
    unreadableMessage: "Berkas presensi tidak dapat dibaca. Gunakan berkas .xlsx atau .xls dari aplikasi presensi.",
    emptyMessage: "Berkas presensi tidak memiliki sheet.",
  });
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    throw new BadRequestError("Header presensi tidak ditemukan. Pastikan berkas memakai format laporan peserta kelas Metode Penelitian.");
  }
  const metaRows = rows.slice(0, headerIndex);
  const columns = buildColumnMap(rows[headerIndex]);
  const cell = (row, index) => (index >= 0 ? row[index] : null);
  const seen = new Set();
  const records = rows.slice(headerIndex + 1).flatMap((row) => {
    const identityNumber = normalizeIdentity(cell(row, columns.identityNumber));
    if (!identityNumber || seen.has(identityNumber)) return [];
    seen.add(identityNumber);
    const count = (index) => Math.max(0, Math.round(toNumber(cell(row, index))));
    const presentCount = count(columns.presentCount);
    const absentCount = count(columns.absentCount);
    const sickCount = count(columns.sickCount);
    const permitCount = count(columns.permitCount);
    const explicitTotal = Math.round(toNumber(cell(row, columns.totalMeetings), NaN));
    const totalMeetings = Number.isFinite(explicitTotal) ? Math.max(0, explicitTotal) : presentCount + absentCount + sickCount + permitCount;
    const attendancePercentage = parsePercentage(cell(row, columns.attendancePercentage), presentCount, totalMeetings);
    const studentName = String(cell(row, columns.studentName) ?? "").trim() || null;
    return [{
      identityNumber,
      studentName,
      presentCount,
      absentCount,
      sickCount,
      permitCount,
      totalMeetings,
      attendancePercentage,
      isEligible: attendancePercentage >= ATTENDANCE_THRESHOLD,
    }];
  });
  if (records.length === 0) throw new BadRequestError("Tidak ada baris mahasiswa yang dapat dibaca dari berkas presensi.");
  const lecturers = metadataValue(metaRows, "Dosen");
  return {
    metadata: {
      classCode: metadataValue(metaRows, "Kelas"),
      courseName: metadataValue(metaRows, "Matakuliah"),
      semesterLabel: metadataValue(metaRows, "Semester"),
      filterLabel: metadataValue(metaRows, "Filter Jenis"),
      lecturerNames: lecturers ? lecturers.split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean) : null,
    },
    records,
  };
}

/** 1–2 distinct files from multipart `files` (or a single `file`). */
export function normalizeUploadFiles(files) {
  const unique = [];
  const seen = new Set();
  for (const file of files ?? []) {
    if (!file?.buffer) continue;
    const key = `${file.originalname ?? ""}:${file.buffer.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(file);
  }
  if (unique.length === 0) throw new BadRequestError("Berkas presensi wajib diunggah.");
  if (unique.length > MAX_ATTENDANCE_FILES) {
    throw new BadRequestError(`Maksimal ${MAX_ATTENDANCE_FILES} berkas kelas per unggahan.`);
  }
  return unique;
}

/** Merge parsed class files by NIM; a NIM in more than one file refuses the whole upload. */
export function mergeParsedFiles(items) {
  const byNim = new Map();
  const conflicts = [];
  for (const item of items) {
    for (const record of item.records) {
      const existing = byNim.get(record.identityNumber);
      if (existing) {
        conflicts.push({
          identityNumber: record.identityNumber,
          studentName: record.studentName ?? existing.studentName ?? null,
          sources: [
            { fileName: existing.sourceFileName, classCode: existing.sourceClassCode, attendancePercentage: existing.attendancePercentage },
            { fileName: item.fileName, classCode: item.metadata.classCode, attendancePercentage: record.attendancePercentage },
          ],
        });
        continue;
      }
      byNim.set(record.identityNumber, { ...record, sourceFileName: item.fileName, sourceClassCode: item.metadata.classCode ?? null });
    }
  }
  if (conflicts.length > 0) {
    const error = new BadRequestError(
      `Ditemukan ${conflicts.length} NIM yang muncul di lebih dari satu berkas kelas. Unggahan ditolak; perbaiki berkas atau unggah ulang tanpa NIM ganda.`,
    );
    error.details = { conflicts };
    throw error;
  }
  const distinct = (pick) => [...new Set(items.map(pick).filter(Boolean))];
  return {
    metadata: {
      classCode: distinct((i) => i.metadata.classCode).join(" + ") || null,
      courseName: distinct((i) => i.metadata.courseName)[0] ?? null,
      semesterLabel: distinct((i) => i.metadata.semesterLabel)[0] ?? null,
      filterLabel: distinct((i) => i.metadata.filterLabel)[0] ?? null,
      lecturerNames: [...new Set(items.flatMap((i) => i.metadata.lecturerNames ?? []))],
    },
    records: [...byNim.values()],
    sourceFiles: items.map((i) => ({ originalName: i.fileName, classCode: i.metadata.classCode ?? null, rowCount: i.records.length })),
  };
}

function parseFiles(files) {
  const list = normalizeUploadFiles(files);
  const parsed = list.map((file) => ({ ...parseAttendanceWorkbook(file.buffer), fileName: file.originalname || "presensi.xlsx", file }));
  return { list, merged: mergeParsedFiles(parsed) };
}

async function requireYear(academicYearId) {
  if (!academicYearId) throw new BadRequestError("Periode akademik wajib dipilih agar presensi tidak tercampur antarperiode.");
  const year = await repo.findAcademicYear(academicYearId);
  if (!year) throw new BadRequestError("Periode akademik untuk presensi tidak ditemukan.");
  return year;
}

async function withStudents(records) {
  const students = await repo.findStudentsByIdentityNumbers(records.map((r) => r.identityNumber));
  const byNim = new Map(students.map((s) => [normalizeIdentity(s.user.identityNumber), s]));
  return records.map((record) => {
    const student = byNim.get(record.identityNumber);
    return { ...record, studentId: student?.id ?? null, studentName: record.studentName ?? student?.user?.fullName ?? null };
  });
}

function percentLabel(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value * 1000) / 10}%`;
}

function thresholdPhrase(percentage) {
  const label = percentLabel(percentage);
  const threshold = percentLabel(ATTENDANCE_THRESHOLD);
  return label ? `${label} (di bawah ${threshold})` : `di bawah ${threshold}`;
}

/** R19: student, active supervisors and (without push) the uploader hear about a new automatic 0. */
async function notifyAutoZero(thesisId, actorUserId, percentage) {
  try {
    const target = await repo.findNotificationTargets(thesisId);
    if (!target) return;
    const studentId = target.student?.id;
    const name = target.student?.user?.fullName ?? "Mahasiswa";
    const title = target.title || "proposal";
    const phrase = thresholdPhrase(percentage);
    const data = { thesisId, attendancePercentage: percentage ?? null };
    if (studentId) {
      await createNotificationEventForUsers([studentId], {
        title: "Nilai Proposal Otomatis 0 (Presensi)",
        message: `Presensi kelas Metode Penelitian Anda ${phrase}. Nilai proposal "${title}" otomatis 0 dan bersifat final; Anda mengulang Metode Penelitian pada periode berikutnya.`,
        type: "research_method_attendance_auto_zero",
        data: { ...data, route: "/tugas-akhir/proposal" },
      }, { push: true });
    }
    const supervisorIds = (target.thesisSupervisors ?? []).map((s) => s.lecturerId);
    if (supervisorIds.length) {
      await createNotificationEventForUsers(supervisorIds, {
        title: "Nilai Proposal Mahasiswa Otomatis 0 (Presensi)",
        message: `Presensi kelas Metode Penelitian ${name} ${phrase}. Nilai proposal "${title}" otomatis 0 dan bersifat final; tidak ada penilaian yang perlu diisi.`,
        type: "research_method_attendance_auto_zero_notice",
        data: { ...data, route: "/tugas-akhir/proposal" },
      }, { push: true });
    }
    if (actorUserId && actorUserId !== studentId && !supervisorIds.includes(actorUserId)) {
      await createNotificationEventForUsers([actorUserId], {
        title: "Nilai Otomatis 0 Diterapkan (Presensi)",
        message: `Presensi kelas Metode Penelitian ${name} ${phrase}. Nilai proposal otomatis 0 dan bersifat final.`,
        type: "research_method_attendance_auto_zero_notice",
        data: { ...data, route: "/metode-penelitian/presensi" },
      }, { push: false });
    }
  } catch (error) {
    console.error("[research-method:attendance] notifikasi nilai 0 gagal:", error?.message ?? error);
  }
}

async function applyAutoZero(assessmentId, thesisId, actorUserId, record, { skipFinalized }) {
  const result = await repo.autoZeroAttempt({
    assessmentId,
    actorUserId,
    attendanceRecordId: record.id,
    reason: ATTENDANCE_AUTO_ZERO_REASON,
    skipFinalized,
  });
  if (result.blockedFinalized) {
    throw new ForbiddenError("Penilaian proposal sudah final sebelum presensi terbaru diproses. Nilai otomatis 0 tidak diterapkan pada nilai yang sudah final.");
  }
  if (result.applied) await notifyAutoZero(thesisId, actorUserId, record.attendancePercentage);
  return result;
}

function importDto(row, records = null) {
  if (!row) return null;
  return {
    id: row.id,
    academicYear: row.academicYear ? { id: row.academicYear.id, label: formatAcademicYearLabel(row.academicYear) } : null,
    classCode: row.classCode,
    courseName: row.courseName,
    semesterLabel: row.semesterLabel,
    lecturerNames: row.lecturerNames ?? [],
    sourceFiles: (row.sourceFiles ?? []).map((f, index) => ({
      index,
      originalName: f.originalName,
      classCode: f.classCode,
      rowCount: f.rowCount,
      fileSize: f.fileSize ?? null,
      url: `/research-method/attendance-imports/${row.id}/files/${index}`,
    })),
    thresholdPercent: row.thresholdPercent,
    totals: {
      totalRows: row.totalRows,
      matchedRows: row.matchedRows,
      unmatchedRows: row.totalRows - row.matchedRows,
      eligibleRows: row.eligibleRows,
      ineligibleRows: row.ineligibleRows,
      autoZeroedCount: row.autoZeroedCount,
      skippedFinalizedCount: row.skippedFinalizedCount,
    },
    uploadedAt: row.uploadedAt,
    uploadedBy: row.uploadedBy ?? null,
    ...(records
      ? {
          records: records.map((r) => ({
            id: r.id,
            identityNumber: r.identityNumber,
            studentName: r.student?.user?.fullName ?? r.rawRow?.studentName ?? null,
            matched: Boolean(r.studentId),
            presentCount: r.presentCount,
            totalMeetings: r.totalMeetings,
            attendancePercentage: r.attendancePercentage,
            isEligible: r.isEligible,
          })),
        }
      : {}),
  };
}

/** The import in force for a period with its rows, and earlier uploads (Metode Penelitian > Presensi). */
export async function getAttendanceOverview(academicYearId) {
  const year = await requireYear(academicYearId);
  const imports = await repo.findImports(year.id);
  const latest = imports[0] ?? null;
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    thresholdPercent: ATTENDANCE_THRESHOLD,
    current: latest ? importDto(latest, await repo.findRecords(latest.id)) : null,
    history: imports.slice(1).map((row) => importDto(row)),
  };
}

/** Dry run: what an upload would do, without writing anything. */
export async function previewAttendance(files, academicYearId) {
  const year = await requireYear(academicYearId);
  const { merged } = parseFiles(files);
  const records = await withStudents(merged.records);
  const ineligible = records.filter((r) => !r.isEligible && r.studentId);
  const attempts = await repo.findScoreableAttempts(year.id, ineligible.map((r) => r.studentId));
  const attemptByStudent = new Map(attempts.map((a) => [a.thesis.studentId, a]));
  const willAutoZero = [];
  const willSkipFinalized = [];
  for (const record of ineligible) {
    const attempt = attemptByStudent.get(record.studentId);
    if (!attempt || attempt.attendanceAutoZeroedAt) continue;
    const row = { identityNumber: record.identityNumber, studentName: record.studentName, attendancePercentage: record.attendancePercentage, thesisTitle: attempt.thesis.title };
    (attempt.isFinalized ? willSkipFinalized : willAutoZero).push(row);
  }
  const matched = records.filter((r) => r.studentId).length;
  const eligible = records.filter((r) => r.isEligible).length;
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    metadata: merged.metadata,
    sourceFiles: merged.sourceFiles,
    thresholdPercent: ATTENDANCE_THRESHOLD,
    totals: {
      totalRows: records.length,
      matchedRows: matched,
      unmatchedRows: records.length - matched,
      eligibleRows: eligible,
      ineligibleRows: records.length - eligible,
      willAutoZeroCount: willAutoZero.length,
      willSkipFinalizedCount: willSkipFinalized.length,
    },
    willAutoZero,
    willSkipFinalized,
    unmatchedRows: records.filter((r) => !r.studentId).map((r) => ({ identityNumber: r.identityNumber, studentName: r.studentName, attendancePercentage: r.attendancePercentage })),
  };
}

/** Store the upload, then apply it to the period's attempts (R19). */
export async function uploadAttendance(files, academicYearId, actorUserId) {
  const year = await requireYear(academicYearId);
  const { list, merged } = parseFiles(files);
  const importId = randomUUID();
  const now = new Date();
  const stored = [];
  try {
    for (const file of list) {
      stored.push(await storeFile({ relDir: attendanceImportDir(importId), file, now }));
    }
  } catch (error) {
    await Promise.all(stored.map((f) => removeFile(f.filePath)));
    throw error;
  }

  const records = await withStudents(merged.records);
  const matched = records.filter((r) => r.studentId).length;
  const eligible = records.filter((r) => r.isEligible).length;
  try {
    await repo.createImport({
      importData: {
        id: importId,
        academicYearId: year.id,
        uploadedByUserId: actorUserId,
        classCode: merged.metadata.classCode,
        courseName: merged.metadata.courseName,
        semesterLabel: merged.metadata.semesterLabel,
        filterLabel: merged.metadata.filterLabel,
        lecturerNames: merged.metadata.lecturerNames,
        sourceFiles: stored.map((f, i) => ({
          originalName: list[i].originalname || f.fileName,
          classCode: merged.sourceFiles[i]?.classCode ?? null,
          rowCount: merged.sourceFiles[i]?.rowCount ?? 0,
          filePath: f.filePath,
          fileHash: f.fileHash,
          fileSize: f.fileSize,
          mimeType: f.mimeType,
        })),
        thresholdPercent: ATTENDANCE_THRESHOLD,
        totalRows: records.length,
        matchedRows: matched,
        eligibleRows: eligible,
        ineligibleRows: records.length - eligible,
        uploadedAt: now,
      },
      records: records.map((r) => ({
        id: randomUUID(),
        studentId: r.studentId,
        identityNumber: r.identityNumber,
        presentCount: r.presentCount,
        absentCount: r.absentCount,
        sickCount: r.sickCount,
        permitCount: r.permitCount,
        totalMeetings: r.totalMeetings,
        attendancePercentage: r.attendancePercentage,
        isEligible: r.isEligible,
        // The name in the file stays in the raw row for rows that match no student (10.4).
        rawRow: { studentName: r.studentName, sourceFileName: r.sourceFileName, sourceClassCode: r.sourceClassCode },
      })),
    });
  } catch (error) {
    await Promise.all(stored.map((f) => removeFile(f.filePath)));
    throw error;
  }

  const saved = await repo.findRecords(importId, { studentId: { not: null } });
  const attempts = await repo.findScoreableAttempts(year.id, saved.map((r) => r.studentId));
  const recordByStudent = new Map(saved.map((r) => [r.studentId, r]));
  const autoZeroed = [];
  const toClear = [];
  let skippedFinalized = 0;
  for (const attempt of attempts) {
    const record = recordByStudent.get(attempt.thesis.studentId);
    if (!record) continue;
    if (!record.isEligible) {
      const result = await applyAutoZero(attempt.id, attempt.thesisId, actorUserId, record, { skipFinalized: true });
      if (result.skipped) skippedFinalized += 1;
      if (result.applied) {
        autoZeroed.push({ thesisId: attempt.thesisId, thesisTitle: attempt.thesis.title, identityNumber: record.identityNumber, attendancePercentage: record.attendancePercentage });
      }
    } else if (attempt.attendanceAutoZeroedAt && attempt.thesis.status === THESIS_STATUS.PROPOSAL) {
      toClear.push({ assessmentId: attempt.id, attendanceRecordId: record.id });
    } else {
      await repo.linkAttendanceRecord(attempt.id, record.id);
    }
  }
  await repo.clearAutoZero(toClear);
  const updated = await repo.updateImportCounts(importId, { autoZeroedCount: autoZeroed.length, skippedFinalizedCount: skippedFinalized });

  await logAudit({
    actorUserId,
    action: AUDIT_ACTIONS.RESEARCH_METHOD_ATTENDANCE_IMPORTED,
    entityType: ENTITY_TYPES.RESEARCH_METHOD_ATTENDANCE_IMPORT,
    entityId: importId,
    newValues: { academicYearId: year.id, totalRows: records.length, matchedRows: matched, eligibleRows: eligible },
    metadata: { autoZeroed: autoZeroed.length, skippedFinalized, reopened: toClear.length, files: stored.length },
  });

  return {
    import: importDto(updated),
    autoZeroed,
    reopenedCount: toClear.length,
    unmatchedRows: records.filter((r) => !r.studentId).map((r) => ({ identityNumber: r.identityNumber, studentName: r.studentName, attendancePercentage: r.attendancePercentage })),
  };
}

/** One stored source file of an import. */
export async function getSourceFile(importId, index) {
  const row = await repo.findImportById(importId);
  const file = row?.sourceFiles?.[Number(index)];
  if (!file?.filePath) throw new NotFoundError("Berkas presensi tidak ditemukan.");
  return file;
}

/**
 * Attendance of one attempt from the period's import in force:
 * `missing_import`, `not_found`, `eligible` or `ineligible`.
 */
export async function getAttendanceForAttempt(attempt) {
  const latest = await repo.findLatestImport(attempt.academicYearId);
  if (!latest) {
    return { status: "missing_import", record: null, message: "Presensi Metode Penelitian periode ini belum diunggah koordinator. Penilaian dibuka setelah presensi tersedia." };
  }
  const record = await repo.findRecordForStudent(latest.id, attempt.thesis.student);
  if (!record) {
    return { status: "not_found", record: null, message: "Mahasiswa tidak ditemukan pada presensi Metode Penelitian terbaru periode ini." };
  }
  return {
    status: record.isEligible ? "eligible" : "ineligible",
    record,
    message: record.isEligible ? null : `Presensi kelas Metode Penelitian mahasiswa ${thresholdPhrase(record.attendancePercentage)}.`,
  };
}

/**
 * R20: a manual score needs the period's import and the student's row; attendance below the
 * threshold applies the automatic 0 and refuses with 403.
 */
export async function assertAttendanceAllowsScoring(attempt, actorUserId) {
  const attendance = await getAttendanceForAttempt(attempt);
  if (attendance.status === "missing_import" || attendance.status === "not_found") throw new BadRequestError(attendance.message);
  if (attendance.status === "ineligible") {
    await applyAutoZero(attempt.id, attempt.thesis.id, actorUserId, attendance.record, { skipFinalized: false });
    throw new ForbiddenError(`${attendance.message} Nilai proposal otomatis 0 dan bersifat final, sehingga penilaian manual tidak dapat diproses.`);
  }
  return attendance.record;
}

/**
 * Catch-up after a final proposal is sent (rule kept): the period's import in force decides at
 * once; an eligible row reopens an automatic 0 while the thesis is in the proposal phase.
 */
export async function reconcileAttempt(assessmentId, actorUserId = null) {
  const attempt = await repo.findAttemptForAttendance(assessmentId);
  if (!attempt?.proposalFilePath) return { status: "no_final_proposal" };
  const attendance = await getAttendanceForAttempt(attempt);
  if (!attendance.record) return { status: attendance.status };
  if (!attendance.record.isEligible) {
    const result = await applyAutoZero(attempt.id, attempt.thesis.id, actorUserId, attendance.record, { skipFinalized: true });
    return { status: "ineligible", applied: result.applied ? "auto_zeroed" : result.skipped ? "skipped_finalized" : "already_auto_zeroed" };
  }
  if (attempt.attendanceAutoZeroedAt && attempt.thesis.status === THESIS_STATUS.PROPOSAL) {
    await repo.clearAutoZero([{ assessmentId: attempt.id, attendanceRecordId: attendance.record.id }]);
    return { status: "eligible", applied: "reopened" };
  }
  await repo.linkAttendanceRecord(attempt.id, attendance.record.id);
  return { status: "eligible", applied: null };
}
