import * as examinerRepo from "../repositories/thesis-seminar-examiner.repository.js";
import * as coreRepo from "../repositories/thesis-seminar.repository.js";
import { computeEffectiveStatus } from "../utils/seminarStatus.util.js";
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

function mapScoreToGrade(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  if (s >= 80) return "A";
  if (s >= 76) return "A-";
  if (s >= 70) return "B+";
  if (s >= 65) return "B";
  if (s >= 55) return "C+";
  if (s >= 50) return "C";
  if (s >= 45) return "D";
  return "E";
}

// ============================================================
// PUBLIC: Get Eligible Examiners
// ============================================================

export async function getEligibleExaminers(seminarId) {
  const lecturers = await examinerRepo.findEligibleExaminers(seminarId);
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

export async function assignExaminers(seminarId, examinerIds, assignedByUserId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (!["verified", "examiner_assigned"].includes(seminar.status)) {
    throwError("Seminar harus berstatus 'verified' untuk penetapan penguji.", 400);
  }

  if (examinerIds.length !== 2) throwError("Harus menetapkan tepat 2 penguji.", 400);
  if (examinerIds[0] === examinerIds[1]) throwError("Kedua penguji harus berbeda.", 400);

  const currentActive = await examinerRepo.findActiveExaminersBySeminar(seminarId);
  const accepted = currentActive.filter((e) => e.availabilityStatus === "available");
  const acceptedIds = accepted.map((e) => e.lecturerId);

  // Cannot replace accepted examiners
  for (const a of accepted) {
    if (!examinerIds.includes(a.lecturerId)) throwError("Tidak dapat mengganti penguji yang sudah menyetujui.", 400);
  }

  const slotsNeeded = 2 - accepted.length;
  const newExaminerIds = examinerIds.filter((id) => !acceptedIds.includes(id));
  if (newExaminerIds.length !== slotsNeeded) {
    throwError(`Harus menetapkan tepat ${slotsNeeded} penguji baru (${accepted.length} sudah diterima).`, 400);
  }

  // Delete pending examiners
  if (currentActive.length > 0) await examinerRepo.deletePendingExaminers(seminarId);

  // Build new examiner records
  const usedOrders = accepted.map((e) => e.order);
  const availableOrders = [1, 2].filter((o) => !usedOrders.includes(o));

  const examinersData = newExaminerIds.map((lecturerId, idx) => ({
    lecturerId,
    order: availableOrders[idx],
    availabilityStatus: lecturerId === assignedByUserId ? "available" : "pending",
  }));

  if (examinersData.length > 0) await examinerRepo.createExaminers(seminarId, examinersData, assignedByUserId);

  // Auto-transition if both available
  const activeExaminers = await examinerRepo.findActiveExaminersBySeminar(seminarId);
  const allAvailable = activeExaminers.length >= 2 && activeExaminers.every((e) => e.availabilityStatus === "available");
  if (allAvailable) await coreRepo.updateSeminar(seminarId, { status: "examiner_assigned" });

  return activeExaminers;
}

// ============================================================
// PUBLIC: Respond to Assignment (Lecturer)
// ============================================================

export async function respondExaminerAssignment(seminarId, examinerId, { status }, lecturerId) {
  if (!["available", "unavailable"].includes(status)) throwError("Status harus 'available' atau 'unavailable'.", 400);

  const examiner = await examinerRepo.findExaminerById(examinerId);
  if (!examiner) throwError("Data penguji tidak ditemukan.", 404);
  if (examiner.lecturerId !== lecturerId) throwError("Anda bukan penguji yang ditugaskan.", 403);
  if (examiner.availabilityStatus !== "pending") throwError("Anda sudah memberikan respons sebelumnya.", 400);

  await examinerRepo.updateExaminerAvailability(examinerId, status);

  // Auto-transition if both available
  const activeExaminers = await examinerRepo.findActiveExaminersBySeminar(examiner.thesisSeminarId);
  const bothAvailable = activeExaminers.length >= 2 && activeExaminers.every((e) => e.availabilityStatus === "available");
  let seminarTransitioned = false;
  if (bothAvailable) {
    await coreRepo.updateSeminar(examiner.thesisSeminarId, { status: "examiner_assigned" });
    seminarTransitioned = true;
  }

  return { examinerId, availabilityStatus: status, seminarTransitioned };
}

// ============================================================
// PUBLIC: Get Assessment Form (Examiner)
// ============================================================

export async function getExaminerAssessment(seminarId, lecturerId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (!["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus)) {
    throwError("Form penilaian hanya tersedia saat seminar sedang berlangsung atau sudah selesai.", 400);
  }

  const examiner = await examinerRepo.findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId);
  if (!examiner || examiner.availabilityStatus !== "available") throwError("Anda bukan penguji aktif pada seminar ini.", 403);

  const cpmks = await examinerRepo.findSeminarAssessmentCpmks();
  const existingScoreMap = new Map(
    (examiner.thesisSeminarExaminerAssessmentDetails || []).map((item) => [item.assessmentCriteriaId, item.score])
  );

  const criteriaGroups = cpmks.map((cpmk) => ({
    id: cpmk.id, code: cpmk.code, description: cpmk.description,
    criteria: (cpmk.assessmentCriterias || []).map((c) => ({
      id: c.id, name: c.name || "-", maxScore: c.maxScore || 0,
      score: existingScoreMap.get(c.id) ?? null,
      rubrics: (c.assessmentRubrics || []).map((r) => ({ id: r.id, minScore: r.minScore, maxScore: r.maxScore, description: r.description })),
    })),
  }));

  return {
    seminar: {
      id: seminar.id, status: effectiveStatus,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
      date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime,
      room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null,
    },
    examiner: {
      id: examiner.id, order: examiner.order,
      assessmentScore: examiner.assessmentScore, revisionNotes: examiner.revisionNotes,
      assessmentSubmittedAt: examiner.assessmentSubmittedAt,
    },
    criteriaGroups,
  };
}

// ============================================================
// PUBLIC: Submit Assessment (Examiner)
// ============================================================

export async function submitExaminerAssessment(seminarId, { scores, revisionNotes }, lecturerId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (effectiveStatus !== "ongoing") throwError("Penilaian hanya dapat disubmit saat seminar sedang berlangsung.", 400);

  const examiner = await examinerRepo.findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId);
  if (!examiner || examiner.availabilityStatus !== "available") throwError("Anda bukan penguji aktif pada seminar ini.", 403);
  if (examiner.assessmentSubmittedAt) throwError("Penilaian sudah disubmit sebelumnya dan tidak dapat diubah.", 400);

  // Validate all criteria are covered
  const cpmks = await examinerRepo.findSeminarAssessmentCpmks();
  const activeCriteria = cpmks.flatMap((c) => c.assessmentCriterias || []);
  const criteriaMap = new Map(activeCriteria.map((item) => [item.id, item]));

  if ((scores || []).length !== activeCriteria.length) throwError("Semua kriteria aktif harus diisi sebelum submit.", 400);

  const seen = new Set();
  const normalizedScores = (scores || []).map((item) => {
    const criterion = criteriaMap.get(item.assessmentCriteriaId);
    if (!criterion) throwError("Terdapat kriteria yang tidak valid.", 400);
    if (seen.has(item.assessmentCriteriaId)) throwError("Duplikasi kriteria pada payload penilaian.", 400);
    seen.add(item.assessmentCriteriaId);
    const max = criterion.maxScore || 0;
    if (item.score < 0 || item.score > max) throwError(`Nilai untuk '${criterion.name || "kriteria"}' harus 0-${max}.`, 400);
    return { assessmentCriteriaId: item.assessmentCriteriaId, score: item.score };
  });

  const updated = await examinerRepo.saveExaminerAssessment({ examinerId: examiner.id, scores: normalizedScores, revisionNotes });
  return { examinerId: updated.id, assessmentScore: updated.assessmentScore, assessmentSubmittedAt: updated.assessmentSubmittedAt };
}

