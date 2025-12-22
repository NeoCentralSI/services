import * as milestoneRepo from "../repositories/milestone.repository.js";
import prisma from "../config/prisma.js";
import { ROLES, isSupervisorRole } from "../constants/roles.js";

// ============================================
// Error Helpers
// ============================================

function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function notFound(message = "Resource not found") {
  return createError(message, 404);
}

function forbidden(message = "Forbidden") {
  return createError(message, 403);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get thesis by ID and validate access
 */
async function getThesisWithAccess(thesisId, userId, requireOwner = false) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        select: { id: true, user: { select: { id: true, fullName: true } } },
      },
      thesisParticipants: {
        include: {
          lecturer: { select: { id: true, user: { select: { id: true, fullName: true } } } },
          role: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  const isOwner = thesis.student?.user?.id === userId || thesis.studentId === userId;
  const isSupervisor = thesis.thesisParticipants.some(
    (p) => p.lecturer?.user?.id === userId && isSupervisorRole(p.role?.name)
  );

  if (requireOwner && !isOwner) {
    throw forbidden("Hanya mahasiswa pemilik thesis yang dapat melakukan aksi ini");
  }

  if (!isOwner && !isSupervisor) {
    throw forbidden("Anda tidak memiliki akses ke thesis ini");
  }

  return { thesis, isOwner, isSupervisor };
}

/**
 * Get milestone with thesis access validation
 */
async function getMilestoneWithAccess(milestoneId, userId) {
  const milestone = await milestoneRepo.findById(milestoneId);
  if (!milestone) {
    throw notFound("Milestone tidak ditemukan");
  }

  const { thesis, isOwner, isSupervisor } = await getThesisWithAccess(
    milestone.thesis.id,
    userId
  );

  return { milestone, thesis, isOwner, isSupervisor };
}

// ============================================
// Template Services
// ============================================

/**
 * Get all milestone templates
 */
export async function getTemplates(category = null) {
  if (category) {
    return milestoneRepo.findTemplatesByCategory(category, true);
  }
  return milestoneRepo.findAllTemplates(true);
}

/**
 * Get template categories
 */
export async function getTemplateCategories() {
  const templates = await milestoneRepo.findAllTemplates(true);
  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))];
  return categories.map((cat) => ({
    name: cat,
    count: templates.filter((t) => t.category === cat).length,
  }));
}

// ============================================
// Milestone CRUD Services
// ============================================

/**
 * Get all milestones for a thesis
 */
export async function getMilestones(thesisId, userId, status = null) {
  await getThesisWithAccess(thesisId, userId);

  const milestones = await milestoneRepo.findByThesisId(thesisId, status);
  const progress = await milestoneRepo.getThesisProgress(thesisId);

  return {
    milestones,
    progress,
  };
}

/**
 * Get milestone detail
 */
export async function getMilestoneDetail(milestoneId, userId) {
  const { milestone } = await getMilestoneWithAccess(milestoneId, userId);
  return milestone;
}

/**
 * Create new milestone (student only)
 */
export async function createMilestone(thesisId, userId, data) {
  const { thesis } = await getThesisWithAccess(thesisId, userId, true);

  // Get next order index
  const maxOrder = await milestoneRepo.getMaxOrderIndex(thesisId);

  const milestoneData = {
    thesisId,
    title: data.title,
    description: data.description || null,
    orderIndex: data.orderIndex ?? maxOrder + 1,
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
    status: "not_started",
    progressPercentage: 0,
    studentNotes: data.studentNotes || null,
  };

  const milestone = await milestoneRepo.createWithLog(milestoneData, userId);

  return milestone;
}

/**
 * Create milestones from templates (bulk create)
 */
