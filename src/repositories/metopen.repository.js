import prisma from "../config/prisma.js";

// ============================================
// Template Repository
// ============================================

/**
 * Get all metopen templates (phase = 'metopen')
 */
export function findAllTemplates({ isActive = null, topicId = null } = {}) {
  const where = { phase: "metopen" };
  if (isActive !== null) where.isActive = isActive;
  if (topicId) where.topicId = topicId;

  return prisma.thesisMilestoneTemplate.findMany({
    where,
    orderBy: { orderIndex: "asc" },
    include: {
      topic: true,
      attachments: {
        include: { document: { select: { id: true, fileName: true, filePath: true } } },
        orderBy: { createdAt: "asc" },
      },
      templateCriterias: {
        include: {
          assessmentCriteria: {
            include: { assessmentRubrics: true },
          },
        },
      },
    },
  });
}

/**
 * Get template by ID
 */
export function findTemplateById(id) {
  return prisma.thesisMilestoneTemplate.findUnique({
    where: { id },
    include: {
      topic: true,
      attachments: {
        include: { document: { select: { id: true, fileName: true, filePath: true } } },
        orderBy: { createdAt: "asc" },
      },
      templateCriterias: {
        include: {
          assessmentCriteria: {
            include: { assessmentRubrics: true },
          },
        },
      },
    },
  });
}

/**
 * Create template
 */
export function createTemplate(data) {
  return prisma.thesisMilestoneTemplate.create({ data, include: { topic: true } });
}

/**
 * Update template
 */
export function updateTemplate(id, data) {
  return prisma.thesisMilestoneTemplate.update({
    where: { id },
    data,
    include: { topic: true },
  });
}

/**
 * Delete template
 */
export function deleteTemplate(id) {
  return prisma.thesisMilestoneTemplate.delete({ where: { id } });
}

/**
 * Get max orderIndex for metopen templates
 */
export async function getMaxTemplateOrderIndex(topicId = null) {
  const where = { phase: "metopen" };
  if (topicId) where.topicId = topicId;
  const result = await prisma.thesisMilestoneTemplate.aggregate({
    where,
    _max: { orderIndex: true },
  });
  return result._max.orderIndex ?? -1;
}

/**
 * Batch update orderIndex for templates
 */
export async function reorderTemplates(orders) {
  return prisma.$transaction(
    orders.map(({ id, orderIndex }) =>
      prisma.thesisMilestoneTemplate.update({
        where: { id },
        data: { orderIndex },
      })
    )
  );
}

// ============================================
// Template Attachment Repository
// ============================================

export function addTemplateAttachment(templateId, documentId) {
  return prisma.milestoneTemplateAttachment.create({
    data: { templateId, documentId },
    include: { document: { select: { id: true, fileName: true, filePath: true } } },
  });
}

export function removeTemplateAttachment(attachmentId) {
  return prisma.milestoneTemplateAttachment.delete({ where: { id: attachmentId } });
}

