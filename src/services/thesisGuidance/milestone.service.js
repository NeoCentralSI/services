import * as milestoneRepo from "../../repositories/thesisGuidance/milestone.repository.js";
import prisma from "../../config/prisma.js";
import { ROLES, isSupervisorRole, normalize, isPembimbing1, isPembimbing2, supervisorRoleDisplayName } from "../../constants/roles.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotification } from "../../repositories/notification.repository.js";
import { getThesisStatusMap, updateThesisStatusById } from "../../repositories/thesisGuidance/lecturer.guidance.repository.js";
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";

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
      thesisSupervisors: {
        include: {
          lecturer: { select: { id: true, user: { select: { id: true, fullName: true } } } },
        },
      },
    },
  });

  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  const isOwner = thesis.student?.user?.id === userId || thesis.studentId === userId;
  const isSupervisor = thesis.thesisSupervisors.some(
    (p) => p.lecturer?.user?.id === userId
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
export async function getTemplates(topicId = null) {
  if (topicId) {
    return milestoneRepo.findTemplatesByTopic(topicId, true);
  }
  return milestoneRepo.findAllTemplates(true);
}

/**
 * Get all thesis topics for template filtering
 */
export async function getTopics() {
  return milestoneRepo.findAllTopics();
}

/**
 * Get template topics (with count)
 */
export async function getTemplateTopics() {
  const templates = await milestoneRepo.findAllTemplates(true);
  const topics = await milestoneRepo.findAllTopics();

  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    count: templates.filter((t) => t.topicId === topic.id).length,
  }));
}

/**
 * Check if user is Sekretaris Departemen
 */
async function checkSekretarisDepartemen(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userHasRoles: {
        include: { role: true },
      },
    },
  });

  if (!user) {
    throw notFound("User tidak ditemukan");
  }

  const isSekdep = user.userHasRoles.some(
    (uhr) => uhr.role?.name === ROLES.SEKRETARIS_DEPARTEMEN
  );

  if (!isSekdep) {
    throw forbidden("Hanya Sekretaris Departemen yang dapat mengelola template milestone");
  }

  return user;
}

/**
 * Get template by ID (Sekretaris Departemen)
 */
export async function getTemplateById(templateId) {
  const template = await milestoneRepo.findTemplateById(templateId);
  if (!template) {
    throw notFound("Template tidak ditemukan");
  }
  return template;
}

/**
 * Create milestone template (Sekretaris Departemen only)
 */
export async function createTemplate(userId, data) {
  await checkSekretarisDepartemen(userId);

  const maxOrder = await milestoneRepo.getMaxTemplateOrderIndex(data.topicId);

  const templateData = {
    name: data.name,
    description: data.description || null,
    topicId: data.topicId || null,
    orderIndex: data.orderIndex ?? maxOrder + 1,
    isActive: data.isActive ?? true,
  };

  return milestoneRepo.createTemplate(templateData);
}

/**
 * Update milestone template (Sekretaris Departemen only)
 */
export async function updateTemplate(userId, templateId, data) {
  await checkSekretarisDepartemen(userId);

  const existing = await milestoneRepo.findTemplateById(templateId);
  if (!existing) {
    throw notFound("Template tidak ditemukan");
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.topicId !== undefined) updateData.topicId = data.topicId;
  if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return milestoneRepo.updateTemplate(templateId, updateData);
}

/**
 * Delete milestone template (Sekretaris Departemen only)
 */
export async function deleteTemplate(userId, templateId) {
  await checkSekretarisDepartemen(userId);

  const existing = await milestoneRepo.findTemplateById(templateId);
  if (!existing) {
    throw notFound("Template tidak ditemukan");
  }

  await milestoneRepo.deleteTemplate(templateId);
  return { success: true, message: "Template berhasil dihapus" };
}

/**
 * Bulk delete milestone templates (Sekretaris Departemen only)
 */
