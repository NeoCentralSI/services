import * as coreRepo from "../repositories/thesis-seminar.repository.js";
import * as docRepo from "../repositories/thesis-seminar-doc.repository.js";
import * as audienceRepo from "../repositories/thesis-seminar-audience.repository.js";
import { computeEffectiveStatus } from "../utils/seminarStatus.util.js";
import * as xlsx from "xlsx";

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

export async function getSeminarList({ search, status, view, page = 1, pageSize = 10, user = {} } = {}) {
  if (view === "assignment") return getAssignmentList({ search });
  if (view === "archive") return getArchiveList({ search, page, pageSize });
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
    currentSchedule: seminar.date ? { date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime, meetingLink: seminar.meetingLink, isOnline: !seminar.roomId, room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null } : null,
    roomBookings: bookings,
    participantIds: allIds
  };
}

export async function scheduleSeminar(seminarId, body) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (!["examiner_assigned", "scheduled"].includes(seminar.status)) throwError("Penjadwalan hanya dapat dilakukan saat seminar berstatus 'examiner_assigned' atau 'scheduled'.", 400);
  if (!body.isOnline) {
    const conflict = await coreRepo.findRoomScheduleConflict({ seminarId, roomId: body.roomId, date: body.date, startTime: body.startTime, endTime: body.endTime });
    if (conflict) throwError("Ruangan sudah digunakan oleh kegiatan seminar/sidang lain pada waktu yang sama.", 409);
  }
  await coreRepo.updateSeminar(seminarId, { roomId: body.isOnline ? null : body.roomId, date: new Date(body.date), startTime: new Date(`1970-01-01T${body.startTime}:00.000Z`), endTime: new Date(`1970-01-01T${body.endTime}:00.000Z`), meetingLink: body.isOnline ? body.meetingLink : null });
  return { seminarId, status: seminar.status };
}

export async function finalizeSchedule(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (!["examiner_assigned", "scheduled"].includes(seminar.status)) {
    throwError("Seminar harus berstatus 'examiner_assigned' untuk ditetapkan.", 400);
  }
  if (!seminar.date) {
    throwError("Jadwal seminar belum diatur sebagai draft.", 400);
  }
  await coreRepo.updateSeminar(seminarId, { status: "scheduled" });
  return { seminarId, status: "scheduled" };
}

// ==================== ARCHIVE CRUD ====================

export async function createArchive(body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status seminar hasil tidak valid", 400);
  const [thesis, room, existing] = await Promise.all([coreRepo.findThesisById(body.thesisId), coreRepo.findRoomById(body.roomId), coreRepo.findSeminarByThesisId(body.thesisId)]);
  if (!thesis) throwError("Thesis tidak ditemukan", 404);
  if (!room) throwError("Ruangan tidak ditemukan", 404);
  if (existing) throwError("Thesis ini sudah memiliki data seminar hasil", 409);
  await validateExaminers(body.thesisId, body.examinerLecturerIds);
  const created = await coreRepo.createSeminarWithExaminers({ thesisId: body.thesisId, roomId: body.roomId, date: body.date, status: body.status, examinerLecturerIds: [...new Set(body.examinerLecturerIds)], assignedByUserId: userId });
  return coreRepo.findSeminarById(created.id);
}

export async function updateArchive(seminarId, body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status seminar hasil tidak valid", 400);
  if (!(await coreRepo.findSeminarBasicById(seminarId))) throwError("Data seminar hasil tidak ditemukan", 404);
  const [thesis, room, dup] = await Promise.all([coreRepo.findThesisById(body.thesisId), coreRepo.findRoomById(body.roomId), coreRepo.findSeminarByThesisIdExcludingId(body.thesisId, seminarId)]);
  if (!thesis) throwError("Thesis tidak ditemukan", 404);
  if (!room) throwError("Ruangan tidak ditemukan", 404);
  if (dup) throwError("Thesis ini sudah memiliki data seminar hasil lain", 409);
  await validateExaminers(body.thesisId, body.examinerLecturerIds);
  await coreRepo.updateSeminarWithExaminers({ seminarId, thesisId: body.thesisId, roomId: body.roomId, date: body.date, status: body.status, examinerLecturerIds: [...new Set(body.examinerLecturerIds)], assignedByUserId: userId });
  return coreRepo.findSeminarById(seminarId);
}

