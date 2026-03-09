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
      metopenClass: {
        select: { id: true, name: true },
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
      assessmentDetails: {
        include: {
          rubric: true,
          lecturer: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ metopenClassId: "asc" }, { milestoneTemplateId: "asc" }, { submittedAt: "asc" }],
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
 * Find active theses with students for publishing tasks.
 * Cohort-based: filters by thesisStatus = "Metopel" + active academic year.
 */
export function findEligibleThesesForPublish(studentIds = null, academicYearId = null) {
  const where = {
    thesisStatus: { name: "Metopel" },
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

/**
 * Get all metopen milestones with student + class info for publish stats.
 * Returns milestones grouped by templateId with student details.
 */
export function findPublishStats() {
  return prisma.thesisMilestone.findMany({
    where: {
      milestoneTemplate: { phase: "metopen" },
    },
    select: {
      id: true,
      milestoneTemplateId: true,
      metopenClassId: true,
      status: true,
      targetDate: true,
      submittedAt: true,
      metopenClass: {
        select: { id: true, name: true },
      },
      thesis: {
        select: {
          id: true,
          studentId: true,
          student: {
            select: {
              id: true,
              user: {
                select: { fullName: true, identityNumber: true },
              },
              metopenClassEnrollments: {
                select: {
                  metopenClass: {
                    select: { id: true, name: true },
                  },
                },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { orderIndex: "asc" },
  });
}
