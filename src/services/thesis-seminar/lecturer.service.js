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
  findSeminarAssessmentCpmks,
  findLatestExaminerBySeminarAndLecturer,
  saveExaminerAssessment,
  findActiveExaminersWithAssessments,
  findSeminarSupervisorRole,
  finalizeSeminarResult,
  finalizeSeminarRevisions,
  findSeminarRevisionsBySeminarId,
  approveRevisionItem,
  unapproveRevisionItem,
  findRevisionByIdFull,
  findSeminarAudiences,
  approveAudienceRegistration,
  resetAudienceApproval,
  toggleAudiencePresence,
} from "../../repositories/thesis-seminar/lecturer.repository.js";
import { getSeminarDocumentTypes } from "../../repositories/thesis-seminar/document.repository.js";
import { findDocumentWithFile } from "../../repositories/thesis-seminar/admin.repository.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";
import prisma from "../../config/prisma.js";

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

function resolveSupervisorMembership(supervisorRelation) {
  if (!supervisorRelation) return null;

  if (
    supervisorRelation.thesis?.thesisSupervisors &&
    supervisorRelation.thesis.thesisSupervisors.length > 0
  ) {
    return supervisorRelation.thesis.thesisSupervisors[0];
  }

  return supervisorRelation;
}

function mapScoreToGrade(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const numericScore = Number(score);

  if (numericScore >= 80 && numericScore <= 100) return "A";
  if (numericScore >= 76 && numericScore < 80) return "A-";
  if (numericScore >= 70 && numericScore < 76) return "B+";
  if (numericScore >= 65 && numericScore < 70) return "B";
  if (numericScore >= 55 && numericScore < 65) return "C+";
  if (numericScore >= 50 && numericScore < 55) return "C";
  if (numericScore >= 45 && numericScore < 50) return "D";
  return "E";
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
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
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
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
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
export async function getLecturerSeminarDetail(seminarId, lecturerId) {
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
  const effectiveStatus = computeEffectiveStatus(
    seminar.status,
    seminar.date,
    seminar.startTime,
    seminar.endTime
  );

  const myExaminerRecords = (seminar.examiners || [])
    .filter((e) => e.lecturerId === lecturerId)
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  const myExaminer = myExaminerRecords[0] || null;

  const mySupervisor = (seminar.thesis?.thesisSupervisors || []).find(
    (ts) => ts.lecturerId === lecturerId
  ) || null;

  const isExaminer = !!myExaminer;
  const isSupervisor = !!mySupervisor;

  const activeExaminers = (seminar.examiners || []).filter(
    (e) => e.availabilityStatus === "available"
  );
  const allExaminerSubmitted =
    activeExaminers.length >= 2 &&
    activeExaminers.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);

  // Get audience data for view-only display
  const audienceRows = await findSeminarAudiences(seminarId);
  const audiences = audienceRows.map((a) => ({
    studentName: a.student?.user?.fullName || "-",
    nim: a.student?.user?.identityNumber || "-",
    registeredAt: a.registeredAt,
    isPresent: Boolean(a.approvedAt),
    approvedAt: a.approvedAt,
  }));

  return {
    id: seminar.id,
    status: effectiveStatus,
    registeredAt: seminar.registeredAt,
    date: seminar.date,
    startTime: seminar.startTime,
    endTime: seminar.endTime,
    meetingLink: seminar.meetingLink,
    finalScore: seminar.finalScore,
    grade: mapScoreToGrade(seminar.finalScore),
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
    canOpenSupervisorFinalization:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isSupervisor,
    canOpenSupervisorRevision:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isSupervisor,
    resultFinalizedAt: seminar.resultFinalizedAt,
    allExaminerSubmitted,
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
    audiences,
  };
}

/**
 * Examiner assessment form payload for an ongoing seminar.
 */
