import prisma from "../config/prisma.js";

/**
 * Fetch all students in a Metopen Class with their Thesis and ResearchMethodScore
 */
export async function findClassGradingData(classId) {
  return prisma.metopenClassStudent.findMany({
    where: { classId },
    include: {
      student: {
        include: {
          user: {
            select: { id: true, fullName: true, identityNumber: true },
          },
          thesis: {
            // Usually academicYearId helps but we take the latest/active ongoing thesis
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              thesisMilestones: {
                where: { milestoneTemplate: { phase: "metopen" }, status: "completed" },
                select: {
                  id: true,
                  totalScore: true,
                  milestoneTemplate: { select: { weightPercentage: true } },
                },
              },
              thesisSupervisors: {
                include: { lecturer: { include: { user: { select: { fullName: true } } } } },
              },
              researchMethodScores: {
                orderBy: { createdAt: "desc" },
                take: 1
              }
            },
          },
        },
      },
    },
  });
}

/**
 * Get single student metopen grading 
 */
export async function findStudentGradingData(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      thesisMilestones: {
        where: { milestoneTemplate: { phase: "metopen" }, status: "completed" },
        select: {
          id: true,
          totalScore: true,
          milestoneTemplate: { select: { weightPercentage: true } },
        },
      },
      thesisSupervisors: {
        include: { lecturer: { include: { user: { select: { fullName: true } } } } },
      },
      researchMethodScores: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
}

/**
 * Upsert Research Method Score
 */
export async function upsertResearchMethodScore({ thesisId, supervisorId, lecturerId, supervisorScore, lecturerScore, finalScore, isFinalized, finalizedBy, finalizedAt, calculatedAt }) {
  // Check if exists
  const existing = await prisma.researchMethodScore.findFirst({
    where: { thesisId },
    orderBy: { createdAt: "desc" }
  });

  const updateData = {};
  if (supervisorScore !== undefined) updateData.supervisorScore = supervisorScore;
  if (supervisorId !== undefined) updateData.supervisorId = supervisorId;
  if (lecturerScore !== undefined) updateData.lecturerScore = lecturerScore;
  if (lecturerId !== undefined) updateData.lecturerId = lecturerId;
  if (finalScore !== undefined) updateData.finalScore = finalScore;
  if (isFinalized !== undefined) updateData.isFinalized = isFinalized;
  if (finalizedBy !== undefined) updateData.finalizedBy = finalizedBy;
  if (finalizedAt !== undefined) updateData.finalizedAt = finalizedAt;
  if (calculatedAt !== undefined) updateData.calculatedAt = calculatedAt;

  if (existing) {
    return prisma.researchMethodScore.update({
      where: { id: existing.id },
      data: updateData,
    });
  } else {
    return prisma.researchMethodScore.create({
      data: {
        thesisId,
        ...updateData,
      }
    });
  }
}

/**
 * Upsert per-criteria score details for a ResearchMethodScore
 */
export async function upsertScoreDetails(researchMethodScoreId, criteriaScores) {
  for (const cs of criteriaScores) {
    await prisma.researchMethodScoreDetail.upsert({
      where: {
        researchMethodScoreId_assessmentCriteriaId: {
          researchMethodScoreId,
          assessmentCriteriaId: cs.criteriaId,
        },
      },
      create: {
        researchMethodScoreId,
        assessmentCriteriaId: cs.criteriaId,
        score: cs.score,
      },
      update: {
        score: cs.score,
      },
    });
  }
}

/**
 * Get assessment criteria for metopen rubrics (TA-03A or TA-03B)
 */
export async function findMetopenAssessmentCriteria(role = "supervisor") {
  return prisma.assessmentCriteria.findMany({
    where: {
      appliesTo: "metopen",
      role: role === "supervisor" ? "supervisor" : "default",
      isActive: true,
      isDeleted: false,
    },
    include: {
      cpmk: { select: { id: true, code: true, description: true } },
      assessmentRubrics: {
        where: { isDeleted: false },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });
}

