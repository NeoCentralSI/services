import * as coreRepo from "../../repositories/thesis-seminar/thesis-seminar.repository.js";
import * as docRepo from "../../repositories/thesis-seminar/doc.repository.js";
import * as audienceRepo from "../../repositories/thesis-seminar/audience.repository.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";
import prisma from "../../config/prisma.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import * as xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as examinerService from "./examiner.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function throwError(msg, code) { const e = new Error(msg); e.statusCode = code; throw e; }

const STATUS_PRIORITY = { registered: 0, examiner_assigned: 1, verified: 2, scheduled: 3, ongoing: 4, passed: 5, passed_with_revision: 5, failed: 5, cancelled: 5 };
const RESULT_STATUSES = ["passed", "passed_with_revision", "failed", "cancelled"];

function getAssignmentStatus(active, total = 0) {
  if (!active || active.length === 0) return total > 0 ? "rejected" : "unassigned";
  const allAvailable = active.every((e) => e.availabilityStatus === "available");
  return allAvailable ? "confirmed" : "pending";
}

export function mapScoreToGrade(s) {
  if (s == null || isNaN(s)) return null;
  s = Number(s);
  if (s >= 80) return "A"; if (s >= 76) return "A-"; if (s >= 70) return "B+"; if (s >= 65) return "B";
  if (s >= 55) return "C+"; if (s >= 50) return "C"; if (s >= 45) return "D"; return "E";
}

function buildSearchWhere(search) {
  if (!search) return {};
  return { OR: [
    { thesis: { title: { contains: search } } },
    { thesis: { student: { user: { fullName: { contains: search } } } } },
    { thesis: { student: { user: { identityNumber: { contains: search } } } } },
  ]};
}

function parseStatusFilter(status) {
  if (!status) return { requested: [], database: [] };
  const requested = String(status)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const database = [...new Set(requested.map((item) => (item === "ongoing" ? "scheduled" : item)))];
  return { requested, database };
}

// ==================== LIST ====================

export async function getSeminarList({ page, pageSize, search, view, status, user }) {
  if (view === "assignment") return getAssignmentList({ search });
  if (view === "archive") return getArchiveList({ search, page, pageSize });
  if (view === "verification") return getAdminList({ search, status });
  if (view === "supervised_students" && user.lecturerId) {
    const data = await coreRepo.findSeminarsBySupervisor({ lecturerId: user.lecturerId, search });
    return mapLecturerSeminarList(data, user.lecturerId, "supervisor");
  }
  if (view === "examiner_requests" && user.lecturerId) {
    const data = await coreRepo.findSeminarsByExaminer({ lecturerId: user.lecturerId, search });
    return mapLecturerSeminarList(data, user.lecturerId, "examiner");
  }
  return getAdminList({ search, status });
}

async function mapLecturerSeminarList(data, lecturerId, primaryRole) {
  const docTypes = await docRepo.getSeminarDocumentTypes();
  return data.map((s) => {
    const myExaminer = s.examiners.find((e) => e.lecturerId === lecturerId);
    const mySupervisor = s.thesis?.thesisSupervisors?.find((ts) => ts.lecturerId === lecturerId);
    
    return {
      id: s.id, thesisId: s.thesis?.id || null,
      studentName: s.thesis?.student?.user?.fullName || "-", studentNim: s.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors: (s.thesis?.thesisSupervisors || []).map((ts) => ({ name: ts.lecturer?.user?.fullName || "-", role: ts.role?.name || "-" })),
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
      registeredAt: s.registeredAt, date: s.date, startTime: s.startTime, endTime: s.endTime,
      room: s.room ? { id: s.room.id, name: s.room.name } : null,
      examiners: (s.examiners || []).map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
      })),
      audienceCount: s._count?.audiences || 0,
      documentSummary: { 
        total: docTypes.length, 
        submitted: s.documents.filter((d) => d.status === "submitted").length, 
        approved: s.documents.filter((d) => d.status === "approved").length, 
        declined: s.documents.filter((d) => d.status === "declined").length 
      },
      // Lecturer specific
      myRole: mySupervisor?.role?.name || (myExaminer ? "Penguji" : "-"),
      myExaminerStatus: myExaminer?.availabilityStatus || null,
      myExaminerId: myExaminer?.id || null,
      myExaminerOrder: myExaminer?.order || null,
    };
  });
}

async function getAdminList({ search, status }) {
  const statusFilter = parseStatusFilter(status);
  const where = {
    ...buildSearchWhere(search),
    registeredAt: { not: null },
    ...(statusFilter.database.length === 1
      ? { status: statusFilter.database[0] }
      : statusFilter.database.length > 1
        ? { status: { in: statusFilter.database } }
        : {}),
  };
  const { data } = await coreRepo.findSeminarsPaginated({ where, skip: 0, take: 500 });
  const docTypes = await docRepo.getSeminarDocumentTypes();
  const mapped = data.map((s) => ({
    id: s.id, thesisId: s.thesis?.id || null,
    studentName: s.thesis?.student?.user?.fullName || "-", studentNim: s.thesis?.student?.user?.identityNumber || "-",
    thesisTitle: s.thesis?.title || "-",
    supervisors: (s.thesis?.thesisSupervisors || []).map((ts) => ({ name: ts.lecturer?.user?.fullName || "-", role: ts.role?.name || "-" })),
    status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
    registeredAt: s.registeredAt, date: s.date, startTime: s.startTime, endTime: s.endTime,
    room: s.room ? { id: s.room.id, name: s.room.name } : null,
    examiners: (s.examiners || []).map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: e.lecturerName || "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
    })),
    audienceCount: s._count?.audiences || 0,
    documentSummary: { total: docTypes.length, submitted: s.documents.filter((d) => d.status === "submitted").length, approved: s.documents.filter((d) => d.status === "approved").length, declined: s.documents.filter((d) => d.status === "declined").length },
  }));
  const filtered = statusFilter.requested.length > 0
    ? mapped.filter((item) => statusFilter.requested.includes(item.status))
    : mapped;
  filtered.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99, pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.registeredAt ? new Date(a.registeredAt).getTime() : 0) - (b.registeredAt ? new Date(b.registeredAt).getTime() : 0);
  });
  return filtered;
}

