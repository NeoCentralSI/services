import prisma from "../config/prisma.js";

// ============================================================
// HELPER: Enrich examiners with lecturer names
// ============================================================

async function enrichExaminers(examiners = []) {
  if (examiners.length === 0) return [];
  const lecturerIds = [...new Set(examiners.map((e) => e.lecturerId).filter(Boolean))];
  if (lecturerIds.length === 0) return examiners.map((e) => ({ ...e, lecturerName: "-" }));
  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: lecturerIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  const lecturerMap = new Map(lecturers.map((l) => [l.id, l.user?.fullName || "-"]));
  return examiners.map((e) => ({ ...e, lecturerName: lecturerMap.get(e.lecturerId) || "-" }));
}

// ============================================================
// ELIGIBLE EXAMINERS
// ============================================================

export async function findEligibleExaminers(defenceId) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    select: {
      thesis: { select: { thesisSupervisors: { select: { lecturerId: true } } } },
    },
  });
  if (!defence) return [];

  const supervisorIds = (defence.thesis?.thesisSupervisors || []).map((ts) => ts.lecturerId);

  return prisma.lecturer.findMany({
    where: { id: { notIn: supervisorIds } },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
      scienceGroup: { select: { name: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

// ============================================================
// EXAMINER ASSIGNMENT
// ============================================================

export async function createExaminers(defenceId, examiners, assignedBy) {
  const now = new Date();
  const data = examiners.map((e) => ({
    thesisDefenceId: defenceId,
    lecturerId: e.lecturerId,
    order: e.order,
    assignedBy,
    assignedAt: now,
    availabilityStatus: e.availabilityStatus || "pending",
    respondedAt: e.availabilityStatus === "available" ? now : null,
  }));
  return prisma.thesisDefenceExaminer.createMany({ data });
}

export async function deletePendingExaminers(defenceId) {
  return prisma.thesisDefenceExaminer.deleteMany({
    where: { thesisDefenceId: defenceId, availabilityStatus: "pending" },
  });
}

// ============================================================
// EXAMINER QUERIES
// ============================================================

export async function findActiveExaminersByDefence(defenceId) {
  const examiners = await prisma.thesisDefenceExaminer.findMany({
    where: {
      thesisDefenceId: defenceId,
      availabilityStatus: { in: ["pending", "available"] },
    },
    orderBy: { order: "asc" },
  });
  return enrichExaminers(examiners);
}

export async function findExaminerById(examinerId) {
  return prisma.thesisDefenceExaminer.findUnique({ where: { id: examinerId } });
}

export async function findLatestExaminerByDefenceAndLecturer(defenceId, lecturerId) {
  return prisma.thesisDefenceExaminer.findFirst({
    where: { thesisDefenceId: defenceId, lecturerId },
    orderBy: { assignedAt: "desc" },
    include: { thesisDefenceExaminerAssessmentDetails: true },
  });
}

export async function updateExaminerAvailability(examinerId, status) {
  return prisma.thesisDefenceExaminer.update({
    where: { id: examinerId },
    data: { availabilityStatus: status, respondedAt: new Date() },
  });
}

// ============================================================
// ASSESSMENTS
// ============================================================

export async function findDefenceAssessmentCpmks(role) {
  return prisma.cpmk.findMany({
    where: {
      type: "thesis",
      isActive: true,
      assessmentCriterias: {
        some: { appliesTo: "defence", role, isActive: true },
      },
    },
    include: {
      assessmentCriterias: {
        where: { appliesTo: "defence", role, isActive: true },
        include: { assessmentRubrics: { orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function saveDefenceExaminerAssessment({ examinerId, scores, revisionNotes }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.thesisDefenceExaminerAssessmentDetail.deleteMany({
      where: { thesisDefenceExaminerId: examinerId },
    });

    if (scores.length > 0) {
      await tx.thesisDefenceExaminerAssessmentDetail.createMany({
        data: scores.map((item) => ({
          thesisDefenceExaminerId: examinerId,
          assessmentCriteriaId: item.assessmentCriteriaId,
          score: item.score,
        })),
      });
    }

    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
    return tx.thesisDefenceExaminer.update({
      where: { id: examinerId },
      data: {
        assessmentScore: totalScore,
        revisionNotes: revisionNotes || null,
        assessmentSubmittedAt: now,
      },
    });
  });
}

export async function findActiveExaminersWithAssessments(defenceId) {
  return prisma.thesisDefenceExaminer.findMany({
    where: { thesisDefenceId: defenceId, availabilityStatus: "available" },
    include: {
      thesisDefenceExaminerAssessmentDetails: {
        include: {
          criteria: {
            select: {
              id: true,
              name: true,
              maxScore: true,
              displayOrder: true,
              cpmk: { select: { id: true, code: true, description: true } },
            },
          },
        },
      },
    },
    orderBy: { order: "asc" },
  });
}

export async function findStudentDefenceExaminerAssessmentDetails(defenceId) {
  return prisma.thesisDefenceExaminerAssessmentDetail.findMany({
    where: {
      defenceExaminer: {
        thesisDefenceId: defenceId,
        availabilityStatus: "available",
      },
    },
    include: {
      defenceExaminer: { select: { id: true, lecturerId: true, order: true } },
      criteria: {
        select: {
          id: true,
          name: true,
          maxScore: true,
          displayOrder: true,
          cpmk: { select: { id: true, code: true, description: true } },
        },
      },
    },
  });
}
