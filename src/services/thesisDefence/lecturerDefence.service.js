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
  findDefenceAssessmentCpmks,
  findLatestExaminerByDefenceAndLecturer,
  saveDefenceExaminerAssessment,
  findDefenceSupervisorRole,
  findDefenceSupervisorAssessmentDetails,
  saveDefenceSupervisorAssessment,
  findActiveExaminersWithAssessments,
  finalizeDefenceResult,
  finalizeDefenceRevisions,
  findDefenceRevisionsByDefenceId,
  approveDefenceRevisionItem,
  unapproveDefenceRevisionItem,
  findDefenceRevisionByIdFull,
} from "../../repositories/thesisDefence/lecturerDefence.repository.js";
import { findDefenceDocumentWithFile } from "../../repositories/thesisDefence/adminDefence.repository.js";
import { getDefenceDocumentTypes } from "../../repositories/thesisDefence/studentDefence.repository.js";
import { computeEffectiveDefenceStatus } from "../../utils/defenceStatus.util.js";
import prisma from "../../config/prisma.js";

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

function groupAssessmentDetailsByCpmk(details = []) {
  const byGroup = {};

  details.forEach((item) => {
    const cpmk = item.criteria?.cpmk;
    if (!cpmk) return;

    if (!byGroup[cpmk.id]) {
      byGroup[cpmk.id] = {
        id: cpmk.id,
        code: cpmk.code,
        description: cpmk.description,
        criteria: [],
      };
    }

    byGroup[cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });

  Object.values(byGroup).forEach((group) => {
    group.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  });

  return Object.values(byGroup).sort((a, b) =>
    (a.code || "").localeCompare(b.code || "")
  );
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
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
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
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
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

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );

  const activeExaminers = (defence.examiners || []).filter(
    (e) => e.availabilityStatus === "available"
  );
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
    myAssessmentSubmittedAt: myExaminer?.assessmentSubmittedAt || null,
    canOpenExaminerAssessment:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isExaminer &&
      myExaminer?.availabilityStatus === "available",
    canOpenSupervisorAssessment:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isSupervisor,
    canOpenSupervisorFinalization:
      ["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus) &&
      isSupervisor,
    resultFinalizedAt: defence.resultFinalizedAt,
    allExaminerSubmitted,
    supervisorAssessmentSubmitted,
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
// LECTURER — Defence Assessment & Finalization
// ============================================================

export async function getDefenceAssessmentForm(defenceId, lecturerId) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (!["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus)) {
    const err = new Error("Form penilaian hanya tersedia saat sidang sedang berlangsung atau sudah selesai.");
    err.statusCode = 400;
    throw err;
  }

  const examiner = await findLatestExaminerByDefenceAndLecturer(defenceId, lecturerId);
  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);

  const isExaminer = !!examiner && examiner.availabilityStatus === "available";
  const isSupervisor = !!mySupervisor;

  if (!isExaminer && !isSupervisor) {
    const err = new Error("Anda bukan penilai aktif pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const assessorRole = isExaminer ? "examiner" : "supervisor";
  const cpmks = await findDefenceAssessmentCpmks(assessorRole);

  let existingScoreMap = new Map();
  if (assessorRole === "examiner") {
    existingScoreMap = new Map(
      (examiner.thesisDefenceExaminerAssessmentDetails || []).map((item) => [
        item.assessmentCriteriaId,
        item.score,
      ])
    );
  } else {
    const supervisorDetails = await findDefenceSupervisorAssessmentDetails(defenceId);
    existingScoreMap = new Map(
      (supervisorDetails || []).map((item) => [item.assessmentCriteriaId, item.score])
    );
  }

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
    defence: {
      id: defence.id,
      status: effectiveStatus,
      studentName: defence.thesis?.student?.user?.fullName || "-",
      studentNim: defence.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: defence.thesis?.title || "-",
      date: defence.date,
      startTime: defence.startTime,
      endTime: defence.endTime,
      room: defence.room ? { id: defence.room.id, name: defence.room.name } : null,
    },
    assessorRole,
    examiner:
      assessorRole === "examiner"
        ? {
            id: examiner.id,
            order: examiner.order,
            assessmentScore: examiner.assessmentScore,
            revisionNotes: examiner.revisionNotes,
            assessmentSubmittedAt: examiner.assessmentSubmittedAt,
          }
        : null,
    supervisor:
      assessorRole === "supervisor"
        ? {
            roleName: mySupervisor?.role?.name || "Pembimbing",
            assessmentScore: defence.supervisorScore,
            supervisorNotes: defence.supervisorNotes,
            assessmentSubmittedAt: defence.supervisorScore !== null ? defence.updatedAt : null,
          }
        : null,
    criteriaGroups,
  };
}

export async function submitDefenceAssessment(defenceId, lecturerId, payload) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (effectiveStatus !== "ongoing") {
    const err = new Error("Penilaian hanya dapat disubmit saat sidang sedang berlangsung.");
    err.statusCode = 400;
    throw err;
  }

  const examiner = await findLatestExaminerByDefenceAndLecturer(defenceId, lecturerId);
  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);

  const isExaminer = !!examiner && examiner.availabilityStatus === "available";
  const isSupervisor = !!mySupervisor;

  if (!isExaminer && !isSupervisor) {
    const err = new Error("Anda bukan penilai aktif pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const role = isExaminer ? "examiner" : "supervisor";
  const cpmks = await findDefenceAssessmentCpmks(role);
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

  if (role === "examiner") {
    if (examiner.assessmentSubmittedAt) {
      const err = new Error("Penilaian penguji sudah disubmit sebelumnya dan tidak dapat diubah.");
      err.statusCode = 400;
      throw err;
    }

    const updated = await saveDefenceExaminerAssessment({
      examinerId: examiner.id,
      scores: normalizedScores,
      revisionNotes: payload.revisionNotes,
    });

    return {
      assessorRole: "examiner",
      examinerId: updated.id,
      assessmentScore: updated.assessmentScore,
      assessmentSubmittedAt: updated.assessmentSubmittedAt,
    };
  }

  if (defence.supervisorScore !== null) {
    const err = new Error("Penilaian pembimbing sudah disubmit sebelumnya dan tidak dapat diubah.");
    err.statusCode = 400;
    throw err;
  }

  const updatedDefence = await saveDefenceSupervisorAssessment({
    defenceId,
    scores: normalizedScores,
    supervisorNotes: payload.supervisorNotes,
  });

  return {
    assessorRole: "supervisor",
    defenceId: updatedDefence.id,
    assessmentScore: updatedDefence.supervisorScore,
    assessmentSubmittedAt: updatedDefence.updatedAt,
  };
}

export async function getSupervisorFinalizationData(defenceId, lecturerId) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );

  const examiners = await findActiveExaminersWithAssessments(defenceId);
  const hasTwoExaminers = examiners.length >= 2;
  const allExaminerSubmitted =
    hasTwoExaminers && examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);

  const examinerAverageScore = allExaminerSubmitted
    ? examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length
    : null;

  const supervisorDetails = await findDefenceSupervisorAssessmentDetails(defenceId);
  const supervisorAssessmentSubmitted = defence.supervisorScore !== null;
  const supervisorAssessmentGroups = groupAssessmentDetailsByCpmk(supervisorDetails);

  const recommendationUnlocked = allExaminerSubmitted && supervisorAssessmentSubmitted;
  const computedFinalScore = recommendationUnlocked
    ? (examinerAverageScore || 0) + (defence.supervisorScore || 0)
    : null;

  return {
    defence: {
      id: defence.id,
      status: effectiveStatus,
      examinerAverageScore,
      supervisorScore: defence.supervisorScore,
      finalScore: defence.finalScore,
      computedFinalScore,
      grade: defence.grade,
      resultFinalizedAt: defence.resultFinalizedAt,
      revisionFinalizedAt: defence.revisionFinalizedAt,
      revisionFinalizedBy: defence.revisionFinalizedBy,
      studentName: defence.thesis?.student?.user?.fullName || "-",
      studentNim: defence.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: defence.thesis?.title || "-",
    },
    supervisor: {
      roleName: mySupervisor.role?.name || "Pembimbing",
      name: mySupervisor.lecturer?.user?.fullName || "-",
      canFinalize: effectiveStatus === "ongoing" && !defence.resultFinalizedAt,
    },
    examiners: examiners.map((item) => ({
      id: item.id,
      lecturerId: item.lecturerId,
      lecturerName:
        (defence.examiners || []).find((x) => x.lecturerId === item.lecturerId)?.lecturerName || "-",
      order: item.order,
      assessmentScore: item.assessmentScore,
      revisionNotes: item.revisionNotes,
      assessmentSubmittedAt: item.assessmentSubmittedAt,
      assessmentDetails: groupAssessmentDetailsByCpmk(item.thesisDefenceExaminerAssessmentDetails || []),
    })),
    supervisorAssessment: {
      assessmentScore: defence.supervisorScore,
      supervisorNotes: defence.supervisorNotes,
      assessmentSubmittedAt: supervisorAssessmentSubmitted ? defence.updatedAt : null,
      assessmentDetails: supervisorAssessmentGroups,
    },
    allExaminerSubmitted,
    supervisorAssessmentSubmitted,
    recommendationUnlocked,
  };
}