export async function deleteArchive(seminarId) {
  if (!(await coreRepo.findSeminarBasicById(seminarId))) throwError("Data seminar hasil tidak ditemukan", 404);
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
  const data = seminars.map((s, i) => {
    const sups = (s.thesis?.thesisSupervisors || []).map((sup) => sup.lecturer?.user?.fullName).filter(Boolean).join(", ");
    const exams = (s.examiners || []).map((e) => e.lecturerName).filter(Boolean).join("; ");
    let hasil = "-"; if (s.status === "passed") hasil = "Lulus"; else if (s.status === "passed_with_revision") hasil = "Lulus dengan Revisi"; else if (s.status === "failed") hasil = "Gagal";
    const d = s.date ? new Date(s.date) : null;
    return { "No": i + 1, "Nama": s.thesis?.student?.user?.fullName || "-", "NIM": s.thesis?.student?.user?.identityNumber || "-", "Judul TA": s.thesis?.title || "-", "Pembimbing": sups || "-", "Tanggal": d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "-", "Ruangan": s.room?.name || "-", "Hasil": hasil, "Dosen Penguji": exams || "-" };
  });
  const ws = xlsx.utils.json_to_sheet(data); const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Arsip Seminar");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function getArchiveTemplate() {
  const ws = xlsx.utils.json_to_sheet([{ "No": 1, "Nama": "Mahasiswa Contoh", "NIM": "12345678", "Judul TA": "Judul TA", "Tanggal": "2026-04-30", "Ruangan": "Ruang 1", "Hasil": "Lulus / Lulus dengan Revisi / Gagal", "Dosen Penguji 1": "Dosen 1", "Dosen Penguji 2": "Dosen 2", "Dosen Penguji 3": "(Opsional)" }]);
  const wb = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(wb, ws, "Template Import");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function importArchive(fileBuffer, userId) {
  const wb = xlsx.read(fileBuffer, { type: "buffer" }); const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const results = { total: rows.length, successCount: 0, failed: 0, failedRows: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nim = String(row["NIM"] || "").trim(); if (!nim) throw new Error("NIM kosong");
      const student = await coreRepo.findStudentByNim(nim); if (!student) throw new Error(`NIM ${nim} tidak ditemukan`);
      const thesis = await coreRepo.findActiveThesisByStudentId(student.id); if (!thesis) throw new Error(`TA untuk ${nim} tidak ditemukan`);
      if (await coreRepo.findSeminarByThesisId(thesis.id)) throw new Error("Sudah memiliki data seminar hasil");
      const ruangan = String(row["Ruangan"] || "").trim(); let roomId = null;
      if (ruangan && ruangan !== "-") { const room = await coreRepo.findRoomByNameLike(ruangan); if (!room) throw new Error(`Ruangan "${ruangan}" tidak ditemukan`); roomId = room.id; }
      const hasil = String(row["Hasil"] || "").trim().toLowerCase();
      let status = "failed"; if (hasil.includes("dengan revisi")) status = "passed_with_revision"; else if (hasil.includes("lulus")) status = "passed";
      const tgl = String(row["Tanggal"] || "").trim(); let date = null;
      if (tgl && tgl !== "-") { const p = new Date(tgl); if (!isNaN(p.getTime())) date = p.toISOString(); }
      const examinerIds = [];
      for (const n of [row["Dosen Penguji 1"], row["Dosen Penguji 2"], row["Dosen Penguji 3"]].map((v) => String(v || "").trim()).filter((v) => v && v !== "-" && !v.includes("Opsional"))) {
        const l = await coreRepo.findLecturerByNameLike(n); if (l) examinerIds.push(l.id); else throw new Error(`Dosen "${n}" tidak ditemukan`);
      }
      if (examinerIds.length < 2) throw new Error("Minimal 2 Dosen Penguji");
      await coreRepo.createSeminarWithExaminers({ thesisId: thesis.id, date, roomId, status, examinerLecturerIds: examinerIds, assignedByUserId: userId });
      results.successCount++;
    } catch (err) {
      results.failed++; results.failedRows.push({ row: i + 2, error: err.message.includes("prisma") ? "Format data tidak valid." : err.message });
    }
  }
  return results;
}
