import {
  findSeminarsForAssignment,
  findEligibleExaminers,
  createExaminers,
  deletePendingExaminers,
  findExaminersBySeminar,
  findActiveExaminersBySeminar,
  findExaminerRequestsByLecturerId,
  findSupervisedStudentSeminars,
  findSeminarDetailById,
  updateExaminerAvailability,
  findExaminerById,
  countExaminersByStatus,
  updateSeminarStatus,
} from "../../repositories/thesisSeminar/lecturerSeminar.repository.js";
import { getSeminarDocumentTypes } from "../../repositories/thesisSeminar/seminarDocument.repository.js";
import { findDocumentWithFile } from "../../repositories/thesisSeminar/adminSeminar.repository.js";

// ============================================================
// Helper: determine examiner assignment status label for kadep view
// Receives only ACTIVE examiners (pending/available).
// Rejected examiners are kept as log and not passed here.
// ============================================================
function getAssignmentStatus(activeExaminers, totalExaminerCount = 0) {
  if (!activeExaminers || activeExaminers.length === 0) {
    // No active examiners — either never assigned or all rejected
    return totalExaminerCount > 0 ? "rejected" : "unassigned";
  }

  // Need exactly 2 active examiners for a complete assignment
  if (activeExaminers.length < 2) {
    // Has some active examiner(s) but not enough — a rejection happened
    const hasAvailable = activeExaminers.some(
      (e) => e.availabilityStatus === "available"
    );
    // If at least one already accepted, it's partially rejected
    if (hasAvailable) return "partially_rejected";
    // Only pending ones left (shouldn't normally happen, but safe fallback)
    return "pending";
  }

  // 2 active examiners exist
  const allAvailable = activeExaminers.every(
    (e) => e.availabilityStatus === "available"
  );
  if (allAvailable) return "confirmed";

  const hasPending = activeExaminers.some(
    (e) => e.availabilityStatus === "pending"
  );
  if (hasPending) return "pending";

  return "pending";
}

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

/**
 * Get list of seminars for examiner assignment view
 */