async function getAssignmentList({ search }) {
  const where = { status: { in: ["verified", "examiner_assigned", "scheduled", "passed", "passed_with_revision", "failed", "cancelled"] }, ...buildSearchWhere(search) };
  const { data } = await coreRepo.findSeminarsPaginated({ where, skip: 0, take: 500 });
  const mapped = data.map((s) => {
    const active = (s.examiners || []).filter((e) => ["available", "pending"].includes(e.availabilityStatus));
    const rejected = (s.examiners || []).filter((e) => e.availabilityStatus === "unavailable");
    
    const isConcluded = ["passed", "passed_with_revision", "failed", "cancelled"].includes(s.status);
    const assignmentStatus = isConcluded ? "finished" : getAssignmentStatus(active, (s.examiners || []).length);

    return {
      id: s.id, thesisId: s.thesis?.id || null,
      studentName: s.thesis?.student?.user?.fullName || "-", studentNim: s.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors: (s.thesis?.thesisSupervisors || []).map((ts) => ({ name: ts.lecturer?.user?.fullName || "-", role: ts.role?.name || "-" })),
      status: s.status, registeredAt: s.registeredAt,
      assignmentStatus,
      examiners: active.map((e) => ({ id: e.id, lecturerId: e.lecturerId, lecturerName: e.lecturerName || "-", order: e.order, availabilityStatus: e.availabilityStatus, respondedAt: e.respondedAt })),
      rejectedExaminers: rejected.map((e) => ({ id: e.id, lecturerId: e.lecturerId, lecturerName: e.lecturerName || "-", order: e.order, availabilityStatus: e.availabilityStatus, respondedAt: e.respondedAt, assignedAt: e.assignedAt })),
    };
  });
  const ORDER = { unassigned: 0, rejected: 1, partially_rejected: 2, pending: 3, confirmed: 4, finished: 5 };
  mapped.sort((a, b) => (ORDER[a.assignmentStatus] ?? 99) - (ORDER[b.assignmentStatus] ?? 99));
  return mapped;
}

async function getArchiveList({ search, page, pageSize, status }) {
  const skip = (page - 1) * pageSize;
  const statusFilter = parseStatusFilter(status);
  const archiveStatuses = statusFilter.database.length > 0
    ? statusFilter.database.filter((item) => RESULT_STATUSES.includes(item))
    : RESULT_STATUSES;
  const where = { status: { in: archiveStatuses }, ...buildSearchWhere(search) };
  const { data, total } = await coreRepo.findSeminarsPaginated({ where, skip, take: pageSize });
  return {
    seminars: data.map((s) => ({
      id: s.id, thesisId: s.thesisId, thesisTitle: s.thesis?.title || "-",
      student: { id: s.thesis?.student?.id || null, fullName: s.thesis?.student?.user?.fullName || "-", nim: s.thesis?.student?.user?.identityNumber || "-" },
      date: s.date, room: s.room, status: s.status, isEditable: s.registeredAt === null,
      audienceCount: s._count?.audiences || 0,
      examiners: s.examiners.map((e) => ({ id: e.id, lecturerId: e.lecturerId, lecturerName: e.lecturerName || "-", order: e.order })),
    })),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ==================== DETAIL ====================

export async function getSeminarDetail(seminarId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  const docTypes = await docRepo.getSeminarDocumentTypes();
  const docs = await docRepo.findSeminarDocuments(seminarId);
  const audiences = await audienceRepo.findAudiencesBySeminarId(seminarId);
  const active = (seminar.examiners || []).filter((e) => ["available", "pending"].includes(e.availabilityStatus));
  return {
    id: seminar.id, status: computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime),
    registeredAt: seminar.registeredAt, date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime,
    meetingLink: seminar.meetingLink, finalScore: seminar.finalScore, grade: mapScoreToGrade(seminar.finalScore),
    resultFinalizedAt: seminar.resultFinalizedAt, cancelledReason: seminar.cancelledReason,
    revisionFinalizedAt: seminar.revisionFinalizedAt,
    revisionFinalizedBy: seminar.revisionFinalizedBy,
    scheduledAt: seminar.scheduledAt,
    invitationLetterNo: seminar.invitationLetterNo,
    room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null,
    thesis: { id: seminar.thesis?.id, title: seminar.thesis?.title },
    student: { id: seminar.thesis?.student?.id || null, name: seminar.thesis?.student?.user?.fullName || "-", nim: seminar.thesis?.student?.user?.identityNumber || "-" },
    supervisors: (seminar.thesis?.thesisSupervisors || []).map((ts) => ({ lecturerId: ts.lecturerId, name: ts.lecturer?.user?.fullName || "-", role: ts.role?.name || "-" })),
    documents: docs.map((d) => ({ documentTypeId: d.documentTypeId, documentId: d.documentId, status: d.status, submittedAt: d.submittedAt, verifiedAt: d.verifiedAt, notes: d.notes, verifiedBy: d.verifier?.fullName || null, fileName: d.document?.fileName || null, filePath: d.document?.filePath || null })),
    documentTypes: docTypes.map((dt) => ({ id: dt.id, name: dt.name })),
    examiners: active.map((e) => ({ id: e.id, lecturerId: e.lecturerId, lecturerName: e.lecturerName || "-", order: e.order, availabilityStatus: e.availabilityStatus })),
    audiences: audiences.map((a) => ({ studentName: a.student?.user?.fullName || "-", nim: a.student?.user?.identityNumber || "-", registeredAt: a.registeredAt, approvedAt: a.approvedAt, approvedByName: a.supervisor?.lecturer?.user?.fullName || null })),
  };
}

// ==================== SCHEDULE ====================

export async function getSchedulingData(seminarId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  const supIds = (seminar.thesis?.thesisSupervisors || []).filter((ts) => ts.role?.name === "Pembimbing 1").map((ts) => ts.lecturerId).filter(Boolean);
  const exIds = (seminar.examiners || []).map((e) => e.lecturerId).filter(Boolean);
  const allIds = [...new Set([...supIds, ...exIds])];
  const [avail, rooms, bookings] = await Promise.all([
    allIds.length > 0 ? coreRepo.findLecturerAvailabilities(allIds) : [],
    coreRepo.findAllRooms(),
    coreRepo.findRoomBookings()
  ]);
  const nameMap = {};
  (seminar.thesis?.thesisSupervisors || []).forEach((ts) => { if (ts.lecturerId) nameMap[ts.lecturerId] = ts.lecturer?.user?.fullName || "-"; });
  (seminar.examiners || []).forEach((e) => { if (e.lecturerId) nameMap[e.lecturerId] = e.lecturerName || "-"; });
  return {
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    lecturerAvailabilities: avail.map((a) => ({ id: a.id, lecturerId: a.lecturerId, lecturerName: nameMap[a.lecturerId] || "-", day: a.day, startTime: a.startTime, endTime: a.endTime, validFrom: a.validFrom, validUntil: a.validUntil })),
    currentSchedule: seminar.date ? { date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime, meetingLink: seminar.meetingLink, isOnline: !seminar.roomId, roomId: seminar.roomId, room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null } : null,

    roomBookings: bookings,
    participantIds: allIds
  };
}

export async function scheduleSeminar(seminarId, body) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.status !== "examiner_assigned") throwError("Penjadwalan hanya dapat dilakukan saat seminar berstatus 'examiner_assigned'.", 400);

  // Weekday-only validation (uses local WIB date to avoid UTC-midnight offset)
  const [yr, mo, dy] = body.date.split('-').map(Number);
  const localDate = new Date(yr, mo - 1, dy);
  const dayOfWeek = localDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    throwError("Seminar hanya dapat dijadwalkan pada hari kerja (Senin – Jumat).", 400);
  }

  // Business-hours validation: 06:00 – 18:00 WIB
  const [startH, startM] = body.startTime.split(':').map(Number);
  const [endH, endM] = body.endTime.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins < 6 * 60) throwError("Waktu mulai tidak boleh sebelum pukul 06.00.", 400);
  if (endMins > 18 * 60) throwError("Waktu selesai tidak boleh setelah pukul 18.00.", 400);
  if (startMins >= endMins) throwError("Waktu mulai harus sebelum waktu selesai.", 400);

  if (!body.isOnline) {
    const conflict = await coreRepo.findRoomScheduleConflict({ seminarId, roomId: body.roomId, date: body.date, startTime: body.startTime, endTime: body.endTime });
    if (conflict) throwError("Ruangan sudah digunakan oleh kegiatan seminar/sidang lain pada waktu yang sama.", 409);
  }
  await coreRepo.updateSeminar(seminarId, { roomId: body.isOnline ? null : body.roomId, date: new Date(body.date), startTime: new Date(`1970-01-01T${body.startTime}:00.000Z`), endTime: new Date(`1970-01-01T${body.endTime}:00.000Z`), meetingLink: body.isOnline ? body.meetingLink : null });
  return { seminarId, status: seminar.status };
}

