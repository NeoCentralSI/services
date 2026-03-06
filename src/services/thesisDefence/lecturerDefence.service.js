import {
  findDefencesForAssignment,
  findEligibleExaminers,
  createExaminers,
  deletePendingExaminers,
  findActiveExaminersByDefence,
  findExaminerRequestsByLecturerId,
  findSupervisedStudentDefences,
  findDefenceDetailById,
  updateExaminerAvailability,
  findExaminerById,
  updateDefenceStatus,
} from "../../repositories/thesisDefence/lecturerDefence.repository.js";
import { findDefenceDocumentWithFile } from "../../repositories/thesisDefence/adminDefence.repository.js";
import { getDefenceDocumentTypes } from "../../repositories/thesisDefence/studentDefence.repository.js";

// ============================================================
// Helper: determine examiner assignment status label for kadep view
// ============================================================
function getAssignmentStatus(activeExaminers, totalExaminerCount = 0) {
  if (!activeExaminers || activeExaminers.length === 0) {
    return totalExaminerCount > 0 ? "rejected" : "unassigned";
  }

  if (activeExaminers.length < 2) {
    const hasAvailable = activeExaminers.some(
      (e) => e.availabilityStatus === "available"
    );
    if (hasAvailable) return "partially_rejected";
    return "pending";
  }

  const allAvailable = activeExaminers.every(
    (e) => e.availabilityStatus === "available"
  );
  if (allAvailable) return "confirmed";

  return "pending";
}

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

export async function getAssignmentList({ search } = {}) {
  const defences = await findDefencesForAssignment({ search });

  const mapped = defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    const activeExaminers = (d.examiners || []).filter(
      (e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending"
    );

    const examiners = activeExaminers.map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: e.lecturerName || "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
      respondedAt: e.respondedAt,
    }));

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: d.status,
      registeredAt: d.registeredAt,
      assignmentStatus: getAssignmentStatus(activeExaminers, (d.examiners || []).length),
      examiners,
    };
  });

  const ASSIGNMENT_ORDER = { unassigned: 0, rejected: 1, partially_rejected: 2, pending: 3, confirmed: 4 };
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

export async function getEligibleExaminers(defenceId) {
  const lecturers = await findEligibleExaminers(defenceId);
  return lecturers.map((l) => ({
    id: l.id,
    fullName: l.user?.fullName || "-",
    identityNumber: l.user?.identityNumber || "-",
    scienceGroup: l.scienceGroup?.name || "-",
  }));
}

export async function assignExaminers(defenceId, examinerIds, assignedByUserId) {
  const detail = await findDefenceDetailById(defenceId);
  if (!detail) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (!["verified", "examiner_assigned"].includes(detail.status)) {
    const err = new Error(
      "Sidang harus berstatus 'verified' untuk penetapan penguji."
    );
    err.statusCode = 400;
    throw err;
  }

  const currentActiveExaminers = await findActiveExaminersByDefence(defenceId);
  const acceptedExaminers = currentActiveExaminers.filter(
    (e) => e.availabilityStatus === "available"
  );
  const acceptedIds = acceptedExaminers.map((e) => e.lecturerId);
  const slotsNeeded = 2 - acceptedExaminers.length;

  for (const accepted of acceptedExaminers) {
    if (!examinerIds.includes(accepted.lecturerId)) {
      const err = new Error(
        "Tidak dapat mengganti penguji yang sudah menyetujui."
      );
      err.statusCode = 400;
      throw err;
    }
  }

  const newExaminerIds = examinerIds.filter((id) => !acceptedIds.includes(id));

  if (newExaminerIds.length !== slotsNeeded) {
    const err = new Error(
      `Harus menetapkan tepat ${slotsNeeded} penguji baru (${acceptedExaminers.length} sudah diterima).`
    );
    err.statusCode = 400;
    throw err;
  }

  if (examinerIds.length !== 2) {
    const err = new Error("Harus menetapkan tepat 2 penguji.");
    err.statusCode = 400;
    throw err;
  }

  if (examinerIds[0] === examinerIds[1]) {
    const err = new Error("Kedua penguji harus berbeda.");
    err.statusCode = 400;
    throw err;
  }

  if (currentActiveExaminers.length > 0) {
    await deletePendingExaminers(defenceId);
  }

  const usedOrders = acceptedExaminers.map((e) => e.order);
  const availableOrders = [1, 2].filter((o) => !usedOrders.includes(o));

  const examinersData = newExaminerIds.map((lecturerId, idx) => ({
    lecturerId,
    order: availableOrders[idx],
    availabilityStatus: lecturerId === assignedByUserId ? "available" : "pending",
  }));

  if (examinersData.length > 0) {
    await createExaminers(defenceId, examinersData, assignedByUserId);
  }

  const activeExaminers = await findActiveExaminersByDefence(defenceId);
  const allAvailable =
    activeExaminers.length >= 2 &&
    activeExaminers.every((e) => e.availabilityStatus === "available");

  if (allAvailable) {
    await updateDefenceStatus(defenceId, "examiner_assigned");
  }

  return activeExaminers;
}

