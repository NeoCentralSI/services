import * as audienceRepo from "../../repositories/thesis-seminar/audience.repository.js";
import * as coreRepo from "../../repositories/thesis-seminar/thesis-seminar.repository.js";
import * as xlsx from "xlsx";
import prisma from "../../config/prisma.js";
import { renderAndIssueOfficialHtmlDocument } from "../official-document.service.js";
import { documentBaseStyles, letterheadHtml, signatureBlockHtml, supervisorSigner } from "../../utils/document-template.util.js";
import path from "path";
import fs from "fs";
import * as outlookService from "../outlook-calendar.service.js";
import { createNotificationService } from "../notification.service.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  if (user.studentId) {
    return registerAsAudience(seminarId, user.studentId, seminar);
  }

  // Admin adds audience (archive mode)
  if (seminar.registeredAt !== null) {
    throwError("Seminar ini merupakan seminar aktif dan tidak dapat dikelola audiens-nya secara manual", 403);
  }
  const { studentId } = body;
  const existing = await audienceRepo.findAudienceByKey(seminarId, studentId);
  if (existing) throwError("Mahasiswa sudah terdaftar sebagai audience seminar ini", 409);

  const thesis = await coreRepo.findThesisById(seminar.thesisId);
  if (String(thesis?.studentId) === String(studentId)) {
    throwError("Mahasiswa yang memiliki seminar ini tidak dapat menjadi audience", 400);
  }

  // Time conflict check (only for active/scheduled seminars with time set)
  if (seminar.date && seminar.startTime && seminar.endTime) {
    const conflictType = await coreRepo.findStudentScheduleConflict({
      studentId,
      date: seminar.date,
      startTime: seminar.startTime.toISOString().split('T')[1].substring(0, 5),
      endTime: seminar.endTime.toISOString().split('T')[1].substring(0, 5),
      excludeSeminarId: seminar.id
    });
    if (conflictType) {
      throwError(`Mahasiswa ini memiliki jadwal ${conflictType} pada waktu yang sama.`, 400);
    }
  }

  const supervisors = await coreRepo.findSupervisorsByThesisId(seminar.thesisId);
  const supervisorId = supervisors?.[0]?.id || null;

  await audienceRepo.createAudience({ seminarId, thesisId: seminar.thesisId, studentId, supervisorId, seminarDate: seminar.date });
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

  await audienceRepo.createAudienceRegistration(seminarId, seminar.thesisId, studentId);

  // Calendar sync (background/fire-and-forget style to avoid blocking the response)
  syncAudienceToOutlook(seminarId, studentId).catch(err =>
    console.error("[AudienceService] Failed to sync to Outlook:", err.message)
  );

  return { message: "Berhasil mendaftar sebagai peserta seminar." };
}

async function syncAudienceToOutlook(seminarId, studentId) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true }
  });
  if (!student?.user?.id) return;

  const access = await outlookService.hasCalendarAccess(student.user.id);
  const hasAccess = typeof access === 'object' ? access.hasAccess : access;
  if (!hasAccess) return;

  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar || !seminar.date || !seminar.startTime) return;

  // Combine date and time
  const getCombinedDate = (timeObj) => {
    const d = new Date(seminar.date);
    d.setUTCHours(timeObj.getUTCHours() - 7, timeObj.getUTCMinutes(), 0, 0);
    return d;
  };

  const startTime = getCombinedDate(seminar.startTime);
  const endTime = getCombinedDate(seminar.endTime);
  const locationStr = seminar.roomId ? `${seminar.room?.name || ''}` : (seminar.meetingLink || "Online Meeting");

  await outlookService.createCalendarEvent(student.user.id, {
    subject: `Peserta Seminar Hasil - ${seminar.thesis?.student?.user?.fullName || 'Mahasiswa'}`,
    body: `Anda terdaftar sebagai peserta seminar hasil:\n\nMahasiswa: ${seminar.thesis?.student?.user?.fullName || '-'}\nJudul: ${seminar.thesis?.title || '-'}\nLokasi: ${locationStr}\n\nDisinkronkan dari Neo Central.`,
    startTime,
    endTime,
    location: locationStr
  });
}