export async function createMilestonesFromTemplates(thesisId, userId, templateIds, startDate = null) {
  const { thesis } = await getThesisWithAccess(thesisId, userId, true);

  // Check if thesis already has milestones
  const existing = await milestoneRepo.findByThesisId(thesisId);
  if (existing.length > 0) {
    throw createError("Thesis sudah memiliki milestones. Hapus yang ada terlebih dahulu atau tambahkan secara manual.");
  }

  // Get templates
  const templates = await Promise.all(
    templateIds.map((id) => milestoneRepo.findTemplateById(id))
  );

  const validTemplates = templates.filter(Boolean);
  if (validTemplates.length === 0) {
    throw createError("Tidak ada template valid yang ditemukan");
  }

  // Sort by orderIndex
  validTemplates.sort((a, b) => a.orderIndex - b.orderIndex);

  // Calculate target dates if startDate provided (default: 2 weeks interval)
  const baseDate = startDate ? new Date(startDate) : new Date();
  const intervalDays = 14; // 2 weeks per milestone

  const milestonesData = validTemplates.map((template, index) => ({
    thesisId,
    title: template.name,
    description: template.description,
    orderIndex: index,
    targetDate: new Date(baseDate.getTime() + index * intervalDays * 24 * 60 * 60 * 1000),
    status: "not_started",
    progressPercentage: 0,
  }));

  // Bulk create
  await milestoneRepo.createMany(milestonesData);

  // Create logs for each
  const createdMilestones = await milestoneRepo.findByThesisId(thesisId);
  for (const milestone of createdMilestones) {
    await milestoneRepo.createLog({
      milestoneId: milestone.id,
      action: "created",
      newStatus: milestone.status,
      newProgress: milestone.progressPercentage,
      performedBy: userId,
      notes: `Milestone "${milestone.title}" dibuat dari template`,
    });
  }

  return {
    count: createdMilestones.length,
    milestones: createdMilestones,
  };
}

/**
 * Update milestone (student only)
 */
export async function updateMilestone(milestoneId, userId, data) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah milestone");
  }

  // Prevent updating completed/validated milestones
  if (milestone.validatedBy && data.status !== "in_progress") {
    throw createError("Milestone yang sudah divalidasi tidak dapat diubah");
  }

  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.targetDate !== undefined) updateData.targetDate = data.targetDate ? new Date(data.targetDate) : null;
  if (data.studentNotes !== undefined) updateData.studentNotes = data.studentNotes;
  if (data.evidenceUrl !== undefined) updateData.evidenceUrl = data.evidenceUrl;
  if (data.evidenceDescription !== undefined) updateData.evidenceDescription = data.evidenceDescription;
  if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;

  const updated = await milestoneRepo.update(milestoneId, updateData);

  // Create log
  await milestoneRepo.createLog({
    milestoneId,
    action: "updated",
    performedBy: userId,
    notes: `Milestone "${updated.title}" diperbarui`,
  });

  return updated;
}

/**
 * Delete milestone (student only, if not validated)
 */
export async function deleteMilestone(milestoneId, userId) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat menghapus milestone");
  }

  if (milestone.validatedBy) {
    throw createError("Milestone yang sudah divalidasi tidak dapat dihapus");
  }

  await milestoneRepo.remove(milestoneId);

  return { success: true, message: "Milestone berhasil dihapus" };
}

// ============================================
// Status Management Services
// ============================================

/**
 * Update milestone status (student)
 */
export async function updateMilestoneStatus(milestoneId, userId, newStatus, notes = null) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah status milestone");
  }

  // Validate status transition
  const currentStatus = milestone.status;
  const validTransitions = {
    not_started: ["in_progress"],
    in_progress: ["pending_review", "not_started"],
    pending_review: ["in_progress"], // student can withdraw from review
    revision_needed: ["in_progress", "pending_review"],
    completed: [], // Cannot change from completed (only supervisor can set this)
  };

  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw createError(
      `Tidak dapat mengubah status dari ${currentStatus} ke ${newStatus}`
    );
  }

  const additionalData = {};
  if (newStatus === "in_progress" && !milestone.startedAt) {
    additionalData.startedAt = new Date();
  }

  const updated = await milestoneRepo.updateStatusWithLog(
    milestoneId,
    newStatus,
    userId,
    notes,
    additionalData
  );

  return updated;
}

/**
 * Update milestone progress percentage (student)
 */
export async function updateMilestoneProgress(milestoneId, userId, progressPercentage) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah progress milestone");
  }

  if (milestone.status === "completed") {
    throw createError("Tidak dapat mengubah progress milestone yang sudah selesai");
  }

  if (progressPercentage < 0 || progressPercentage > 100) {
    throw createError("Progress harus antara 0-100");
  }

  const previousProgress = milestone.progressPercentage;
  const updated = await milestoneRepo.updateProgress(milestoneId, progressPercentage);

  // Auto-update status based on progress
  let statusUpdate = null;
  if (progressPercentage > 0 && milestone.status === "not_started") {
    statusUpdate = "in_progress";
    await milestoneRepo.update(milestoneId, {
      status: "in_progress",
      startedAt: milestone.startedAt || new Date(),
    });
  }

  // Create log
  await milestoneRepo.createLog({
    milestoneId,
    action: "updated",
    previousProgress,
    newProgress: progressPercentage,
    performedBy: userId,
    notes: `Progress diperbarui dari ${previousProgress}% ke ${progressPercentage}%`,
  });

  return { ...updated, statusUpdated: statusUpdate };
}