export function findTemplateAttachments(templateId) {
  return prisma.milestoneTemplateAttachment.findMany({
    where: { templateId },
    include: { document: { select: { id: true, fileName: true, filePath: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// ============================================
// Student Task Repository
// ============================================

/**
 * Find milestones (metopen tasks) for a thesis
 * Only metopen-phase milestones (linked to template with phase=metopen)
 */
export function findTasksByThesisId(thesisId) {
  return prisma.thesisMilestone.findMany({
    where: {
      thesisId,
      milestoneTemplate: { phase: "metopen" },
    },
    include: {
      milestoneTemplate: {
        include: {
          attachments: {
            include: {
              document: {
                select: { id: true, fileName: true, filePath: true, mimeType: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          templateCriterias: {
            include: {
              assessmentCriteria: {
                include: { assessmentRubrics: true },
              },
            },
          },
        },
      },
      milestoneDocuments: true,
      assessmentDetails: {
        include: {
          rubric: true,
          lecturer: {
            include: { user: { select: { fullName: true } } },
          },
        },
      },
      thesis: {
        select: {
          id: true,
          student: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * Find student's thesis with metopen-phase milestones
 */
export async function findStudentThesis(userId) {
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!student) return null;

  return prisma.thesis.findFirst({
    where: { studentId: student.id },
    select: {
      id: true,
      studentId: true,
      title: true,
      thesisStatusId: true,
      proposalStatus: true,
      thesisStatus: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Find a single milestone by ID
 */
export function findTaskById(milestoneId) {
  return prisma.thesisMilestone.findUnique({
    where: { id: milestoneId },
    include: {
      milestoneTemplate: {
        include: {
          templateCriterias: {
            include: {
              assessmentCriteria: {
                include: { assessmentRubrics: true },
              },
            },
          },
        },
      },
      milestoneDocuments: true,
      assessmentDetails: {
        include: {
          rubric: true,
          lecturer: {
            include: { user: { select: { fullName: true } } },
          },
        },
      },
      thesis: {
        select: {
          id: true,
          studentId: true,
          student: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Update a milestone (for submit, grade, etc.)
 */
export function updateTask(id, data) {
  return prisma.thesisMilestone.update({ where: { id }, data });
}

/**
 * Find a milestone document by ID with milestone and thesis for access check
 */
export function findMilestoneDocumentById(documentId) {
  return prisma.thesisMilestoneDocument.findUnique({
    where: { id: documentId },
    include: {
      milestone: {
        include: {
          thesis: {
            select: {
              id: true,
              student: {
                select: { id: true, user: { select: { id: true } } },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Bulk create milestones from templates for a thesis
 */
export function createManyTasks(dataArray) {
  return prisma.thesisMilestone.createMany({
    data: dataArray,
    skipDuplicates: true,
  });
}

/**
 * Get all theses that have metopen milestones (for monitoring)
 */
export function findAllMetopenTheses(academicYearId = null) {
  const where = {
    thesisMilestones: {
      some: { milestoneTemplate: { phase: "metopen" } },
    },
  };
  if (academicYearId) where.academicYearId = academicYearId;

  return prisma.thesis.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      student: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
      thesisMilestones: {
        where: { milestoneTemplate: { phase: "metopen" } },
        include: {
          milestoneTemplate: true,
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
}

/**
 * Get pending review milestones for grading queue
 * (milestones with phase=metopen and status=pending_review)
 */
export function findGradingQueue(status = null) {
  const where = {
    milestoneTemplate: { phase: "metopen" },
  };
  if (status) {
    where.status = status;
  } else {
    where.status = "pending_review";
  }

  return prisma.thesisMilestone.findMany({
    where,
    include: {
      milestoneTemplate: true,
      milestoneDocuments: true,
      thesis: {
        select: {
          id: true,
          academicYear: {
            select: { id: true, year: true, semester: true },
          },
          student: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
        },
      },
      assessmentDetails: {
        include: {
          rubric: true,
          lecturer: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ milestoneTemplateId: "asc" }, { submittedAt: "asc" }],
  });
}


/**
 * Count milestones by thesis for progress
 */
export async function getThesisMetopenProgress(thesisId) {
  const [total, completed] = await Promise.all([
    prisma.thesisMilestone.count({
      where: { thesisId, milestoneTemplate: { phase: "metopen" } },
    }),
    prisma.thesisMilestone.count({
      where: { thesisId, milestoneTemplate: { phase: "metopen" }, status: "completed" },
    }),
  ]);
  return { total, completed };
}

/**
 * Find active proposal theses with students for publishing deliverables.
 */
export function findEligibleThesesForPublish(studentIds = null, academicYearId = null) {
  const where = {
    OR: [{ proposalStatus: null }, { proposalStatus: { not: "accepted" } }],
  };

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
    where.studentId = { in: studentIds };
  }

  return prisma.thesis.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      thesisTopicId: true,
      academicYear: {
        select: { id: true, year: true, semester: true },
      },
      student: {
        select: {
          user: {
            select: {
              fullName: true,
              identityNumber: true
            }
          }
        }
      },
      thesisMilestones: {
        where: { milestoneTemplate: { phase: "metopen" } },
        select: { milestoneTemplateId: true, status: true }
      }
    },
  });
}

/**
 * Find lecturer by userId
 */
export function findLecturerByUserId(userId) {
  return prisma.lecturer.findUnique({
    where: { id: userId },
    select: { id: true },
  });
}

/**
 * Create assessment detail for a milestone
 */
export function createAssessmentDetail(data) {
  return prisma.thesisMilestoneAssessmentDetail.create({ data });
}

// ============================================
// Extracted from metopen.service.js (layer fix)
// ============================================

export function countActiveMilestones(milestoneTemplateId) {
  return prisma.thesisMilestone.count({
    where: { milestoneTemplateId, status: { not: "deleted" } },
  });
}

export function createDocument(data) {
  return prisma.document.create({ data });
}

export function countSupervisorsForThesis(thesisId, roleNames) {
  return prisma.thesisParticipant.count({
    where: {
      thesisId,
      role: { is: { name: { in: roleNames } } },
    },
  });
}

export function markPreviousDocumentsNotLatest(milestoneId) {
  return prisma.thesisMilestoneDocument.updateMany({
    where: { milestoneId },
    data: { isLatest: false },
  });
}

export function findLatestDocumentsByMilestoneId(milestoneId) {
  return prisma.thesisMilestoneDocument.findMany({
    where: { milestoneId, isLatest: true },
    orderBy: [{ version: "asc" }, { createdAt: "asc" }],
  });
}

export function findMilestoneDocumentsByIds(ids) {
  return prisma.thesisMilestoneDocument.findMany({
    where: { id: { in: ids } },
  });
}

export function updateMilestoneDocument(id, data) {
  return prisma.thesisMilestoneDocument.update({
    where: { id },
    data,
  });
}

export function countMilestoneDocuments(milestoneId) {
  return prisma.thesisMilestoneDocument.count({ where: { milestoneId } });
}

export function createMilestoneDocument(data) {
  return prisma.thesisMilestoneDocument.create({ data });
}

export function findCompletedGuidances(thesisId, guidanceIds) {
  return prisma.thesisGuidance.findMany({
    where: {
      id: { in: guidanceIds },
      thesisId,
      status: "completed",
    },
    select: { id: true },
  });
}

export function deleteGuidanceMilestoneLinks(milestoneId) {
  return prisma.thesisGuidanceMilestone.deleteMany({ where: { milestoneId } });
}

export function createGuidanceMilestoneLinks(data) {
  return prisma.thesisGuidanceMilestone.createMany({ data });
}

export function findCompletedGuidancesForThesis(thesisId) {
  return prisma.thesisGuidance.findMany({
    where: { thesisId, status: "completed" },
    select: {
      id: true,
      requestedDate: true,
      approvedDate: true,
      completedAt: true,
      sessionSummary: true,
      supervisorFeedback: true,
      supervisor: {
        select: { user: { select: { id: true, fullName: true } } },
      },
      milestones: { select: { milestoneId: true } },
    },
    orderBy: { completedAt: "desc" },
  });
}

export function findLinkedGuidances(milestoneId) {
  return prisma.thesisGuidanceMilestone.findMany({
    where: { milestoneId },
    include: {
      guidance: {
        select: {
          id: true,
          requestedDate: true,
          completedAt: true,
          sessionSummary: true,
          supervisorFeedback: true,
          status: true,
          supervisor: {
            select: { user: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
  });
}

export function findSupervisedThesesByLecturer(lecturerId) {
  return prisma.thesisParticipant.findMany({
    where: { lecturerId },
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            include: { user: { select: { fullName: true, identityNumber: true } } },
          },
          thesisMilestones: {
            where: { milestoneTemplate: { phase: "metopen" } },
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              totalScore: true,
              feedback: true,
              submittedAt: true,
              completedAt: true,
              milestoneTemplate: { select: { name: true, weightPercentage: true } },
            },
          },
        },
      },
      role: { select: { name: true } },
    },
  });
}

export function findLatestCompletedMilestoneDoc(thesisId) {
  return prisma.thesisMilestoneDocument.findFirst({
    where: {
      milestone: { thesisId, status: "completed" },
      isLatest: true,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, filePath: true, fileName: true, fileSize: true, mimeType: true },
  });
}

export function updateThesis(thesisId, data) {
  return prisma.thesis.update({ where: { id: thesisId }, data });
}

export function updateManyMilestones(where, data) {
  return prisma.thesisMilestone.updateMany({ where, data });
}

export function countMilestones(where) {
  return prisma.thesisMilestone.count({ where });
}

export function findMilestones(where, options = {}) {
  return prisma.thesisMilestone.findMany({
    where,
    ...options,
  });
}

export function deleteManyGuidanceMilestoneLinks(milestoneIds) {
  return prisma.thesisGuidanceMilestone.deleteMany({
    where: { milestoneId: { in: milestoneIds } },
  });
}

export function deleteManyAssessmentDetails(milestoneIds) {
  return prisma.thesisMilestoneAssessmentDetail.deleteMany({
    where: { milestoneId: { in: milestoneIds } },
  });
}

export function deleteManyMilestoneDocuments(milestoneIds) {
  return prisma.thesisMilestoneDocument.deleteMany({
    where: { milestoneId: { in: milestoneIds } },
  });
}

export function deleteManyMilestones(milestoneIds) {
  return prisma.thesisMilestone.deleteMany({
    where: { id: { in: milestoneIds } },
  });
}

export function findResearchMethodScore(thesisId) {
  return prisma.researchMethodScore.findFirst({
    where: { thesisId },
    orderBy: { createdAt: "desc" },
  });
}

export function findThesisById(thesisId) {
  return prisma.thesis.findUnique({ where: { id: thesisId } });
}

export function findThesisByIdWithDetails(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        include: { user: { select: { fullName: true, identityNumber: true } } },
      },
      thesisTopic: { select: { name: true } },
      thesisSupervisors: {
        include: {
          lecturer: { include: { user: { select: { fullName: true, identityNumber: true } } } },
          role: { select: { name: true } },
        },
      },
    },
  });
}

/**
 * Get all metopen milestones with student + class info for publish stats.
 * Returns milestones grouped by templateId with student details.
 */
/**
 * Find all proposal document versions across milestones for a thesis.
 * Returns all ThesisMilestoneDocument records sorted by version descending —
 * this provides the complete audit trail / version history of the proposal.
 */
export function findProposalVersionsByThesisId(thesisId) {
  return prisma.thesisMilestoneDocument.findMany({
    where: {
      milestone: {
        thesisId,
        milestoneTemplate: { phase: "metopen" },
      },
    },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      fileSize: true,
      mimeType: true,
      version: true,
      isLatest: true,
      description: true,
      createdAt: true,
      milestone: {
        select: {
          id: true,
          title: true,
          status: true,
          milestoneTemplate: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export function findPublishStats() {
  return prisma.thesisMilestone.findMany({
    where: {
      milestoneTemplate: { phase: "metopen" },
    },
    select: {
      id: true,
      milestoneTemplateId: true,
      status: true,
      targetDate: true,
      submittedAt: true,
      thesis: {
        select: {
          id: true,
          studentId: true,
          academicYear: {
            select: { id: true, year: true, semester: true },
          },
          student: {
            select: {
              id: true,
              user: {
                select: { fullName: true, identityNumber: true },
              },
            },
          },
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}