export async function getExaminerAssessmentForm(seminarId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const effectiveStatus = computeEffectiveStatus(
    seminar.status,
    seminar.date,
    seminar.startTime,
    seminar.endTime
  );
  if (!["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus)) {
    const err = new Error("Form penilaian hanya tersedia saat seminar sedang berlangsung atau sudah selesai.");
    err.statusCode = 400;
    throw err;
  }

  const examiner = await findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId);
  if (!examiner || examiner.availabilityStatus !== "available") {
    const err = new Error("Anda bukan penguji aktif pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  const cpmks = await findSeminarAssessmentCpmks();
  const existingScoreMap = new Map(
    (examiner.thesisSeminarExaminerAssessmentDetails || []).map((item) => [
      item.assessmentCriteriaId,
      item.score,
    ])
  );

  const criteriaGroups = cpmks.map((cpmk) => ({
    id: cpmk.id,
    code: cpmk.code,
    description: cpmk.description,
    criteria: (cpmk.assessmentCriterias || []).map((criterion) => ({
      id: criterion.id,
      name: criterion.name || "-",
      maxScore: criterion.maxScore || 0,
      score: existingScoreMap.get(criterion.id) ?? null,
      rubrics: (criterion.assessmentRubrics || []).map((rubric) => ({
        id: rubric.id,
        minScore: rubric.minScore,
        maxScore: rubric.maxScore,
        description: rubric.description,
      })),
    })),
  }));

  return {
    seminar: {
      id: seminar.id,
      status: effectiveStatus,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
      date: seminar.date,
      startTime: seminar.startTime,
      endTime: seminar.endTime,
      room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null,
    },
    examiner: {
      id: examiner.id,
      order: examiner.order,
      assessmentScore: examiner.assessmentScore,
      revisionNotes: examiner.revisionNotes,
      assessmentSubmittedAt: examiner.assessmentSubmittedAt,
    },
    criteriaGroups,
  };
}

/**
 * Submit examiner assessment (final submit).
 */
export async function submitExaminerAssessment(seminarId, lecturerId, payload) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const effectiveStatus = computeEffectiveStatus(
    seminar.status,
    seminar.date,
    seminar.startTime,
    seminar.endTime
  );
  if (effectiveStatus !== "ongoing") {
    const err = new Error("Penilaian hanya dapat disubmit saat seminar sedang berlangsung.");
    err.statusCode = 400;
    throw err;
  }

  const examiner = await findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId);
  if (!examiner || examiner.availabilityStatus !== "available") {
    const err = new Error("Anda bukan penguji aktif pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }
  if (examiner.assessmentSubmittedAt) {
    const err = new Error("Penilaian sudah disubmit sebelumnya dan tidak dapat diubah.");
    err.statusCode = 400;
    throw err;
  }

  const cpmks = await findSeminarAssessmentCpmks();
  const activeCriteria = cpmks.flatMap((cpmk) => cpmk.assessmentCriterias || []);
  const criteriaMap = new Map(activeCriteria.map((item) => [item.id, item]));

  const incoming = payload.scores || [];
  if (incoming.length !== activeCriteria.length) {
    const err = new Error("Semua kriteria aktif harus diisi sebelum submit.");
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set();
  const normalizedScores = incoming.map((item) => {
    const criterion = criteriaMap.get(item.assessmentCriteriaId);
    if (!criterion) {
      const err = new Error("Terdapat kriteria yang tidak valid.");
      err.statusCode = 400;
      throw err;
    }
    if (seen.has(item.assessmentCriteriaId)) {
      const err = new Error("Duplikasi kriteria pada payload penilaian.");
      err.statusCode = 400;
      throw err;
    }
    seen.add(item.assessmentCriteriaId);

    const max = criterion.maxScore || 0;
    if (item.score < 0 || item.score > max) {
      const err = new Error(`Nilai untuk '${criterion.name || "kriteria"}' harus 0-${max}.`);
      err.statusCode = 400;
      throw err;
    }

    return {
      assessmentCriteriaId: item.assessmentCriteriaId,
      score: item.score,
    };
  });

  const updatedExaminer = await saveExaminerAssessment({
    examinerId: examiner.id,
    scores: normalizedScores,
    revisionNotes: payload.revisionNotes,
  });

  return {
    examinerId: updatedExaminer.id,
    assessmentScore: updatedExaminer.assessmentScore,
    assessmentSubmittedAt: updatedExaminer.assessmentSubmittedAt,
  };
}

/**
 * Supervisor monitoring data for final recommendation step.
 */
export async function getSupervisorFinalizationData(seminarId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  const effectiveStatus = computeEffectiveStatus(
    seminar.status,
    seminar.date,
    seminar.startTime,
    seminar.endTime
  );

  const examiners = await findActiveExaminersWithAssessments(seminarId);
  const hasTwoExaminers = examiners.length >= 2;
  const allExaminerSubmitted =
    hasTwoExaminers && examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);

  const averageScore = allExaminerSubmitted
    ? examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length
    : null;
  const averageGrade = averageScore !== null ? mapScoreToGrade(averageScore) : null;

  return {
    seminar: {
      id: seminar.id,
      status: effectiveStatus,
      finalScore: seminar.finalScore,
      grade: mapScoreToGrade(seminar.finalScore),
      resultFinalizedAt: seminar.resultFinalizedAt,
      revisionFinalizedAt: seminar.revisionFinalizedAt,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
    },
    supervisor: {
      roleName: mySupervisor.role?.name || "Pembimbing",
      canFinalize: effectiveStatus === "ongoing" && !seminar.resultFinalizedAt,
    },
    examiners: examiners.map((item) => {
      // Group assessment details by CPMK for per-criteria breakdown
      const detailsByGroup = {};
      (item.thesisSeminarExaminerAssessmentDetails || []).forEach((d) => {
        const cpmk = d.criteria?.cpmk;
        if (!cpmk) return;
        if (!detailsByGroup[cpmk.id]) {
          detailsByGroup[cpmk.id] = {
            id: cpmk.id,
            code: cpmk.code,
            description: cpmk.description,
            criteria: [],
          };
        }
        detailsByGroup[cpmk.id].criteria.push({
          id: d.criteria.id,
          name: d.criteria.name,
          maxScore: d.criteria.maxScore,
          score: d.score,
          displayOrder: d.criteria.displayOrder,
        });
      });
      // Sort criteria within each group by displayOrder
      Object.values(detailsByGroup).forEach((g) => {
        g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      });

      return {
        id: item.id,
        lecturerId: item.lecturerId,
        lecturerName:
          (seminar.examiners || []).find((x) => x.lecturerId === item.lecturerId)?.lecturerName || "-",
        order: item.order,
        assessmentScore: item.assessmentScore,
        revisionNotes: item.revisionNotes,
        assessmentSubmittedAt: item.assessmentSubmittedAt,
        assessmentDetails: Object.values(detailsByGroup).sort((a, b) =>
          (a.code || "").localeCompare(b.code || "")
        ),
      };
    }),
    allExaminerSubmitted,
    averageScore,
    averageGrade,
    recommendationUnlocked: allExaminerSubmitted,
  };
}

/**
 * Supervisor finalizes seminar result.
 */
export async function finalizeSeminarBySupervisor(seminarId, lecturerId, payload) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  if (seminar.resultFinalizedAt) {
    const err = new Error("Hasil seminar sudah pernah ditetapkan.");
    err.statusCode = 400;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  const effectiveStatus = computeEffectiveStatus(
    seminar.status,
    seminar.date,
    seminar.startTime,
    seminar.endTime
  );
  if (effectiveStatus !== "ongoing") {
    const err = new Error("Penetapan hasil hanya dapat dilakukan saat seminar berstatus sedang berlangsung.");
    err.statusCode = 400;
    throw err;
  }

  const examiners = await findActiveExaminersWithAssessments(seminarId);
  const allExaminerSubmitted =
    examiners.length >= 2 &&
    examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);
  if (!allExaminerSubmitted) {
    const err = new Error("Penetapan hasil dikunci sampai seluruh penguji submit nilai.");
    err.statusCode = 400;
    throw err;
  }

  const averageScore =
    examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) /
    examiners.length;
  const finalGrade = mapScoreToGrade(averageScore);

  const finalized = await finalizeSeminarResult({
    seminarId,
    status: payload.status,
    finalScore: averageScore,
  });

  // If failed, reset seminarReady for all supervisors so student can re-register
  if (payload.status === "failed") {
    const thesisId = seminar.thesis?.id;
    if (thesisId) {
      await prisma.thesisSupervisors.updateMany({
        where: { thesisId },
        data: { seminarReady: false },
      });
    }
  }

  return {
    seminarId: finalized.id,
    status: finalized.status,
    finalScore: finalized.finalScore,
    grade: finalGrade,
    resultFinalizedAt: finalized.resultFinalizedAt,
  };
}