/**
 * Submit milestone for review (student)
 */
export async function submitForReview(milestoneId, userId, evidenceUrl = null, studentNotes = null) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengajukan review milestone");
  }

  if (milestone.status === "completed") {
    throw createError("Milestone sudah selesai dan tervalidasi");
  }

  if (milestone.status === "pending_review") {
    throw createError("Milestone sudah dalam status menunggu review");
  }

  const updateData = {};
  if (evidenceUrl) updateData.evidenceUrl = evidenceUrl;
  if (studentNotes) updateData.studentNotes = studentNotes;

  const updated = await milestoneRepo.updateStatusWithLog(
    milestoneId,
    "pending_review",
    userId,
    "Milestone diajukan untuk review",
    updateData
  );

  // TODO: Send notification to supervisors

  return updated;
}

// ============================================
// Supervisor Actions
// ============================================

/**
 * Validate/approve milestone (supervisor only)
 */
export async function validateMilestone(milestoneId, userId, supervisorNotes = null) {
  const { milestone, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memvalidasi milestone");
  }

  if (milestone.status === "completed") {
    throw createError("Milestone sudah tervalidasi sebelumnya");
  }

  const updated = await milestoneRepo.validateMilestone(
    milestoneId,
    userId,
    supervisorNotes
  );

  // TODO: Send notification to student

  return updated;
}

/**
 * Request revision on milestone (supervisor only)
 */
export async function requestRevision(milestoneId, userId, revisionNotes) {
  const { milestone, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat meminta revisi");
  }

  if (!revisionNotes) {
    throw createError("Catatan revisi wajib diisi");
  }

  if (milestone.status === "completed") {
    throw createError("Tidak dapat meminta revisi pada milestone yang sudah selesai");
  }

  const updated = await milestoneRepo.requestRevision(milestoneId, userId, revisionNotes);

  // TODO: Send notification to student

  return updated;
}

/**
 * Add supervisor feedback (without status change)
 */
export async function addSupervisorFeedback(milestoneId, userId, feedback) {
  const { milestone, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memberikan feedback");
  }

  const updated = await milestoneRepo.update(milestoneId, {
    supervisorNotes: feedback,
  });

  await milestoneRepo.createLog({
    milestoneId,
    action: "updated",
    performedBy: userId,
    notes: `Dosen pembimbing memberikan feedback`,
  });

  return updated;
}

// ============================================
// Progress & Analytics Services
// ============================================

/**
 * Get overall thesis progress
 */
export async function getThesisProgress(thesisId, userId) {
  await getThesisWithAccess(thesisId, userId);
  return milestoneRepo.getThesisProgress(thesisId);
}

/**
 * Get milestone activity logs
 */
export async function getMilestoneLogs(milestoneId, userId, limit = 20) {
  await getMilestoneWithAccess(milestoneId, userId);
  return milestoneRepo.findLogsByMilestoneId(milestoneId, limit);
}

/**
 * Get recent activity logs for entire thesis
 */
export async function getThesisMilestoneLogs(thesisId, userId, limit = 50) {
  await getThesisWithAccess(thesisId, userId);
  return milestoneRepo.findRecentLogsByThesisId(thesisId, limit);
}

// ============================================
// Reorder Service
// ============================================

/**
 * Reorder milestones (student only)
 */
export async function reorderMilestones(thesisId, userId, milestoneOrders) {
  const { thesis, isOwner } = await getThesisWithAccess(thesisId, userId, true);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengatur ulang urutan milestone");
  }

  // Validate that all milestone IDs belong to this thesis
  const existingMilestones = await milestoneRepo.findByThesisId(thesisId);
  const existingIds = new Set(existingMilestones.map((m) => m.id));

  for (const order of milestoneOrders) {
    if (!existingIds.has(order.id)) {
      throw createError(`Milestone dengan ID ${order.id} tidak ditemukan di thesis ini`);
    }
  }

  await milestoneRepo.reorderMilestones(thesisId, milestoneOrders);

  return { success: true, message: "Urutan milestone berhasil diperbarui" };
}
