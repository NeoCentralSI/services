import prisma from "../config/prisma.js";
import { syncQuotaCount } from "../utils/quotaSync.js";

/**
 * Find the supervisor record linking a lecturer to a thesis.
 */
export const findThesisSupervisor = async (thesisId, lecturerId, roleNames) => {
  return prisma.thesisParticipant.findFirst({
    where: {
      thesisId,
      lecturerId,
      role: { name: { in: roleNames } },
    },
    include: {
      thesis: {
        include: { student: { include: { user: { select: { id: true, fullName: true } } } } },
      },
    },
  });
};

/**
 * Find a pending evaluation for a supervisor.
 */
export const findPendingEvaluation = async (thesisSupervisorId) => {
  return prisma.thesisGuidanceEvaluation.findFirst({
    where: { thesisSupervisorId, status: "pending" },
  });
};

/**
 * Create a new guidance evaluation record.
 */
export const createEvaluation = async (data) => {
  return prisma.thesisGuidanceEvaluation.create({
    data,
    include: {
      thesis: { include: { student: { include: { user: { select: { fullName: true } } } } } },
    },
  });
};

/**
 * Find users with a specific active role (e.g., KaDep).
 */
export const findUsersByActiveRole = async (roleName) => {
  return prisma.user.findMany({
    where: {
      userHasRoles: {
        some: { role: { name: roleName }, status: "active" },
      },
    },
  });
};

/**
 * Find evaluation by ID with full relations.
 */
export const findEvaluationById = async (evaluationId) => {
  return prisma.thesisGuidanceEvaluation.findUnique({
    where: { id: evaluationId },
    include: {
      thesis: {
        include: { student: { include: { user: { select: { id: true, fullName: true } } } } },
      },
      thesisSupervisor: { include: { lecturer: { include: { user: { select: { id: true } } } } } },
    },
  });
};

/**
 * Approve or reject an evaluation (transaction for approve+terminate).
 */
export const approveEvaluation = async (evaluationId, userId, kadepNotes) => {
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.thesisGuidanceEvaluation.findUnique({
      where: { id: evaluationId },
      select: {
        recommendation: true,
        thesisSupervisorId: true,
        thesisSupervisor: {
          select: {
            lecturerId: true,
            thesis: { select: { academicYearId: true } },
          },
        },
      },
    });

    if (!evaluation) {
      throw new Error("Evaluation not found");
    }

    await tx.thesisGuidanceEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: "approved",
        kadepApprovedBy: userId,
        kadepApprovedAt: new Date(),
        kadepNotes: kadepNotes || null,
      },
    });

    if (evaluation.recommendation === "terminate_supervision") {
      await tx.thesisParticipant.update({
        where: { id: evaluation.thesisSupervisorId },
        data: { status: "terminated" },
      });

      const lecturerId = evaluation.thesisSupervisor?.lecturerId;
      const academicYearId = evaluation.thesisSupervisor?.thesis?.academicYearId;
      if (lecturerId && academicYearId) {
        await syncQuotaCount(tx, lecturerId, academicYearId);
      }
    }

    return { action: "approved", evaluationId };
  });
};

/**
 * Reject an evaluation.
 */
export const rejectEvaluation = async (evaluationId, userId, kadepNotes) => {
  await prisma.thesisGuidanceEvaluation.update({
    where: { id: evaluationId },
    data: {
      status: "rejected",
      kadepApprovedBy: userId,
      kadepApprovedAt: new Date(),
      kadepNotes: kadepNotes || null,
    },
  });
  return { action: "rejected", evaluationId };
};

/**
 * Get all pending evaluations for KaDep review.
 */
export const findPendingEvaluations = async () => {
  return prisma.thesisGuidanceEvaluation.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: {
      thesis: {
        include: {
          student: { include: { user: { select: { fullName: true, identityNumber: true } } } },
        },
      },
      thesisSupervisor: {
        include: {
          lecturer: { include: { user: { select: { fullName: true } } } },
          role: true,
        },
      },
    },
  });
};

/**
 * Get evaluations for a thesis filtered by supervisor.
 */
export const findEvaluationsForThesis = async (thesisSupervisorId) => {
  return prisma.thesisGuidanceEvaluation.findMany({
    where: { thesisSupervisorId },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Find supervisor record (id only) for a thesis+lecturer pair.
 */
export const findSupervisorId = async (thesisId, lecturerId) => {
  return prisma.thesisParticipant.findFirst({
    where: { thesisId, lecturerId },
    select: { id: true },
  });
};
