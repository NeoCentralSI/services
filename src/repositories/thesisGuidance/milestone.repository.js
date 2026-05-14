import prisma from "../../config/prisma.js";
import { withSupervisorRoleAliases } from "../../utils/supervisorIntegrity.js";

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
        include: {
          guidance: {
            select: {
              id: true,
              status: true,
              requestedDate: true,
              completedAt: true,
            },
          },
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
          guidance: {
            include: {
              supervisor: {
                include: {
                  user: { select: { id: true, fullName: true, email: true } },
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
export async function getThesisSeminarReadiness(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
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
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          role: { select: { name: true } },
          seminarReady: true,
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

  if (!thesis) return null;
  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis.thesisSupervisors ?? []),
  };
}

/**
 * Approve seminar readiness by supervisor
 * Updates the seminarReady field on the ThesisSupervisors record
 * @param {string} thesisId
 * @param {string} lecturerId - the lecturer's ID
 */
export async function approveSeminarReadiness(thesisId, lecturerId) {
  // Find the supervisor record for this lecturer on this thesis
  const supervisor = await prisma.thesisParticipant.findFirst({
    where: { thesisId, lecturerId, status: "active" },
  });

  if (!supervisor) {
    throw new Error("Supervisor record not found");
  }

  // Update seminarReady to true
  await prisma.thesisParticipant.update({
    where: { id: supervisor.id },
    data: { seminarReady: true },
  });

  // Return the thesis with updated supervisors
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          role: { select: { name: true } },
          seminarReady: true,
          lecturer: {
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis?.thesisSupervisors ?? []),
  };
}

/**
 * Revoke seminar readiness approval by supervisor
 */
export async function revokeSeminarReadiness(thesisId, lecturerId) {
  // Find the supervisor record
  const supervisor = await prisma.thesisParticipant.findFirst({
    where: { thesisId, lecturerId, status: "active" },
  });

  if (!supervisor) {
    throw new Error("Supervisor record not found");
  }

  // Update seminarReady to false
  await prisma.thesisParticipant.update({
    where: { id: supervisor.id },
    data: { seminarReady: false },
  });

  // Return the thesis with updated supervisors
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          role: { select: { name: true } },
          seminarReady: true,
          lecturer: {
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis?.thesisSupervisors ?? []),
  };
}

/**
 * Get list of students ready for seminar (all supervisors approved)
 */
export async function findStudentsReadyForSeminar() {
  const theses = await prisma.thesis.findMany({
    where: {
      thesisSupervisors: {
        some: { status: "active" },
        none: { status: "active", seminarReady: false },
      },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
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
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          role: { select: { name: true } },
          seminarReady: true,
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return theses.map((thesis) => ({
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis.thesisSupervisors ?? []),
  }));
}

// ============================================
// Defence Readiness Repository
// ============================================

/**
 * Get thesis defence readiness status
 */
export async function getThesisDefenceReadiness(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
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
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          role: { select: { name: true } },
          defenceReady: true,
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
      thesisSeminars: {
        select: {
          id: true,
          status: true,
          revisionFinalizedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!thesis) return null;
  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis.thesisSupervisors ?? []),
  };
}

/**
 * Approve defence readiness by supervisor
 * @param {string} thesisId
 * @param {string} supervisorRole - "pembimbing1" or "pembimbing2"
 * @param {string} notes - optional notes
 */
export async function approveDefenceReadiness(thesisId, lecturerId) {
  await prisma.thesisParticipant.updateMany({
    where: { thesisId, lecturerId, status: "active" },
    data: { defenceReady: true },
  });

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          lecturerId: true,
          role: { select: { name: true } },
          defenceReady: true,
        },
      },
    },
  });

  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis?.thesisSupervisors ?? []),
  };
}

/**
 * Revoke defence readiness approval by supervisor
 */
export async function revokeDefenceReadiness(thesisId, lecturerId) {
  await prisma.thesisParticipant.updateMany({
    where: { thesisId, lecturerId, status: "active" },
    data: { defenceReady: false },
  });

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          lecturerId: true,
          role: { select: { name: true } },
          defenceReady: true,
        },
      },
    },
  });

  return {
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis?.thesisSupervisors ?? []),
  };
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
export async function findStudentsReadyForDefence() {
  const theses = await prisma.thesis.findMany({
    where: {
      defenceRequestedAt: { not: null },
      thesisSupervisors: {
        some: { status: "active" },
        none: { status: "active", defenceReady: false },
      },
    },
    select: {
      id: true,
      title: true,
      defenceRequestedAt: true,
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
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          role: { select: { name: true } },
          defenceReady: true,
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: { defenceRequestedAt: "desc" },
  });

  return theses.map((thesis) => ({
    ...thesis,
    thesisSupervisors: withSupervisorRoleAliases(thesis.thesisSupervisors ?? []),
  }));
}
