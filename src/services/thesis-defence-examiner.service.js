import * as examinerRepo from "../repositories/thesis-defence-examiner.repository.js";
import * as coreRepo from "../repositories/thesis-defence.repository.js";
import { computeEffectiveDefenceStatus } from "../utils/defenceStatus.util.js";
import { mapScoreToGrade } from "./thesis-defence.service.js";
import prisma from "../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function resolveSupervisorMembership(supervisorRelation) {
  if (!supervisorRelation) return null;
  if (supervisorRelation.thesis?.thesisSupervisors?.length > 0) {
    return supervisorRelation.thesis.thesisSupervisors[0];
  }
  return supervisorRelation;
}

function groupAssessmentDetailsByCpmk(details = []) {
  const byGroup = {};
  details.forEach((item) => {
    const cpmk = item.criteria?.cpmk;
    if (!cpmk) return;
    if (!byGroup[cpmk.id]) {
      byGroup[cpmk.id] = { id: cpmk.id, code: cpmk.code, description: cpmk.description, criteria: [] };
    }
    byGroup[cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });
  Object.values(byGroup).forEach((g) =>
    g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  );
  return Object.values(byGroup).sort((a, b) => (a.code || "").localeCompare(b.code || ""));
}

// ============================================================
// PUBLIC: Eligible Examiners
// ============================================================

export async function getEligibleExaminers(defenceId) {
  const lecturers = await examinerRepo.findEligibleExaminers(defenceId);
  return lecturers.map((l) => ({
    id: l.id,
    fullName: l.user?.fullName || "-",
    identityNumber: l.user?.identityNumber || "-",
    scienceGroup: l.scienceGroup?.name || "-",
  }));
}

// ============================================================
// PUBLIC: Assign Examiners (Kadep)
// ============================================================

export async function assignExaminers(defenceId, examinerIds, assignedByUserId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (!["verified", "examiner_assigned"].includes(defence.status)) {
    throwError("Sidang harus berstatus 'verified' untuk penetapan penguji.", 400);
  }

  if (examinerIds.length !== 2) throwError("Harus menetapkan tepat 2 penguji.", 400);
  if (examinerIds[0] === examinerIds[1]) throwError("Kedua penguji harus berbeda.", 400);

  const currentActive = await examinerRepo.findActiveExaminersByDefence(defenceId);
  const accepted = currentActive.filter((e) => e.availabilityStatus === "available");
  const acceptedIds = accepted.map((e) => e.lecturerId);

  for (const a of accepted) {
    if (!examinerIds.includes(a.lecturerId)) {
      throwError("Tidak dapat mengganti penguji yang sudah menyetujui.", 400);
    }
  }

  const slotsNeeded = 2 - accepted.length;
  const newExaminerIds = examinerIds.filter((id) => !acceptedIds.includes(id));
  if (newExaminerIds.length !== slotsNeeded) {
    throwError(
      `Harus menetapkan tepat ${slotsNeeded} penguji baru (${accepted.length} sudah diterima).`,
      400
    );
  }

  if (currentActive.length > 0) await examinerRepo.deletePendingExaminers(defenceId);

  const usedOrders = accepted.map((e) => e.order);
  const availableOrders = [1, 2].filter((o) => !usedOrders.includes(o));

  const examinersData = newExaminerIds.map((lecturerId, idx) => ({
    lecturerId,
    order: availableOrders[idx],
    availabilityStatus: lecturerId === assignedByUserId ? "available" : "pending",
  }));

  if (examinersData.length > 0) {
    await examinerRepo.createExaminers(defenceId, examinersData, assignedByUserId);
  }

  const activeExaminers = await examinerRepo.findActiveExaminersByDefence(defenceId);
  const allAvailable =
    activeExaminers.length >= 2 && activeExaminers.every((e) => e.availabilityStatus === "available");
  if (allAvailable) await coreRepo.updateDefenceStatus(defenceId, "examiner_assigned");

  return activeExaminers;
}

// ============================================================
// PUBLIC: Respond to Assignment (Lecturer)
// ============================================================

export async function respondExaminerAssignment(defenceId, examinerId, { status }, lecturerId) {
  if (!["available", "unavailable"].includes(status)) {
    throwError("Status harus 'available' atau 'unavailable'.", 400);
  }

  const examiner = await examinerRepo.findExaminerById(examinerId);
  if (!examiner) throwError("Data penguji tidak ditemukan.", 404);
  if (examiner.lecturerId !== lecturerId) throwError("Anda bukan penguji yang ditugaskan.", 403);
  if (examiner.availabilityStatus !== "pending") throwError("Anda sudah memberikan respons sebelumnya.", 400);

  await examinerRepo.updateExaminerAvailability(examinerId, status);

  let defenceTransitioned = false;
  if (status === "available") {
    const activeExaminers = await examinerRepo.findActiveExaminersByDefence(examiner.thesisDefenceId);
    const bothAvailable =
      activeExaminers.length >= 2 && activeExaminers.every((e) => e.availabilityStatus === "available");
    if (bothAvailable) {
      await coreRepo.updateDefenceStatus(examiner.thesisDefenceId, "examiner_assigned");
      defenceTransitioned = true;
    }
  }

  return { examinerId, availabilityStatus: status, defenceTransitioned };
}

// ============================================================
// PUBLIC: Assessment Form (Examiner / Supervisor)
// ============================================================

export async function getAssessment(defenceId, lecturerId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (!["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus)) {
    throwError("Form penilaian hanya tersedia saat sidang sedang berlangsung atau sudah selesai.", 400);
  }

  const examiner = await examinerRepo.findLatestExaminerByDefenceAndLecturer(defenceId, lecturerId);
  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);

  const isExaminer = !!examiner && examiner.availabilityStatus === "available";
  const isSupervisor = !!mySupervisor;

  if (!isExaminer && !isSupervisor) throwError("Anda bukan penilai aktif pada sidang ini.", 403);

  const assessorRole = isExaminer ? "examiner" : "supervisor";
  const cpmks = await examinerRepo.findDefenceAssessmentCpmks(assessorRole);

  let existingScoreMap = new Map();
  if (assessorRole === "examiner") {
    existingScoreMap = new Map(
      (examiner.thesisDefenceExaminerAssessmentDetails || []).map((item) => [
        item.assessmentCriteriaId,
        item.score,
      ])
    );
  } else {
    const supervisorDetails = await coreRepo.findDefenceSupervisorAssessmentDetails(defenceId);
    existingScoreMap = new Map(
      (supervisorDetails || []).map((item) => [item.assessmentCriteriaId, item.score])
    );
  }

  const criteriaGroups = cpmks.map((cpmk) => ({
    id: cpmk.id,
    code: cpmk.code,
    description: cpmk.description,
    criteria: (cpmk.assessmentCriterias || []).map((c) => ({
      id: c.id,
      name: c.name || "-",
      maxScore: c.maxScore || 0,
      score: existingScoreMap.get(c.id) ?? null,
      rubrics: (c.assessmentRubrics || []).map((r) => ({
        id: r.id,
        minScore: r.minScore,
        maxScore: r.maxScore,
        description: r.description,
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

// ============================================================
// PUBLIC: Submit Assessment (Examiner / Supervisor)
// ============================================================

export async function submitAssessment(defenceId, payload, lecturerId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (effectiveStatus !== "ongoing") {
    throwError("Penilaian hanya dapat disubmit saat sidang sedang berlangsung.", 400);
  }

  const examiner = await examinerRepo.findLatestExaminerByDefenceAndLecturer(defenceId, lecturerId);
  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);

  const isExaminer = !!examiner && examiner.availabilityStatus === "available";
  const isSupervisor = !!mySupervisor;
  if (!isExaminer && !isSupervisor) throwError("Anda bukan penilai aktif pada sidang ini.", 403);

  const role = isExaminer ? "examiner" : "supervisor";
  const cpmks = await examinerRepo.findDefenceAssessmentCpmks(role);
  const activeCriteria = cpmks.flatMap((cpmk) => cpmk.assessmentCriterias || []);
  const criteriaMap = new Map(activeCriteria.map((item) => [item.id, item]));

  const incoming = payload.scores || [];
  if (incoming.length !== activeCriteria.length) {
    throwError("Semua kriteria aktif harus diisi sebelum submit.", 400);
  }

  const seen = new Set();
  const normalizedScores = incoming.map((item) => {
    const criterion = criteriaMap.get(item.assessmentCriteriaId);
    if (!criterion) throwError("Terdapat kriteria yang tidak valid.", 400);
    if (seen.has(item.assessmentCriteriaId)) throwError("Duplikasi kriteria pada payload penilaian.", 400);
    seen.add(item.assessmentCriteriaId);
    const max = criterion.maxScore || 0;
    if (item.score < 0 || item.score > max) {
      throwError(`Nilai untuk '${criterion.name || "kriteria"}' harus 0-${max}.`, 400);
    }
    return { assessmentCriteriaId: item.assessmentCriteriaId, score: item.score };
  });

  if (role === "examiner") {
    if (examiner.assessmentSubmittedAt) {
      throwError("Penilaian penguji sudah disubmit sebelumnya dan tidak dapat diubah.", 400);
    }
    const updated = await examinerRepo.saveDefenceExaminerAssessment({
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
    throwError("Penilaian pembimbing sudah disubmit sebelumnya dan tidak dapat diubah.", 400);
  }
  const updated = await coreRepo.saveDefenceSupervisorAssessment({
    defenceId,
    scores: normalizedScores,
    supervisorNotes: payload.supervisorNotes,
  });
  return {
    assessorRole: "supervisor",
    defenceId: updated.id,
    assessmentScore: updated.supervisorScore,
    assessmentSubmittedAt: updated.updatedAt,
  };
}

// ============================================================
// PUBLIC: Finalization Data (Supervisor view)
// ============================================================

export async function getFinalizationData(defenceId, lecturerId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) throwError("Anda bukan dosen pembimbing pada sidang ini.", 403);

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );

  const examiners = await examinerRepo.findActiveExaminersWithAssessments(defenceId);
  const hasTwoExaminers = examiners.length >= 2;
  const allExaminerSubmitted =
    hasTwoExaminers && examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);

  const examinerAverageScore = allExaminerSubmitted
    ? examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length
    : null;

  const supervisorDetails = await coreRepo.findDefenceSupervisorAssessmentDetails(defenceId);
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

// ============================================================
// PUBLIC: Finalize Defence Result (Supervisor)
// ============================================================

export async function finalizeDefence(defenceId, payload, lecturerId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (defence.resultFinalizedAt) throwError("Hasil sidang sudah pernah ditetapkan.", 400);

  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) throwError("Anda bukan dosen pembimbing pada sidang ini.", 403);

  const effectiveStatus = computeEffectiveDefenceStatus(
    defence.status,
    defence.date,
    defence.startTime,
    defence.endTime
  );
  if (effectiveStatus !== "ongoing") {
    throwError("Penetapan hasil hanya dapat dilakukan saat sidang berstatus sedang berlangsung.", 400);
  }

  const examiners = await examinerRepo.findActiveExaminersWithAssessments(defenceId);
  const allExaminerSubmitted =
    examiners.length >= 2 &&
    examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);
  if (!allExaminerSubmitted) {
    throwError("Penetapan hasil dikunci sampai seluruh penguji submit nilai.", 400);
  }
  if (defence.supervisorScore === null) {
    throwError("Penetapan hasil dikunci sampai pembimbing submit penilaian.", 400);
  }

  const examinerAverageScore =
    examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length;
  const supervisorScore = defence.supervisorScore || 0;
  const finalScore = examinerAverageScore + supervisorScore;
  const finalGrade = mapScoreToGrade(finalScore);

  const finalized = await coreRepo.finalizeDefenceResult({
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
      await prisma.thesisSupervisors.updateMany({
        where: { thesisId },
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