/**
 * Supervisor revision board API.
 */
export async function getSupervisorRevisionBoard(seminarId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  const revisions = await findSeminarRevisionsBySeminarId(seminarId);

  return revisions.map((item) => ({
    id: item.id,
    examinerOrder: item.seminarExaminer?.order || null,
    examinerLecturerId: item.seminarExaminer?.lecturerId || null,
    description: item.description,
    revisionAction: item.revisionAction,
    isFinished: item.isFinished,
    studentSubmittedAt: item.studentSubmittedAt,
    supervisorApprovedAt: item.supervisorApprovedAt,
    approvedBySupervisorId: item.supervisor?.id || null,
    approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
  }));
}

/**
 * Supervisor approves a revision item.
 */
export async function approveRevisionBySupervisor(seminarId, revisionId, lecturerId) {
  const revision = await findRevisionByIdFull(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Verify revision belongs to this seminar
  if (revision.seminarExaminer?.thesisSeminarId !== seminarId) {
    const err = new Error("Revisi tidak terkait dengan seminar ini.");
    err.statusCode = 400;
    throw err;
  }

  // Verify lecturer is supervisor
  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  const supervisorId = mySupervisor.id;

  if (revision.isFinished) {
    const err = new Error("Revisi ini sudah disetujui.");
    err.statusCode = 400;
    throw err;
  }

  if (!revision.studentSubmittedAt) {
    const err = new Error("Mahasiswa belum mengisi perbaikan untuk revisi ini.");
    err.statusCode = 400;
    throw err;
  }

  const approved = await approveRevisionItem(revisionId, supervisorId);

  return {
    id: approved.id,
    isFinished: approved.isFinished,
    supervisorApprovedAt: approved.supervisorApprovedAt,
  };
}

/**
 * Supervisor unapproves a revision item (reset approval).
 */
export async function unapproveRevisionBySupervisor(seminarId, revisionId, lecturerId) {
  const revision = await findRevisionByIdFull(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (revision.seminarExaminer?.thesisSeminarId !== seminarId) {
    const err = new Error("Revisi tidak terkait dengan seminar ini.");
    err.statusCode = 400;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  if (!revision.isFinished) {
    const err = new Error("Revisi ini belum disetujui.");
    err.statusCode = 400;
    throw err;
  }

  const unapproved = await unapproveRevisionItem(revisionId);

  return {
    id: unapproved.id,
    isFinished: unapproved.isFinished,
  };
}

/**
 * Supervisor finalizes all seminar revisions.
 */
export async function finalizeSeminarRevisionsBySupervisor(seminarId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) {
    const err = new Error("Anda bukan dosen pembimbing pada seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  if (seminar.revisionFinalizedAt) {
    const err = new Error("Revisi seminar sudah difinalisasi sebelumnya.");
    err.statusCode = 400;
    throw err;
  }

  const revisions = await findSeminarRevisionsBySeminarId(seminarId);
  const relevantRevisions = revisions.filter(
    (item) => item.studentSubmittedAt || item.isFinished
  );

  if (relevantRevisions.length === 0) {
    const err = new Error("Tidak ada item revisi yang diajukan mahasiswa untuk difinalisasi.");
    err.statusCode = 400;
    throw err;
  }

  const unfinished = relevantRevisions.filter((item) => !item.isFinished);
  if (unfinished.length > 0) {
    const err = new Error("Masih ada item revisi yang belum disetujui.");
    err.statusCode = 400;
    throw err;
  }

  let finalized;
  try {
    finalized = await finalizeSeminarRevisions({
      seminarId,
      supervisorId: supervisorRole.id,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("revisionFinalizedAt") ||
      message.includes("revisionFinalizedBy") ||
      message.includes("Unknown arg") ||
      message.includes("Unknown column")
    ) {
      const err = new Error(
        "Kolom finalisasi revisi belum tersedia di database. Jalankan migrasi Prisma dan generate client terlebih dahulu."
      );
      err.statusCode = 400;
      throw err;
    }
    throw error;
  }

  return {
    seminarId: finalized.id,
    revisionFinalizedAt: finalized.revisionFinalizedAt,
    revisionFinalizedBy: finalized.revisionFinalizedBy,
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

// ============================================================
// Audience / Attendance Management
// ============================================================

/**
 * Get audience list for a seminar. Accessible by supervisors and examiners.
 */
export async function getSeminarAudienceList(seminarId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const audiences = await findSeminarAudiences(seminarId);

  return audiences.map((a) => ({
    studentId: a.studentId,
    studentName: a.student?.user?.fullName || "-",
    nim: a.student?.user?.identityNumber || "-",
    registeredAt: a.registeredAt,
    isPresent: Boolean(a.approvedAt),
    approvedAt: a.approvedAt,
    approvedByName: a.supervisor?.lecturer?.user?.fullName || null,
  }));
}

/**
 * Supervisor approves an audience registration.
 */
export async function approveAudienceBySupervisor(seminarId, studentId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Find the supervisor role for this lecturer
  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) {
    const err = new Error("Anda bukan pembimbing untuk seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  await approveAudienceRegistration(seminarId, studentId, supervisorRole.id);
  return { success: true };
}

/**
 * Supervisor cancels audience approval and resets it to initial registration state.
 */
export async function unapproveAudienceBySupervisor(seminarId, studentId, lecturerId) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) {
    const err = new Error("Anda bukan pembimbing untuk seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  await resetAudienceApproval(seminarId, studentId);
  return { success: true };
}

/**
 * Supervisor toggles audience presence.
 */
export async function toggleAudiencePresenceBySupervisor(seminarId, studentId, lecturerId, isPresent) {
  const seminar = await findSeminarDetailById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findSeminarSupervisorRole(seminarId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) {
    const err = new Error("Anda bukan pembimbing untuk seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  await toggleAudiencePresence(seminarId, studentId, isPresent);
  return { success: true };
}
