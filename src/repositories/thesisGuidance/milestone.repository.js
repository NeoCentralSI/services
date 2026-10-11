import prisma from "../../config/prisma.js";
import { normalize } from "../../constants/roles.js";
import { THESIS_PHASE, TA_PHASE } from "../../constants/thesisStatus.js";

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
// ThesisMilestoneTemplate is shared by both phases (K18). TA template management
// (Kelola > Tugas Akhir > Milestone) only covers thesis-phase templates.
const TA_TEMPLATE_PHASE = THESIS_PHASE.RESEARCH;

export function findAllTemplates(isActive = true, topicId = null) {
  const where = { phase: TA_TEMPLATE_PHASE };
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
    where: {
      topicId,
      phase: TA_TEMPLATE_PHASE,
      ...(isActive === null ? {} : { isActive }),
    },
    orderBy: { orderIndex: "asc" },
    include: { topic: true },
  });
}

/**
 * Get template by ID
 */
export function findTemplateById(id) {
  return prisma.thesisMilestoneTemplate.findFirst({
    where: { id, phase: TA_TEMPLATE_PHASE },
    include: { topic: true },
  });
}

/**
 * Get templates by IDs regardless of phase (callers validate the phase).
 */
export function findTemplatesByIds(ids) {
  return prisma.thesisMilestoneTemplate.findMany({
    where: { id: { in: ids } },
  });
}

/**
 * Create template
 */
export function createTemplate(data) {
  return prisma.thesisMilestoneTemplate.create({
    data: { ...data, phase: TA_TEMPLATE_PHASE },
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
    where: { id: { in: ids }, phase: TA_TEMPLATE_PHASE },
  });
}

/**
 * Get max order index for templates
 */
