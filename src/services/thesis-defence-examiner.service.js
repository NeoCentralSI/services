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
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const lecturers = await examinerRepo.findEligibleExaminers(defenceId);
  const lecturerIds = lecturers.map((l) => l.id);
  if (lecturerIds.length === 0) return [];

  // Find examiners from the student's passed Thesis Seminar for continuity
  let previousExaminerIds = [];
  const currentThesis = await prisma.thesis.findUnique({
    where: { id: defence.thesisId },
    select: { studentId: true },
  });
  if (currentThesis?.studentId) {
    const passedSeminar = await prisma.thesisSeminar.findFirst({
      where: {
        thesis: { studentId: currentThesis.studentId },
        status: { in: ['passed', 'passed_with_revision'] },
      },
      include: { examiners: { select: { lecturerId: true } } },
      orderBy: { date: 'desc' }, // Latest passed seminar
    });
    if (passedSeminar) {
      passedSeminar.examiners.forEach((e) => {
        previousExaminerIds.push(e.lecturerId);
      });
    }
  }

  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [availabilityRows, upcomingSeminars, upcomingDefences] = await Promise.all([
    prisma.lecturerAvailability.findMany({
      where: { lecturerId: { in: lecturerIds } },
      orderBy: [{ lecturerId: "asc" }, { day: "asc" }, { startTime: "asc" }],
    }),
    prisma.thesisSeminarExaminer.findMany({
      where: {
        lecturerId: { in: lecturerIds },
        availabilityStatus: { in: ["pending", "available"] },
        seminar: {
          date: { gte: now, lte: oneMonthLater },
          status: { notIn: ["cancelled"] },
        },
      },
      include: {
        seminar: {
          include: { thesis: { include: { student: { include: { user: true } } } } },
        },
      },
    }),
    prisma.thesisDefenceExaminer.findMany({
      where: {
        lecturerId: { in: lecturerIds },
        availabilityStatus: { in: ["pending", "available"] },
        defence: {
          date: { gte: now, lte: oneMonthLater },
          status: { notIn: ["cancelled"] },
        },
      },
      include: {
        defence: {
          include: { thesis: { include: { student: { include: { user: true } } } } },
        },
      },
    }),
  ]);

  const DAY_LABELS = {
    monday: "Senin",
    tuesday: "Selasa",
    wednesday: "Rabu",
    thursday: "Kamis",
    friday: "Jumat",
  };

  const formatTimeHHMM = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };

  const availabilitiesByLecturer = new Map();
  availabilityRows.forEach((slot) => {
    if (!availabilitiesByLecturer.has(slot.lecturerId)) availabilitiesByLecturer.set(slot.lecturerId, []);
    availabilitiesByLecturer.get(slot.lecturerId).push(slot);
  });

  return lecturers.map((l) => {
    const filteredSeminars = upcomingSeminars.filter((s) => s.lecturerId === l.id);
    const filteredDefences = upcomingDefences.filter((d) => d.lecturerId === l.id);
    const upcomingCount = filteredSeminars.length + filteredDefences.length;

    const events = [
      ...filteredSeminars.map((s) => ({
        type: "seminar",
        title: "Seminar Hasil",
        studentName: s.seminar?.thesis?.student?.user?.fullName || "Mahasiswa",
        date: s.seminar.date,
        startTime: formatTimeHHMM(s.seminar.startTime),
        endTime: formatTimeHHMM(s.seminar.endTime),
      })),
      ...filteredDefences.map((d) => ({
        type: "defence",
        title: "Sidang Tugas Akhir",
        studentName: d.defence?.thesis?.student?.user?.fullName || "Mahasiswa",
        date: d.defence.date,
        startTime: formatTimeHHMM(d.defence.startTime),
        endTime: formatTimeHHMM(d.defence.endTime),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const availabilityRanges = (availabilitiesByLecturer.get(l.id) || []).map((slot) => ({
      day: slot.day,
      dayLabel: DAY_LABELS[slot.day] || slot.day,
      startTime: formatTimeHHMM(slot.startTime),
      endTime: formatTimeHHMM(slot.endTime),
      validFrom: slot.validFrom,
      validUntil: slot.validUntil,
      label: `${DAY_LABELS[slot.day] || slot.day}, ${formatTimeHHMM(slot.startTime)}-${formatTimeHHMM(slot.endTime)}`,
    }));

    return {
      id: l.id,
      fullName: l.user?.fullName || "-",
      identityNumber: l.user?.identityNumber || "-",
      scienceGroup: l.scienceGroup?.name || "-",
      upcomingCount,
      availabilityRanges,
      events,
      isPreviousExaminer: previousExaminerIds.includes(l.id),
      isSelectable: true,
    };
  });
}

// ============================================================
// PUBLIC: Assign Examiners (Kadep)
// ============================================================

export async function assignExaminers(defenceId, examinerIds, assignedByUserId) {
  const defence = await coreRepo.findDefenceById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (!["verified", "examiner_assigned", "scheduled"].includes(defence.status)) {
    throwError("Sidang harus berstatus 'verified', 'examiner_assigned', atau 'scheduled' untuk penetapan penguji.", 400);
  }

  if (examinerIds.length < 1) throwError("Minimal 1 penguji wajib ditetapkan.", 400);
  if (new Set(examinerIds).size !== examinerIds.length) throwError("Penguji tidak boleh duplikat.", 400);

  const currentAssignments = await prisma.thesisDefenceExaminer.findMany({
    where: {
      thesisDefenceId: defenceId,
      availabilityStatus: { in: ["available", "pending", "unavailable"] },
    },
    orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
  });

  const assignmentByLecturerId = new Map();
  currentAssignments.forEach((assignment) => {
    if (!assignmentByLecturerId.has(assignment.lecturerId)) {
      assignmentByLecturerId.set(assignment.lecturerId, assignment);
    }
  });

  const currentComparableAssignments = [...assignmentByLecturerId.values()];
  const requestedIdSet = new Set(examinerIds);
  const requestedOrderByLecturerId = new Map(examinerIds.map((lecturerId, idx) => [lecturerId, idx + 1]));

  const removedExaminerRecordIds = currentComparableAssignments
    .filter((examiner) => !requestedIdSet.has(examiner.lecturerId))
    .map((examiner) => examiner.id);
  const addedExaminerIds = examinerIds.filter((lecturerId) => !assignmentByLecturerId.has(lecturerId));
  const keptExaminerUpdates = examinerIds
    .map((lecturerId, idx) => ({ lecturerId, order: idx + 1, existing: assignmentByLecturerId.get(lecturerId) }))
    .filter((item) => item.existing);

  await prisma.$transaction(async (tx) => {
    if (removedExaminerRecordIds.length > 0) {
      await tx.thesisDefenceExaminer.deleteMany({
        where: {
          id: { in: removedExaminerRecordIds },
          thesisDefenceId: defenceId,
          availabilityStatus: { in: ["available", "pending", "unavailable"] },
        },
      });
    }

    if (keptExaminerUpdates.length > 0) {
      await Promise.all(
        keptExaminerUpdates.map((item) =>
          tx.thesisDefenceExaminer.update({
            where: { id: item.existing.id },
            data: {
              order: item.order,
              ...(item.existing.availabilityStatus === "unavailable"
                ? { availabilityStatus: "pending", respondedAt: null }
                : {}),
            },
          })
        )
      );
    }

    if (addedExaminerIds.length > 0) {
      const now = new Date();
      await tx.thesisDefenceExaminer.createMany({
        data: addedExaminerIds.map((lecturerId) => ({
          thesisDefenceId: defenceId,
          lecturerId,
          order: requestedOrderByLecturerId.get(lecturerId),
          assignedBy: assignedByUserId,
          assignedAt: now,
          availabilityStatus: "pending",
        })),
      });
    }
  });

  // Auto-transition if all assigned examiners are available
  const activeExaminers = await examinerRepo.findActiveExaminersByDefence(defenceId);
  const allAvailable = activeExaminers.length > 0 && activeExaminers.every((e) => e.availabilityStatus === "available");
  
  if (defence.status !== "scheduled") {
    const targetStatus = allAvailable ? "examiner_assigned" : "verified";
    if (defence.status !== targetStatus) await coreRepo.updateDefenceStatus(defenceId, targetStatus);
  }

  return activeExaminers;
}

// ============================================================
// PUBLIC: Respond to Assignment (Lecturer)
// ============================================================

export async function respondExaminerAssignment(defenceId, examinerId, payload, lecturerId) {
  const { status, unavailableReasons } = payload || {};
  if (!["available", "unavailable"].includes(status)) {
    throwError("Status harus 'available' atau 'unavailable'.", 400);
  }

  const examiner = await examinerRepo.findExaminerById(examinerId);
  if (!examiner) throwError("Data penguji tidak ditemukan.", 404);
  if (examiner.lecturerId !== lecturerId) throwError("Anda bukan penguji yang ditugaskan.", 403);
  if (examiner.availabilityStatus !== "pending") throwError("Anda sudah memberikan respons sebelumnya.", 400);

  await examinerRepo.updateExaminerAvailability(examinerId, status, unavailableReasons);

  // Auto-transition if all assigned examiners are available
  const activeExaminers = await examinerRepo.findActiveExaminersByDefence(examiner.thesisDefenceId);
  const allAvailable = activeExaminers.length > 0 && activeExaminers.every((e) => e.availabilityStatus === "available");
  let defenceTransitioned = false;
  
  const defence = await coreRepo.findDefenceBasicById(examiner.thesisDefenceId);
  if (allAvailable && defence && defence.status !== "scheduled") {
    await coreRepo.updateDefenceStatus(examiner.thesisDefenceId, "examiner_assigned");
    defenceTransitioned = true;
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