export async function finalizeDefenceBySupervisor(defenceId, lecturerId, payload) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  if (defence.resultFinalizedAt) {
    const err = new Error("Hasil sidang sudah pernah ditetapkan.");
    err.statusCode = 400;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (effectiveStatus !== "ongoing") {
    const err = new Error("Penetapan hasil hanya dapat dilakukan saat sidang berstatus sedang berlangsung.");
    err.statusCode = 400;
    throw err;
  }

  const examiners = await findActiveExaminersWithAssessments(defenceId);
  const allExaminerSubmitted =
    examiners.length >= 2 &&
    examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);
  if (!allExaminerSubmitted) {
    const err = new Error("Penetapan hasil dikunci sampai seluruh penguji submit nilai.");
    err.statusCode = 400;
    throw err;
  }

  if (defence.supervisorScore === null) {
    const err = new Error("Penetapan hasil dikunci sampai pembimbing submit penilaian.");
    err.statusCode = 400;
    throw err;
  }

  const examinerAverageScore =
    examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length;
  const supervisorScore = defence.supervisorScore || 0;
  const finalScore = examinerAverageScore + supervisorScore;
  const finalGrade = mapScoreToGrade(finalScore);

  const finalized = await finalizeDefenceResult({
    defenceId,
    status: payload.status,
    examinerAverageScore,
    supervisorScore,
    finalScore,
    grade: finalGrade,
    resultFinalizedBy: mySupervisor.id,
  });

  if (payload.status === "failed") {
    const thesisId = defence.thesis?.id;
    if (thesisId) {
      await prisma.thesisParticipant.updateMany({
        where: { thesisId, status: "active" },
        data: { defenceReady: false },
      });
    }
  }

  return {
    defenceId: finalized.id,
    status: finalized.status,
    examinerAverageScore: finalized.examinerAverageScore,
    supervisorScore: finalized.supervisorScore,
    finalScore: finalized.finalScore,
    grade: finalized.grade,
    resultFinalizedAt: finalized.resultFinalizedAt,
  };
}

