import prisma from "../../config/prisma.js";
import { SUMMARY_SUBMITTABLE_STATUSES, byScheduledAt } from "../../constants/guidanceStatus.js";
import {
  CURRENT_THESIS_STATUSES,
  OPEN_THESIS_STATUSES,
  POST_PROPOSAL_THESIS_STATUSES,
  TA_PHASE,
} from "../../constants/thesisStatus.js";

export function getStudentByUserId(userId) {
  // Schema baru: Student.id adalah foreign key ke User.id
  return prisma.student.findUnique({ where: { id: userId } });
}

/**
 * TA mahasiswa yang belum berakhir (proposal, research, on_leave), terbaru lebih dulu.
 * Dipakai bimbingan/milestone (aksi tulis wajib cek status === research) dan
 * fase proposal (K27) untuk TA berstatus proposal.
 */
export async function getActiveThesisForStudent(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId, status: { in: OPEN_THESIS_STATUSES } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/**
 * Paket E7 (K28): the student's current thesis, the latest that has not failed, a Selesai one
 * included. For reads that stay available after the defence (riwayat and log bimbingan).
 */
export async function getCurrentThesisForStudent(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId, status: { in: CURRENT_THESIS_STATUSES } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function getThesisHistory(studentId) {
  const theses = await prisma.thesis.findMany({
    where: { studentId, status: { in: POST_PROPOSAL_THESIS_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: {
      thesisTopic: { select: { id: true, name: true } },
      academicYear: { select: { id: true, year: true, semester: true } },
      thesisSupervisors: {
        include: {
          role: { select: { id: true, name: true } },
          lecturer: { include: { user: { select: { id: true, fullName: true, email: true, identityNumber: true } } } },
        }
      },
      _count: {
        select: {
          thesisGuidances: { where: { status: "completed", ...TA_PHASE } },
        }
      },
      thesisMilestones: {
        select: { status: true },
        where: { status: { not: "deleted" }, ...TA_PHASE }
      }
    },
  });
  return theses;
}

export async function getSupervisorsForThesis(thesisId) {
  // Revival adaptation (A1): only active supervisor rows grant guidance access.
  const supervisors = await prisma.thesisSupervisors.findMany({
    where: { thesisId, status: "active" },
    include: {
      role: { select: { id: true, name: true } },
      lecturer: { include: { user: { select: { id: true, fullName: true, email: true, identityNumber: true } } } },
    },
  });
  return supervisors;
}

export function listGuidancesForThesis(thesisId, status) {
  // K27: the list shows both phases; each row carries its phase (Jenis).
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
    include: {
      supervisor: { include: { user: true } },
    },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function getGuidanceByIdForStudent(guidanceId, studentId) {
  return prisma.thesisGuidance.findFirst({
    // K27: a session of either phase belongs to the student's guidance log.
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

export async function listGuidanceHistoryByStudent(studentId) {
  const rows = await prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      status: { not: "deleted" }
    },
    include: {
      supervisor: { include: { user: true } },
    },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
  // C6: newest first by the effective schedule (approvedDate ?? requestedDate)
  return rows.sort(byScheduledAt("desc"));
}

export function listMilestones(thesisId) {
  return prisma.thesisMilestone.findMany({
    where: {
      thesisId,
      ...TA_PHASE,
      status: { not: "deleted" }
    },
    orderBy: { orderIndex: "asc" },
  });
}

export function listMilestoneTemplates(topicId) {
  // Template table is shared by both phases (K18); TA guidance uses thesis-phase templates.
  const where = { isActive: true, ...TA_PHASE };
  if (topicId) {
    where.topicId = topicId;
  }
  return prisma.thesisMilestoneTemplate.findMany({
    where,
    orderBy: { orderIndex: "asc" },
  });
}

export async function createMilestonesDirectly(thesisId, milestonesData, phase) {
  return prisma.thesisMilestone.createMany({
    data: milestonesData.map((m) => ({
      thesisId,
      milestoneTemplateId: m.id ?? null,
      title: m.name,
      description: m.description,
      orderIndex: m.orderIndex,
      status: "not_started",
      phase,
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
      // K19: scheduled sessions (legacy "rescheduled" included) and summaries sent back
      // for revision need a summary from the student.
      status: { in: SUMMARY_SUBMITTABLE_STATUSES },
      approvedDate: { lte: new Date() }, // Jadwal sudah lewat
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: { include: { milestone: { select: { id: true, title: true } } } },
    },
    orderBy: [{ approvedDate: "desc" }],
  });
}