export async function bulkDeleteTemplates(userId, templateIds) {
  await checkSekretarisDepartemen(userId);

  if (!Array.isArray(templateIds) || templateIds.length === 0) {
    throw createError("Pilih minimal satu template untuk dihapus");
  }

  const result = await milestoneRepo.deleteTemplatesMany(templateIds);
  return {
    success: true,
    count: result.count,
    message: `${result.count} template berhasil dihapus`
  };
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

  const milestone = await milestoneRepo.create(milestoneData);

  // Audit log: milestone created
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.MILESTONE_CREATED,
    entityType: ENTITY_TYPES.THESIS_MILESTONE,
    entityId: milestone.id,
    newValues: { thesisId, title: data.title },
  });

  return milestone;
}

/**
 * Create new milestone by supervisor for student
 */
export async function createMilestoneBySupervisor(thesisId, userId, data) {
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId, false);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat membuat milestone untuk mahasiswa");
  }

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
    supervisorNotes: data.supervisorNotes || null,
  };

  const milestone = await milestoneRepo.create(milestoneData);

  // Send FCM notification to student
  const studentUserId = thesis.student?.user?.id;
  const supervisorName = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.lecturer?.user?.fullName || "Dosen Pembimbing";

  if (studentUserId) {
    await sendFcmToUsers([studentUserId], {
      title: "Milestone Baru dari Pembimbing",
      body: `${supervisorName} menambahkan milestone baru: "${data.title}"`,
    });

    await createNotification({
      userId: studentUserId,
      title: "Milestone Baru dari Pembimbing",
      message: `${supervisorName} menambahkan milestone baru: "${data.title}"`,
    });
  }

  return milestone;
}

/**
 * Create milestones from templates (bulk create)
 */
export async function createMilestonesFromTemplates(thesisId, userId, templateIds, topicId = null, startDate = null) {
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

  // If topicId provided, update thesis topic
  if (topicId) {
    // Verify topic exists
    const topic = await prisma.thesisTopic.findUnique({ where: { id: topicId } });
    if (!topic) {
      throw createError("Topic tugas akhir tidak ditemukan");
    }
    // Update thesis topic
    await prisma.thesis.update({
      where: { id: thesisId },
      data: { thesisTopicId: topicId },
    });
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

  // Get created milestones
  const createdMilestones = await milestoneRepo.findByThesisId(thesisId);

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
  if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;

  const updated = await milestoneRepo.update(milestoneId, updateData);

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
    in_progress: ["not_started"],
    revision_needed: ["in_progress"],
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

  const updated = await milestoneRepo.updateMilestoneStatus(
    milestoneId,
    newStatus,
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

  // Send FCM notification to supervisors when progress reaches 100%
  if (progressPercentage === 100 && previousProgress < 100) {
    const { thesis } = await getMilestoneWithAccess(milestoneId, userId);
    const supervisors = thesis.thesisSupervisors.filter((p) =>
      p.lecturer?.user?.id
    );
    const supervisorUserIds = supervisors
      .map((p) => p.lecturer?.user?.id)
      .filter(Boolean);

    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const milestoneTitle = updated.title || "Milestone";

    if (supervisorUserIds.length > 0) {
      // Send FCM notification
      await sendFcmToUsers(supervisorUserIds, {
        title: "Milestone Selesai 100%",
        body: `${studentName} telah menyelesaikan milestone "${milestoneTitle}"`,
      });

      // Create in-app notifications
      for (const supervisorUserId of supervisorUserIds) {
        await createNotification({
          userId: supervisorUserId,
          title: "Milestone Selesai 100%",
          message: `${studentName} telah menyelesaikan milestone "${milestoneTitle}"`,
        });
      }
    }
  }

  return { ...updated, statusUpdated: statusUpdate };
}

/**
 * Submit milestone for review (student)
 */
export async function submitForReview(milestoneId, userId, studentNotes = null) {
  const { milestone, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengajukan review milestone");
  }

  const updateData = {};
  if (studentNotes) updateData.studentNotes = studentNotes;

  const updated = await milestoneRepo.update(milestoneId, {
    ...updateData,
  });

  // Audit log: milestone submitted for review
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.MILESTONE_SUBMITTED,
    entityType: ENTITY_TYPES.THESIS_MILESTONE,
    entityId: milestoneId,
    oldValues: { status: milestone.status },
    newValues: { status: 'pending_review', studentNotes: studentNotes || null, thesisId: milestone.thesisId },
  });

  return updated;
}

