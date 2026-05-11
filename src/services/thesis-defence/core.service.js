import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import xlsx from "xlsx";
import prisma from "../../config/prisma.js";
import * as coreRepo from "../../repositories/thesis-defence/thesis-defence.repository.js";
import * as docRepo from "../../repositories/thesis-defence/doc.repository.js";
import { computeEffectiveDefenceStatus } from "../../utils/defenceStatus.util.js";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import { mapScoreToGrade } from "../../utils/score.util.js";
import * as examinerService from "./examiner.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function getAssignmentStatus(active, total = 0) {
  if (!active || active.length === 0) return total > 0 ? "rejected" : "unassigned";
  const allAvailable = active.every((e) => e.availabilityStatus === "available");
  return allAvailable ? "confirmed" : "pending";
}

const STATUS_PRIORITY = {
  registered: 0,
  verified: 1,
  examiner_assigned: 2,
  scheduled: 3,
  ongoing: 4,
  passed: 5,
  passed_with_revision: 5,
  failed: 5,
  cancelled: 5,
};

const RESULT_STATUSES = ["passed", "passed_with_revision", "failed", "cancelled"];
const FINAL_STATUSES = ["passed", "passed_with_revision"];

function buildSearchWhere(search) {
  if (!search) return {};
  return {
    thesis: {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    },
  };
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

// ============================================================
// LIST
// ============================================================

export async function getDefenceList({ search, status, view, page = 1, pageSize = 10, user = {} } = {}) {
  if (view === "archive") return getArchiveList({ search, page, pageSize, status });
  if (view === "verification") return getAdminList({ search, status });
  if (view === "assignment") return getAssignmentList({ search });
  if (view === "supervised_students" && user.lecturerId) {
    const data = await coreRepo.findDefencesBySupervisor(user.lecturerId, { search });
    return await mapLecturerDefenceList(data, user.lecturerId, "supervisor");
  }
  if (view === "examiner_requests" && user.lecturerId) {
    const data = await coreRepo.findDefencesByExaminer(user.lecturerId, { search });
    return await mapLecturerDefenceList(data, user.lecturerId, "examiner");
  }
  return getAdminList({ search, status });
}

async function getArchiveList({ search, page, pageSize, status }) {
  const skip = (page - 1) * pageSize;
  const statusFilter = parseStatusFilter(status);
  const archiveStatuses = statusFilter.database.length > 0
    ? statusFilter.database.filter((item) => RESULT_STATUSES.includes(item))
    : RESULT_STATUSES;
  
  const where = { status: { in: archiveStatuses }, ...buildSearchWhere(search) };
  const { data, total } = await coreRepo.findDefencesPaginated({ where, skip, take: pageSize });

  return {
    defences: data.map((d) => ({
      id: d.id,
      thesisId: d.thesisId,
      thesisTitle: d.thesis?.title || "-",
      student: {
        id: d.thesis?.student?.id || null,
        fullName: d.thesis?.student?.user?.fullName || "-",
        nim: d.thesis?.student?.user?.identityNumber || "-",
      },
      date: d.date,
      room: d.room,
      status: d.status,
      finalScore: d.finalScore,
      grade: d.grade,
      isEditable: d.registeredAt === null,
      examiners: (d.examiners || []).map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
      })),
    })),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function getAdminList({ search, status }) {
  const statusFilter = parseStatusFilter(status);
  const where = { ...buildSearchWhere(search), registeredAt: { not: null } };
  
  if (statusFilter.database.length === 1) {
    where.status = statusFilter.database[0];
  } else if (statusFilter.database.length > 1) {
    where.status = { in: statusFilter.database };
  }

  const data = await coreRepo.findAllDefences({ search, status: where.status });
  const docTypes = await docRepo.getDefenceDocumentTypes();
  
  const mapped = data.map((d) => ({
    id: d.id,
    thesisId: d.thesisId,
    studentName: d.thesis?.student?.user?.fullName || "-",
    studentNim: d.thesis?.student?.user?.identityNumber || "-",
    thesisTitle: d.thesis?.title || "-",
    supervisors: (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    })),
    status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
    registeredAt: d.registeredAt,
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
    room: d.room,
    examiners: (d.examiners || []).map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: e.lecturerName || "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
    })),
    documentSummary: {
      total: docTypes.length,
      submitted: (d.documents || []).filter((doc) => doc.status === "submitted").length,
      approved: (d.documents || []).filter((doc) => doc.status === "approved").length,
      declined: (d.documents || []).filter((doc) => doc.status === "declined").length,
    },
  }));

  const filtered = statusFilter.requested.length > 0
    ? mapped.filter((item) => statusFilter.requested.includes(item.status))
    : mapped;

  filtered.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    
    return (a.registeredAt ? new Date(a.registeredAt).getTime() : 0) - 
           (b.registeredAt ? new Date(b.registeredAt).getTime() : 0);
  });

  return filtered;
}

