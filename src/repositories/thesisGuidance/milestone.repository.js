import prisma from "../../config/prisma.js";
import { normalize } from "../../constants/roles.js";

// Helper functions for role matching
function isPembimbing1(roleName) {
  const n = normalize(roleName);
  return n === "pembimbing 1" || n === "pembimbing1";
}

function isPembimbing2(roleName) {
  const n = normalize(roleName);
  return n === "pembimbing 2" || n === "pembimbing2";
}

// ============================================
// Milestone Template Repository
// ============================================

/**
 * Get all milestone templates
 */
export function findAllTemplates(isActive = true) {
  const where = {};
  if (isActive !== null) {
    where.isActive = isActive;
  }
  return prisma.thesisMilestoneTemplate.findMany({
    where,
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * Get templates by category
 */
export function findTemplatesByCategory(category, isActive = true) {
  return prisma.thesisMilestoneTemplate.findMany({
    where: { category, isActive },
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * Get template by ID
 */
export function findTemplateById(id) {
  return prisma.thesisMilestoneTemplate.findUnique({
    where: { id },
  });
}

/**
 * Create template
 */
export function createTemplate(data) {
  return prisma.thesisMilestoneTemplate.create({
    data,
  });
}

/**
 * Update template
 */
export function updateTemplate(id, data) {
  return prisma.thesisMilestoneTemplate.update({
    where: { id },
    data,
  });
}

/**
 * Delete template
 */
export function deleteTemplate(id) {
  return prisma.thesisMilestoneTemplate.delete({
    where: { id },
  });
}

/**
 * Get max order index for templates
 */
export async function getMaxTemplateOrderIndex(category = null) {
  const where = category ? { category } : {};
  const result = await prisma.thesisMilestoneTemplate.aggregate({
    where,
    _max: { orderIndex: true },
  });
  return result._max.orderIndex ?? -1;
}

// ============================================
// Thesis Milestone Repository
// ============================================

/**
 * Get all milestones for a thesis
 */
export function findByThesisId(thesisId, status = null) {
  const where = { thesisId };
  if (status) {
    where.status = status;
  }
  return prisma.thesisMilestone.findMany({
    where,
    include: {
      guidances: {
        select: {
          id: true,
          status: true,
          requestedDate: true,
          completedAt: true,
        },
      },
      _count: {
        select: { activityLogs: true },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * Get milestone by ID
 */
export function findById(id) {
  return prisma.thesisMilestone.findUnique({
    where: { id },
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          studentId: true,
          student: {
            select: {
              user: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
        },
      },
      guidances: {
        include: {
          supervisor: {
            include: {
              user: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
        orderBy: { requestedDate: "desc" },
        take: 5,
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}

/**
 * Get milestone by ID and thesis ID (for validation)
 */
export function findByIdAndThesisId(id, thesisId) {
  return prisma.thesisMilestone.findFirst({
    where: { id, thesisId },
    include: {
      thesis: { select: { id: true, studentId: true } },
    },
  });
}

/**
 * Create new milestone
 */
export function create(data) {
  return prisma.thesisMilestone.create({
    data,
    include: {
      _count: {
        select: { activityLogs: true },
      },
    },
  });
}

/**
 * Create multiple milestones (bulk create)
 */
export function createMany(dataArray) {
  return prisma.thesisMilestone.createMany({
    data: dataArray,
    skipDuplicates: true,
  });
}

/**
 * Update milestone by ID
 */
export function update(id, data) {
  return prisma.thesisMilestone.update({
    where: { id },
    data,
    include: {
      _count: {
        select: { activityLogs: true },
      },
    },
  });
}

/**
 * Delete milestone by ID
 */
export function remove(id) {
  return prisma.thesisMilestone.delete({
    where: { id },
  });
}

/**
 * Update milestone status
 */
export function updateStatus(id, status, additionalData = {}) {
  return prisma.thesisMilestone.update({
    where: { id },
    data: {
      status,
      ...additionalData,
    },
  });
}

/**
 * Update progress percentage
 */
export function updateProgress(id, progressPercentage) {
  return prisma.thesisMilestone.update({
    where: { id },
    data: { progressPercentage },
  });
}

/**
 * Count milestones by status for a thesis
 */
export function countByThesisAndStatus(thesisId) {
  return prisma.thesisMilestone.groupBy({
    by: ["status"],
    where: { thesisId },
    _count: { id: true },
  });
}

/**
 * Get overall progress for a thesis
 */
export async function getThesisProgress(thesisId) {
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId },
    select: {
      id: true,
      status: true,
      progressPercentage: true,
    },
  });

  const total = milestones.length;
  if (total === 0) return { total: 0, completed: 0, averageProgress: 0, percentComplete: 0, isComplete: false };

  const completed = milestones.filter((m) => m.status === "completed").length;
  const totalProgress = milestones.reduce((sum, m) => sum + m.progressPercentage, 0);
  const averageProgress = Math.round(totalProgress / total);
  const percentComplete = Math.round((completed / total) * 100);

  return {
    total,
    completed,
    inProgress: milestones.filter((m) => m.status === "in_progress").length,
    notStarted: milestones.filter((m) => m.status === "not_started").length,
    pendingReview: milestones.filter((m) => m.status === "pending_review").length,
    revisionNeeded: milestones.filter((m) => m.status === "revision_needed").length,
    averageProgress,
    percentComplete,
    isComplete: completed === total && total > 0,
  };
}

// ============================================
// Milestone Log Repository
// ============================================

/**
 * Create milestone activity log
 */
export function createLog(data) {
  return prisma.thesisMilestoneLog.create({
    data,
  });
}

/**
 * Get logs for a milestone
 */
export function findLogsByMilestoneId(milestoneId, limit = 20) {
  return prisma.thesisMilestoneLog.findMany({
    where: { milestoneId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get recent logs for a thesis (all milestones)
 */
export function findRecentLogsByThesisId(thesisId, limit = 50) {
  return prisma.thesisMilestoneLog.findMany({
    where: {
      milestone: { thesisId },
    },
    include: {
      milestone: {
        select: { id: true, title: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ============================================
// Helper functions
// ============================================

/**
 * Get max order index for a thesis
 */
export async function getMaxOrderIndex(thesisId) {
  const result = await prisma.thesisMilestone.aggregate({
    where: { thesisId },
    _max: { orderIndex: true },
  });
  return result._max.orderIndex ?? -1;
}

/**
 * Reorder milestones
 */
export async function reorderMilestones(thesisId, milestoneOrders) {
  // milestoneOrders: [{ id: string, orderIndex: number }]
  const updates = milestoneOrders.map((item) =>
    prisma.thesisMilestone.update({
      where: { id: item.id },
      data: { orderIndex: item.orderIndex },
    })
  );
  return prisma.$transaction(updates);
}

/**
 * Create milestone with log in transaction
 */
export async function createWithLog(milestoneData, userId) {
  return prisma.$transaction(async (tx) => {
    const milestone = await tx.thesisMilestone.create({
      data: milestoneData,
    });

    await tx.thesisMilestoneLog.create({
      data: {
        milestoneId: milestone.id,
        action: "created",
        newStatus: milestone.status,
        newProgress: milestone.progressPercentage,
        performedBy: userId,
        notes: `Milestone "${milestone.title}" dibuat`,
      },
    });

    return milestone;
  });
}

/**
 * Update milestone status with log
 */
export async function updateStatusWithLog(id, newStatus, userId, notes = null, additionalData = {}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thesisMilestone.findUnique({
      where: { id },
      select: { status: true, progressPercentage: true, title: true },
    });

    if (!current) throw new Error("Milestone not found");

    const milestone = await tx.thesisMilestone.update({
      where: { id },
      data: {
        status: newStatus,
        ...additionalData,
      },
    });

    await tx.thesisMilestoneLog.create({
      data: {
        milestoneId: id,
        action: "status_changed",
        previousStatus: current.status,
        newStatus: newStatus,
        previousProgress: current.progressPercentage,
        newProgress: milestone.progressPercentage,
        performedBy: userId,
        notes: notes || `Status berubah dari ${current.status} ke ${newStatus}`,
      },
    });

    return milestone;
  });
}

/**
 * Validate milestone by supervisor
 */
export async function validateMilestone(id, validatorId, supervisorNotes = null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thesisMilestone.findUnique({
      where: { id },
      select: { status: true, progressPercentage: true, title: true },
    });

    if (!current) throw new Error("Milestone not found");

    const milestone = await tx.thesisMilestone.update({
      where: { id },
      data: {
        status: "completed",
        progressPercentage: 100,
        validatedBy: validatorId,
        validatedAt: new Date(),
        supervisorNotes,
        completedAt: new Date(),
      },
    });

    await tx.thesisMilestoneLog.create({
      data: {
        milestoneId: id,
        action: "validated",
        previousStatus: current.status,
        newStatus: "completed",
        previousProgress: current.progressPercentage,
        newProgress: 100,
        performedBy: validatorId,
        notes: supervisorNotes || `Milestone "${current.title}" divalidasi oleh dosen pembimbing`,
      },
    });

    return milestone;
  });
}

/**
 * Request revision on milestone
 */
export async function requestRevision(id, supervisorId, revisionNotes) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.thesisMilestone.findUnique({
      where: { id },
      select: { status: true, progressPercentage: true, title: true },
    });

    if (!current) throw new Error("Milestone not found");

    const milestone = await tx.thesisMilestone.update({
      where: { id },
      data: {
        status: "revision_needed",
        supervisorNotes: revisionNotes,
      },
    });

    await tx.thesisMilestoneLog.create({
      data: {
        milestoneId: id,
        action: "revision_requested",
        previousStatus: current.status,
        newStatus: "revision_needed",
        performedBy: supervisorId,
        notes: revisionNotes || `Revisi diminta untuk milestone "${current.title}"`,
      },
    });

    return milestone;
  });
}

// ============================================
// Seminar Readiness Approval Repository
// ============================================

/**
 * Get thesis seminar readiness status
 */
export function getThesisSeminarReadiness(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      seminarReadyApprovedBySupervisor1: true,
      seminarReadyApprovedBySupervisor2: true,
      seminarReadyApprovedAt: true,
      seminarReadyNotes: true,
      student: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              fullName: true,
              identityNumber: true,
              email: true,
            },
          },
        },
      },
      thesisParticipants: {
        select: {
          id: true,
          lecturerId: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          lecturer: {
            select: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Approve seminar readiness by supervisor
 * @param {string} thesisId
 * @param {string} supervisorRole - "pembimbing1" or "pembimbing2"
 * @param {string} notes - optional notes
 */
export async function approveSeminarReadiness(thesisId, supervisorRole, notes = null) {
  const updateData = {
    seminarReadyNotes: notes,
  };

  const isSupervisor1 = isPembimbing1(supervisorRole);
  const isSupervisor2 = isPembimbing2(supervisorRole);

  if (isSupervisor1) {
    updateData.seminarReadyApprovedBySupervisor1 = true;
  } else if (isSupervisor2) {
    updateData.seminarReadyApprovedBySupervisor2 = true;
  }

  // Check if both are now approved
  const current = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      seminarReadyApprovedBySupervisor1: true,
      seminarReadyApprovedBySupervisor2: true,
    },
  });

  // If this approval makes both supervisors approved, set the approval date
  const willBothBeApproved =
    (isSupervisor1 && current.seminarReadyApprovedBySupervisor2) ||
    (isSupervisor2 && current.seminarReadyApprovedBySupervisor1);

  if (willBothBeApproved) {
    updateData.seminarReadyApprovedAt = new Date();
  }

  return prisma.thesis.update({
    where: { id: thesisId },
    data: updateData,
    select: {
      id: true,
      title: true,
      seminarReadyApprovedBySupervisor1: true,
      seminarReadyApprovedBySupervisor2: true,
      seminarReadyApprovedAt: true,
      seminarReadyNotes: true,
    },
  });
}

/**
 * Revoke seminar readiness approval by supervisor
 */
export async function revokeSeminarReadiness(thesisId, supervisorRole, notes = null) {
  const updateData = {
    seminarReadyApprovedAt: null,
    seminarReadyNotes: notes,
  };

  if (isPembimbing1(supervisorRole)) {
    updateData.seminarReadyApprovedBySupervisor1 = false;
  } else if (isPembimbing2(supervisorRole)) {
    updateData.seminarReadyApprovedBySupervisor2 = false;
  }

  return prisma.thesis.update({
    where: { id: thesisId },
    data: updateData,
    select: {
      id: true,
      title: true,
      seminarReadyApprovedBySupervisor1: true,
      seminarReadyApprovedBySupervisor2: true,
      seminarReadyApprovedAt: true,
      seminarReadyNotes: true,
    },
  });
}

/**
 * Get list of students ready for seminar (both supervisors approved)
 */
export function findStudentsReadyForSeminar() {
  return prisma.thesis.findMany({
    where: {
      seminarReadyApprovedBySupervisor1: true,
      seminarReadyApprovedBySupervisor2: true,
      seminarReadyApprovedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      seminarReadyApprovedAt: true,
      seminarReadyNotes: true,
      student: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              identityNumber: true,
              email: true,
            },
          },
        },
      },
      thesisParticipants: {
        select: {
          role: { select: { name: true } },
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: { seminarReadyApprovedAt: "desc" },
  });
}