// ============================================================
// PUBLIC: Finalization Data (Supervisor view)
// ============================================================

export async function getFinalizationData(seminarId, lecturerId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  const examiners = await examinerRepo.findActiveExaminersWithAssessments(seminarId);
  const allSubmitted = examiners.length >= 2 && examiners.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);

  const avgScore = allSubmitted ? examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length : null;

  return {
    seminar: {
      id: seminar.id, status: effectiveStatus, finalScore: seminar.finalScore,
      grade: mapScoreToGrade(seminar.finalScore), resultFinalizedAt: seminar.resultFinalizedAt,
      revisionFinalizedAt: seminar.revisionFinalizedAt,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
    },
    supervisor: { roleName: mySupervisor.role?.name || "Pembimbing", canFinalize: effectiveStatus === "ongoing" && !seminar.resultFinalizedAt },
    examiners: examiners.map((item) => {
      const detailsByGroup = {};
      (item.thesisSeminarExaminerAssessmentDetails || []).forEach((d) => {
        const cpmk = d.criteria?.cpmk;
        if (!cpmk) return;
        if (!detailsByGroup[cpmk.id]) detailsByGroup[cpmk.id] = { id: cpmk.id, code: cpmk.code, description: cpmk.description, criteria: [] };
        detailsByGroup[cpmk.id].criteria.push({ id: d.criteria.id, name: d.criteria.name, maxScore: d.criteria.maxScore, score: d.score, displayOrder: d.criteria.displayOrder });
      });
      Object.values(detailsByGroup).forEach((g) => g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
      return {
        id: item.id, lecturerId: item.lecturerId,
        lecturerName: (seminar.examiners || []).find((x) => x.lecturerId === item.lecturerId)?.lecturerName || "-",
        order: item.order, assessmentScore: item.assessmentScore, revisionNotes: item.revisionNotes,
        assessmentSubmittedAt: item.assessmentSubmittedAt,
        assessmentDetails: Object.values(detailsByGroup).sort((a, b) => (a.code || "").localeCompare(b.code || "")),
      };
    }),
    allExaminerSubmitted: allSubmitted, averageScore: avgScore, averageGrade: avgScore !== null ? mapScoreToGrade(avgScore) : null,
    recommendationUnlocked: allSubmitted,
  };
}