// ============================================================
// PUBLIC: Update Audience (approve/unapprove/toggle_presence)
// ============================================================

export async function updateAudience(seminarId, studentId, body, user) {
  const seminar = await resolveSeminarForAudience(seminarId);
  const { action } = body;

  // Resolve supervisor role
  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId);
  const supervisorId = supervisorRelation?.thesis?.thesisSupervisors?.[0]?.id || null;

  if (action === "approve") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);
    await audienceRepo.approveAudience(seminarId, studentId, supervisorId);
    await notifyAudiencePresence(seminarId, studentId, seminar);
  } else if (action === "unapprove") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);
    await audienceRepo.resetAudienceApproval(seminarId, studentId);
  } else if (action === "toggle_presence") {
    if (!supervisorId) throwError("Anda bukan pembimbing untuk seminar ini.", 403);

    // Prevent verification before seminar date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seminarDate = new Date(seminar.date);
    if (seminarDate > today) {
      throwError("Verifikasi kehadiran hanya dapat dilakukan pada hari seminar atau setelahnya.", 400);
    }

    const current = await audienceRepo.findAudienceByKey(seminarId, studentId);
    if (!current) throwError("Data audience tidak ditemukan.", 404);

    const isNowPresent = !current.approvedAt;
    await audienceRepo.toggleAudiencePresence(seminarId, studentId, isNowPresent, supervisorId);

    if (isNowPresent) {
      await notifyAudiencePresence(seminarId, studentId, seminar);
    }
  } else {
    throwError("Action tidak valid. Gunakan: approve, unapprove, toggle_presence.", 400);
  }

  return { success: true };
}

async function notifyAudiencePresence(seminarId, studentId, seminar) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true }
    });
    if (!student?.user?.id) return;

    const presenterName = seminar.student?.name || "Mahasiswa";

    await createNotificationService({
      userId: student.user.id,
      title: "Kehadiran Seminar Terverifikasi",
      message: `Kehadiran Anda sebagai audiens pada seminar ${presenterName} telah diverifikasi oleh dosen pembimbing.`,
    });
  } catch (err) {
    console.error("[AudienceService] Failed to send presence notification:", err);
    // Don't throw error to avoid breaking the verification flow
  }
}

// ============================================================
// PUBLIC: Remove Audience
// ============================================================