// ============================================
// Supervisor Actions
// ============================================

/**
 * Validate/approve milestone (supervisor only)
 */
export async function validateMilestone(milestoneId, userId, supervisorNotes = null) {
  const { milestone, thesis, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

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

  // Send FCM notification to student
  const studentUserId = thesis.student?.user?.id;
  const supervisorName = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.lecturer?.user?.fullName || "Dosen Pembimbing";
  const milestoneTitle = updated.title || "Milestone";

  if (studentUserId) {
    await sendFcmToUsers([studentUserId], {
      title: "Milestone Disetujui",
      body: `${supervisorName} telah menyetujui milestone "${milestoneTitle}"`,
    });

    await createNotification({
      userId: studentUserId,
      title: "Milestone Disetujui",
      message: `${supervisorName} telah menyetujui milestone "${milestoneTitle}"`,
    });
  }

  // Audit log: milestone validated
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.MILESTONE_VALIDATED,
    entityType: ENTITY_TYPES.THESIS_MILESTONE,
    entityId: milestoneId,
    oldValues: { status: milestone.status },
    newValues: { status: 'completed', supervisorNotes, thesisId: thesis.id },
  });

  return updated;
}

/**
 * Request revision on milestone (supervisor only)
 */
export async function requestRevision(milestoneId, userId, revisionNotes) {
  const { milestone, thesis, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

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

  // Send FCM notification to student
  const studentUserId = thesis.student?.user?.id;
  const supervisorName = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.lecturer?.user?.fullName || "Dosen Pembimbing";
  const milestoneTitle = updated.title || "Milestone";

  if (studentUserId) {
    await sendFcmToUsers([studentUserId], {
      title: "Revisi Milestone",
      body: `${supervisorName} meminta revisi pada milestone "${milestoneTitle}"`,
    });

    await createNotification({
      userId: studentUserId,
      title: "Revisi Milestone",
      message: `${supervisorName} meminta revisi pada milestone "${milestoneTitle}". Catatan: ${revisionNotes}`,
    });
  }

  // Audit log: revision requested
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.MILESTONE_REVISION_REQUESTED,
    entityType: ENTITY_TYPES.THESIS_MILESTONE,
    entityId: milestoneId,
    oldValues: { status: milestone.status },
    newValues: { status: 'revision_needed', revisionNotes, thesisId: thesis.id },
  });

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

// ============================================
// Seminar Readiness Approval Services
// ============================================

/**
 * Get thesis seminar readiness status
 */