// ============================================================
// PUBLIC: Finalize Seminar Result (Supervisor)
// ============================================================

export async function finalizeSeminar(seminarId, lecturerId, payload) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.resultFinalizedAt) throwError("Hasil seminar sudah pernah ditetapkan.", 400);

  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (effectiveStatus !== "ongoing") throwError("Penetapan hasil hanya dapat dilakukan saat seminar berstatus sedang berlangsung.", 400);

  const examiners = await examinerRepo.findActiveExaminersWithAssessments(seminarId);
  const allSubmitted = examiners.length >= 2 && examiners.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);
  if (!allSubmitted) throwError("Penetapan hasil dikunci sampai seluruh penguji submit nilai.", 400);

  const avgScore = examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length;

  const finalized = await coreRepo.updateSeminar(seminarId, {
    status: payload.status, finalScore: avgScore, resultFinalizedAt: new Date(),
  });

  // If failed, reset seminarReady so student can re-register
  if (payload.status === "failed" && seminar.thesisId) {
    await prisma.thesisSupervisors.updateMany({ where: { thesisId: seminar.thesisId }, data: { seminarReady: false } });
  }

  return { seminarId: finalized.id, status: finalized.status, finalScore: finalized.finalScore, grade: mapScoreToGrade(avgScore), resultFinalizedAt: finalized.resultFinalizedAt };
}