async function mapLecturerDefenceList(data, lecturerId, role) {
  const docTypes = await docRepo.getDefenceDocumentTypes();
  return data.map((d) => {
    const myExaminer = (d.examiners || []).find((e) => e.lecturerId === lecturerId);
    const mySupervisor = (d.thesis?.thesisSupervisors || []).find((ts) => ts.lecturerId === lecturerId);

    return {
      id: d.id,
      thesisId: d.thesisId,
      studentName: d.thesis?.student?.user?.fullName || "-",
      studentNim: d.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors: (d.thesis?.thesisSupervisors || []).map((ts) => ({
        name: ts.lecturer?.user?.fullName || "-",
        role: ts.role?.name || "-",
      })),
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      room: d.room,
      examiners: (d.examiners || []).map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
      })),
      documentSummary: {
        total: docTypes.length,
        submitted: (d.documents || []).filter((doc) => doc.status === "submitted").length,
        approved: (d.documents || []).filter((doc) => doc.status === "approved").length,
        declined: (d.documents || []).filter((doc) => doc.status === "declined").length,
      },
      // Lecturer specific
      myRole: mySupervisor?.role?.name || (myExaminer ? "Penguji" : "-"),
      myExaminerStatus: myExaminer?.availabilityStatus || null,
      myExaminerId: myExaminer?.id || null,
      myExaminerOrder: myExaminer?.order || null,
    };
  });
}

const ASSIGNMENT_ORDER = { unassigned: 0, rejected: 1, partially_rejected: 2, pending: 3, confirmed: 4 };


async function getAssignmentList({ search }) {
  const data = await coreRepo.findDefencesForAssignment({ search });
  const mapped = data.map((d) => {
    const active = (d.examiners || []).filter((e) => ["available", "pending"].includes(e.availabilityStatus));
    const rejected = (d.examiners || []).filter((e) => e.availabilityStatus === "unavailable");
    
    const isConcluded = ["passed", "passed_with_revision", "failed", "cancelled"].includes(d.status);
    const assignmentStatus = isConcluded ? "finished" : getAssignmentStatus(active, (d.examiners || []).length);

    return {
      id: d.id,
      thesisId: d.thesisId,
      studentName: d.thesis?.student?.user?.fullName || "-",
      studentNim: d.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors: (d.thesis?.thesisSupervisors || []).map((ts) => ({
        name: ts.lecturer?.user?.fullName || "-",
        role: ts.role?.name || "-",
      })),
      status: d.status,
      registeredAt: d.registeredAt,
      assignmentStatus,
      examiners: active.map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
      })),
      rejectedExaminers: rejected.map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
        assignedAt: e.assignedAt,
      })),
    };
  });

  const ORDER = { unassigned: 0, rejected: 1, partially_rejected: 2, pending: 3, confirmed: 4, finished: 5 };
  mapped.sort((a, b) => (ORDER[a.assignmentStatus] ?? 99) - (ORDER[b.assignmentStatus] ?? 99));

  return mapped;
}


// ============================================================
// DETAIL
// ============================================================

export async function getDefenceDetail(defenceId, user = {}) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const student = defence.thesis?.student;
  const supervisors = (defence.thesis?.thesisSupervisors || []).map((ts) => ({
    lecturerId: ts.lecturerId,
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  const documents = await Promise.all(
    (defence.documents || []).map(async (d) => {
      const withFile = await docRepo.findDefenceDocumentWithFile(defence.id, d.documentTypeId);
      return {
        documentTypeId: d.documentTypeId,
        documentId: d.documentId,
        status: d.status,
        submittedAt: d.submittedAt,
        verifiedAt: d.verifiedAt,
        notes: d.notes,
        verifiedBy: d.verifier?.fullName || null,
        fileName: withFile?.document?.fileName || null,
        filePath: withFile?.document?.filePath || null,
      };
    })
  );

  const docTypes = await docRepo.getDefenceDocumentTypes();
  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );

  // Lecturer-specific viewer info
  const lecturerId = user?.lecturerId || null;
  const myExaminerRecords = lecturerId
    ? (defence.examiners || [])
        .filter((e) => e.lecturerId === lecturerId)
        .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
    : [];
  const myExaminer = myExaminerRecords[0] || null;
  const mySupervisor = lecturerId
    ? (defence.thesis?.thesisSupervisors || []).find((ts) => ts.lecturerId === lecturerId) || null
    : null;
  const isExaminer = !!myExaminer;
  const isSupervisor = !!mySupervisor;

  const activeExaminers = (defence.examiners || []).filter((e) => e.availabilityStatus === "available");
  const allExaminerSubmitted =
    activeExaminers.length >= 2 &&
    activeExaminers.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);
  const supervisorAssessmentSubmitted = defence.supervisorScore !== null;

  return {
    id: defence.id,
    status: effectiveStatus,
    registeredAt: defence.registeredAt,
    date: defence.date,
    startTime: defence.startTime,
    endTime: defence.endTime,
    meetingLink: defence.meetingLink,
    finalScore: defence.finalScore,
    grade: defence.grade,
    resultFinalizedAt: defence.resultFinalizedAt,
    cancelledReason: defence.cancelledReason,
    room: defence.room ? { id: defence.room.id, name: defence.room.name } : null,
    thesis: { id: defence.thesis?.id, title: defence.thesis?.title },
    student: {
      name: student?.user?.fullName || "-",
      nim: student?.user?.identityNumber || "-",
    },
    supervisors,
    documents,
    documentTypes: docTypes.map((dt) => ({ id: dt.id, name: dt.name })),
    examiners: (defence.examiners || [])
      .filter((e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending")
      .map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
      })),
    rejectedExaminers: (defence.examiners || [])
      .filter((e) => e.availabilityStatus === "unavailable")
      .map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
        assignedAt: e.assignedAt,
      })),
    viewerRole: isSupervisor ? "supervisor" : isExaminer ? "examiner" : "none",
    mySupervisorRole: mySupervisor?.role?.name || null,
    myExaminerId: myExaminer?.id || null,
    myExaminerOrder: myExaminer?.order || null,
    myExaminerAvailabilityStatus: myExaminer?.availabilityStatus || null,
    myAssessmentSubmittedAt: myExaminer?.assessmentSubmittedAt || null,
    canOpenExaminerAssessment:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isExaminer &&
      myExaminer?.availabilityStatus === "available",
    canOpenSupervisorAssessment:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) && isSupervisor,
    canOpenSupervisorFinalization:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) && isSupervisor,
    allExaminerSubmitted,
    supervisorAssessmentSubmitted,
  };
}

