import prisma from "../../config/prisma.js";

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

export async function updateExaminerAvailability(examinerId, status, unavailableReasons = null) {
  return prisma.thesisDefenceExaminer.update({
    where: { id: examinerId },
    data: { 
      availabilityStatus: status, 
      unavailableReasons: status === "unavailable" ? unavailableReasons : null,
      respondedAt: new Date() 
    },
  });
}

// ============================================================
// ASSESSMENTS
// ============================================================

export async function findDefenceAssessmentCpmks(academicYearId, role) {
  const criteriaField =
    role === "examiner"
      ? "thesisDefenceExaminerAssessmentCriterias"
      : "thesisDefenceSupervisorAssessmentCriterias";

  const where = {
    [criteriaField]: {
      some: {},
    },
  };

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  const cpmks = await prisma.thesisCpmk.findMany({
    where,
    include: {
      [criteriaField]: {
        include: {
          assessmentRubrics: {
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return cpmks.map((cpmk) => ({
    id: cpmk.id,
    code: cpmk.code,
    description: cpmk.description,
    academicYearId: cpmk.academicYearId,
    assessmentCriterias: (cpmk[criteriaField] || []).map((c) => ({
      id: c.id,
      name: c.name,
      maxScore: c.maxScore,
      displayOrder: c.displayOrder,
      assessmentRubrics: c.assessmentRubrics || [],
    })),
  }));
}

export async function findDefenceMinimumScore(academicYearId) {
  if (!academicYearId) return null;
  const ay = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { thesisDefenceMinimumScore: true },
  });
  return ay?.thesisDefenceMinimumScore ?? null;
}

export async function saveDefenceExaminerAssessment({ examinerId, scores, revisionNotes, isDraft }) {
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
        assessmentSubmittedAt: isDraft ? undefined : new Date(),
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
              thesisCpmk: { select: { id: true, code: true, description: true } },
              assessmentRubrics: {
                select: { id: true, minScore: true, maxScore: true, description: true },
                orderBy: { displayOrder: "asc" },
              },
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
          thesisCpmk: { select: { id: true, code: true, description: true } },
          assessmentRubrics: {
            select: { id: true, minScore: true, maxScore: true, description: true },
            orderBy: { displayOrder: "asc" },
          },
        },
      },
    },
  });
}
