import * as audienceRepo from "../repositories/thesis-seminar-audience.repository.js";
import * as coreRepo from "../repositories/thesis-seminar.repository.js";
import * as xlsx from "xlsx";
import prisma from "../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

async function resolveSeminarForAudience(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan", 404);
  return seminar;
}

// ============================================================
// PUBLIC: List Audiences
// ============================================================

export async function getAudiences(seminarId) {
  await resolveSeminarForAudience(seminarId);
  const rows = await audienceRepo.findAudiencesBySeminarId(seminarId);
  return rows.map((r) => ({
    studentId: r.studentId,
    fullName: r.student?.user?.fullName || "-",
    nim: r.student?.user?.identityNumber || "-",
    approvedAt: r.approvedAt,
    approvedByName: r.supervisor?.lecturer?.user?.fullName || "-",
    registeredAt: r.registeredAt,
    createdAt: r.createdAt,
  }));
}

// ============================================================
// PUBLIC: Add Audience (Admin or Student self-registration)
// ============================================================

export async function addAudience(seminarId, body, user) {
  const seminar = await resolveSeminarForAudience(seminarId);

  // Student self-registration
  if (user.role === "MAHASISWA") {
    return registerAsAudience(seminarId, user.studentId, seminar);
  }

  // Admin adds audience (archive mode)
  if (seminar.registeredAt !== null) {
    throwError("Seminar ini merupakan seminar aktif dan tidak dapat dikelola audiens-nya secara manual", 403);
  }
  const { studentId } = body;
  const existing = await audienceRepo.findAudienceByKey(seminarId, studentId);
  if (existing) throwError("Mahasiswa sudah terdaftar sebagai audience seminar ini", 409);

  const supervisors = await coreRepo.findSupervisorsByThesisId(seminar.thesisId);
  const supervisorId = supervisors?.[0]?.id || null;

  await audienceRepo.createAudience({ seminarId, studentId, supervisorId, seminarDate: seminar.date });
  return { success: true };
}

async function registerAsAudience(seminarId, studentId, seminar) {
  // Check not own seminar
  const fullSeminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    select: { status: true, date: true, thesis: { select: { student: { select: { id: true } } } } },
  });
  if (fullSeminar?.thesis?.student?.id === studentId) throwError("Anda tidak dapat mendaftar pada seminar milik sendiri.", 400);
  if (fullSeminar?.status !== "scheduled") throwError("Seminar ini tidak lagi membuka pendaftaran kehadiran.", 400);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const seminarDate = fullSeminar?.date ? new Date(fullSeminar.date) : null;
  if (seminarDate) { seminarDate.setHours(0, 0, 0, 0); if (seminarDate < today) throwError("Seminar ini sudah berlangsung.", 400); }

  const existing = await audienceRepo.findAudienceRegistration(seminarId, studentId);
  if (existing) throwError("Anda sudah terdaftar sebagai peserta seminar ini.", 409);

  await audienceRepo.createAudienceRegistration(seminarId, studentId);
  return { message: "Berhasil mendaftar sebagai peserta seminar." };
}

// ============================================================
// PUBLIC: Update Audience (approve/unapprove/toggle_presence)
// ============================================================

export async function updateAudience(seminarId, studentId, body, user) {
  await resolveSeminarForAudience(seminarId);
  const { action } = body;

  // Resolve supervisor role
  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId);
  const supervisorId = supervisorRelation?.thesis?.thesisSupervisors?.[0]?.id || null;

  if (action === "approve") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);
    await audienceRepo.approveAudience(seminarId, studentId, supervisorId);
  } else if (action === "unapprove") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);
    await audienceRepo.resetAudienceApproval(seminarId, studentId);
  } else if (action === "toggle_presence") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);
    const current = await audienceRepo.findAudienceByKey(seminarId, studentId);
    if (!current) throwError("Data audience tidak ditemukan.", 404);
    await audienceRepo.toggleAudiencePresence(seminarId, studentId, !current.approvedAt);
  } else {
    throwError("Action tidak valid. Gunakan: approve, unapprove, toggle_presence.", 400);
  }

  return { success: true };
}

// ============================================================
// PUBLIC: Remove Audience
// ============================================================