// ============================================================
// LECTURER — Examiner Requests
// ============================================================

export async function getExaminerRequests(lecturerId, { search } = {}) {
  const defences = await findExaminerRequestsByLecturerId(lecturerId, { search });

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
      status: d.status,
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

// ============================================================
// LECTURER — Supervised Student Defences
// ============================================================

export async function getSupervisedStudentDefences(lecturerId, { search } = {}) {
  const defences = await findSupervisedStudentDefences(lecturerId, { search });

  return defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    const myRole = (d.thesis?.thesisSupervisors || []).find(
      (ts) => ts.lecturerId === lecturerId
    );

    const activeExaminers = (d.examiners || []).filter(
      (e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending"
    );

    const examiners = activeExaminers.map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: e.lecturerName || "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
    }));

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: d.status,
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      room: d.room ? { id: d.room.id, name: d.room.name } : null,
      myRole: myRole?.role?.name || "Pembimbing",
      examiners,
    };
  });
}

// ============================================================
// LECTURER — Defence Detail
// ============================================================

export async function getLecturerDefenceDetail(defenceId, lecturerId) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const student = defence.thesis?.student;
  const supervisors = (defence.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  const documents = await Promise.all(
    (defence.documents || []).map(async (d) => {
      const withFile = await findDefenceDocumentWithFile(defence.id, d.documentTypeId);
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

  const docTypes = await getDefenceDocumentTypes();

  const myExaminerRecords = (defence.examiners || [])
    .filter((e) => e.lecturerId === lecturerId)
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  const myExaminer = myExaminerRecords[0] || null;

  const mySupervisor = (defence.thesis?.thesisSupervisors || []).find(
    (ts) => ts.lecturerId === lecturerId
  ) || null;

  const isExaminer = !!myExaminer;
  const isSupervisor = !!mySupervisor;

  return {
    id: defence.id,
    status: defence.status,
    registeredAt: defence.registeredAt,
    date: defence.date,
    startTime: defence.startTime,
    endTime: defence.endTime,
    meetingLink: defence.meetingLink,
    finalScore: defence.finalScore,
    grade: defence.grade,
    room: defence.room
      ? { id: defence.room.id, name: defence.room.name }
      : null,
    thesis: {
      id: defence.thesis?.id,
      title: defence.thesis?.title,
    },
    student: {
      name: student?.user?.fullName || "-",
      nim: student?.user?.identityNumber || "-",
    },
    viewerRole: isSupervisor ? "supervisor" : isExaminer ? "examiner" : "none",
    mySupervisorRole: mySupervisor?.role?.name || null,
    myExaminerId: myExaminer?.id || null,
    myExaminerOrder: myExaminer?.order || null,
    myExaminerAvailabilityStatus: myExaminer?.availabilityStatus || null,
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
  };
}

// ============================================================
// LECTURER — Respond to Examiner Assignment
// ============================================================

export async function respondToAssignment(examinerId, lecturerId, { status }) {
  const examiner = await findExaminerById(examinerId);
  if (!examiner) {
    const err = new Error("Data penguji tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (examiner.lecturerId !== lecturerId) {
    const err = new Error("Anda bukan penguji yang ditugaskan.");
    err.statusCode = 403;
    throw err;
  }

  if (examiner.availabilityStatus !== "pending") {
    const err = new Error("Anda sudah merespons penugasan ini.");
    err.statusCode = 400;
    throw err;
  }

  await updateExaminerAvailability(examinerId, status);

  // Check if all active examiners have accepted → transition to examiner_assigned
  let defenceTransitioned = false;
  if (status === "available") {
    const activeExaminers = await findActiveExaminersByDefence(examiner.thesisDefenceId);
    const allAvailable =
      activeExaminers.length >= 2 &&
      activeExaminers.every((e) => e.availabilityStatus === "available");

    if (allAvailable) {
      await updateDefenceStatus(examiner.thesisDefenceId, "examiner_assigned");
      defenceTransitioned = true;
    }
  }

  return {
    examinerId,
    status,
    defenceTransitioned,
  };
}