export async function getAssignmentList({ search } = {}) {
  const seminars = await findSeminarsForAssignment({ search });

  const mapped = seminars.map((s) => {
    const student = s.thesis?.student;
    const supervisors = (s.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    // Only show active examiners (pending/available) in assignment view
    // Rejected (unavailable) are kept as historical log, not shown here
    const activeExaminers = (s.examiners || []).filter(
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
      id: s.id,
      thesisId: s.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors,
      status: s.status,
      registeredAt: s.registeredAt,
      assignmentStatus: getAssignmentStatus(activeExaminers, (s.examiners || []).length),
      examiners,
    };
  });

  // Sort: unassigned first, then rejected, partially_rejected, pending, confirmed
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

/**
 * Get eligible lecturers for examiner assignment
 */
export async function getEligibleExaminers(seminarId) {
  const lecturers = await findEligibleExaminers(seminarId);
  return lecturers.map((l) => ({
    id: l.id,
    fullName: l.user?.fullName || "-",
    identityNumber: l.user?.identityNumber || "-",
    scienceGroup: l.scienceGroup?.name || "-",
  }));
}

/**
 * Assign examiners to a seminar (by Ketua Departemen)
 * Supports:
 * - Fresh assignment: 2 new examiners
 * - Full reassignment: both rejected/pending → replace all 2
 * - Partial reassignment: 1 accepted + 1 rejected → keep accepted, add 1 new
 * Auto-approves Kadep's own examiner assignment.
 */
export async function assignExaminers(seminarId, examinerIds, assignedByUserId) {
  // Validate seminar exists and has correct status
  const detail = await findSeminarDetailById(seminarId);
  if (!detail) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (!["verified", "examiner_assigned"].includes(detail.status)) {
    const err = new Error(
      "Seminar harus berstatus 'verified' untuk penetapan penguji."
    );
    err.statusCode = 400;
    throw err;
  }

  // Get current ACTIVE examiners (pending/available) — rejected ones are kept as log
  const currentActiveExaminers = await findActiveExaminersBySeminar(seminarId);

  // Separate accepted (locked) and pending (replaceable)
  const acceptedExaminers = currentActiveExaminers.filter(
    (e) => e.availabilityStatus === "available"
  );
  const acceptedIds = acceptedExaminers.map((e) => e.lecturerId);

  // Calculate how many slots need to be filled
  const slotsNeeded = 2 - acceptedExaminers.length;

  // Validate: cannot replace accepted examiners
  // All accepted examiners must still appear in the new list
  for (const accepted of acceptedExaminers) {
    if (!examinerIds.includes(accepted.lecturerId)) {
      const err = new Error(
        "Tidak dapat mengganti penguji yang sudah menyetujui."
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // Filter out accepted IDs from the submitted list → these are the new ones
  const newExaminerIds = examinerIds.filter((id) => !acceptedIds.includes(id));

  if (newExaminerIds.length !== slotsNeeded) {
    const err = new Error(
      `Harus menetapkan tepat ${slotsNeeded} penguji baru (${acceptedExaminers.length} sudah diterima).`
    );
    err.statusCode = 400;
    throw err;
  }

  // Validate total is 2
  if (examinerIds.length !== 2) {
    const err = new Error("Harus menetapkan tepat 2 penguji.");
    err.statusCode = 400;
    throw err;
  }

  // Check for duplicates
  if (examinerIds[0] === examinerIds[1]) {
    const err = new Error("Kedua penguji harus berbeda.");
    err.statusCode = 400;
    throw err;
  }

  // Delete only pending examiners (rejected ones stay as historical log)
  if (currentActiveExaminers.length > 0) {
    await deletePendingExaminers(seminarId);
  }

  // Build new examiner records (only for slots that need filling)
  const usedOrders = acceptedExaminers.map((e) => e.order);
  const availableOrders = [1, 2].filter((o) => !usedOrders.includes(o));

  const examinersData = newExaminerIds.map((lecturerId, idx) => {
    return {
      lecturerId,
      order: availableOrders[idx],
      // If Kadep assigns themselves, auto-set to "available"
      availabilityStatus: lecturerId === assignedByUserId ? "available" : "pending",
    };
  });

  if (examinersData.length > 0) {
    await createExaminers(seminarId, examinersData, assignedByUserId);
  }

  // Check if both active examiners are now available
  const activeExaminers = await findActiveExaminersBySeminar(seminarId);
  const allAvailable =
    activeExaminers.length >= 2 &&
    activeExaminers.every((e) => e.availabilityStatus === "available");

  if (allAvailable) {
    await updateSeminarStatus(seminarId, "examiner_assigned");
  }

  return activeExaminers;
}

// ============================================================
// LECTURER — Examiner Requests (Permintaan Menguji)
// ============================================================

/**
 * Get seminars where the lecturer is assigned as examiner
 */
export async function getExaminerRequests(lecturerId, { search } = {}) {
  const seminars = await findExaminerRequestsByLecturerId(lecturerId, { search });

  return seminars.map((s) => {
    const student = s.thesis?.student;
    const supervisors = (s.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    // Get the most recent examiner record for this lecturer
    // (in case they were rejected and re-assigned)
    const myExaminers = (s.examiners || [])
      .filter((e) => e.lecturerId === lecturerId)
      .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
    const myExaminer = myExaminers[0];

    return {
      id: s.id,
      thesisId: s.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors,
      status: s.status,
      registeredAt: s.registeredAt,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room ? { id: s.room.id, name: s.room.name } : null,
      myExaminerStatus: myExaminer?.availabilityStatus || null,
      myExaminerId: myExaminer?.id || null,
      myExaminerOrder: myExaminer?.order || null,
    };
  });
}

// ============================================================
// LECTURER — Supervised Student Seminars (Mahasiswa Bimbingan)
// ============================================================

/**
 * Get seminars of students this lecturer supervises
 */
export async function getSupervisedStudentSeminars(lecturerId, { search } = {}) {
  const seminars = await findSupervisedStudentSeminars(lecturerId, { search });

  return seminars.map((s) => {
    const student = s.thesis?.student;
    const supervisors = (s.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    // Determine lecturer's supervisor role
    const myRole = (s.thesis?.thesisSupervisors || []).find(
      (ts) => ts.lecturerId === lecturerId
    );

    // Only show active examiners (pending/available)
    const activeExaminers = (s.examiners || []).filter(
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
      id: s.id,
      thesisId: s.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors,
      status: s.status,
      registeredAt: s.registeredAt,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room ? { id: s.room.id, name: s.room.name } : null,
      myRole: myRole?.role?.name || "Pembimbing",
      examiners,
    };
  });
}

/**
 * Get seminar detail for lecturer
 */
export async function getLecturerSeminarDetail(seminarId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const student = seminar.thesis?.student;
  const supervisors = (seminar.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  // Map documents with file info
  const documents = await Promise.all(
    (seminar.documents || []).map(async (d) => {
      const withFile = await findDocumentWithFile(seminar.id, d.documentTypeId);
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

  const docTypes = await getSeminarDocumentTypes();

  return {
    id: seminar.id,
    status: seminar.status,
    registeredAt: seminar.registeredAt,
    date: seminar.date,
    startTime: seminar.startTime,
    endTime: seminar.endTime,
    meetingLink: seminar.meetingLink,
    finalScore: seminar.finalScore,
    grade: seminar.grade,
    room: seminar.room
      ? { id: seminar.room.id, name: seminar.room.name }
      : null,
    thesis: {
      id: seminar.thesis?.id,
      title: seminar.thesis?.title,
    },
    student: {
      name: student?.user?.fullName || "-",
      nim: student?.user?.identityNumber || "-",
    },
    supervisors,
    documents,
    documentTypes: docTypes.map((dt) => ({ id: dt.id, name: dt.name })),
    // Active examiners (current: pending/available)
    examiners: (seminar.examiners || [])
      .filter((e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending")
      .map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
      })),
    // Rejected examiners (historical log)
    rejectedExaminers: (seminar.examiners || [])
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
// EXAMINER — Respond to assignment
// ============================================================

/**
 * Examiner responds to their assignment (available / unavailable)
 */
export async function respondToAssignment(examinerId, lecturerId, status) {
  // Validate status
  if (!["available", "unavailable"].includes(status)) {
    const err = new Error("Status harus 'available' atau 'unavailable'.");
    err.statusCode = 400;
    throw err;
  }

  // Get examiner record
  const examiner = await findExaminerById(examinerId);
  if (!examiner) {
    const err = new Error("Data penguji tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Verify the examiner is the one responding
  if (examiner.lecturerId !== lecturerId) {
    const err = new Error("Anda bukan penguji yang ditugaskan.");
    err.statusCode = 403;
    throw err;
  }

  // Can only respond if currently pending
  if (examiner.availabilityStatus !== "pending") {
    const err = new Error("Anda sudah memberikan respons sebelumnya.");
    err.statusCode = 400;
    throw err;
  }

  // Update status
  await updateExaminerAvailability(examinerId, status);

  // Check if BOTH active examiners are now available → auto-transition seminar
  const activeExaminers = await findActiveExaminersBySeminar(
    examiner.thesisSeminarId
  );
  const bothAvailable =
    activeExaminers.length >= 2 &&
    activeExaminers.every((e) => e.availabilityStatus === "available");

  let seminarTransitioned = false;
  if (bothAvailable) {
    await updateSeminarStatus(
      examiner.thesisSeminarId,
      "examiner_assigned"
    );
    seminarTransitioned = true;
  }

  return {
    examinerId,
    availabilityStatus: status,
    seminarTransitioned,
  };
}