// ============================================================
// SCHEDULING
// ============================================================

export async function getSchedulingData(defenceId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const supervisorIds = (defence.thesis?.thesisSupervisors || [])
    .filter((ts) => ts.role?.name === "Pembimbing 1")
    .map((ts) => ts.lecturerId)
    .filter(Boolean);

  const examinerIds = (defence.examiners || []).map((e) => e.lecturerId).filter(Boolean);

  const allLecturerIds = [...new Set([...supervisorIds, ...examinerIds])];

  const [availabilities, rooms, bookings] = await Promise.all([
    allLecturerIds.length > 0 ? coreRepo.findLecturerAvailabilities(allLecturerIds) : [],
    coreRepo.findAllRooms(),
    coreRepo.findRoomBookings(),
  ]);

  const lecturerNameMap = {};
  (defence.thesis?.thesisSupervisors || []).forEach((ts) => {
    if (ts.lecturerId) lecturerNameMap[ts.lecturerId] = ts.lecturer?.user?.fullName || "-";
  });
  (defence.examiners || []).forEach((e) => {
    if (e.lecturerId) lecturerNameMap[e.lecturerId] = e.lecturerName || "-";
  });

  return {
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    lecturerAvailabilities: availabilities.map((a) => ({
      id: a.id,
      lecturerId: a.lecturerId,
      lecturerName: lecturerNameMap[a.lecturerId] || "-",
      day: a.day,
      startTime: a.startTime,
      endTime: a.endTime,
      validFrom: a.validFrom,
      validUntil: a.validUntil,
    })),
    currentSchedule: defence.date
      ? {
          date: defence.date,
          startTime: defence.startTime,
          endTime: defence.endTime,
          meetingLink: defence.meetingLink,
          isOnline: !defence.roomId,
          room: defence.room ? { id: defence.room.id, name: defence.room.name } : null,
        }
      : null,
    roomBookings: bookings,
    participantIds: allLecturerIds,
  };
}

export async function scheduleDefence(defenceId, { roomId, date, startTime, endTime, isOnline, meetingLink }) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  if (!["examiner_assigned", "scheduled"].includes(defence.status)) {
    throwError(
      "Penjadwalan hanya dapat dilakukan saat sidang berstatus 'examiner_assigned' atau 'scheduled'.",
      400
    );
  }

  if (!isOnline) {
    const conflict = await coreRepo.findRoomScheduleConflict({ defenceId, roomId, date, startTime, endTime });
    if (conflict) throwError("Ruangan sudah digunakan oleh sidang lain pada waktu yang sama.", 409);
  }

  await coreRepo.updateDefenceSchedule(defenceId, {
    roomId: isOnline ? null : roomId,
    date,
    startTime,
    endTime,
    meetingLink: isOnline ? meetingLink : null,
  });

  return { defenceId, status: defence.status };
}

export async function setSchedule(defenceId, payload) {
  return scheduleDefence(defenceId, payload);
}

export async function finalizeSchedule(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  if (defence.status === "scheduled") {
    return { defenceId, status: "scheduled" };
  }

  if (defence.status !== "examiner_assigned") {
    throwError(`Hanya sidang berstatus examiner_assigned yang dapat difinalisasi jadwalnya. Status saat ini: ${defence.status}`, 400);
  }

  if (!defence.date || !defence.startTime || !defence.endTime) {
    throwError("Jadwal sidang belum lengkap. Harap atur jadwal terlebih dahulu sebelum melakukan finalisasi.", 400);
  }

  await coreRepo.updateDefenceStatus(defenceId, "scheduled");
  return { defenceId, status: "scheduled" };
}

