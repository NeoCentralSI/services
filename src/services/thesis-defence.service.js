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
  examiner_assigned: 1,
  verified: 2,
  scheduled: 3,
  ongoing: 3,
  passed: 4,
  passed_with_revision: 4,
  failed: 4,
  cancelled: 4,
};

const ASSIGNMENT_ORDER = { unassigned: 0, rejected: 1, partially_rejected: 2, pending: 3, confirmed: 4 };

function getAssignmentStatus(activeExaminers, totalExaminerCount = 0) {
  if (!activeExaminers || activeExaminers.length === 0) {
    return totalExaminerCount > 0 ? "rejected" : "unassigned";
  }
  const allAvailable = activeExaminers.every((e) => e.availabilityStatus === "available");
  return allAvailable ? "confirmed" : "pending";
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
// LIST
// ============================================================

export async function getDefenceList({ search, status, view, user = {} } = {}) {
  if (view === "assignment") return getAssignmentList({ search });
  if (view === "examiner_requests" && user.lecturerId) {
    return getExaminerRequestsList(user.lecturerId, { search });
  }
  if (view === "supervised_students" && user.lecturerId) {
    return getSupervisedStudentsList(user.lecturerId, { search });
  }
  return getAdminList({ search, status });
}

async function getAdminList({ search, status }) {
  const defences = await coreRepo.findAllDefences({ search, status });
  const docTypes = await docRepo.getDefenceDocumentTypes();
  const totalDocTypes = docTypes.length;

  const mapped = defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));
    const documents = d.documents || [];
    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      documentSummary: {
        total: totalDocTypes,
        submitted: documents.filter((x) => x.status === "submitted").length,
        approved: documents.filter((x) => x.status === "approved").length,
        declined: documents.filter((x) => x.status === "declined").length,
      },
    };
  });

  mapped.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return mapped;
}

async function getAssignmentList({ search }) {
  const defences = await coreRepo.findDefencesForAssignment({ search });

  const mapped = defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    const activeExaminers = (d.examiners || []).filter(
      (e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending"
    );

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      assignmentStatus: getAssignmentStatus(activeExaminers, (d.examiners || []).length),
      examiners: activeExaminers.map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
      })),
    };
  });

  mapped.sort((a, b) => {
    const pa = ASSIGNMENT_ORDER[a.assignmentStatus] ?? 99;
    const pb = ASSIGNMENT_ORDER[b.assignmentStatus] ?? 99;
    if (pa !== pb) return pa - pb;
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return mapped;
}

async function getExaminerRequestsList(lecturerId, { search } = {}) {
  const defences = await coreRepo.findDefencesByExaminer(lecturerId, { search });

  return defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));
    const myExaminers = (d.examiners || [])
      .filter((e) => e.lecturerId === lecturerId)
      .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
    const myExaminer = myExaminers[0];

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      room: d.room ? { id: d.room.id, name: d.room.name } : null,
      myExaminerStatus: myExaminer?.availabilityStatus || null,
      myExaminerId: myExaminer?.id || null,
      myExaminerOrder: myExaminer?.order || null,
    };
  });
}

async function getSupervisedStudentsList(lecturerId, { search } = {}) {
  const defences = await coreRepo.findDefencesBySupervisor(lecturerId, { search });

  return defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));
    const myRole = (d.thesis?.thesisSupervisors || []).find((ts) => ts.lecturerId === lecturerId);
    const activeExaminers = (d.examiners || []).filter(
      (e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending"
    );

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      room: d.room ? { id: d.room.id, name: d.room.name } : null,
      myRole: myRole?.role?.name || "Pembimbing",
      examiners: activeExaminers.map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
      })),
    };
  });
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