export async function finalizeSchedule(seminarId, adminId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.status !== "examiner_assigned") {
    throwError("Seminar harus berstatus 'examiner_assigned' untuk ditetapkan.", 400);
  }
  if (!seminar.date || !seminar.startTime || !seminar.endTime) {
    throwError("Jadwal seminar belum lengkap. Harap atur jadwal terlebih dahulu sebelum melakukan finalisasi.", 400);
  }
  await coreRepo.updateSeminar(seminarId, { status: "scheduled", scheduledAt: new Date() });

  try {
    const studentUserId = seminar.thesis?.student?.id;
    const studentName = seminar.thesis?.student?.user?.fullName || "Mahasiswa";
    
    // Collect participant IDs for notifications
    const supervisorUserIds = (seminar.thesis?.thesisSupervisors || []).map((s) => s.lecturerId).filter(Boolean);
    const examinerUserIds = (seminar.examiners || []).map((e) => e.lecturerId).filter(Boolean);
    
    // Notify ALL students in the system as requested
    const allStudents = await prisma.student.findMany({
      select: { id: true }
    });
    const allStudentUserIds = allStudents.map(s => s.id);

    const title = "Jadwal Seminar Hasil Ditetapkan";
    const dateStr = seminar.date.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const startTimeStr = new Date(seminar.startTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    const endTimeStr = new Date(seminar.endTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    const locationStr = seminar.room ? seminar.room.name : (seminar.meetingLink || "Online");
    const message = `Jadwal seminar hasil untuk ${studentName} telah ditetapkan pada ${dateStr}, pukul ${startTimeStr} - ${endTimeStr} di ${locationStr}.`;

    const allUserIdsToNotify = [...new Set([
      ...(studentUserId ? [studentUserId] : []),
      ...supervisorUserIds,
      ...examinerUserIds,
      ...allStudentUserIds
    ])];

    if (allUserIdsToNotify.length > 0) {
      await Promise.all([
        import("../notification.service.js").then((m) => m.createNotificationsForUsers(allUserIdsToNotify, { title, message })),
        import("../push.service.js").then((m) => m.sendFcmToUsers(allUserIdsToNotify, { title, body: message, data: { seminarId, type: "seminar_scheduled" } })),
      ]);
    }


    // Outlook Calendar Sync
    try {
      await syncSeminarToOutlook(seminarId, adminId);
    } catch (err) {
      console.error("[OutlookSync Error] Sync failed:", err.message);
    }

  } catch (err) {
    console.error("[Notification Error] Failed to notify stakeholders on schedule finalization:", err.message);
  }

  return { seminarId, status: "scheduled" };
}

export async function cancelSeminar(seminarId, { cancelledReason }) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const cancellableStatuses = ["verified", "examiner_assigned", "scheduled"];
  if (!cancellableStatuses.includes(seminar.status)) {
    throwError(`Seminar dengan status ${seminar.status} tidak dapat dibatalkan.`, 400);
  }

  await coreRepo.updateSeminar(seminarId, {
    status: "cancelled",
    cancelledReason: cancelledReason || null,
  });

  // Reset supervisor seminarReady so student must re-get approval for next attempt
  if (seminar.thesisId) {
    await prisma.thesisSupervisors.updateMany({
      where: { thesisId: seminar.thesisId },
      data: { seminarReady: false },
    });
  }

  return { seminarId, status: "cancelled" };
}