export async function getThesisSeminarReadiness(thesisId, userId) {
  await getThesisWithAccess(thesisId, userId);

  const thesis = await milestoneRepo.getThesisSeminarReadiness(thesisId);
  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  // Get milestone completion status
  const progress = await milestoneRepo.getThesisProgress(thesisId);

  // Derive per-supervisor approval from thesisSupervisors
  const sup1 = thesis.thesisSupervisors.find((p) => isPembimbing1(p.supervisorRole));
  const sup2 = thesis.thesisSupervisors.find((p) => isPembimbing2(p.supervisorRole));
  const approvedBySupervisor1 = sup1?.seminarReady || false;
  const approvedBySupervisor2 = sup2?.seminarReady || false;
  // If only 1 supervisor exists, only their approval is needed
  const isFullyApproved = (sup1 ? approvedBySupervisor1 : true) && (sup2 ? approvedBySupervisor2 : true);

  const supervisors = thesis.thesisSupervisors.map((p) => ({
    id: p.lecturerId,
    name: p.lecturer?.user?.fullName,
    email: p.lecturer?.user?.email,
    role: supervisorRoleDisplayName(p.supervisorRole),
    hasApproved: p.seminarReady || false,
  }));

  // Determine current user's role as supervisor
  const currentUserParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );
  const currentUserRole = currentUserParticipant ? supervisorRoleDisplayName(currentUserParticipant.supervisorRole) : null;
  const currentUserHasApproved = currentUserParticipant?.seminarReady || false;

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    student: {
      id: thesis.student?.id,
      userId: thesis.student?.user?.id,
      name: thesis.student?.user?.fullName,
      nim: thesis.student?.user?.identityNumber,
      email: thesis.student?.user?.email,
    },
    milestoneProgress: {
      total: progress.total,
      completed: progress.completed,
      percentComplete: progress.percentComplete,
      isComplete: progress.isComplete,
    },
    seminarReadiness: {
      approvedBySupervisor1,
      approvedBySupervisor2,
      isFullyApproved,
    },
    supervisors,
    currentUserRole,
    currentUserHasApproved,
    canRegisterSeminar: progress.isComplete && isFullyApproved,
  };
}

/**
 * Approve seminar readiness by supervisor
 */
export async function approveSeminarReadiness(thesisId, userId, notes = null) {
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memberikan approval");
  }

  // Determine which supervisor role the current user has
  const supervisorParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );

  if (!supervisorParticipant) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const supervisorRole = supervisorRoleDisplayName(supervisorParticipant.supervisorRole);
  const isSupervisor1 = isPembimbing1(supervisorParticipant.supervisorRole);
  const lecturerId = supervisorParticipant.lecturerId;
  const supervisorName = supervisorParticipant.lecturer?.user?.fullName || (isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2");

  // Check milestone completion
  const progress = await milestoneRepo.getThesisProgress(thesisId);
  if (!progress.isComplete) {
    throw createError(
      `Mahasiswa belum menyelesaikan semua milestone (${progress.completed}/${progress.total}). ` +
      "Pastikan semua milestone sudah tervalidasi sebelum memberikan approval."
    );
  }

  const updated = await milestoneRepo.approveSeminarReadiness(thesisId, lecturerId);

  // Derive fully approved from all supervisors
  const isFullyApproved = updated.thesisSupervisors.every((s) => s.seminarReady);

  // Get student userId for notification
  const studentUserId = thesis.student?.user?.id;

  // Update thesis status to "Acc Seminar" when fully approved
  if (isFullyApproved) {
    try {
      const statusMap = await getThesisStatusMap();
      const accSeminarStatusId = statusMap.get("acc seminar");
      if (accSeminarStatusId) {
        await updateThesisStatusById(thesisId, accSeminarStatusId);
        console.log(`[Seminar] Thesis ${thesisId} status updated to Acc Seminar`);
      } else {
        console.warn("[Seminar] ThesisStatus 'Acc Seminar' not found in database");
      }
    } catch (err) {
      console.error("[Seminar] Failed to update thesis status:", err);
    }
  }

  // Send notification to student
  if (studentUserId) {
    const notifTitle = isFullyApproved
      ? "🎉 Kesiapan Seminar Disetujui Penuh!"
      : `✅ Persetujuan Seminar dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"}`;
    const notifMessage = isFullyApproved
      ? `Selamat! Semua pembimbing telah menyetujui kesiapan seminar Anda. Anda sekarang dapat mendaftar seminar.`
      : `${supervisorName} telah menyetujui kesiapan seminar Anda. Menunggu persetujuan dari pembimbing lainnya.`;

    // Create in-app notification
    await createNotification({
      userId: studentUserId,
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: {
        type: "seminar_readiness_approved",
        thesisId,
        isFullyApproved: String(isFullyApproved),
      },
    }).catch((err) => console.error("[FCM] Error sending seminar approval notification:", err));
  }

  // Derive per-role approval from updated supervisors
  const sup1 = updated.thesisSupervisors.find((s) => isPembimbing1(s.supervisorRole));
  const sup2 = updated.thesisSupervisors.find((s) => isPembimbing2(s.supervisorRole));

  // Audit log: seminar readiness approved
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.SEMINAR_READINESS_APPROVED,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isSupervisor1 ? 'pembimbing_1' : 'pembimbing_2', isFullyApproved, notes },
  });

  return {
    success: true,
    message: `Approval dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"} berhasil diberikan`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: sup1?.seminarReady || false,
      approvedBySupervisor2: sup2?.seminarReady || false,
      isFullyApproved,
    },
  };
}

