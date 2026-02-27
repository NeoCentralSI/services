import prisma from "../../config/prisma.js";

export function getStudentByUserId(userId) {
  // Schema baru: Student.id adalah foreign key ke User.id
  return prisma.student.findUnique({ where: { id: userId } });
}

export async function getActiveThesisForStudent(studentId) {
  // Pick the most recent ACTIVE thesis (exclude cancelled/failed/completed)
  const thesis = await prisma.thesis.findFirst({
    where: {
      studentId,
      thesisStatus: {
        name: { notIn: ['Dibatalkan', 'Gagal', 'Selesai', 'Lulus', 'Drop Out'] },
      },
    },
    orderBy: [
      { startDate: "desc" },
      { id: "desc" },
    ],
    include: {
      document: { select: { id: true, filePath: true, fileName: true } },
      thesisStatus: { select: { id: true, name: true } },
    },
  });
  return thesis;
}

export async function getThesisHistory(studentId) {
  const theses = await prisma.thesis.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: {
      thesisStatus: { select: { id: true, name: true } },
      thesisTopic: { select: { id: true, name: true } },
      academicYear: { select: { id: true, year: true, semester: true } },
      document: { select: { id: true, filePath: true, fileName: true } },
      thesisSupervisors: {
        include: {
          role: { select: { id: true, name: true } },
          lecturer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        }
      },
      _count: {
        select: {
          thesisGuidances: { where: { status: "completed" } },
          thesisMilestones: { where: { status: { not: "deleted" } } }
        }
      }
    },
  });
  return theses;
}

export async function getSupervisorsForThesis(thesisId) {
  const supervisors = await prisma.ThesisSupervisors.findMany({
    where: { thesisId },
    include: {
      role: { select: { id: true, name: true } },
      lecturer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
    },
  });
  return supervisors;
}

export function listGuidancesForThesis(thesisId, status) {
  const where = { thesisId };
  if (status) {
    where.status = status;
  } else {
    // Default: exclude deleted
    where.status = { not: "deleted" };
  }
  // Schema baru: tidak ada schedule relation, gunakan requestedDate/approvedDate langsung
  return prisma.thesisGuidance.findMany({
    where,
    include: { supervisor: { include: { user: true } } },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function getGuidanceByIdForStudent(guidanceId, studentId) {
  return prisma.thesisGuidance.findFirst({
    where: { id: guidanceId, thesis: { studentId } },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true } } } },
    },
  });
}

// Schema baru: tidak ada ThesisGuidanceSchedule, requestedDate langsung di ThesisGuidance
export function createGuidance(data) {
  return prisma.thesisGuidance.create({
    data,
    include: { supervisor: { include: { user: true } } }
  });
}

// Schema baru: update requestedDate langsung di ThesisGuidance
export function updateGuidanceRequestedDate(guidanceId, requestedDate) {
  return prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: { requestedDate }
  });
}

export function updateGuidanceById(id, data) {
  return prisma.thesisGuidance.update({
    where: { id },
    data,
    include: { supervisor: { include: { user: true } } }
  });
}

export function listGuidanceHistoryByStudent(studentId) {
  return prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      status: { not: "deleted" }
    },
    include: { supervisor: { include: { user: true } } },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function listMilestones(thesisId) {
  return prisma.thesisMilestone.findMany({
    where: {
      thesisId,
      status: { not: "deleted" }
    },
    orderBy: { orderIndex: "asc" },
  });
}

export function listMilestoneTemplates(topicId) {
  const where = { isActive: true };
  if (topicId) {
    where.topicId = topicId;
  }
  return prisma.thesisMilestoneTemplate.findMany({
    where,
    orderBy: { orderIndex: "asc" },
  });
}

export async function createMilestonesDirectly(thesisId, milestonesData) {
  return prisma.thesisMilestone.createMany({
    data: milestonesData.map((m) => ({
      thesisId,
      title: m.name,
      description: m.description,
      orderIndex: m.orderIndex,
      status: "not_started",
    })),
  });
}

// Deprecated functions kept for reference but should not be used with new schema
export function listProgressComponents() {
  return [];
}

export function getCompletionsForThesis(thesisId) {
  return [];
}

export async function upsertStudentCompletions(thesisId, componentIds = [], completedAt = undefined) {
  // Implementation needs to be updated for ThesisMilestone if still needed
  return { updated: 0, created: 0 };
}

// ==================== SESSION SUMMARY ====================

/**
 * Submit session summary by student
 * Changes status from 'accepted' to 'summary_pending'
 */
export async function submitSessionSummary(guidanceId, { sessionSummary, actionItems }) {
  const updated = await prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: {
      sessionSummary,
      actionItems,
      summarySubmittedAt: new Date(),
      status: "summary_pending",
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
    },
  });

  if (updated.thesisId) {
    await prisma.thesis.update({
      where: { id: updated.thesisId },
      data: { updatedAt: new Date() }
    });
  }

  return updated;
}

/**
 * Get completed guidance history for student
 */
export function getCompletedGuidanceHistory(studentId) {
  return prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      status: "completed",
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true } } } },
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Get single guidance detail for export/download
 */
export function getGuidanceForExport(guidanceId, studentId) {
  return prisma.thesisGuidance.findFirst({
    where: {
      id: guidanceId,
      thesis: { studentId },
      status: "completed",
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true } } } },
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Get guidances that need summary submission (accepted + jadwal sudah lewat)
 */
export function getGuidancesNeedingSummary(studentId) {
  return prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      status: "accepted",
      approvedDate: { lte: new Date() }, // Jadwal sudah lewat
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true } } } },
    },
    orderBy: [{ approvedDate: "desc" }],
  });
}