// ==================== ARCHIVE CRUD ====================

export async function createArchive(body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status seminar hasil tidak valid", 400);
  const [thesis, room, existing] = await Promise.all([coreRepo.findThesisById(body.thesisId), coreRepo.findRoomById(body.roomId), coreRepo.findSeminarByThesisId(body.thesisId)]);
  if (!thesis) throwError("Tugas Akhir tidak ditemukan", 404);
  if (!room) throwError("Ruangan tidak ditemukan", 404);

  const existingPassed = await prisma.thesisSeminar.findFirst({
    where: { thesisId: body.thesisId, status: { in: ["passed", "passed_with_revision"] } }
  });
  if (existingPassed) {
    throwError("Mahasiswa ini sudah lulus seminar hasil.", 409);
  }
  await validateExaminers(body.thesisId, body.examinerLecturerIds);
  const created = await coreRepo.createSeminarWithExaminers({ thesisId: body.thesisId, roomId: body.roomId, date: body.date, status: body.status, examinerLecturerIds: [...new Set(body.examinerLecturerIds)], assignedByUserId: userId });
  return coreRepo.findSeminarById(created.id);
}

export async function updateArchive(seminarId, body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status seminar hasil tidak valid", 400);
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Data seminar hasil tidak ditemukan", 404);
  if (seminar.registeredAt !== null) {
    throwError("Seminar yang diproses melalui sistem tidak dapat diubah secara manual di arsip", 403);
  }
  const [thesis, room, dup] = await Promise.all([coreRepo.findThesisById(body.thesisId), coreRepo.findRoomById(body.roomId), coreRepo.findSeminarByThesisIdExcludingId(body.thesisId, seminarId)]);
  if (!thesis) throwError("Tugas Akhir tidak ditemukan", 404);
  if (!room) throwError("Ruangan tidak ditemukan", 404);

  // If updating to a different thesis, check if that thesis already has a successful seminar result.
  if (dup && ["passed", "passed_with_revision"].includes(dup.status)) {
    throwError("Tugas Akhir ini sudah memiliki data seminar hasil lain dengan status Lulus", 409);
  }
  await validateExaminers(body.thesisId, body.examinerLecturerIds);
  await coreRepo.updateSeminarWithExaminers({ seminarId, thesisId: body.thesisId, roomId: body.roomId, date: body.date, status: body.status, examinerLecturerIds: [...new Set(body.examinerLecturerIds)], assignedByUserId: userId });
  return coreRepo.findSeminarById(seminarId);
}

export async function deleteArchive(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Data seminar hasil tidak ditemukan", 404);
  if (seminar.registeredAt !== null) {
    throwError("Seminar yang diproses melalui sistem tidak dapat dihapus secara manual di arsip", 403);
  }
  await coreRepo.deleteSeminar(seminarId);
  return { success: true };
}

async function validateExaminers(thesisId, ids) {
  const unique = [...new Set(ids || [])];
  if (unique.length < 1) throwError("Minimal 1 dosen penguji harus dipilih", 400);
  const sups = await coreRepo.findSupervisorsByThesisId(thesisId);
  if (unique.some((id) => sups.some((s) => s.lecturerId === id))) throwError("Dosen pembimbing tidak boleh menjadi dosen penguji", 400);
}

// ==================== OPTIONS ====================

export const getThesisOptions = () => coreRepo.findThesesForOptions();
export const getLecturerOptions = () => coreRepo.findLecturersForOptions();
export const getStudentOptions = () => coreRepo.findStudentsForOptions();
export const getRoomOptions = () => coreRepo.findAllRooms();

// ==================== IMPORT/EXPORT ====================