export async function cancelDefence(defenceId, { cancelledReason }) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  await coreRepo.updateDefence(defenceId, {
    status: "cancelled",
    cancelledReason: cancelledReason || null,
  });

  return { defenceId, status: "cancelled" };
}

export async function createArchive(body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status sidang tidak valid", 400);
  
  // Validate if thesis exists
  const theses = await coreRepo.getThesisOptions();
  const thesis = theses.find(t => t.id === body.thesisId);
  if (!thesis) throwError("Tugas Akhir tidak ditemukan", 404);

  // Check for existing passed result
  const existingPassed = thesis.thesisDefences.find(d => FINAL_STATUSES.includes(d.status));
  if (existingPassed) {
    throwError("Mahasiswa ini sudah lulus sidang tugas akhir.", 409);
  }

  await validateExaminers(body.thesisId, body.examinerLecturerIds);
  
  const created = await coreRepo.createArchive({ ...body, userId });
  return coreRepo.findDefenceById(created.id);
}

export async function updateArchive(defenceId, body, userId) {
  if (!RESULT_STATUSES.includes(body.status)) throwError("Status sidang tidak valid", 400);
  
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Data sidang tidak ditemukan", 404);
  if (defence.registeredAt !== null) throwError("Data sidang aktif tidak dapat diubah melalui fitur arsip", 403);

  await validateExaminers(defence.thesisId, body.examinerLecturerIds);
  
  await coreRepo.updateArchive(defenceId, { ...body, userId });
  return coreRepo.findDefenceById(defenceId);
}

export async function deleteArchive(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Data sidang tidak ditemukan", 404);
  if (defence.registeredAt !== null) throwError("Data sidang aktif tidak dapat dihapus melalui fitur arsip", 403);
  
  await coreRepo.deleteDefence(defenceId);
  return { success: true };
}

async function validateExaminers(thesisId, ids) {
  const unique = [...new Set(ids || [])];
  if (unique.length < 1) throwError("Minimal 1 dosen penguji harus dipilih", 400);
  
  // In a real app, we'd fetch supervisors for this thesis and check them
  // For now, let's assume coreRepo has a way or just check from the options
  const theses = await coreRepo.getThesisOptions();
  const thesis = theses.find(t => t.id === thesisId);
  if (thesis) {
    const sups = thesis.thesisSupervisors.map(s => s.lecturerId);
    if (unique.some(id => sups.includes(id))) {
      throwError("Dosen pembimbing tidak boleh menjadi dosen penguji", 400);
    }
  }
}

// ============================================================
// OPTIONS
// ============================================================

export async function getThesisOptions() {
  const data = await coreRepo.getThesisOptions();
  return data.map(t => ({
    id: t.id,
    thesisTitle: t.title,
    studentName: t.student?.user?.fullName || "-",
    studentNim: t.student?.user?.identityNumber || "-",
    hasDefenceResult: t.thesisDefences.some(d => FINAL_STATUSES.includes(d.status)),
    defenceResultId: t.thesisDefences.find(d => FINAL_STATUSES.includes(d.status))?.id || null,
    supervisorIds: t.thesisSupervisors.map(s => s.lecturerId),
  }));
}

export async function getLecturerOptions() {
  const data = await coreRepo.getLecturerOptions();
  return data.map(l => ({
    id: l.id,
    fullName: l.user?.fullName || "-",
    nip: l.user?.identityNumber || "-",
  }));
}

export async function getStudentOptions() {
  const data = await coreRepo.getStudentOptions();
  return data.map(s => ({
    id: s.id,
    fullName: s.user?.fullName || "-",
    nip: s.user?.identityNumber || "-",
  }));
}

export async function getRoomOptions() {
  const rooms = await coreRepo.findAllRooms();
  return rooms.map(r => ({ id: r.id, name: r.name }));
}

// ============================================================
// IMPORT/EXPORT
// ============================================================