/**
 * Revoke seminar readiness approval by supervisor
 */
export async function revokeSeminarReadiness(thesisId, userId, notes = null) {
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat mencabut approval");
  }

  // Determine which supervisor role the current user has
  const supervisorParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );

  if (!supervisorParticipant) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const supervisorRole = supervisorRoleDisplayName(supervisorParticipant.supervisorRole);
  const isSupervisor1 = isPembimbing1(supervisorParticipant.supervisorRole);
  const lecturerId = supervisorParticipant.lecturerId;
  const supervisorName = supervisorParticipant.lecturer?.user?.fullName || (isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2");

  const updated = await milestoneRepo.revokeSeminarReadiness(thesisId, lecturerId);

  // Get student userId for notification
  const studentUserId = thesis.student?.user?.id;

  // Send notification to student
  if (studentUserId) {
    const notifTitle = `⚠️ Persetujuan Seminar Dicabut`;
    const notifMessage = `${supervisorName} telah mencabut persetujuan kesiapan seminar Anda.${notes ? ` Alasan: ${notes}` : ""}`;

    // Create in-app notification
    await createNotification({
      userId: studentUserId,
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: {
        type: "seminar_readiness_revoked",
        thesisId,
      },
    }).catch((err) => console.error("[FCM] Error sending seminar revoke notification:", err));
  }

  // Derive per-role approval from updated supervisors
  const sup1 = updated.thesisSupervisors.find((s) => isPembimbing1(s.supervisorRole));
  const sup2 = updated.thesisSupervisors.find((s) => isPembimbing2(s.supervisorRole));

  // Audit log: seminar readiness revoked
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.SEMINAR_READINESS_REVOKED,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isSupervisor1 ? 'pembimbing_1' : 'pembimbing_2', notes },
  });

  return {
    success: true,
    message: `Approval dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"} berhasil dicabut`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: sup1?.seminarReady || false,
      approvedBySupervisor2: sup2?.seminarReady || false,
      isFullyApproved: false,
    },
  };
}

/**
 * Get list of students ready for seminar registration
 */
export async function getStudentsReadyForSeminar() {
  const theses = await milestoneRepo.findStudentsReadyForSeminar();

  return theses.map((t) => ({
    thesisId: t.id,
    thesisTitle: t.title,
    student: {
      name: t.student?.user?.fullName,
      nim: t.student?.user?.identityNumber,
      email: t.student?.user?.email,
    },
    supervisors: t.thesisSupervisors.map((p) => ({
      name: p.lecturer?.user?.fullName,
      role: supervisorRoleDisplayName(p.supervisorRole),
      seminarReady: p.seminarReady || false,
    })),
  }));
}

// ============================================
// Defence Readiness Approval Services
// ============================================

/**
 * Check if student has completed the seminar through ThesisSeminar table
 */
function isSeminarCompleted(thesisSeminars = []) {
  if (!thesisSeminars || thesisSeminars.length === 0) return false;
  
  // Get latest seminar attempt
  const latestSeminar = thesisSeminars[0];
  if (!latestSeminar) return false;

  const { status, revisionFinalizedAt } = latestSeminar;

  if (status === "passed") {
    return true;
  }
  
  if (status === "passed_with_revision" && revisionFinalizedAt) {
    return true;
  }
  
  return false;
}

/**
 * Get thesis defence readiness status
 */
