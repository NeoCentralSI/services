import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

export function getStudentByUserId(userId) {
  // Schema baru: Student.id adalah foreign key ke User.id
  return prisma.student.findUnique({ where: { id: userId } });
}

export async function getActiveThesisForStudent(studentId) {
  // Pick the most recent by startDate desc (fallback by id desc)
  const thesis = await prisma.thesis.findFirst({
    where: { studentId },
    orderBy: [
      { startDate: "desc" },
      { id: "desc" },
    ],
    include: {
      document: { select: { id: true, filePath: true, fileName: true } },
    },
  });
  return thesis;
}

export async function getSupervisorsForThesis(thesisId) {
  const parts = await prisma.thesisParticipant.findMany({
    where: { thesisId, role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
    include: {
      lecturer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      role: { select: { id: true, name: true } },
    },
  });
  return parts;
}

export function listGuidancesForThesis(thesisId, status) {
  const where = { thesisId };
  if (status) where.status = status;
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
    include: { supervisor: { include: { user: true } } },
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

export function listActivityLogsByStudent(studentId) {
  return prisma.thesisActivityLog.findMany({ where: { thesis: { studentId } }, orderBy: { createdAt: "desc" } });
}

export function listGuidanceHistoryByStudent(studentId) {
  return prisma.thesisGuidance.findMany({
    where: { thesis: { studentId } },
    include: { supervisor: { include: { user: true } } },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function listMilestones(thesisId) {
  return prisma.thesisMilestone.findMany({
    where: { thesisId },
    orderBy: { orderIndex: "asc" },
  });
}

export function listMilestoneTemplates() {
  return prisma.thesisMilestoneTemplate.findMany({
    where: { isActive: true },
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
export function submitSessionSummary(guidanceId, { sessionSummary, actionItems }) {
  return prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: {
      sessionSummary,
      actionItems,
      summarySubmittedAt: new Date(),
      status: "summary_pending",
    },
    include: {
      supervisor: { include: { user: true } },
      milestone: { select: { id: true, title: true, status: true } },
    },
  });
}

/**
 * Get completed guidance history for student (for download/documentation)
 */
export function getCompletedGuidanceHistory(studentId) {
  return prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      status: "completed",
    },
    include: {
      supervisor: { include: { user: true } },
      milestone: { select: { id: true, title: true } },
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
      milestone: { select: { id: true, title: true } },
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
      milestone: { select: { id: true, title: true } },
    },
    orderBy: [{ approvedDate: "desc" }],
  });
}