export async function exportArchive() {
  const defences = await coreRepo.findAllDefences();
  // Filter for archived results only
  const archived = defences.filter(d => RESULT_STATUSES.includes(d.status));

  const data = archived.map((d, i) => {
    const sups = (d.thesis?.thesisSupervisors || []).map(s => s.lecturer?.user?.fullName).filter(Boolean).join(", ");
    const examiners = (d.examiners || []).map(e => e.lecturerName).filter(Boolean);
    let hasil = d.status === "passed" ? "Lulus" : d.status === "passed_with_revision" ? "Lulus dengan Revisi" : "Gagal";
    const date = d.date ? new Date(d.date) : null;
    
    return {
      "No": i + 1,
      "Nama": d.thesis?.student?.user?.fullName || "-",
      "NIM": d.thesis?.student?.user?.identityNumber || "-",
      "Judul TA": d.thesis?.title || "-",
      "Pembimbing": sups || "-",
      "Tanggal": date ? date.toISOString().split("T")[0] : "-",
      "Ruangan": d.room?.name || "-",
      "Nilai": d.finalScore ? Math.round((Number(d.finalScore) + Number.EPSILON) * 100) / 100 : "-",
      "Grade": d.grade || "-",
      "Hasil": hasil,
      "Dosen Penguji": examiners.join("; ") || "-",
    };
  });

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Arsip Sidang TA");
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function importArchive(fileBuffer, userId) {
  const wb = xlsx.read(fileBuffer, { type: "buffer" });
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const results = { total: rows.length, successCount: 0, failed: 0, failedRows: [] };

  const [rooms, lecturers, students, theses] = await Promise.all([
    coreRepo.findAllRooms(),
    coreRepo.getLecturerOptions(),
    coreRepo.getStudentOptions(),
    coreRepo.getThesisOptions(),
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

      const hasPassed = thesis.thesisDefences.some(d => FINAL_STATUSES.includes(d.status));
      if (hasPassed) throw new Error("Sudah lulus sidang TA");

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

      const finalScore = row["Nilai"] ? Number(row["Nilai"]) : null;
      const grade = row["Grade"] ? String(row["Grade"]).trim() : null;

      const examinerColumns = [row["Dosen Penguji 1"], row["Dosen Penguji 2"], row["Dosen Penguji 3"]]
        .map((value) => String(value || "").trim())
        .filter((value) => value && value !== "-" && !value.includes("Opsional"));
      const fallbackExaminerColumn = String(row["Dosen Penguji"] || "")
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean);
      const examinerNames = examinerColumns.length > 0 ? examinerColumns : fallbackExaminerColumn;

      const examinerLecturerIds = [];
      for (const name of examinerNames) {
        const lec = lecturers.find(l => l.user.fullName.toLowerCase().includes(name.toLowerCase()));
        if (lec) examinerLecturerIds.push(lec.id);
        else throw new Error(`Dosen "${name}" tidak ditemukan`);
      }

      if (examinerLecturerIds.length < 1) throw new Error("Minimal 1 Dosen Penguji");

      await coreRepo.createArchive({
        thesisId: thesis.id,
        date,
        roomId,
        status,
        finalScore,
        grade,
        examinerLecturerIds,
        userId,
      });

      results.successCount++;
    } catch (err) {
      results.failed++;
      results.failedRows.push({ row: i + 2, error: err.message.includes("prisma") ? "Format data tidak valid." : err.message });
    }
  }
  return results;
}