export async function removeAudience(seminarId, studentId, user) {
  const seminar = await resolveSeminarForAudience(seminarId);

  if (user.studentId) {
    const targetStudentId = user.studentId;
    const existing = await audienceRepo.findAudienceRegistration(seminarId, targetStudentId);
    if (!existing) throwError("Anda belum terdaftar sebagai peserta seminar ini.", 404);
    await audienceRepo.deleteAudienceRegistration(seminarId, targetStudentId);
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
  const thesis = await coreRepo.findThesisById(seminar.thesisId);
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

      // Check if student is the owner of the seminar
      if (String(thesis?.studentId) === String(student.id)) {
        results.failed++;
        results.failedRows.push({ row: i + 2, error: `Mahasiswa ${rawName} adalah pemilik seminar ini dan tidak dapat menjadi audience` });
        continue;
      }

      // Time conflict check
      if (seminar.date && seminar.startTime && seminar.endTime) {
        const conflictType = await coreRepo.findStudentScheduleConflict({
          studentId: student.id,
          date: seminar.date,
          startTime: seminar.startTime.toISOString().split('T')[1].substring(0, 5),
          endTime: seminar.endTime.toISOString().split('T')[1].substring(0, 5),
          excludeSeminarId: seminar.id
        });
        if (conflictType) {
          results.failed++;
          results.failedRows.push({ row: i + 2, error: `Mahasiswa ${rawName} memiliki jadwal ${conflictType} pada waktu yang sama.` });
          continue;
        }
      }

      const existing = await audienceRepo.findAudienceByKey(seminarId, student.id);
      if (existing) { results.failed++; results.failedRows.push({ row: i + 2, error: `Mahasiswa ${rawName} sudah terdaftar sebagai audience` }); continue; }
      await audienceRepo.createAudience({ seminarId, thesisId: seminar.thesisId, studentId: student.id, supervisorId, seminarDate: seminar.date });
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

export async function exportAudiencesPdf(seminarId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const rows = (await audienceRepo.findAudiencesBySeminarId(seminarId)).filter((row) => row.approvedAt);


  // The presenting student's Pembimbing 1 verifies the attendance and signs the list.
  const signer = await supervisorSigner(seminar.thesisId);
  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>${documentBaseStyles()}

    .title { text-align: center; font-size: 12pt; font-weight: bold; text-decoration: underline; margin: 15px 0 5px 0; text-transform: uppercase; }
    .subtitle { text-align: center; font-size: 11pt; font-weight: normal; margin-bottom: 20px; }

    .info-table { width: 100%; margin-bottom: 20px; }
    .info-table td { padding: 2px 0; vertical-align: top; }
    .info-label { width: 140px; }
    .info-colon { width: 15px; text-align: center; }

    .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .data-table th, .data-table td { border: 1px solid #000; padding: 6px 8px; font-size: 10pt; }
    .data-table th { background-color: #f2f2f2; font-weight: bold; text-align: center; }
    .text-center { text-align: center; }

    .footer-container { margin-top: 40px; width: 100%; }
  </style>
</head>
<body>
  ${letterheadHtml()}

  <div class="title">Daftar Hadir Peserta Seminar Hasil</div>
  <div class="subtitle">Tugas Akhir Mahasiswa</div>

  <table class="info-table">
    <tr>
      <td class="info-label">Nama Mahasiswa</td>
      <td class="info-colon">:</td>
      <td><strong>${seminar.thesis?.student?.user?.fullName || '-'}</strong></td>
    </tr>
    <tr>
      <td class="info-label">NIM</td>
      <td class="info-colon">:</td>
      <td>${seminar.thesis?.student?.user?.identityNumber || '-'}</td>
    </tr>
    <tr>
      <td class="info-label">Judul Tugas Akhir</td>
      <td class="info-colon">:</td>
      <td>${seminar.thesis?.title || '-'}</td>
    </tr>
    <tr>
      <td class="info-label">Waktu Seminar</td>
      <td class="info-colon">:</td>
      <td>${seminar.date ? new Date(seminar.date).toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</td>
    </tr>
    <tr>
      <td class="info-label">Ruangan</td>
      <td class="info-colon">:</td>
      <td>${seminar.room?.name || '-'}</td>
    </tr>
  </table>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 40px;">No</th>
        <th>Nama Mahasiswa</th>
        <th style="width: 200px;">NIM</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length > 0 ? rows.map((r, idx) => `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td>${r.student?.user?.fullName || '-'}</td>
          <td class="text-center">${r.student?.user?.identityNumber || '-'}</td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="3" class="text-center">Belum ada peserta dengan kehadiran yang disetujui</td>
        </tr>
      `}
    </tbody>
  </table>

  ${signatureBlockHtml({ date: seminar.date ?? new Date(), title: signer.title, name: signer.name, nip: signer.nip, withQr: true })}
</body>
</html>
  `;

  return renderAndIssueOfficialHtmlDocument({
    documentKind: "seminar_audience_list",
    sourceId: seminarId,
    title: "Daftar Hadir Peserta Seminar Hasil",
    subjectName: seminar.thesis?.student?.user?.fullName || "-",
    subjectIdentifier: seminar.thesis?.student?.user?.identityNumber || "-",
    issuerName: "Departemen Sistem Informasi Universitas Andalas",
    issuerRole: "Penerbit dokumen",
    html,
  });
}