export async function getThesisDefenceReadiness(thesisId, userId) {
  await getThesisWithAccess(thesisId, userId);

  const thesis = await milestoneRepo.getThesisDefenceReadiness(thesisId);
  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  const isEligibleStatus = isSeminarCompleted(thesis.thesisSeminars);
  const hasFinalDocument = !!thesis.finalThesisDocumentId;
  const hasRequestedDefence = !!thesis.defenceRequestedAt;

  // Determine supervisor roles
  const supervisors = thesis.thesisSupervisors.map((p) => ({
    id: p.lecturerId,
    name: p.lecturer?.user?.fullName,
    email: p.lecturer?.user?.email,
    role: supervisorRoleDisplayName(p.supervisorRole),
    hasApproved: p.defenceReady,
  }));

  // Determine current user's role as supervisor
  const currentUserParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );
  const currentUserRole = currentUserParticipant ? supervisorRoleDisplayName(currentUserParticipant.supervisorRole) : null;
  const currentUserHasApproved = currentUserParticipant?.defenceReady || false;

  const sup1Defence = thesis.thesisSupervisors.find((p) => isPembimbing1(p.supervisorRole));
  const sup2Defence = thesis.thesisSupervisors.find((p) => isPembimbing2(p.supervisorRole));
  const approvedBySupervisor1 = sup1Defence?.defenceReady || false;
  const approvedBySupervisor2 = sup2Defence?.defenceReady || false;
  // If only 1 supervisor exists, only their approval is needed
  const isFullyApproved = (sup1Defence ? approvedBySupervisor1 : true) && (sup2Defence ? approvedBySupervisor2 : true);

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    student: {
      id: thesis.student?.id,
      userId: thesis.student?.user?.id,
      name: thesis.student?.user?.fullName,
      nim: thesis.student?.user?.identityNumber,
      email: thesis.student?.user?.email,
    },
    thesisStatus: {
      id: thesis.thesisStatus?.id,
      name: thesis.thesisStatus?.name,
      isEligible: isEligibleStatus,
    },
    finalDocument: thesis.finalThesisDocument ? {
      id: thesis.finalThesisDocument.id,
      fileName: thesis.finalThesisDocument.fileName,
      filePath: thesis.finalThesisDocument.filePath,
      uploadedAt: thesis.finalThesisDocument.createdAt,
    } : null,
    defenceReadiness: {
      hasRequestedDefence,
      requestedAt: thesis.defenceRequestedAt,
      approvedBySupervisor1,
      approvedBySupervisor2,
      isFullyApproved,
    },
    supervisors,
    currentUserRole,
    currentUserHasApproved,
    canRegisterDefence:
      isEligibleStatus &&
      hasFinalDocument &&
      hasRequestedDefence &&
      isFullyApproved,
  };
}

/**
 * Approve defence readiness by supervisor
 */