export async function generateAssessmentResultPdf(defenceId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const finalizationData = await examinerService.getFinalizationData(defenceId, { role: "admin" });
  const { defence: defDetail, examiners, supervisorAssessment } = finalizationData;
  
  if (!defDetail.resultFinalizedAt) {
    throwError("Hasil penilaian hanya dapat diunduh setelah hasil sidang difinalisasi.", 400);
  }

  // Helpers
  const indonesianMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const formatIndoDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    return `${d.getDate()} ${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
  };
  const getIndoDay = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[d.getDay()];
  };
  const formatTime = (time) => {
    if (!time) return '--:--';
    const d = new Date(time);
    return `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  // Logo load
  const logoPath = path.resolve(__dirname, "../assets/unand-logo.png");
  let logoBase64 = "";
  try {
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    }
  } catch (e) {
    console.error("Assessment result logo load failed:", e);
  }

  const student = defence.thesis?.student?.user;
  const studentName = student?.fullName || '-';
  const studentNim = student?.identityNumber || '-';
  const thesisTitle = defence.thesis?.title || '-';

  const defenceDay = getIndoDay(defence.date);
  const defenceDateFormatted = formatIndoDate(defence.date);
  const defenceTime = `${formatTime(defence.startTime)} - ${formatTime(defence.endTime)}`;
  const defencePlace = defence.room ? (defence.room.name + (defence.room.location ? `, ${defence.room.location}` : '')) : (defence.meetingLink || 'Daring');

  // Supervisors and Examiners for Identity section
  const supervisors = (defence.thesis?.thesisSupervisors || [])
    .sort((a, b) => (a.role?.name || '').localeCompare(b.role?.name || ''))
    .map(ts => ts.lecturer?.user?.fullName || '-');
  const supervisor1 = supervisors[0] || '-';
  const supervisor2 = supervisors[1] || '-';

  const examinerList = examiners.map(ex => ({
    name: ex.lecturerName || '-',
    order: ex.order
  }));

  // Examiners data
  const examinerScores = examiners.map(e => e.assessmentScore).filter(s => s !== null);
  const averageExaminerScore = examinerScores.length > 0 ? (examinerScores.reduce((a, b) => a + b, 0) / examinerScores.length) : 0;
  
  // Unique groups for examiners to build the recap table
  const uniqueExaminerGroups = [];
  const seenGroups = new Set();
  examiners.forEach(ex => {
    (ex.assessmentDetails || []).forEach(group => {
      if (!seenGroups.has(group.code)) {
        seenGroups.add(group.code);
        uniqueExaminerGroups.push(group);
      }
    });
  });

  const supervisorAssessmentGroups = supervisorAssessment?.assessmentDetails || [];

  // Grade Checkbox Logic
  const na = defDetail.finalScore || 0;
  const grades = [
    { label: '80 ≤ NA ≤ 100', mutu: 'A', checked: na >= 80 && na <= 100 },
    { label: '76 ≤ NA < 80', mutu: 'A-', checked: na >= 76 && na < 80 },
    { label: '70 ≤ NA < 75', mutu: 'B+', checked: na >= 70 && na < 75 },
    { label: '65 ≤ NA < 70', mutu: 'B', checked: na >= 65 && na < 70 },
    { label: '60 ≤ NA < 65', mutu: 'B-', checked: na >= 60 && na < 65 },
    { label: '55 ≤ NA < 60', mutu: 'C+', checked: na >= 55 && na < 60 },
    { label: '50 ≤ NA < 55', mutu: 'C', checked: na >= 50 && na < 55 },
    { label: '45 ≤ NA < 50', mutu: 'D', checked: na >= 45 && na < 50 },
    { label: '< 45', mutu: 'E', checked: na < 45 },
  ];

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 1.2cm 1.5cm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 10pt; line-height: 1.2; color: #000; }
    .header-table { width: 100%; border-collapse: collapse; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
    .logo-cell { width: 70px; vertical-align: middle; padding-right: 10px; }
    .logo-img { width: 70px; height: auto; }
    .header-text { text-align: center; vertical-align: middle; }
    .header-text h3 { margin: 0; font-size: 11pt; font-weight: normal; text-transform: uppercase; }
    .header-text h4 { margin: 0; font-size: 11pt; font-weight: bold; text-transform: uppercase; }
    .header-text h2 { margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    .header-text p { margin: 1px 0; font-size: 8.5pt; }
    
    .title-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .ta-code { width: 90px; border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; font-size: 14pt; background-color: #d1d5db; }
    .title-box { border: 1px solid #000; border-left: none; padding: 6px; text-align: center; font-weight: bold; font-size: 11pt; text-transform: uppercase; background-color: #d1d5db; letter-spacing: 1px; }
    
    .section-title { font-weight: bold; margin: 12px 0 6px 0; font-size: 10.5pt; }
    .identity-table { width: 100%; margin-left: 15px; border-collapse: collapse; }
    .identity-table td { vertical-align: top; padding: 1px 4px; }
    .identity-table td:first-child { width: 150px; }
    .identity-table td:nth-child(2) { width: 10px; }

    .assessment-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 9.5pt; }
    .assessment-table th, .assessment-table td { border: 1px solid #000; padding: 3px 6px; }
    .assessment-table th { background-color: #d1d5db; text-align: center; font-weight: bold; }
    .assessment-table .bg-gray { background-color: #d1d5db; }
    .text-center { text-align: center; }
    
    .checkbox-container { margin: 15px 0 15px 40px; }
    .checkbox-item { margin-bottom: 8px; display: flex; align-items: center; }
    .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; margin-right: 10px; text-align: center; line-height: 10px; font-size: 10pt; font-weight: bold; }

    .signature-grid { width: 100%; margin-top: 25px; border-collapse: collapse; }
    .signature-grid td { vertical-align: bottom; padding: 4px 0; }
    .sig-label { width: 30px; text-align: left; }
    .sig-name-box { width: 180px; border-bottom: 1px dotted #000; }
    .sig-role { width: 150px; }
    .sig-line { width: 150px; border-bottom: 1px dotted #000; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}</td>
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

  <table class="title-table">
    <tr>
      <td class="ta-code">TA – 16</td>
      <td class="title-box">Formulir Berita Acara Sidang Tugas Akhir</td>
    </tr>
  </table>

  <div class="section-title">A. Identitas Mahasiswa</div>
  <table class="identity-table">
    <tr><td>Nama mahasiswa</td><td>:</td><td>${studentName}</td></tr>
    <tr><td>NIM</td><td>:</td><td>${studentNim}</td></tr>
    <tr><td>Judul Tugas Akhir</td><td>:</td><td>${thesisTitle}</td></tr>
    <tr><td>Hari/Tanggal</td><td>:</td><td>${defenceDay} / ${defenceDateFormatted}</td></tr>
    <tr><td>Waktu</td><td>:</td><td>${defenceTime}</td></tr>
    <tr><td>Tempat</td><td>:</td><td>${defencePlace}</td></tr>
    <tr><td>Dosen Pembimbing 1</td><td>:</td><td>${supervisor1}</td></tr>
    <tr><td>Dosen Pembimbing 2 <i>(jika ada)</i></td><td>:</td><td>${supervisor2}</td></tr>
    ${examinerList.map(ex => `<tr><td>Dosen Penguji ${ex.order}</td><td>:</td><td>${ex.name}</td></tr>`).join('')}
  </table>

  <div class="section-title">B. Hasil Rekapitulasi Penilaian Sidang Tugas Akhir dari Penguji</div>
  <table class="assessment-table">
    <thead>
      <tr>
        <th rowspan="2" style="width: 30px;">No.</th>
        <th rowspan="2">Aspek Penilaian</th>
        <th colspan="${examiners.length}">Nilai</th>
      </tr>
      <tr>
        ${examiners.map(ex => `<th style="width: ${Math.floor(200 / examiners.length)}px;">Penguji ${ex.order}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${uniqueExaminerGroups.map((group, idx) => `
        <tr>
          <td class="text-center">${String.fromCharCode(65 + idx)}</td>
          <td>${group.code} (maksimal nilai = ${group.criteria.reduce((s, c) => s + (c.maxScore || 0), 0)})</td>
          ${examiners.map(ex => {
            const groupScore = ex.assessmentDetails?.find(g => g.code === group.code)?.criteria?.reduce((s, c) => s + (Number(c.score) || 0), 0) ?? '';
            return `<td class="text-center">${groupScore}</td>`;
          }).join('')}
        </tr>
      `).join('')}
      <tr class="bg-gray">
        <td colspan="2" class="text-center"><b>TOTAL</b></td>
        ${examiners.map(ex => `<td class="text-center"><b>${ex.assessmentScore || ''}</b></td>`).join('')}
      </tr>
      <tr>
        <td colspan="2" class="text-center"><b>RATA-RATA</b><br/><small>(nilai maksimal = 70)</small></td>
        <td colspan="${examiners.length}" class="text-center"><b>${averageExaminerScore.toFixed(2)}</b></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">C. Hasil Rekapitulasi Penilaian Tugas Akhir dari Pembimbing</div>
  <table class="assessment-table">
    <thead>
      <tr>
        <th style="width: 30px;">No.</th>
        <th>Aspek Penilaian</th>
        <th style="width: 150px;">Nilai<br/>Pembimbing</th>
      </tr>
    </thead>
    <tbody>
      ${supervisorAssessmentGroups.map((group, idx) => `
        <tr>
          <td class="text-center">${String.fromCharCode(65 + idx)}</td>
          <td>${group.code} (maksimal nilai = ${group.criteria.reduce((s, c) => s + (c.maxScore || 0), 0)})</td>
          <td class="text-center">${group.criteria.reduce((s, c) => s + (Number(c.score) || 0), 0)}</td>
        </tr>
      `).join('')}
      <tr class="bg-gray">
        <td colspan="2" class="text-center"><b>TOTAL</b><br/><small>(nilai maksimal = 30)</small></td>
        <td class="text-center"><b>${supervisorAssessment?.assessmentScore || 0}</b></td>
      </tr>
    </tbody>
  </table>

  <div style="page-break-before: always;"></div>
  
  <table class="header-table">
    <tr>
      <td class="logo-cell">${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}</td>
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

  <div class="section-title">D. Perhitungan Nilai Akhir</div>
  <table class="assessment-table">
    <thead>
      <tr>
        <th style="width: 30px;">No.</th>
        <th>Penilaian</th>
        <th style="width: 150px;">Nilai</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-center">A</td>
        <td>Hasil Rekapitulasi Penilaian Sidang Tugas Akhir dari Penguji</td>
        <td class="text-center">${averageExaminerScore.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="text-center">B</td>
        <td>Hasil Rekapitulasi Penilaian Tugas Akhir dari Pembimbing</td>
        <td class="text-center">${(supervisorAssessment?.assessmentScore || 0).toFixed(2)}</td>
      </tr>
      <tr class="bg-gray">
        <td colspan="2" class="text-center"><b>TOTAL</b><br/><small>(nilai maksimal = 100)</small></td>
        <td class="text-center"><b>${na.toFixed(2)}</b></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">E. Keterangan Penilaian Akhir</div>
  <table class="assessment-table" style="width: 70%; margin-left: auto; margin-right: auto;">
    <thead>
      <tr>
        <th style="width: 40%;">Nilai Akhir (NA)</th>
        <th style="width: 30%;">Nilai Mutu</th>
        <th style="width: 30%;">Pilih (✔)</th>
      </tr>
    </thead>
    <tbody>
      ${grades.map(g => `
        <tr>
          <td class="text-center">${g.label}</td>
          <td class="text-center">${g.mutu}</td>
          <td class="text-center"><div class="box">${g.checked ? '✔' : ''}</div></td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 20px;">
    <p>Berdasarkan hasil Sidang Tugas Akhir, mahasiswa dinyatakan:</p>
    <div class="checkbox-container">
      <div class="checkbox-item"><span class="box">${defDetail.status === 'passed' ? '✔' : ''}</span> Lulus tanpa perbaikan</div>
      <div class="checkbox-item"><span class="box">${defDetail.status === 'passed_with_revision' ? '✔' : ''}</span> Lulus dengan perbaikan</div>
      <div class="checkbox-item"><span class="box">${defDetail.status === 'failed' ? '✔' : ''}</span> Tidak lulus dan harus mengulang sidang</div>
    </div>
  </div>

  <div class="section-title">F. Validasi Penilai</div>
  <table class="signature-grid">
    <thead>
      <tr>
        <th style="width: 30px; text-align: left;">No.</th>
        <th style="width: 250px; text-align: left;">Nama Dosen</th>
        <th style="width: 150px; text-align: left;">Peran</th>
        <th style="width: 150px; text-align: left;">Tanda Tangan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1.</td>
        <td class="sig-name-box">[ ${finalizationData.supervisor.name} ]</td>
        <td class="sig-role">Dosen Pembimbing</td>
        <td class="sig-line"></td>
      </tr>
      ${examiners.map((ex, idx) => `
        <tr>
          <td>${idx + 2}.</td>
          <td class="sig-name-box">[ ${ex.lecturerName} ]</td>
          <td class="sig-role">Penguji ${ex.order}</td>
          <td class="sig-line"></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

  return await convertHtmlToPdf(html);
}

export async function generateInvitationLetter(defenceId, nomorSurat) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
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

  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const examinerIds = defence.examiners.map(e => e.lecturerId);
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
  const supervisor1 = defence.thesis?.thesisSupervisors?.find(
    (ts) => ts.role?.name === "Pembimbing 1"
  );
  const supervisorName = supervisor1?.lecturer?.user?.fullName || '-';

  // Map Examiners in order
  const sortedExaminers = defence.examiners
    .sort((a, b) => a.order - b.order)
    .map(e => {
      const l = examinerLecturers.find(lecturer => lecturer.id === e.lecturerId);
      return l?.user?.fullName || '-';
    });

  const lecturersList = [];
  if (supervisorName !== '-') lecturersList.push(supervisorName);
  lecturersList.push(...sortedExaminers);

  const studentName = defence.thesis?.student?.user?.fullName || '-';
  const studentNim = defence.thesis?.student?.user?.identityNumber || '-';
  const thesisTitle = defence.thesis?.title || '-';

  const defenceDay = getIndoDay(defence.date);
  const defenceDateFormatted = formatIndoDate(defence.date);
  const defenceTime = formatTime(defence.startTime);
  const defencePlace = defence.room ? defence.room.name : (defence.meetingLink || 'Daring');

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
  const logoPath = path.resolve(__dirname, "../assets/unand-logo.png");
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
  <title>Surat Undangan Sidang Tugas Akhir</title>
  <style>
    @page {
      size: A4;
      margin: 1.2cm 2cm 1cm 2.5cm;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.2;
      color: #000;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .logo-cell {
      width: 70px;
      vertical-align: middle;
      padding-right: 12px;
    }
    .logo-img {
      width: 70px;
      height: auto;
    }
    .header-text {
      text-align: center;
      vertical-align: middle;
    }
    .header-text h3 {
      margin: 0;
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text h4 {
      margin: 0;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text h2 {
      margin: 0;
      font-size: 15pt;
      font-weight: bold;
      color: #0b5c9e;
      text-transform: uppercase;
    }
    .header-text p {
      margin: 1px 0;
      font-size: 9pt;
    }
    .details-table {
      width: 100%;
      margin-bottom: 10px;
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
      margin-bottom: 1px;
    }
    .content-table {
      width: 100%;
      margin: 8px 0;
    }
    .content-table td {
      vertical-align: top;
      padding: 1px 4px;
    }
    .signature-block {
      float: right;
      width: 220px;
      margin-top: 15px;
      text-align: left;
    }
    .signature-block .space {
      height: 50px;
    }
    .tembusan {
      margin-top: 15px;
      font-size: 10pt;
    }
    .tembusan ol {
      margin: 2px 0 0 15px;
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
      <td style="width: 60px;"></td>
    </tr>
  </table>

  <table class="details-table">
    <tr>
      <td style="width: 80px;">Nomor</td>
      <td style="width: 10px;">:</td>
      <td style="width: 300px;">${nomorSurat || ''}</td>
      <td style="text-align: right;">Padang, ${dateGenerated}</td>
    </tr>
    <tr>
      <td>Hal</td>
      <td>:</td>
      <td>Undangan Sidang Tugas Akhir</td>
      <td></td>
    </tr>
    <tr>
      <td>Lamp</td>
      <td>:</td>
      <td>Draft Tugas Akhir</td>
      <td></td>
    </tr>
  </table>

  <p>Kepada Yth.</p>
  <ol class="recipient-list">
    ${lecturersList.map(name => `<li>${name}</li>`).join('')}
  </ol>
  
  <p style="margin-top: 10px;">Di<br/>Tempat.</p>

  <p style="margin-top: 15px;">Sesuai dengan Surat Persetujuan Sidang Tugas Akhir dari Pembimbing Utama Tugas Akhir Mahasiswa :</p>

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

  <p style="margin-top: 15px;">Maka akan diadakan Sidang Tugas Akhir mahasiswa tersebut pada :</p>

  <table class="content-table" style="margin-left: 25px; width: calc(100% - 25px);">
    <tr>
      <td style="width: 150px;">Hari / Tanggal</td>
      <td style="width: 10px;">:</td>
      <td>${defenceDay} / ${defenceDateFormatted}</td>
    </tr>
    <tr>
      <td>Pukul</td>
      <td>:</td>
      <td>${defenceTime} WIB s/d Selesai</td>
    </tr>
    <tr>
      <td>Tempat</td>
      <td>:</td>
      <td>${defencePlace}</td>
    </tr>
  </table>

  <p style="margin-top: 15px;">Untuk itu dimohon kesediaan Saudara(i) untuk hadir sebagai Penguji / Pembimbing pada Sidang tersebut.</p>

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
