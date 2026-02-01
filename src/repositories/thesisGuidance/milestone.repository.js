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
export function findAllTemplates(isActive = true, topicId = null) {
  const where = {};
  if (isActive !== null) {
    where.isActive = isActive;
  }
  if (topicId) {
    where.topicId = topicId;
  }
  return prisma.thesisMilestoneTemplate.findMany({
    where,
    orderBy: { orderIndex: "asc" },
    include: { topic: true },
  });
}

/**
 * Get templates by topic
 */
export function findTemplatesByTopic(topicId, isActive = true) {
  return prisma.thesisMilestoneTemplate.findMany({
    where: { topicId, isActive },
    orderBy: { orderIndex: "asc" },
    include: { topic: true },
  });
}

/**
 * Get template by ID
 */
export function findTemplateById(id) {
  return prisma.thesisMilestoneTemplate.findUnique({
    where: { id },
    include: { topic: true },
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
 * Bulk delete templates
 */
export function deleteTemplatesMany(ids) {
  return prisma.thesisMilestoneTemplate.deleteMany({
    where: { id: { in: ids } },
  });
}

/**
 * Get max order index for templates
 */
export async function getMaxTemplateOrderIndex(topicId = null) {
  const where = topicId ? { topicId } : {};
  const result = await prisma.thesisMilestoneTemplate.aggregate({
    where,
    _max: { orderIndex: true },
  });
  return result._max.orderIndex ?? -1;
}

/**
 * Get all thesis topics
 */
export function findAllTopics() {
  return prisma.thesisTopic.findMany({
    orderBy: { name: "asc" },
  });
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
 * Update milestone status
 */
export async function updateMilestoneStatus(id, newStatus, additionalData = {}) {
  return prisma.thesisMilestone.update({
    where: { id },
    data: {
      status: newStatus,
      ...additionalData,
    },
  });
}

/**
 * Validate milestone by supervisor
 */
export async function validateMilestone(id, validatorId, supervisorNotes = null) {
  return prisma.thesisMilestone.update({
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
}

/**
 * Request revision on milestone
 */
export async function requestRevision(id, supervisorId, revisionNotes) {
  return prisma.thesisMilestone.update({
    where: { id },
    data: {
      status: "revision_needed",
      supervisorNotes: revisionNotes,
    },
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

// ============================================
// Defence Readiness Repository
// ============================================

/**
 * Get thesis defence readiness status
 */
export function getThesisDefenceReadiness(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      defenceReadyApprovedBySupervisor1: true,
      defenceReadyApprovedBySupervisor2: true,
      defenceReadyApprovedAt: true,
      defenceReadyNotes: true,
      finalThesisDocumentId: true,
      defenceRequestedAt: true,
      thesisStatus: {
        select: {
          id: true,
          name: true,
        },
      },
      finalThesisDocument: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
          createdAt: true,
        },
      },
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
 * Approve defence readiness by supervisor
 * @param {string} thesisId
 * @param {string} supervisorRole - "pembimbing1" or "pembimbing2"
 * @param {string} notes - optional notes
 */
export async function approveDefenceReadiness(thesisId, supervisorRole, notes = null) {
  const updateData = {
    defenceReadyNotes: notes,
  };

  const isSupervisor1 = isPembimbing1(supervisorRole);
  const isSupervisor2 = isPembimbing2(supervisorRole);

  if (isSupervisor1) {
    updateData.defenceReadyApprovedBySupervisor1 = true;
  } else if (isSupervisor2) {
    updateData.defenceReadyApprovedBySupervisor2 = true;
  }

  // Check if both are now approved
  const current = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      defenceReadyApprovedBySupervisor1: true,
      defenceReadyApprovedBySupervisor2: true,
    },
  });

  // If this approval makes both supervisors approved, set the approval date
  const willBothBeApproved =
    (isSupervisor1 && current.defenceReadyApprovedBySupervisor2) ||
    (isSupervisor2 && current.defenceReadyApprovedBySupervisor1);

  if (willBothBeApproved) {
    updateData.defenceReadyApprovedAt = new Date();
  }

  return prisma.thesis.update({
    where: { id: thesisId },
    data: updateData,
    select: {
      id: true,
      title: true,
      defenceReadyApprovedBySupervisor1: true,
      defenceReadyApprovedBySupervisor2: true,
      defenceReadyApprovedAt: true,
      defenceReadyNotes: true,
    },
  });
}

/**
 * Revoke defence readiness approval by supervisor
 */
export async function revokeDefenceReadiness(thesisId, supervisorRole, notes = null) {
  const updateData = {
    defenceReadyApprovedAt: null,
    defenceReadyNotes: notes,
  };

  if (isPembimbing1(supervisorRole)) {
    updateData.defenceReadyApprovedBySupervisor1 = false;
  } else if (isPembimbing2(supervisorRole)) {
    updateData.defenceReadyApprovedBySupervisor2 = false;
  }

  return prisma.thesis.update({
    where: { id: thesisId },
    data: updateData,
    select: {
      id: true,
      title: true,
      defenceReadyApprovedBySupervisor1: true,
      defenceReadyApprovedBySupervisor2: true,
      defenceReadyApprovedAt: true,
      defenceReadyNotes: true,
    },
  });
}

/**
 * Update thesis with final document and request defence
 */
export function updateThesisDefenceRequest(thesisId, documentId) {
  return prisma.thesis.update({
    where: { id: thesisId },
    data: {
      finalThesisDocumentId: documentId,
      defenceRequestedAt: new Date(),
    },
    select: {
      id: true,
      title: true,
      finalThesisDocumentId: true,
      defenceRequestedAt: true,
      finalThesisDocument: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
        },
      },
    },
  });
}

/**
 * Get list of students ready for defence (both supervisors approved)
 */
export function findStudentsReadyForDefence() {
  return prisma.thesis.findMany({
    where: {
      defenceReadyApprovedBySupervisor1: true,
      defenceReadyApprovedBySupervisor2: true,
      defenceReadyApprovedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      defenceReadyApprovedAt: true,
      defenceReadyNotes: true,
      finalThesisDocument: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
        },
      },
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
    orderBy: { defenceReadyApprovedAt: "desc" },
  });
}