export async function exportArchive() {
  const seminars = await coreRepo.findAllSeminarResultsForExport({ status: { in: RESULT_STATUSES } });

  const indonesianDays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const indonesianMonths = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const formatFullDate = (dateObj) => {
    if (!dateObj) return "-";
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return "-";
    return `${indonesianDays[d.getDay()]}, ${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
  };

  const formatTime = (dateObj) => {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const minutes = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hours}.${minutes}`;
  };

  const data = seminars.map((s, i) => {
    const sups = (s.thesis?.thesisSupervisors || [])
      .sort((a, b) => (a.role?.name === "Pembimbing 1" ? -1 : 1))
      .map((sup) => sup.lecturer?.user?.fullName)
      .filter(Boolean)
      .join(", ");
    
    const exams = (s.examiners || [])
      .map((e) => e.lecturerName)
      .filter(Boolean)
      .join("; ");
    
    let hasil = "-";
    if (s.status === "passed") hasil = "Lulus";
    else if (s.status === "passed_with_revision") hasil = "Lulus dengan Revisi";
    else if (s.status === "failed") hasil = "Tidak Lulus";
    else if (s.status === "cancelled") hasil = "Dibatalkan";

    const waktu = s.startTime && s.endTime 
      ? `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`
      : "-";

    return {
      "No": i + 1,
      "Nama": s.thesis?.student?.user?.fullName || "-",
      "NIM": s.thesis?.student?.user?.identityNumber || "-",
      "Judul Tugas Akhir": s.thesis?.title || "-",
      "Pembimbing": sups || "-",
      "Tanggal": formatFullDate(s.date),
      "Waktu": waktu,
      "Ruangan": s.room?.name || "-",
      "Dosen Penguji": exams || "-",
      "Dijadwalkan pada": formatFullDate(s.scheduledAt),
      "Hasil": hasil
    };
  });

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Arsip Seminar");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function importArchive(fileBuffer, userId) {
  const wb = xlsx.read(fileBuffer, { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const results = { total: rows.length, successCount: 0, failed: 0, failedRows: [] };

  const [rooms, lecturers, students, theses] = await Promise.all([
    coreRepo.findAllRooms(),
    coreRepo.findLecturersForOptions(),
    coreRepo.findStudentsForOptions(),
    coreRepo.findThesesForOptions(),
  ]);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nim = String(row["NIM"] || "").trim();
      if (!nim) throw new Error("NIM kosong");

      const student = students.find(s => s.user.identityNumber === nim);
      if (!student) throw new Error(`NIM ${nim} tidak ditemukan`);

      const thesis = theses.find(t => t.student?.user?.identityNumber === nim);
      if (!thesis) throw new Error(`TA untuk ${nim} tidak ditemukan`);

      const hasPassed = thesis.thesisSeminars.some(s => ["passed", "passed_with_revision"].includes(s.status));
      if (hasPassed) throw new Error("Sudah lulus seminar hasil");

      const ruangan = String(row["Ruangan"] || "").trim();
      let roomId = null;
      if (ruangan && ruangan !== "-") {
        const room = rooms.find(r => r.name.toLowerCase().includes(ruangan.toLowerCase()));
        if (!room) throw new Error(`Ruangan "${ruangan}" tidak ditemukan`);
        roomId = room.id;
      }

      const hasilStr = String(row["Hasil"] || "").trim().toLowerCase();
      let status = "failed";
      if (hasilStr.includes("dengan revisi")) status = "passed_with_revision";
      else if (hasilStr.includes("lulus")) status = "passed";

      const tgl = String(row["Tanggal"] || "").trim();
      let date = null;
      if (tgl && tgl !== "-") {
        const p = new Date(tgl);
        if (!isNaN(p.getTime())) date = p.toISOString();
      }

      const examinerColumns = [row["Dosen Penguji 1"], row["Dosen Penguji 2"], row["Dosen Penguji 3"]]
        .map((v) => String(v || "").trim())
        .filter((v) => v && v !== "-" && !v.includes("Opsional"));
      
      const examinerLecturerIds = [];
      for (const name of examinerColumns) {
        const lec = lecturers.find(l => l.user.fullName.toLowerCase().includes(name.toLowerCase()));
        if (lec) examinerLecturerIds.push(lec.id);
        else throw new Error(`Dosen "${name}" tidak ditemukan`);
      }

      if (examinerLecturerIds.length < 1) throw new Error("Minimal 1 Dosen Penguji");

      await coreRepo.createSeminarWithExaminers({
        thesisId: thesis.id,
        date,
        roomId,
        status,
        examinerLecturerIds,
        assignedByUserId: userId,
      });

      results.successCount++;
    } catch (err) {
      results.failed++;
      results.failedRows.push({ row: i + 2, error: err.message.includes("prisma") ? "Format data tidak valid." : err.message });
    }
  }
  return results;
}
export async function generateInvitationLetter(seminarId, nomorSurat) {
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    include: {
      thesis: {
        include: {
          student: { include: { user: true } },
          thesisSupervisors: {
            include: {
              role: true,
              lecturer: { include: { user: true } }
            }
          }
        }
      },
      room: true,
      examiners: true
    }
  });

  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  
  // Persist invitation letter number if provided
  if (nomorSurat) {
    await prisma.thesisSeminar.update({
      where: { id: seminarId },
      data: { invitationLetterNo: nomorSurat }
    });
  }

  const actualNomorSurat = nomorSurat || seminar.invitationLetterNo || '';

  const examinerIds = seminar.examiners.map(e => e.lecturerId);
  const examinerLecturers = await prisma.lecturer.findMany({
    where: { id: { in: examinerIds } },
    include: { user: true }
  });

  const indonesianMonths = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function formatIndoDate(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const day = d.getDate();
    const month = indonesianMonths[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }
  
  function getIndoDay(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[d.getDay()];
  }

  function formatTime(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}.${minutes}`;
  }

  const dateGenerated = formatIndoDate(new Date());

  // Find Pembimbing 1
  const supervisor1 = seminar.thesis?.thesisSupervisors?.find(
    (ts) => ts.role?.name === "Pembimbing 1"
  );
  const supervisorName = supervisor1?.lecturer?.user?.fullName || '-';

  // Map Examiners in order
  const sortedExaminers = seminar.examiners
    .sort((a, b) => a.order - b.order)
    .map(e => {
      const l = examinerLecturers.find(lecturer => lecturer.id === e.lecturerId);
      return l?.user?.fullName || '-';
    });

  const lecturersList = [];
  if (supervisorName !== '-') lecturersList.push(supervisorName);
  lecturersList.push(...sortedExaminers);

  const studentName = seminar.thesis?.student?.user?.fullName || '-';
  const studentNim = seminar.thesis?.student?.user?.identityNumber || '-';
  const thesisTitle = seminar.thesis?.title || '-';

  const seminarDay = getIndoDay(seminar.date);
  const seminarDateFormatted = formatIndoDate(seminar.date);
  const seminarTime = formatTime(seminar.startTime);
  const seminarPlace = seminar.room ? seminar.room.name : (seminar.meetingLink || 'Daring');

  // Signatory: Ketua Departemen
  const ketuaDept = await prisma.user.findFirst({
    where: {
      userHasRoles: {
        some: {
          role: { name: "Ketua Departemen" },
          status: "active"
        }
      }
    }
  });

  const ketuaDeptName = ketuaDept?.fullName || 'Ketua Departemen';
  const ketuaDeptNip = ketuaDept?.identityNumber || '-';

  // Logo base64
  const logoPath = path.resolve(__dirname, "../../assets/unand-logo.png");
  let logoBase64 = "";
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    }
  } catch (e) {
    console.error("Invitation letter logo load failed:", e);
  }

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Surat Undangan Seminar Hasil</title>
  <style>
    @page {
      size: A4;
      margin: 1.5cm 2cm 1.5cm 2.5cm;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.3;
      color: #000;
    }
    .header-table { width: 100%; border-collapse: collapse; border-bottom: 2.5px solid #000; padding-bottom: 8px; margin-bottom: 15px; }
    .logo-cell { width: 85px; vertical-align: middle; padding-right: 15px; }
    .logo-img { width: 80px; height: auto; }
    .header-text { text-align: center; vertical-align: middle; padding-right: 40px; }
    .header-text h3 { margin: 0; font-size: 12pt; font-weight: normal; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-text h4 { margin: 0; font-size: 12pt; font-weight: normal; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-text h2 { margin: 2px 0; font-size: 16pt; font-weight: bold; color: #000; text-transform: uppercase; }
    .header-text p { margin: 2px 0; font-size: 10pt; font-weight: normal; }
    .ta-box {
      border: 1px solid #000;
      padding: 3px 8px;
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
    }
    .details-table {
      width: 100%;
      margin-bottom: 12px;
    }
    .details-table td {
      vertical-align: top;
    }
    .recipient-list {
      margin-left: 20px;
      padding-left: 0;
      list-style-type: decimal;
    }
    .recipient-list li {
      margin-bottom: 2px;
    }
    .content-table {
      width: 100%;
      margin: 10px 0;
    }
    .content-table td {
      vertical-align: top;
      padding: 1px 4px;
    }
    .signature-block {
      float: right;
      width: 220px;
      margin-top: 25px;
      text-align: left;
    }
    .signature-block .space {
      height: 55px;
    }
    .tembusan {
      margin-top: 25px;
      font-size: 10pt;
    }
    .tembusan ol {
      margin: 3px 0 0 15px;
      padding: 0;
    }
    .clear {
      clear: both;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}
      </td>
      <td class="header-text">
        <h3>Kementerian Pendidikan Tinggi, Sains, dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis Padang – 25163</p>
        <p>http://si.fti.unand.ac.id, email: jurusan_si@fti.unand.ac.id</p>
      </td>
    </tr>
  </table>

  <table class="details-table">
    <tr>
      <td style="width: 80px;">Nomor</td>
      <td style="width: 10px;">:</td>
      <td style="width: 300px;">${actualNomorSurat}</td>
      <td style="text-align: right;">Padang, ${dateGenerated}</td>
    </tr>
    <tr>
      <td>Hal</td>
      <td>:</td>
      <td>Undangan Seminar Hasil</td>
      <td></td>
    </tr>
    <tr>
      <td>Lamp</td>
      <td>:</td>
      <td>Makalah dan draft Tugas Akhir</td>
      <td></td>
    </tr>
  </table>

  <p>Kepada Yth.</p>
  <ol class="recipient-list">
    ${lecturersList.map(name => `<li>${name}</li>`).join('')}
  </ol>
  
  <p style="margin-top: 15px;">Di<br/>Tempat.</p>

  <p style="margin-top: 20px;">Sesuai dengan persetujuan Pembimbing Tugas Akhir Mahasiswa:</p>

  <table class="content-table" style="margin-left: 25px; width: calc(100% - 25px);">
    <tr>
      <td style="width: 150px;">Nama</td>
      <td style="width: 10px;">:</td>
      <td style="font-weight: bold;">${studentName}</td>
    </tr>
    <tr>
      <td>NIM</td>
      <td>:</td>
      <td>${studentNim}</td>
    </tr>
    <tr>
      <td>Judul Tugas Akhir</td>
      <td>:</td>
      <td>${thesisTitle}</td>
    </tr>
  </table>

  <p style="margin-top: 20px;">Maka akan diadakan Seminar Hasil Pelaksanaan Tugas Akhir mahasiswa tersebut pada:</p>

  <table class="content-table" style="margin-left: 25px; width: calc(100% - 25px);">
    <tr>
      <td style="width: 150px;">Hari / Tanggal</td>
      <td style="width: 10px;">:</td>
      <td>${seminarDay} / ${seminarDateFormatted}</td>
    </tr>
    <tr>
      <td>Pukul</td>
      <td>:</td>
      <td>${seminarTime} WIB s/d Selesai</td>
    </tr>
    <tr>
      <td>Tempat</td>
      <td>:</td>
      <td>${seminarPlace}</td>
    </tr>
  </table>

  <p style="margin-top: 20px;">Untuk itu dimohon kesediaan Sdr(i) untuk hadir sebagai Penguji / Pembimbing pada Seminar tersebut.</p>

  <div class="signature-block">
    <p style="margin-bottom: 0;">Ketua,</p>
    <div class="space"></div>
    <p style="font-weight: bold; text-decoration: underline; margin: 0;">${ketuaDeptName}</p>
    <p style="margin: 0;">NIP. ${ketuaDeptNip}</p>
  </div>
  <div class="clear"></div>

  <div class="tembusan">
    <p style="margin: 0; font-weight: bold;">Tembusan :</p>
    <ol>
      <li>Dosen Ybs</li>
      <li>Mahasiswa Ybs</li>
      <li>Arsip</li>
    </ol>
  </div>
</body>
</html>`;

  return await convertHtmlToPdf(html);
}

