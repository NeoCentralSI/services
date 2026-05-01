import xlsx from "xlsx";
import * as coreRepo from "../repositories/thesis-defence.repository.js";
import * as docRepo from "../repositories/thesis-defence-doc.repository.js";
import { computeEffectiveDefenceStatus } from "../utils/defenceStatus.util.js";

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
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
      isEditable: d.registeredAt === null || d.status !== "cancelled",
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
  const where = { ...buildSearchWhere(search) };
  
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


function getAssignmentStatus(activeExaminers, totalExaminerCount = 0) {
  if (!activeExaminers || activeExaminers.length === 0) {
    return totalExaminerCount > 0 ? "rejected" : "unassigned";
  }
  const allAvailable = activeExaminers.every((e) => e.availabilityStatus === "available");
  return allAvailable ? "confirmed" : "pending";
}

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

export function mapScoreToGrade(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  if (s >= 80 && s <= 100) return "A";
  if (s >= 76 && s < 80) return "A-";
  if (s >= 70 && s < 76) return "B+";
  if (s >= 65 && s < 70) return "B";
  if (s >= 55 && s < 65) return "C+";
  if (s >= 50 && s < 55) return "C";
  if (s >= 45 && s < 50) return "D";
  return "E";
}

// ============================================================
// DETAIL
// ============================================================

export async function getDefenceDetail(defenceId, user = {}) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const student = defence.thesis?.student;
  const supervisors = (defence.thesis?.thesisSupervisors || []).map((ts) => ({
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

  const [availabilities, rooms] = await Promise.all([
    allLecturerIds.length > 0 ? coreRepo.findLecturerAvailabilities(allLecturerIds) : [],
    coreRepo.findAllRooms(),
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

  return { defenceId, status: "scheduled" };
}

export async function setSchedule(defenceId, payload) {
  return scheduleDefence(defenceId, payload);
}

export async function finalizeSchedule(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (defence.status !== "scheduled") throwError("Hanya sidang yang sudah dijadwalkan yang dapat difinalisasi.", 400);

  await coreRepo.updateDefenceStatus(defenceId, "ongoing");
  return { defenceId, status: "ongoing" };
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

  await validateExaminers(defence.thesisId, body.examinerLecturerIds);
  
  await coreRepo.updateArchive(defenceId, { ...body, userId });
  return coreRepo.findDefenceById(defenceId);
}

export async function deleteArchive(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Data sidang tidak ditemukan", 404);
  
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
      "Nama": d.studentName || "-",
      "NIM": d.studentNim || "-",
      "Judul TA": d.thesisTitle || "-",
      "Pembimbing": sups || "-",
      "Tanggal": date ? date.toISOString().split("T")[0] : "-",
      "Ruangan": d.room?.name || "-",
      "Nilai": d.finalScore || "-",
      "Grade": d.grade || "-",
      "Hasil": hasil,
      "Dosen Penguji 1": examiners[0] || "-",
      "Dosen Penguji 2": examiners[1] || "-",
      "Dosen Penguji 3": examiners[2] || "-",
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