export async function approveDefenceReadiness(thesisId, userId, notes = null) {
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memberikan approval");
  }

  // Check thesis status eligibility directly from seminars
  const thesisWithStatus = await milestoneRepo.getThesisDefenceReadiness(thesisId);
  if (!isSeminarCompleted(thesisWithStatus?.thesisSeminars)) {
    throw createError(
      `Mahasiswa belum memenuhi syarat untuk sidang. ` +
      `Seminar hasil belum dinyatakan lulus atau revisi belum diselesaikan.`
    );
  }

  // Check if student has uploaded final document
  if (!thesisWithStatus?.finalThesisDocumentId) {
    throw createError("Mahasiswa belum mengupload dokumen thesis final. Minta mahasiswa untuk mengupload terlebih dahulu.");
  }

  // Check if student has requested defence
  if (!thesisWithStatus?.defenceRequestedAt) {
    throw createError("Mahasiswa belum mengajukan permintaan sidang.");
  }

  // Determine which supervisor role the current user has
  const supervisorParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );

  if (!supervisorParticipant) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const supervisorRole = supervisorRoleDisplayName(supervisorParticipant.supervisorRole);
  const isSupervisor1 = isPembimbing1(supervisorParticipant.supervisorRole);
  const supervisorName = supervisorParticipant.lecturer?.user?.fullName || (isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2");

  const updated = await milestoneRepo.approveDefenceReadiness(thesisId, supervisorParticipant.lecturerId);

  // Get student userId for notification
  const studentUserId = thesis.student?.user?.id;
  const isFullyApproved = updated.thesisSupervisors.every((s) => s.defenceReady);

  // Update thesis status to "Acc Sidang" when fully approved
  if (isFullyApproved) {
    try {
      const statusMap = await getThesisStatusMap();
      const accSidangStatusId = statusMap.get("acc sidang");
      if (accSidangStatusId) {
        await updateThesisStatusById(thesisId, accSidangStatusId);
        console.log(`[Defence] Thesis ${thesisId} status updated to Acc Sidang`);
      } else {
        console.warn("[Defence] ThesisStatus 'Acc Sidang' not found in database");
      }
    } catch (err) {
      console.error("[Defence] Failed to update thesis status:", err);
    }
  }

  // Send notification to student
  if (studentUserId) {
    const notifTitle = isFullyApproved
      ? "🎉 Kesiapan Sidang Disetujui Penuh!"
      : `✅ Persetujuan Sidang dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"}`;
    const notifMessage = isFullyApproved
      ? `Selamat! Kedua pembimbing telah menyetujui kesiapan sidang Anda. Anda sekarang dapat mendaftar sidang.`
      : `${supervisorName} telah menyetujui kesiapan sidang Anda. Menunggu persetujuan dari pembimbing lainnya.`;

    // Create in-app notification
    await createNotification({
      userId: studentUserId,
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: {
        type: "defence_readiness_approved",
        thesisId,
        isFullyApproved: String(isFullyApproved),
      },
    }).catch((err) => console.error("[FCM] Error sending defence approval notification:", err));
  }

  // Audit log: defence readiness approved
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.DEFENCE_READINESS_APPROVED,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isSupervisor1 ? 'pembimbing_1' : 'pembimbing_2', isFullyApproved, notes },
  });

  return {
    success: true,
    message: `Approval dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"} berhasil diberikan`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: updated.thesisSupervisors.find((s) => isPembimbing1(s.supervisorRole))?.defenceReady || false,
      approvedBySupervisor2: updated.thesisSupervisors.find((s) => isPembimbing2(s.supervisorRole))?.defenceReady || false,
      isFullyApproved,
    },
  };
}

/**
 * Revoke defence readiness approval by supervisor
 */
export async function revokeDefenceReadiness(thesisId, userId, notes = null) {
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat mencabut approval");
  }

  // Determine which supervisor role the current user has
  const supervisorParticipant = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  );

  if (!supervisorParticipant) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const supervisorRole = supervisorRoleDisplayName(supervisorParticipant.supervisorRole);
  const isSupervisor1 = isPembimbing1(supervisorParticipant.supervisorRole);
  const supervisorName = supervisorParticipant.lecturer?.user?.fullName || (isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2");

  const updated = await milestoneRepo.revokeDefenceReadiness(thesisId, supervisorParticipant.lecturerId);

  // Get student userId for notification
  const studentUserId = thesis.student?.user?.id;

  // Send notification to student
  if (studentUserId) {
    const notifTitle = `⚠️ Persetujuan Sidang Dicabut`;
    const notifMessage = `${supervisorName} telah mencabut persetujuan kesiapan sidang Anda.${notes ? ` Alasan: ${notes}` : ""}`;

    // Create in-app notification
    await createNotification({
      userId: studentUserId,
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: {
        type: "defence_readiness_revoked",
        thesisId,
      },
    }).catch((err) => console.error("[FCM] Error sending defence revoke notification:", err));
  }

  // Audit log: defence readiness revoked
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.DEFENCE_READINESS_REVOKED,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isSupervisor1 ? 'pembimbing_1' : 'pembimbing_2', notes },
  });

  return {
    success: true,
    message: `Approval dari ${isSupervisor1 ? "Pembimbing 1" : "Pembimbing 2"} berhasil dicabut`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: updated.thesisSupervisors.find((s) => isPembimbing1(s.supervisorRole))?.defenceReady || false,
      approvedBySupervisor2: updated.thesisSupervisors.find((s) => isPembimbing2(s.supervisorRole))?.defenceReady || false,
      isFullyApproved: false,
    },
  };
}