export async function removeAudience(seminarId, studentId, user) {
  const seminar = await resolveSeminarForAudience(seminarId);

  if (user.role === "MAHASISWA") {
    const existing = await audienceRepo.findAudienceRegistration(seminarId, studentId);
    if (!existing) throwError("Anda belum terdaftar sebagai peserta seminar ini.", 404);
    await audienceRepo.deleteAudienceRegistration(seminarId, studentId);
    return { message: "Pendaftaran berhasil dibatalkan." };
  }

  // Admin removes
  if (seminar.registeredAt !== null) throwError("Seminar ini merupakan seminar aktif dan tidak dapat dikelola audiens-nya secara manual", 403);
  try {
    await audienceRepo.deleteAudience(seminarId, studentId);
  } catch (err) {
    if (err?.code === "P2025") throwError("Data audience tidak ditemukan", 404);
    throw err;
  }
  return { success: true };
}

// ============================================================
// PUBLIC: Student Options for Audience
// ============================================================

export async function getStudentOptionsForAudience(seminarId) {
  await resolveSeminarForAudience(seminarId);
  const students = await audienceRepo.findStudentOptionsForAudience(seminarId);
  return students.map((s) => ({ id: s.id, fullName: s.user?.fullName || "-", nim: s.user?.identityNumber || "-" }));
}

// ============================================================
// PUBLIC: Import Audiences from Excel
// ============================================================

export async function importAudiences(seminarId, file) {
  const seminar = await resolveSeminarForAudience(seminarId);
  if (seminar.registeredAt !== null) throwError("Seminar ini merupakan seminar aktif dan tidak dapat dikelola audiens-nya secara manual", 403);

  const workbook = xlsx.read(file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const results = { success: true, total: rows.length, successCount: 0, failed: 0, failedRows: [] };
  const supervisors = await coreRepo.findSupervisorsByThesisId(seminar.thesisId);
  const supervisorId = supervisors?.[0]?.id || null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawName = String(row["Nama Mahasiswa"] || "").trim();
    const rawNim = String(row["NIM"] || "").trim();
    if (!rawName && !rawNim) { results.failed++; results.failedRows.push({ row: i + 2, error: "Nama dan NIM tidak boleh kosong" }); continue; }
    try {
      const student = await coreRepo.findStudentByNameOrNim({ fullName: rawName, nim: rawNim });
      if (!student) { results.failed++; results.failedRows.push({ row: i + 2, error: `Mahasiswa tidak ditemukan: ${rawName} / ${rawNim}` }); continue; }
      const existing = await audienceRepo.findAudienceByKey(seminarId, student.id);
      if (existing) { results.failed++; results.failedRows.push({ row: i + 2, error: `Mahasiswa ${rawName} sudah terdaftar sebagai audience` }); continue; }
      await audienceRepo.createAudience({ seminarId, studentId: student.id, supervisorId, seminarDate: seminar.date });
      results.successCount++;
    } catch (err) {
      results.failed++;
      const errorMsg = err.message.includes("prisma.") ? "Terjadi kesalahan internal pada database." : err.message;
      results.failedRows.push({ row: i + 2, error: errorMsg });
    }
  }
  return results;
}

// ============================================================
// PUBLIC: Export Audiences
// ============================================================

export async function exportAudiences(seminarId) {
  await resolveSeminarForAudience(seminarId);
  const rows = await audienceRepo.findAudiencesBySeminarId(seminarId);
  const data = rows.map((r, idx) => ({
    No: idx + 1,
    "Nama Mahasiswa": r.student?.user?.fullName || "-",
    "NIM": r.student?.user?.identityNumber || "-",
    "Disetujui Pada": r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("id-ID") : "-",
    "Disetujui Oleh": r.supervisor?.lecturer?.user?.fullName || "-",
  }));
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 5 }, { wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 30 }];
  xlsx.utils.book_append_sheet(wb, ws, "Audience");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ============================================================
// PUBLIC: Audience Template
// ============================================================

export async function getAudienceTemplate() {
  const data = [
    { "No": 1, "Nama Mahasiswa": "John Doe", "NIM": "2111521001" },
    { "No": 2, "Nama Mahasiswa": "Jane Smith", "NIM": "2111522002" },
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 5 }, { wch: 35 }, { wch: 18 }];
  xlsx.utils.book_append_sheet(wb, ws, "Template_Audience");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}