export async function getSupervisorDefenceRevisionBoard(defenceId, lecturerId) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const revisions = await findDefenceRevisionsByDefenceId(defenceId);

  return revisions.map((item) => ({
    id: item.id,
    examinerOrder: item.defenceExaminer?.order || null,
    examinerLecturerId: item.defenceExaminer?.lecturerId || null,
    description: item.description,
    revisionAction: item.revisionAction,
    isFinished: item.isFinished,
    studentSubmittedAt: item.studentSubmittedAt,
    supervisorApprovedAt: item.supervisorApprovedAt,
    approvedBySupervisorId: item.supervisor?.id || null,
    approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
  }));
}

export async function approveDefenceRevisionBySupervisor(defenceId, revisionId, lecturerId) {
  const revision = await findDefenceRevisionByIdFull(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (revision.defenceExaminer?.thesisDefenceId !== defenceId) {
    const err = new Error("Revisi tidak terkait dengan sidang ini.");
    err.statusCode = 400;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

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

  const approved = await approveDefenceRevisionItem(revisionId, mySupervisor.id);

  return {
    id: approved.id,
    isFinished: approved.isFinished,
    supervisorApprovedAt: approved.supervisorApprovedAt,
  };
}

export async function unapproveDefenceRevisionBySupervisor(defenceId, revisionId, lecturerId) {
  const revision = await findDefenceRevisionByIdFull(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (revision.defenceExaminer?.thesisDefenceId !== defenceId) {
    const err = new Error("Revisi tidak terkait dengan sidang ini.");
    err.statusCode = 400;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  if (!revision.isFinished) {
    const err = new Error("Revisi ini belum disetujui.");
    err.statusCode = 400;
    throw err;
  }

  const unapproved = await unapproveDefenceRevisionItem(revisionId);

  return {
    id: unapproved.id,
    isFinished: unapproved.isFinished,
  };
}

export async function finalizeDefenceRevisionsBySupervisor(defenceId, lecturerId) {
  const defence = await findDefenceDetailById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorRelation = await findDefenceSupervisorRole(defenceId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) {
    const err = new Error("Anda bukan dosen pembimbing pada sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  if (defence.revisionFinalizedAt) {
    const err = new Error("Revisi sidang sudah difinalisasi sebelumnya.");
    err.statusCode = 400;
    throw err;
  }

  const revisions = await findDefenceRevisionsByDefenceId(defenceId);
  const relevantRevisions = revisions.filter((item) => item.studentSubmittedAt || item.isFinished);

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
    finalized = await finalizeDefenceRevisions({
      defenceId,
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
    defenceId: finalized.id,
    revisionFinalizedAt: finalized.revisionFinalizedAt,
    revisionFinalizedBy: finalized.revisionFinalizedBy,
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