/**
 * Get list of students ready for defence registration
 */
export async function getStudentsReadyForDefence() {
  const theses = await milestoneRepo.findStudentsReadyForDefence();

  return theses.map((t) => ({
    thesisId: t.id,
    thesisTitle: t.title,
    student: {
      name: t.student?.user?.fullName,
      nim: t.student?.user?.identityNumber,
      email: t.student?.user?.email,
    },
    supervisors: t.thesisSupervisors.map((p) => ({
      name: p.lecturer?.user?.fullName,
      role: supervisorRoleDisplayName(p.supervisorRole),
    })),
    finalDocument: t.finalThesisDocument ? {
      fileName: t.finalThesisDocument.fileName,
      filePath: t.finalThesisDocument.filePath,
    } : null,
    requestedAt: t.defenceRequestedAt,
  }));
}

/**
 * Request defence (student uploads final thesis and requests defence)
 */
export async function requestDefence(thesisId, userId, documentId) {
  // Validate thesis access for student
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        select: { id: true, user: { select: { id: true, fullName: true } } },
      },
      thesisStatus: { select: { id: true, name: true } },
      thesisSupervisors: {
        where: { status: "active" },
        include: {
          lecturer: { select: { id: true, user: { select: { id: true, fullName: true } } } },
        },
      },
      thesisSeminars: {
        select: { id: true, status: true, revisionFinalizedAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  // Check if user is the student owner
  if (thesis.student?.user?.id !== userId) {
    throw forbidden("Anda tidak memiliki akses ke thesis ini");
  }

  // Check thesis eligibility via seminar completion
  if (!isSeminarCompleted(thesis.thesisSeminars)) {
    throw createError(
      `Mahasiswa belum memenuhi syarat untuk sidang. ` +
      `Seminar hasil belum dinyatakan lulus atau revisi belum diselesaikan.`
    );
  }

  // Check if document exists
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, fileName: true },
  });

  if (!document) {
    throw notFound("Dokumen tidak ditemukan");
  }

  // Update thesis with final document
  const updated = await milestoneRepo.updateThesisDefenceRequest(thesisId, documentId);

  // Notify supervisors
  const supervisorUserIds = thesis.thesisSupervisors
    .map((p) => p.lecturer?.user?.id)
    .filter(Boolean);

  if (supervisorUserIds.length > 0) {
    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const notifTitle = "📄 Permintaan Persetujuan Sidang";
    const notifMessage = `${studentName} telah mengupload dokumen thesis final dan mengajukan permintaan sidang.`;

    // Create in-app notifications
    for (const supervisorUserId of supervisorUserIds) {
      await createNotification({
        userId: supervisorUserId,
        title: notifTitle,
        message: notifMessage,
      });
    }

    // Send FCM push notification
    sendFcmToUsers(supervisorUserIds, {
      title: notifTitle,
      body: notifMessage,
      data: {
        type: "defence_request",
        thesisId,
      },
    }).catch((err) => console.error("[FCM] Error sending defence request notification:", err));
  }

  // Audit log: defence requested
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.DEFENCE_REQUESTED,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { documentId, finalDocument: updated.finalThesisDocument, requestedAt: updated.defenceRequestedAt },
  });

  return {
    success: true,
    message: "Permintaan sidang berhasil diajukan",
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      finalDocument: updated.finalThesisDocument,
      requestedAt: updated.defenceRequestedAt,
    },
  };
}