export async function getMaxTemplateOrderIndex(topicId = null) {
  const where = topicId ? { topicId, phase: TA_TEMPLATE_PHASE } : { phase: TA_TEMPLATE_PHASE };
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
  const where = { thesisId, ...TA_PHASE };
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
export async function create(data) {
  const result = await prisma.thesisMilestone.create({
    data,
  });
  if (result.thesisId) {
    await prisma.thesis.update({
      where: { id: result.thesisId },
      data: { updatedAt: new Date() }
    });
  }
  return result;
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
export async function update(id, data) {
  const result = await prisma.thesisMilestone.update({
    where: { id },
    data,
  });
  if (result.thesisId) {
    await prisma.thesis.update({
      where: { id: result.thesisId },
      data: { updatedAt: new Date() }
    });
  }
  return result;
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
export async function updateStatus(id, status, additionalData = {}) {
  const result = await prisma.thesisMilestone.update({
    where: { id },
    data: {
      status,
      ...additionalData,
    },
  });
  if (result.thesisId) {
    await prisma.thesis.update({
      where: { id: result.thesisId },
      data: { updatedAt: new Date() }
    });
  }
  return result;
}

/**
 * Update progress percentage
 */
export async function updateProgress(id, progressPercentage) {
  const result = await prisma.thesisMilestone.update({
    where: { id },
    data: { progressPercentage },
  });
  if (result.thesisId) {
    await prisma.thesis.update({
      where: { id: result.thesisId },
      data: { updatedAt: new Date() }
    });
  }
  return result;
}

/**
 * Count milestones by status for a thesis
 */
export function countByThesisAndStatus(thesisId) {
  return prisma.thesisMilestone.groupBy({
    by: ["status"],
    where: { thesisId, ...TA_PHASE },
    _count: { id: true },
  });
}

/**
 * Get overall progress for a thesis
 */
export async function getThesisProgress(thesisId) {
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId, ...TA_PHASE },
    select: {
      id: true,
      status: true,
      progressPercentage: true,
    },
  });

  const total = milestones.length;
  // Same shape as the non-empty result, so every summary card shows 0 (Paket C, C3).
  if (total === 0) {
    return { total: 0, completed: 0, inProgress: 0, notStarted: 0, pendingReview: 0, revisionNeeded: 0, averageProgress: 0, percentComplete: 0, isComplete: false };
  }

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
 * Paket C (C9): adds `feedbackByName` to milestone rows (one user lookup for all rows).
 * Accepts a single row or an array; rows without feedback are returned unchanged.
 */
export async function withFeedbackAuthor(input) {
  const rows = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const ids = [...new Set(rows.map((m) => m.feedbackBy).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  const mapped = rows.map((m) => ({ ...m, feedbackByName: m.feedbackBy ? nameOf.get(m.feedbackBy) ?? null : null }));
  return Array.isArray(input) ? mapped : mapped[0] ?? null;
}

/**
 * Get max order index for a thesis
 */
export async function getMaxOrderIndex(thesisId) {
  const result = await prisma.thesisMilestone.aggregate({
    where: { thesisId, ...TA_PHASE },
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
  const result = await prisma.thesisMilestone.update({
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
  if (result.thesisId) {
    await prisma.thesis.update({
      where: { id: result.thesisId },
      data: { updatedAt: new Date() }
    });
  }
  return result;
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
      progressPercentage: {
        decrement: 10,
      },
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
      status: true,
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
          seminarReady: true,
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
 * Updates the seminarReady field on the ThesisSupervisors record
 * @param {string} thesisId
 * @param {string} lecturerId - the lecturer's ID
 */
export async function approveSeminarReadiness(thesisId, lecturerId) {
  // Find the supervisor record for this lecturer on this thesis
  const supervisor = await prisma.thesisSupervisors.findFirst({
    where: { thesisId, lecturerId, status: "active" },
  });

  if (!supervisor) {
    throw new Error("Supervisor record not found");
  }

  // Update seminarReady to true
  await prisma.thesisSupervisors.update({
    where: { id: supervisor.id },
    data: { seminarReady: true },
  });

  // Return the thesis with updated supervisors
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          seminarReady: true,
          role: { select: { name: true } },
          lecturer: {
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Revoke seminar readiness approval by supervisor
 */
export async function revokeSeminarReadiness(thesisId, lecturerId) {
  // Find the supervisor record
  const supervisor = await prisma.thesisSupervisors.findFirst({
    where: { thesisId, lecturerId, status: "active" },
  });

  if (!supervisor) {
    throw new Error("Supervisor record not found");
  }

  // Update seminarReady to false
  await prisma.thesisSupervisors.update({
    where: { id: supervisor.id },
    data: { seminarReady: false },
  });

  // Return the thesis with updated supervisors
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          seminarReady: true,
          role: { select: { name: true } },
          lecturer: {
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Get list of students ready for seminar (all supervisors approved)
 */
export function findStudentsReadyForSeminar() {
  return prisma.thesis.findMany({
    where: {
      thesisSupervisors: {
        every: {
          // Revival adaptation (A1): ignore non-active supervisor rows.
          OR: [{ status: { not: "active" } }, { seminarReady: true }],
        },
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
          seminarReady: true,
          role: { select: { name: true } },
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
      status: true,
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
          defenceReady: true,
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
}

/**
 * Approve defence readiness by supervisor
 * @param {string} thesisId
 * @param {string} supervisorRole - "pembimbing1" or "pembimbing2"
 * @param {string} notes - optional notes
 */
export async function approveDefenceReadiness(thesisId, lecturerId) {
  return prisma.thesisSupervisors.updateMany({
    where: { thesisId, lecturerId, status: "active" },
    data: { defenceReady: true },
  }).then(() =>
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: {
        id: true,
        title: true,
        thesisSupervisors: {
          where: { status: "active" },
          select: {
            lecturerId: true,
            defenceReady: true,
            role: { select: { name: true } },
          },
        },
      },
    })
  );
}

/**
 * Revoke defence readiness approval by supervisor
 */
export async function revokeDefenceReadiness(thesisId, lecturerId) {
  return prisma.thesisSupervisors.updateMany({
    where: { thesisId, lecturerId, status: "active" },
    data: { defenceReady: false },
  }).then(() =>
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: {
        id: true,
        title: true,
        thesisSupervisors: {
          where: { status: "active" },
          select: {
            lecturerId: true,
            defenceReady: true,
            role: { select: { name: true } },
          },
        },
      },
    })
  );
}

/**
 * Latest research-phase guidance attachment of a thesis: what a supervisor reads as the
 * current draft before approving seminar/defence readiness. Null when none was uploaded.
 */
export async function findLatestGuidanceAttachment(thesisId) {
  const guidance = await prisma.thesisGuidance.findFirst({
    where: { thesisId, ...TA_PHASE, filePath: { not: null }, status: { not: "deleted" } },
    orderBy: [{ fileUploadedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, fileName: true, filePath: true, fileUploadedAt: true },
  });
  if (!guidance) return null;
  return {
    guidanceId: guidance.id,
    fileName: guidance.fileName,
    filePath: guidance.filePath,
    uploadedAt: guidance.fileUploadedAt,
  };
}

/**
 * Get list of students ready for defence (every active supervisor approved)
 */
export function findStudentsReadyForDefence() {
  return prisma.thesis.findMany({
    where: {
      thesisSupervisors: {
        some: { status: "active", defenceReady: true },
        every: { OR: [{ status: { not: "active" } }, { defenceReady: true }] },
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
          defenceReady: true,
          role: { select: { name: true } },
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
}

/**
 * Get all pending_review milestones for a given supervisor (by userId).
 * Single query — avoids N+1 problem.
 */
export function findPendingReviewBySupervisor(userId) {
  return prisma.thesisMilestone.findMany({
    where: {
      status: "pending_review",
      ...TA_PHASE,
      thesis: {
        thesisSupervisors: {
          some: {
            status: "active",
            lecturer: {
              id: userId,
            },
          },
        },
      },
    },
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              user: {
                select: {
                  fullName: true,
                  identityNumber: true,
                },
              },
            },
          },
          thesisSupervisors: {
            where: { status: "active" },
            include: {
              role: true,
              lecturer: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