export async function generateAssessmentResultPdf(seminarId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  // Fetch all examiners with their assessments
  const finalizationData = await examinerService.getFinalizationData(seminarId, { role: 'admin' });
  
  const { seminar: semDetail, examiners, criteriaGroups } = finalizationData;
  const isFinalized = !!semDetail.resultFinalizedAt;

  if (!isFinalized) {
    throwError("Berita Acara hanya dapat diunduh setelah hasil seminar difinalisasi.", 400);
  }

  // Helpers for formatting
  const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  function formatIndoDate(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    return `${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
  }
  
  function getIndoDay(dateObj) {
    if (!dateObj) return '-';
    const d = new Date(dateObj);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[d.getDay()];
  }

  function formatTime(dateObj) {
    if (!dateObj) return '--:--';
    const d = new Date(dateObj);
    return `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  // Logo base64
  const logoPath = path.resolve(__dirname, "../../assets/unand-logo.png");
  let logoBase64 = "";
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    }
  } catch (e) {
    console.error("Assessment result logo load failed:", e);
  }

  const student = seminar.thesis?.student?.user;
  const studentName = student?.fullName || '-';
  const studentNim = student?.identityNumber || '-';
  const thesisTitle = seminar.thesis?.title || '-';
  
  const seminarDay = getIndoDay(seminar.date);
  const seminarDateFormatted = formatIndoDate(seminar.date);
  const seminarTime = `${formatTime(seminar.startTime)} - ${formatTime(seminar.endTime)}`;
  const seminarPlace = seminar.room ? seminar.room.name : (seminar.meetingLink || 'Daring');

  // Final Decision Logic
  const status = semDetail.status;
  const isPassed = status === 'passed';
  const isPassedWithRevision = status === 'passed_with_revision';
  const isFailed = status === 'failed';

  // Signature Block
  const supervisor1 = seminar.thesis?.thesisSupervisors?.find(s => s.role?.name === "Pembimbing 1");
  const dospemName = supervisor1?.lecturer?.user?.fullName || '-';
  
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 1.5cm 2cm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 10.5pt; line-height: 1.3; color: #000; }
    .header-table { width: 100%; border-collapse: collapse; border-bottom: 2.5px solid #000; padding-bottom: 8px; margin-bottom: 15px; }
    .logo-cell { width: 85px; vertical-align: middle; padding-right: 15px; }
    .logo-img { width: 80px; height: auto; }
    .header-text { text-align: center; vertical-align: middle; padding-right: 40px; }
    .header-text h3 { margin: 0; font-size: 12pt; font-weight: normal; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-text h4 { margin: 0; font-size: 12pt; font-weight: normal; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-text h2 { margin: 2px 0; font-size: 16pt; font-weight: bold; color: #000; text-transform: uppercase; }
    .header-text p { margin: 2px 0; font-size: 10pt; font-weight: normal; }
    
    .doc-title-table { width: 100%; border: 1.5px solid #000; border-collapse: collapse; margin-bottom: 20px; }
    .doc-title-table td { border: 1.5px solid #000; padding: 8px; font-weight: bold; font-size: 11pt; text-transform: uppercase; background-color: #d1d5db; text-align: center; vertical-align: middle; }
    .doc-title-table td.doc-no { width: 100px; font-size: 14pt; letter-spacing: 1px; }
    
    .section-title { font-weight: bold; margin: 15px 0 8px 0; }
    .identity-table { width: 100%; margin-left: 20px; border-collapse: collapse; }
    .identity-table td { vertical-align: top; padding: 2px 4px; }
    .identity-table td:first-child { width: 140px; }
    .identity-table td:nth-child(2) { width: 10px; }

    .assessment-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9.5pt; }
    .assessment-table th, .assessment-table td { border: 1px solid #000; padding: 4px 6px; }
    .assessment-table th { background-color: #f3f4f6; text-align: center; font-weight: bold; }
    .assessment-table .bg-gray { background-color: #f3f4f6; }
    .text-center { text-align: center; }
    
    .decision-list { list-style: none; padding: 0; margin-left: 25px; }
    .decision-list li { margin-bottom: 6px; display: flex; align-items: center; }
    .checkbox { width: 14px; height: 14px; border: 1px solid #000; display: inline-block; margin-right: 10px; position: relative; text-align: center; line-height: 14px; font-weight: bold; }
    
    .signature-grid { width: 100%; margin-top: 25px; border-collapse: collapse; }
    .signature-grid td { vertical-align: top; padding-top: 10px; }
    .sig-label { width: 40px; text-align: center; }
    .sig-name { width: 220px; border-bottom: 1px dotted #000; height: 16px; margin-bottom: 2px; }
    .sig-role { width: 150px; }
    .sig-box { width: 150px; border-bottom: 1px dotted #000; height: 16px; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}
      </td>
      <td class="header-text">
        <h3>KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI</h3>
        <h4>UNIVERSITAS ANDALAS</h4>
        <h4>FAKULTAS TEKNOLOGI INFORMASI</h4>
        <h2>DEPARTEMEN SISTEM INFORMASI</h2>
        <p>Kampus Universitas Andalas, Limau Manis 25163</p>
        <p>Website: <a href="http://si.fti.unand.ac.id">http://si.fti.unand.ac.id</a> dan email: <a href="mailto:jurusan_si@fti.unand.ac.id">jurusan_si@fti.unand.ac.id</a></p>
      </td>
    </tr>
  </table>

  <table class="doc-title-table">
    <tr>
      <td class="doc-no">TA – 11</td>
      <td>Formulir Berita Acara Seminar Hasil Tugas Akhir</td>
    </tr>
  </table>

  <div class="section-title">A. Identitas Mahasiswa</div>
  <table class="identity-table">
    <tr><td>Nama mahasiswa</td><td>:</td><td>${studentName}</td></tr>
    <tr><td>NIM</td><td>:</td><td>${studentNim}</td></tr>
    <tr><td>Judul Tugas Akhir</td><td>:</td><td>${thesisTitle}</td></tr>
    <tr><td>Hari/Tanggal</td><td>:</td><td>${seminarDay} / ${seminarDateFormatted}</td></tr>
    <tr><td>Waktu</td><td>:</td><td>${seminarTime} WIB</td></tr>
    <tr><td>Tempat</td><td>:</td><td>${seminarPlace}</td></tr>
  </table>

  <div class="section-title">B. Hasil Penilaian Seminar Tugas Akhir</div>
  <table class="assessment-table">
    <thead>
      <tr>
        <th rowspan="2" style="width: 30px;">No.</th>
        <th rowspan="2">Aspek Penilaian</th>
        <th colspan="${examiners.length}" class="bg-gray">Nilai</th>
      </tr>
      <tr>
        ${examiners.map(ex => `<th style="width: 80px;" class="bg-gray">Penguji ${ex.order}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${criteriaGroups.map((group, gIdx) => {
        const groupLabel = String.fromCharCode(65 + gIdx);
        const hasSingleCriteria = (group.criteria || []).length === 1;

        if (hasSingleCriteria) {
          const c = group.criteria[0];
          return `
            <tr>
              <td class="text-center"><b>${groupLabel}</b></td>
              <td><b>${group.code} (maksimal nilai = ${group.maxScore})</b></td>
              ${examiners.map(ex => {
                let score = 0;
                (ex.assessmentDetails || []).forEach(exGroup => {
                  const found = (exGroup.criteria || []).find(crit => crit.id === c.id);
                  if (found) score = found.score || 0;
                });
                return `<td class="text-center"><b>${score}</b></td>`;
              }).join('')}
            </tr>
          `;
        }

        return `
          <tr class="bg-gray">
            <td class="text-center"><b>${groupLabel}</b></td>
            <td><b>${group.code} (maksimal nilai = ${group.maxScore})</b></td>
            ${examiners.map(ex => {
              let totalGroupScore = 0;
              (ex.assessmentDetails || []).forEach(exGroup => {
                if (exGroup.id === group.id) {
                  (exGroup.criteria || []).forEach(crit => {
                    totalGroupScore += (crit.score || 0);
                  });
                }
              });
              return `<td class="text-center"><b>${totalGroupScore}</b></td>`;
            }).join('')}
          </tr>
          ${group.criteria.map((c, cIdx) => `
            <tr>
              <td class="text-center">(${String.fromCharCode(97 + cIdx)})</td>
              <td>${c.name}</td>
              ${examiners.map(ex => {
                let score = 0;
                (ex.assessmentDetails || []).forEach(exGroup => {
                  const found = (exGroup.criteria || []).find(crit => crit.id === c.id);
                  if (found) score = found.score || 0;
                });
                return `<td class="text-center">${score}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        `;
      }).join('')}
      <tr class="bg-gray">
        <td colspan="2" class="text-center"><b>TOTAL</b></td>
        ${examiners.map(ex => `<td class="text-center"><b>${ex.assessmentScore || 0}</b></td>`).join('')}
      </tr>
      <tr>
        <td colspan="2" class="text-center"><b>RATA-RATA</b></td>
        <td colspan="${examiners.length}" class="text-center"><b>${(Number(semDetail.finalScore) || 0).toFixed(2)}</b></td>
      </tr>
    </tbody>
  </table>
  <p style="font-size: 8pt; margin-top: 4px;">Keterangan: nilai rata-rata &le; 55 dinyatakan tidak lulus</p>

  <div class="section-title" style="margin-top: 20px;">C. Keputusan Seminar Hasil</div>
  <p style="margin-left: 20px;">Berdasarkan hasil seminar, mahasiswa dinyatakan:</p>
  <ul class="decision-list">
    <li><span class="checkbox">${isPassed ? '&#10003;' : ''}</span> Lulus dan dapat melanjutkan ke sidang tanpa perbaikan</li>
    <li><span class="checkbox">${isPassedWithRevision ? '&#10003;' : ''}</span> Lulus dengan syarat melakukan perbaikan sebelum mendaftar sidang</li>
    <li><span class="checkbox">${isFailed ? '&#10003;' : ''}</span> Tidak lulus dan harus mengulang seminar hasil</li>
  </ul>

  <div class="section-title">D. Tanda Tangan Penguji dan Pembimbing</div>
  <table class="signature-grid" style="margin-left: 20px; width: calc(100% - 20px);">
    <tr>
      <th style="text-align: left; padding-bottom: 10px;">No.</th>
      <th style="text-align: left; padding-bottom: 10px;">Nama Dosen</th>
      <th style="text-align: left; padding-bottom: 10px;">Peran</th>
      <th style="text-align: left; padding-bottom: 10px;">Tanda Tangan</th>
    </tr>
    <tr>
      <td style="width: 30px;">1.</td>
      <td class="sig-name">[ ${dospemName} ]</td>
      <td class="sig-role">Dosen Pembimbing</td>
      <td class="sig-box"></td>
    </tr>
    ${examiners.map((ex, idx) => `
      <tr>
        <td>${idx + 2}.</td>
        <td class="sig-name">[ ${ex.lecturerName} ]</td>
        <td class="sig-role">Penguji ${ex.order}</td>
        <td class="sig-box"></td>
      </tr>
    `).join('')}
  </table>
</body>
</html>`;

  return await convertHtmlToPdf(html);
}

/**
 * Sync a specific seminar to all participants' Outlook calendars
 */
export async function syncSeminarToOutlook(seminarId, adminId = null) {
  try {
    const seminar = await prisma.thesisSeminar.findUnique({
      where: { id: seminarId },
      include: {
        thesis: {
          include: {
            student: { include: { user: true } },
            thesisSupervisors: { include: { lecturer: { include: { user: true } } } },
          },
        },
        examiners: true,
        audiences: true,
        room: true,
      },
    });

    if (!seminar) return;

    // Fetch examiner user details separately since the relation is not defined in Prisma schema
    const examinerLecturerIds = (seminar.examiners || []).map(e => e.lecturerId);
    const examinerUsers = await prisma.user.findMany({
      where: { id: { in: examinerLecturerIds } },
      select: { id: true, fullName: true, email: true }
    });

    // Fetch audience student details (using the student relation which is defined)
    const audienceStudentIds = (seminar.audiences || []).map(a => a.studentId);
    const audienceUsers = await prisma.user.findMany({
      where: { id: { in: audienceStudentIds } },
      select: { id: true, fullName: true, email: true }
    });

    const participants = {
      student: {
        userId: seminar.thesis?.student?.user?.id,
        fullName: seminar.thesis?.student?.user?.fullName,
        email: seminar.thesis?.student?.user?.email
      },
      supervisors: (seminar.thesis?.thesisSupervisors || []).map(s => ({
        userId: s.lecturer?.user?.id,
        fullName: s.lecturer?.user?.fullName,
        email: s.lecturer?.user?.email
      })),
      examiners: (seminar.examiners || []).map(e => {
        const u = examinerUsers.find(user => user.id === e.lecturerId);
        return {
          userId: e.lecturerId,
          fullName: u?.fullName || "-",
          email: u?.email
        };
      }),
      audiences: (seminar.audiences || []).map(a => {
        const u = audienceUsers.find(user => user.id === a.studentId);
        return {
          userId: a.studentId,
          fullName: u?.fullName || "-",
          email: u?.email
        };
      }),
      room: seminar.room
    };

    const { createSeminarCalendarEvents } = await import("../outlook-calendar.service.js");
    await createSeminarCalendarEvents(seminar, participants, adminId);
  } catch (err) {
    console.error("[OutlookSync] Error during seminar sync orchestration:", err.message);
  }
}
