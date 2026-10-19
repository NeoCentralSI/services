import * as milestoneRepo from "../../repositories/thesisGuidance/milestone.repository.js";
import prisma from "../../config/prisma.js";
import { ROLES, isSupervisorRole, normalize, isPembimbing1, isPembimbing2 } from "../../constants/roles.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotification } from "../../repositories/notification.repository.js";
import { THESIS_PHASE, THESIS_STATUS, TA_PHASE, currentPhaseOf, phaseForThesisStatus } from "../../constants/thesisStatus.js";
import { THESIS_STATUS_LABELS, THESIS_PHASE_LABELS, MILESTONE_STATUS_LABELS } from "../../constants/thesisLabels.js";
import { getProposalPhaseAccess, PROPOSAL_NOT_ASSIGNED_REASON } from "../../helpers/thesis-phase-access.helper.js";

const milestoneStatusLabel = (status) => MILESTONE_STATUS_LABELS[status] ?? status;

/** A milestone transition starts from an allowed status; otherwise 400 with labels. */
function assertMilestoneStatus(milestone, allowed, actionText) {
  if (allowed.includes(milestone.status)) return;
  const allowedText = allowed.map((s) => `"${milestoneStatusLabel(s)}"`).join(" atau ");
  throw createError(
    `Milestone tidak dapat ${actionText}. Hanya milestone berstatus ${allowedText} yang dapat ${actionText}; status saat ini "${milestoneStatusLabel(milestone.status)}".`
  );
}
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { isRepeatingProposal } from "../../repositories/thesis-guidance-evaluation.repository.js";
import { REPEAT_PROPOSAL_LOCK_REASON } from "../../constants/thesis-guidance-evaluation.js";

// ============================================
// Error Helpers
// ============================================

function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function notFound(message = "Data tidak ditemukan") {
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
        where: { status: "active" },
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
  // Action authority: only an ACTIVE supervisor relation (thesisSupervisors above is
  // filtered to status "active").
  const isSupervisor = thesis.thesisSupervisors.some(
    (p) => p.lecturer?.user?.id === userId && isSupervisorRole(p.role?.name)
  );

  if (requireOwner && !isOwner) {
    throw forbidden("Hanya mahasiswa pemilik thesis yang dapat melakukan aksi ini");
  }

  if (!isOwner && !isSupervisor) {
    // History read: former (released/terminated) supervisors keep the read access they
    // had before the revival, but never action authority (isSupervisor stays false).
    const formerRelation = await prisma.thesisSupervisors.findFirst({
      where: { thesisId, lecturerId: userId, status: { not: "active" } },
      select: { id: true },
    });
    if (!formerRelation) {
      throw forbidden("Anda tidak memiliki akses ke thesis ini");
    }
  }

  return { thesis, isOwner, isSupervisor };
}

/**
 * Milestone writes (create, update, progress, review, validation): a thesis in the TA phase,
 * or in the proposal phase once Penetapan Pembimbing is issued. BSS, closed theses and a
 * thesis repeating its proposal get a clear 403.
 */
async function ensureThesisWritable(thesis) {
  if (thesis?.status === THESIS_STATUS.RESEARCH) return;
  if (thesis?.status === THESIS_STATUS.PROPOSAL) {
    const { open, repeating } = await getProposalPhaseAccess(thesis);
    if (open) return;
    // A thesis sent back to the proposal by a guidance evaluation says so.
    if (repeating) {
      throw forbidden(`${REPEAT_PROPOSAL_LOCK_REASON} Milestone terkunci sampai Pembimbing 1 menyetujui proposal revisi (Tugas Akhir > Proposal).`);
    }
    throw forbidden(PROPOSAL_NOT_ASSIGNED_REASON);
  }
  if (thesis?.status === THESIS_STATUS.ON_LEAVE) {
    throw forbidden(`Tugas akhir sedang berstatus "${THESIS_STATUS_LABELS.on_leave}". Milestone tidak dapat diubah.`);
  }
  throw forbidden("Tugas akhir sudah tidak aktif. Milestone tidak dapat diubah.");
}

/** Why a milestone of another phase is read-only (10.7), or null when it is the current one. */
export function otherPhaseReason(milestonePhase, thesisStatus) {
  const current = currentPhaseOf(thesisStatus);
  if (!milestonePhase || milestonePhase === current) return null;
  return milestonePhase === THESIS_PHASE.PROPOSAL
    ? "Fase proposal sudah selesai. Milestone fase proposal hanya dapat dibaca."
    : `Milestone fase ${THESIS_PHASE_LABELS[milestonePhase] ?? milestonePhase} hanya dapat dibaca selama tugas akhir berada di fase ${THESIS_PHASE_LABELS[current] ?? current}.`;
}

/** A write on an existing milestone: the thesis is writable and the milestone is of its current phase. */
async function ensureMilestoneWritable(milestone, thesis) {
  await ensureThesisWritable(thesis);
  const reason = otherPhaseReason(milestone?.phase, thesis?.status);
  if (reason) throw forbidden(reason);
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
export async function getTemplates(topicId = null, { includeInactive = false, phase = THESIS_PHASE.RESEARCH } = {}) {
  // isActive=null means "no isActive filter" in the repository.
  const isActive = includeInactive ? null : true;
  // Proposal templates are general, without a topic.
  if (phase === THESIS_PHASE.PROPOSAL) {
    return milestoneRepo.findAllTemplates(isActive, null, THESIS_PHASE.PROPOSAL);
  }
  if (topicId) {
    return milestoneRepo.findTemplatesByTopic(topicId, isActive);
  }
  return milestoneRepo.findAllTemplates(isActive);
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
export async function getTemplateTopics({ includeInactive = false } = {}) {
  // Same filter as getTemplates so the per-topic count matches the list.
  const templates = await milestoneRepo.findAllTemplates(includeInactive ? null : true);
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
/** A template topic must exist (null = general template); avoids a raw FK error. */
async function assertTemplateTopic(topicId) {
  if (!topicId) return;
  const topic = await prisma.thesisTopic.findUnique({ where: { id: topicId }, select: { id: true } });
  if (!topic) throw createError("Topik tugas akhir tidak ditemukan");
}

export async function createTemplate(userId, data) {
  await checkSekretarisDepartemen(userId);
  await assertTemplateTopic(data.topicId);

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

  if (data.topicId !== undefined) await assertTemplateTopic(data.topicId);

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
export async function getMilestones(thesisId, userId, status = null, phase = null) {
  const { thesis } = await getThesisWithAccess(thesisId, userId);
  // One phase at a time, the current phase by default; the other phase is read-only.
  const currentPhase = currentPhaseOf(thesis.status);
  const listPhase = Object.values(THESIS_PHASE).includes(phase) ? phase : currentPhase;

  // C9: each milestone carries the feedback author's name
  const milestones = await milestoneRepo.withFeedbackAuthor(await milestoneRepo.findByThesisId(thesisId, status, listPhase));
  const progress = await milestoneRepo.getThesisProgress(thesisId, listPhase);

  return {
    milestones,
    progress,
    phase: listPhase,
    currentPhase,
    readOnlyReason: otherPhaseReason(listPhase, thesis.status),
  };
}

/**
 * Get milestone detail
 */
export async function getMilestoneDetail(milestoneId, userId) {
  const { milestone } = await getMilestoneWithAccess(milestoneId, userId);
  return milestoneRepo.withFeedbackAuthor(milestone);
}

/**
 * Create new milestone (student only)
 */
export async function createMilestone(thesisId, userId, data) {
  const { thesis } = await getThesisWithAccess(thesisId, userId, true);
  await ensureThesisWritable(thesis);

  // Get next order index
  const maxOrder = await milestoneRepo.getMaxOrderIndex(thesisId, phaseForThesisStatus(thesis.status));

  const milestoneData = {
    thesisId,
    // Phase is set by the server from the thesis status.
    phase: phaseForThesisStatus(thesis.status),
    title: data.title,
    description: data.description || null,
    orderIndex: data.orderIndex ?? maxOrder + 1,
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
    status: "not_started",
    progressPercentage: 0,
    studentNotes: data.studentNotes || null,
  };

  const milestone = await milestoneRepo.create(milestoneData);

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
  await ensureThesisWritable(thesis);

  // Get next order index
  const maxOrder = await milestoneRepo.getMaxOrderIndex(thesisId, phaseForThesisStatus(thesis.status));

  const milestoneData = {
    thesisId,
    // Phase is set by the server from the thesis status.
    phase: phaseForThesisStatus(thesis.status),
    title: data.title,
    description: data.description || null,
    orderIndex: data.orderIndex ?? maxOrder + 1,
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
    status: "not_started",
    progressPercentage: 0,
    // C9: `supervisorNotes` is only for decisions (validate / request revision); a note
    // given while creating the milestone is stored as supervisor feedback.
    ...(String(data.supervisorNotes ?? "").trim()
      ? { feedback: String(data.supervisorNotes).trim(), feedbackBy: userId, feedbackAt: new Date() }
      : {}),
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
  // `topicId` from the client is never trusted (and never changes the thesis topic);
  // the thesis topic decides which templates apply. The parameter stays for API
  // compatibility.
  void topicId;
  const { thesis } = await getThesisWithAccess(thesisId, userId, true);
  await ensureThesisWritable(thesis);
  const phase = phaseForThesisStatus(thesis.status);

  // Proposal templates are general; only thesis-phase templates come from the topic.
  if (phase === THESIS_PHASE.RESEARCH && !thesis.thesisTopicId) {
    throw createError(
      "Tugas akhir Anda belum memiliki topik, sehingga template milestone belum dapat dipasang. Topik diisi oleh Admin/Sekretaris Departemen melalui Data Master Tugas Akhir."
    );
  }

  // Templates are only applied while the milestones of the current phase are still empty.
  const existing = await milestoneRepo.findByThesisId(thesisId, null, phase);
  if (existing.length > 0) {
    throw createError("Tugas akhir sudah memiliki milestone. Template hanya dapat dipasang saat milestone masih kosong; tambahkan milestone baru secara manual.");
  }

  // Only active templates of the thesis phase, from the thesis topic or general (no topic).
  const uniqueIds = Array.from(new Set(templateIds ?? []));
  if (uniqueIds.length === 0) {
    throw createError("Pilih minimal satu template");
  }
  const templates = await milestoneRepo.findTemplatesByIds(uniqueIds);
  if (templates.length !== uniqueIds.length) {
    throw createError("Sebagian template tidak ditemukan");
  }
  if (templates.some((t) => t.phase !== phase)) {
    throw createError("Template milestone tidak sesuai dengan fase tugas akhir");
  }
  if (templates.some((t) => !t.isActive)) {
    throw createError("Template yang sudah dinonaktifkan tidak dapat dipasang");
  }
  if (templates.some((t) => t.topicId && t.topicId !== thesis.thesisTopicId)) {
    throw createError("Template harus berasal dari topik tugas akhir Anda");
  }
  const validTemplates = templates;

  // Sort by orderIndex
  validTemplates.sort((a, b) => a.orderIndex - b.orderIndex);

  // Calculate target dates if startDate provided (default: 2 weeks interval)
  const baseDate = startDate ? new Date(startDate) : new Date();
  const intervalDays = 14; // 2 weeks per milestone

  const milestonesData = validTemplates.map((template, index) => ({
    thesisId,
    milestoneTemplateId: template.id,
    phase,
    title: template.name,
    description: template.description,
    orderIndex: index,
    targetDate: new Date(baseDate.getTime() + index * intervalDays * 24 * 60 * 60 * 1000),
    status: "not_started",
    progressPercentage: 0,
  }));

  // Bulk create
  await milestoneRepo.createMany(milestonesData);

  // Get created milestones (of the phase they were made in; the proposal phase read the
  // research list back and answered "0 milestone berhasil dibuat").
  const createdMilestones = await milestoneRepo.findByThesisId(thesisId, null, phase);

  return {
    count: createdMilestones.length,
    milestones: createdMilestones,
  };
}

/**
 * Update milestone (student only)
 */
export async function updateMilestone(milestoneId, userId, data) {
  const { milestone, thesis, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah milestone");
  }
  await ensureMilestoneWritable(milestone, thesis);

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
  const { milestone, thesis, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat menghapus milestone");
  }
  await ensureMilestoneWritable(milestone, thesis);

  // A student may delete only a milestone that is not completed.
  if (milestone.status === "completed" || milestone.validatedBy) {
    throw createError(`Milestone berstatus "${milestoneStatusLabel("completed")}" tidak dapat dihapus`);
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
  const { milestone, thesis, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah status milestone");
  }
  await ensureMilestoneWritable(milestone, thesis);

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
      `Tidak dapat mengubah status milestone dari "${milestoneStatusLabel(currentStatus)}" ke "${milestoneStatusLabel(newStatus)}"`
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
  const { milestone, thesis: milestoneThesis, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengubah progress milestone");
  }
  await ensureMilestoneWritable(milestone, milestoneThesis);

  if (milestone.status === "completed") {
    throw createError("Tidak dapat mengubah progress milestone yang sudah selesai");
  }

  if (progressPercentage < 0 || progressPercentage > 100) {
    throw createError("Progress harus antara 0-100");
  }

  const updated = await milestoneRepo.updateProgress(milestoneId, progressPercentage);

  // The status follows the progress.
  //   < 100 (and > 0, or after a revision request / withdrawn review) -> in_progress
  //   = 100 -> pending_review (also after revision_needed, even if it was 100 before)
  let statusUpdate = null;
  if (progressPercentage < 100) {
    const backToWork =
      (progressPercentage > 0 && milestone.status === "not_started") ||
      milestone.status === "revision_needed" ||
      milestone.status === "pending_review";
    if (backToWork) {
      statusUpdate = "in_progress";
      await milestoneRepo.update(milestoneId, {
        status: "in_progress",
        startedAt: milestone.startedAt || new Date(),
      });
    }
  }

  // Auto-submit for review when progress reaches 100%
  if (progressPercentage === 100 && milestone.status !== "pending_review") {
    statusUpdate = "pending_review";
    await milestoneRepo.update(milestoneId, {
      status: "pending_review",
      startedAt: milestone.startedAt || new Date(),
    });

    const { thesis } = await getMilestoneWithAccess(milestoneId, userId);
    const supervisors = thesis.thesisSupervisors.filter((p) =>
      isSupervisorRole(p.role?.name)
    );
    const supervisorUserIds = supervisors
      .map((p) => p.lecturer?.user?.id)
      .filter(Boolean);

    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const milestoneTitle = updated.title || "Milestone";

    if (supervisorUserIds.length > 0) {
      // Send FCM notification
      await sendFcmToUsers(supervisorUserIds, {
        title: "Milestone Siap Direview",
        body: `${studentName} telah menyelesaikan milestone "${milestoneTitle}" (100%)`,
        data: { type: "milestone:pending_review" },
      });

      // Create in-app notifications
      for (const supervisorUserId of supervisorUserIds) {
        await createNotification({
          userId: supervisorUserId,
          title: "Milestone Siap Direview",
          message: `${studentName} telah menyelesaikan milestone "${milestoneTitle}" (100%)`,
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
  const { milestone, thesis, isOwner } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isOwner) {
    throw forbidden("Hanya mahasiswa yang dapat mengajukan review milestone");
  }
  await ensureMilestoneWritable(milestone, thesis);

  // Review is requested for work in progress or a revised milestone.
  assertMilestoneStatus(milestone, ["in_progress", "revision_needed"], "diajukan untuk review");

  const updateData = {
    status: "pending_review",
  };
  if (studentNotes) updateData.studentNotes = studentNotes;

  const updated = await milestoneRepo.update(milestoneId, {
    ...updateData,
  });

  // Send notification to supervisors
  try {
    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const milestoneTitle = updated.title || milestone.title || "Milestone";
    const supervisorUserIds = (thesis.thesisSupervisors || [])
      .map((p) => p.lecturer?.user?.id)
      .filter(Boolean);

    for (const supervisorUserId of supervisorUserIds) {
      await sendFcmToUsers([supervisorUserId], {
        title: "Milestone Siap Direview",
        body: `${studentName} mengajukan review untuk milestone "${milestoneTitle}"`,
      });

      await createNotification({
        userId: supervisorUserId,
        title: "Milestone Siap Direview",
        message: `${studentName} mengajukan review untuk milestone "${milestoneTitle}"`,
      });
    }
  } catch (e) {
    console.error("Failed to send submitForReview notification:", e?.message || e);
  }

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
  await ensureMilestoneWritable(milestone, thesis);

  // Check if current user is Pembimbing 1 for this thesis
  const userRole = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.role?.name;

  if (!isPembimbing1(userRole)) {
    throw forbidden("Hanya Pembimbing 1 yang memiliki hak untuk memvalidasi milestone");
  }

  // Only a milestone waiting for review can be validated (-> completed).
  assertMilestoneStatus(milestone, ["pending_review"], "divalidasi");

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
  await ensureMilestoneWritable(milestone, thesis);

  // Check if current user is Pembimbing 1 for this thesis
  const userRole = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.role?.name;

  if (!isPembimbing1(userRole)) {
    throw forbidden("Hanya Pembimbing 1 yang memiliki hak untuk meminta revisi milestone");
  }

  revisionNotes = String(revisionNotes ?? "").trim();
  if (!revisionNotes) {
    throw createError("Catatan revisi wajib diisi");
  }

  // A revision is requested on a milestone waiting for review.
  assertMilestoneStatus(milestone, ["pending_review"], "diminta revisi");

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
  const { milestone, thesis, isSupervisor } = await getMilestoneWithAccess(milestoneId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memberikan feedback");
  }
  await ensureMilestoneWritable(milestone, thesis);

  // Pembimbing 1 and 2 may both give feedback; it never changes the status.
  const text = String(feedback ?? "").trim();
  if (!text) {
    throw createError("Feedback wajib diisi");
  }

  // Feedback has its own columns and never touches `supervisorNotes`
  // (the decision notes written by validate / request-revision). A new feedback replaces
  // the previous one; the history lives in the notification and the audit log.
  const now = new Date();
  const updated = await milestoneRepo.update(milestoneId, {
    feedback: text,
    feedbackBy: userId,
    feedbackAt: now,
  });

  const supervisorName = thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId
  )?.lecturer?.user?.fullName || "Dosen Pembimbing";
  const studentUserId = thesis.student?.user?.id;
  const milestoneTitle = updated.title || milestone.title || "Milestone";
  if (studentUserId) {
    try {
      await sendFcmToUsers([studentUserId], {
        title: "Feedback Milestone",
        body: `${supervisorName} memberi feedback pada milestone "${milestoneTitle}"`,
      });
      await createNotification({
        userId: studentUserId,
        title: "Feedback Milestone",
        message: `${supervisorName} memberi feedback pada milestone "${milestoneTitle}": ${text}`,
      });
    } catch (e) {
      console.error("Failed to send milestone feedback notification:", e?.message || e);
    }
  }

  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.MILESTONE_FEEDBACK_ADDED,
    entityType: ENTITY_TYPES.THESIS_MILESTONE,
    entityId: milestoneId,
    oldValues: { feedback: milestone.feedback ?? null, feedbackBy: milestone.feedbackBy ?? null },
    newValues: { feedback: text, feedbackBy: userId, thesisId: thesis.id },
  });

  return milestoneRepo.withFeedbackAuthor(updated);
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
  await ensureThesisWritable(thesis);

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
// Seminar & Defence Readiness
// ============================================
// Readiness is decided from what the system can count plus the approval of every active
// supervisor (`seminarReady` / `defenceReady`). The student uploads nothing here: supervisors
// read the draft through guidance attachments, and seminar/defence registration has its own
// requirement documents.

/** Completed research-phase guidance sessions required before the results seminar. */
export const MIN_COMPLETED_GUIDANCES = 8;

const READINESS_KINDS = Object.freeze({
  seminar: {
    flag: "seminarReady",
    noun: "seminar hasil",
    title: "Seminar",
    approvedAction: AUDIT_ACTIONS.SEMINAR_READINESS_APPROVED,
    revokedAction: AUDIT_ACTIONS.SEMINAR_READINESS_REVOKED,
    requestedAction: AUDIT_ACTIONS.SEMINAR_READINESS_REQUESTED,
    approve: (thesisId, lecturerId) => milestoneRepo.approveSeminarReadiness(thesisId, lecturerId),
    revoke: (thesisId, lecturerId) => milestoneRepo.revokeSeminarReadiness(thesisId, lecturerId),
  },
  defence: {
    flag: "defenceReady",
    noun: "sidang",
    title: "Sidang",
    approvedAction: AUDIT_ACTIONS.DEFENCE_READINESS_APPROVED,
    revokedAction: AUDIT_ACTIONS.DEFENCE_READINESS_REVOKED,
    requestedAction: AUDIT_ACTIONS.DEFENCE_READINESS_REQUESTED,
    approve: (thesisId, lecturerId) => milestoneRepo.approveDefenceReadiness(thesisId, lecturerId),
    revoke: (thesisId, lecturerId) => milestoneRepo.revokeDefenceReadiness(thesisId, lecturerId),
  },
});

const isMainSupervisorRole = (roleName) => isPembimbing1(roleName) || isPembimbing2(roleName);
const supervisorLabel = (roleName) => (isPembimbing1(roleName) ? "Pembimbing 1" : "Pembimbing 2");

/** Seminar: >= 8 completed research-phase sessions and every milestone completed. */
function buildSeminarRequirements(progress, completedGuidances) {
  return [
    {
      key: "guidance",
      label: `Minimal ${MIN_COMPLETED_GUIDANCES} sesi bimbingan fase penelitian berstatus Selesai`,
      met: completedGuidances >= MIN_COMPLETED_GUIDANCES,
      detail: `${completedGuidances} dari ${MIN_COMPLETED_GUIDANCES} sesi`,
    },
    {
      key: "milestone",
      label: "Seluruh milestone selesai (100%)",
      met: !!progress.isComplete,
      detail: progress.total > 0 ? `${progress.completed} dari ${progress.total} milestone selesai` : "Belum ada milestone",
    },
  ];
}

/**
 * Defence: the latest results seminar is passed, and its revision is finalised when it
 * passed with revision.
 */
function buildDefenceRequirements(thesisSeminars = []) {
  const latest = thesisSeminars?.[0] ?? null;
  const passed = latest?.status === "passed" || latest?.status === "passed_with_revision";
  const requirements = [
    {
      key: "seminar",
      label: "Seminar hasil dinyatakan lulus",
      met: passed,
      detail: !latest
        ? "Belum ada seminar hasil"
        : latest.status === "passed"
          ? "Lulus"
          : latest.status === "passed_with_revision"
            ? "Lulus dengan revisi"
            : "Belum dinyatakan lulus",
    },
  ];
  if (latest?.status === "passed_with_revision") {
    requirements.push({
      key: "seminar_revision",
      label: "Revisi seminar hasil sudah difinalkan",
      met: !!latest.revisionFinalizedAt,
      detail: latest.revisionFinalizedAt ? "Sudah difinalkan" : "Belum difinalkan",
    });
  }
  return requirements;
}

const requirementsMet = (requirements) => requirements.every((item) => item.met);

const PASSED_EVENT_STATUSES = ["passed", "passed_with_revision"];

/**
 * The passed results seminar (or defence) of a thesis, newest first, or null.
 * Its date is the result finalisation, else the day it was held.
 */
function passedEventOf(rows = []) {
  const passed = (rows ?? []).find((row) => PASSED_EVENT_STATUSES.includes(row.status));
  return passed ? { passedAt: passed.resultFinalizedAt ?? passed.date ?? null } : null;
}

/** Why readiness approvals can no longer change once the event is passed, or null. */
function passedBlock(kind, passed) {
  if (!passed) return null;
  return kind === "seminar"
    ? "Seminar hasil sudah lulus. Persetujuan kesiapan seminar tidak dapat diubah lagi."
    : "Sidang sudah lulus. Persetujuan kesiapan sidang tidak dapat diubah lagi.";
}

/** The passed event of one readiness kind, read fresh from the database. */
async function loadPassedEvent(kind, thesisId) {
  if (kind === "seminar") {
    const thesis = await milestoneRepo.getThesisSeminarReadiness(thesisId);
    return passedEventOf(thesis?.thesisSeminars);
  }
  const thesis = await milestoneRepo.getThesisDefenceReadiness(thesisId);
  return passedEventOf(thesis?.thesisDefences);
}

/**
 * When each supervisor last approved (the flags carry no date): the latest approval in the
 * audit log per lecturer. Missing for approvals given before the audit trail existed.
 */
async function readApprovalDates(thesisId, action) {
  const rows = await prisma.auditLog.findMany({
    where: { entity: ENTITY_TYPES.THESIS, entityId: thesisId, action },
    select: { userId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const dates = new Map();
  for (const row of rows ?? []) {
    if (row.userId && !dates.has(row.userId)) dates.set(row.userId, row.createdAt);
  }
  return dates;
}

const withApprovalDates = (supervisors, dates) =>
  supervisors.map((supervisor) => ({ ...supervisor, approvedAt: supervisor.hasApproved ? dates.get(supervisor.id) ?? null : null }));

/** Text for an unmet requirement list, used in 400 responses. */
function describeUnmet(requirements) {
  return requirements.filter((item) => !item.met).map((item) => `${item.label} (${item.detail})`).join("; ");
}

/** Approval state of the active Pembimbing 1/2 relations for one readiness flag. */
function readApprovals(thesisSupervisors = [], userId, flag) {
  const main = thesisSupervisors.filter((p) => isMainSupervisorRole(p.role?.name));
  const sup1 = main.find((p) => isPembimbing1(p.role?.name));
  const sup2 = main.find((p) => isPembimbing2(p.role?.name));
  const current = main.find((p) => p.lecturer?.user?.id === userId);
  return {
    supervisors: thesisSupervisors.map((p) => ({
      id: p.lecturerId,
      name: p.lecturer?.user?.fullName,
      email: p.lecturer?.user?.email,
      role: p.role?.name,
      hasApproved: !!p[flag],
    })),
    approvedBySupervisor1: !!sup1?.[flag],
    approvedBySupervisor2: !!sup2?.[flag],
    // Every active supervisor must approve; a thesis without one is never approved.
    isFullyApproved: main.length > 0 && main.every((p) => !!p[flag]),
    hasSupervisor: main.length > 0,
    currentUserRole: current?.role?.name || null,
    currentUserHasApproved: !!current?.[flag],
  };
}

function studentOf(thesis) {
  return {
    id: thesis.student?.id,
    userId: thesis.student?.user?.id,
    name: thesis.student?.user?.fullName,
    nim: thesis.student?.user?.identityNumber,
    email: thesis.student?.user?.email,
  };
}

/** Why the readiness flow is closed for this thesis status, or null when it is open. */
function readinessStatusBlock(thesis, kind) {
  if (thesis?.status === THESIS_STATUS.RESEARCH) return null;
  return `Persetujuan kesiapan ${READINESS_KINDS[kind].noun} hanya berlaku untuk tugas akhir berstatus "${THESIS_STATUS_LABELS.research}". Status saat ini "${THESIS_STATUS_LABELS[thesis?.status] ?? "-"}".`;
}

/**
 * Reasons shown next to the disabled buttons. The same checks run again when the action is
 * submitted.
 */
function readinessActionReasons(thesis, kind, requirements, approvals, passed = null) {
  const closed = passedBlock(kind, passed);
  const statusBlock = readinessStatusBlock(thesis, kind);
  const unmet = requirementsMet(requirements) ? null : "Syarat sistem belum terpenuhi.";
  return {
    requestBlockedReason:
      closed ??
      statusBlock ??
      unmet ??
      (!approvals.hasSupervisor
        ? "Tugas akhir belum memiliki pembimbing aktif."
        : approvals.isFullyApproved
          ? "Semua pembimbing sudah menyetujui."
          : null),
    approveBlockedReason: closed ?? statusBlock ?? unmet,
    revokeBlockedReason: closed,
  };
}

async function countCompletedResearchGuidances(thesisId) {
  return prisma.thesisGuidance.count({ where: { thesisId, ...TA_PHASE, status: "completed" } });
}

/**
 * Get thesis seminar readiness status
 */
export async function getThesisSeminarReadiness(thesisId, userId) {
  await getThesisWithAccess(thesisId, userId);

  const thesis = await milestoneRepo.getThesisSeminarReadiness(thesisId);
  if (!thesis) {
    throw notFound("Thesis tidak ditemukan");
  }

  const [progress, completedGuidancesCount, latestGuidanceAttachment] = await Promise.all([
    milestoneRepo.getThesisProgress(thesisId),
    countCompletedResearchGuidances(thesisId),
    milestoneRepo.findLatestGuidanceAttachment(thesisId),
  ]);

  const requirements = buildSeminarRequirements(progress, completedGuidancesCount);
  const approvals = readApprovals(thesis.thesisSupervisors, userId, "seminarReady");
  const allMet = requirementsMet(requirements);
  const passed = passedEventOf(thesis.thesisSeminars);
  const approvalDates = await readApprovalDates(thesisId, READINESS_KINDS.seminar.approvedAction);

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    thesisStatus: thesis.status ?? null,
    student: studentOf(thesis),
    requirements,
    requirementsMet: allMet,
    milestoneProgress: {
      total: progress.total,
      completed: progress.completed,
      percentComplete: progress.percentComplete,
      isComplete: progress.isComplete,
    },
    guidanceProgress: {
      completed: completedGuidancesCount,
      required: MIN_COMPLETED_GUIDANCES,
      isComplete: completedGuidancesCount >= MIN_COMPLETED_GUIDANCES,
    },
    seminarReadiness: {
      approvedBySupervisor1: approvals.approvedBySupervisor1,
      approvedBySupervisor2: approvals.approvedBySupervisor2,
      isFullyApproved: approvals.isFullyApproved,
    },
    supervisors: withApprovalDates(approvals.supervisors, approvalDates),
    currentUserRole: approvals.currentUserRole,
    currentUserHasApproved: approvals.currentUserHasApproved,
    latestGuidanceAttachment: latestGuidanceAttachment ?? null,
    // Passed seminar → read-only card ("Seminar hasil lulus pada …").
    isPassed: Boolean(passed),
    passedAt: passed?.passedAt ?? null,
    ...readinessActionReasons(thesis, "seminar", requirements, approvals, passed),
    canRegisterSeminar: !passed && allMet && approvals.isFullyApproved,
  };
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

  const latestGuidanceAttachment = await milestoneRepo.findLatestGuidanceAttachment(thesisId);
  const requirements = buildDefenceRequirements(thesis.thesisSeminars);
  const approvals = readApprovals(thesis.thesisSupervisors, userId, "defenceReady");
  const allMet = requirementsMet(requirements);
  const passed = passedEventOf(thesis.thesisDefences);
  const approvalDates = await readApprovalDates(thesisId, READINESS_KINDS.defence.approvedAction);

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    thesisStatus: thesis.status ?? null,
    student: studentOf(thesis),
    requirements,
    requirementsMet: allMet,
    defenceReadiness: {
      approvedBySupervisor1: approvals.approvedBySupervisor1,
      approvedBySupervisor2: approvals.approvedBySupervisor2,
      isFullyApproved: approvals.isFullyApproved,
    },
    supervisors: withApprovalDates(approvals.supervisors, approvalDates),
    currentUserRole: approvals.currentUserRole,
    currentUserHasApproved: approvals.currentUserHasApproved,
    latestGuidanceAttachment: latestGuidanceAttachment ?? null,
    // Passed defence → read-only card; before the seminar passes the card
    // only shows the unmet requirement ("Menunggu seminar hasil lulus").
    isPassed: Boolean(passed),
    passedAt: passed?.passedAt ?? null,
    seminarPassed: Boolean(passedEventOf(thesis.thesisSeminars)),
    ...readinessActionReasons(thesis, "defence", requirements, approvals, passed),
    canRegisterDefence: !passed && allMet && approvals.isFullyApproved,
  };
}

/** System requirements of one readiness kind, read fresh from the database. */
async function loadRequirements(kind, thesisId) {
  if (kind === "seminar") {
    const [progress, completedGuidancesCount] = await Promise.all([
      milestoneRepo.getThesisProgress(thesisId),
      countCompletedResearchGuidances(thesisId),
    ]);
    return buildSeminarRequirements(progress, completedGuidancesCount);
  }
  const thesis = await milestoneRepo.getThesisDefenceReadiness(thesisId);
  return buildDefenceRequirements(thesis?.thesisSeminars);
}

function findOwnSupervisorRelation(thesis, userId) {
  return thesis.thesisSupervisors.find(
    (p) => p.lecturer?.user?.id === userId && isMainSupervisorRole(p.role?.name)
  );
}

async function notifyUsers(userIds, { title, message, data }) {
  for (const targetUserId of userIds) {
    await createNotification({ userId: targetUserId, title, message });
  }
  sendFcmToUsers(userIds, { title, body: message, data }).catch((err) =>
    console.error("[FCM] Error sending readiness notification:", err)
  );
}

async function approveReadiness(kind, thesisId, userId, notes) {
  const config = READINESS_KINDS[kind];
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat memberikan approval");
  }
  const relation = findOwnSupervisorRelation(thesis, userId);
  if (!relation) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const closed = passedBlock(kind, await loadPassedEvent(kind, thesisId));
  if (closed) throw createError(closed);

  const statusBlock = readinessStatusBlock(thesis, kind);
  if (statusBlock) throw createError(statusBlock);

  const requirements = await loadRequirements(kind, thesisId);
  if (!requirementsMet(requirements)) {
    throw createError(
      `Mahasiswa belum memenuhi syarat ${config.noun}: ${describeUnmet(requirements)}.`
    );
  }

  const roleLabel = supervisorLabel(relation.role?.name);
  const supervisorName = relation.lecturer?.user?.fullName || roleLabel;
  const updated = await config.approve(thesisId, relation.lecturerId);
  const main = updated.thesisSupervisors.filter((s) => isMainSupervisorRole(s.role?.name));
  const isFullyApproved = main.length > 0 && main.every((s) => s[config.flag]);

  // "Acc Seminar"/"Acc Sidang" is not a thesis status; readiness lives in the
  // supervisors' flags and the thesis stays `research`.
  const studentUserId = thesis.student?.user?.id;
  if (studentUserId) {
    await notifyUsers([studentUserId], {
      title: isFullyApproved
        ? `🎉 Kesiapan ${config.title} Disetujui Penuh!`
        : `✅ Persetujuan ${config.title} dari ${roleLabel}`,
      message: isFullyApproved
        ? `Selamat! Semua pembimbing telah menyetujui kesiapan ${config.noun} Anda. Anda sekarang dapat mendaftar ${config.noun}.`
        : `${supervisorName} telah menyetujui kesiapan ${config.noun} Anda. Menunggu persetujuan dari pembimbing lainnya.`,
      data: { type: `${kind}_readiness_approved`, thesisId, isFullyApproved: String(isFullyApproved) },
    });
  }

  await logAudit({
    actorUserId: userId,
    action: config.approvedAction,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isPembimbing1(relation.role?.name) ? "pembimbing_1" : "pembimbing_2", isFullyApproved, notes },
  });

  return {
    success: true,
    message: `Approval dari ${roleLabel} berhasil diberikan`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: !!updated.thesisSupervisors.find((s) => isPembimbing1(s.role?.name))?.[config.flag],
      approvedBySupervisor2: !!updated.thesisSupervisors.find((s) => isPembimbing2(s.role?.name))?.[config.flag],
      isFullyApproved,
    },
  };
}

async function revokeReadiness(kind, thesisId, userId, notes) {
  const config = READINESS_KINDS[kind];
  const { thesis, isSupervisor } = await getThesisWithAccess(thesisId, userId);

  if (!isSupervisor) {
    throw forbidden("Hanya dosen pembimbing yang dapat mencabut approval");
  }
  const relation = findOwnSupervisorRelation(thesis, userId);
  if (!relation) {
    throw forbidden("Anda bukan pembimbing dari thesis ini");
  }

  const closed = passedBlock(kind, await loadPassedEvent(kind, thesisId));
  if (closed) throw createError(closed);

  const roleLabel = supervisorLabel(relation.role?.name);
  const supervisorName = relation.lecturer?.user?.fullName || roleLabel;
  const updated = await config.revoke(thesisId, relation.lecturerId);

  const studentUserId = thesis.student?.user?.id;
  if (studentUserId) {
    await notifyUsers([studentUserId], {
      title: `⚠️ Persetujuan ${config.title} Dibatalkan`,
      message: `${supervisorName} telah membatalkan persetujuan kesiapan ${config.noun} Anda.${notes ? ` Alasan: ${notes}` : ""}`,
      data: { type: `${kind}_readiness_revoked`, thesisId },
    });
  }

  await logAudit({
    actorUserId: userId,
    action: config.revokedAction,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { supervisorRole: isPembimbing1(relation.role?.name) ? "pembimbing_1" : "pembimbing_2", notes },
  });

  return {
    success: true,
    message: `Approval dari ${roleLabel} berhasil dicabut`,
    data: {
      thesisId: updated.id,
      thesisTitle: updated.title,
      approvedBySupervisor1: !!updated.thesisSupervisors.find((s) => isPembimbing1(s.role?.name))?.[config.flag],
      approvedBySupervisor2: !!updated.thesisSupervisors.find((s) => isPembimbing2(s.role?.name))?.[config.flag],
      isFullyApproved: false,
    },
  };
}

/**
 * "Minta Persetujuan": the student asks the supervisors who have not approved yet. Only a
 * notification is sent; nothing is uploaded and no flag changes.
 */
async function requestReadinessApproval(kind, thesisId, userId) {
  const config = READINESS_KINDS[kind];
  // Only the owning student may ask (route guard: MAHASISWA).
  const { thesis } = await getThesisWithAccess(thesisId, userId, true);

  const closed = passedBlock(kind, await loadPassedEvent(kind, thesisId));
  if (closed) throw createError(closed);

  const statusBlock = readinessStatusBlock(thesis, kind);
  if (statusBlock) throw createError(statusBlock);

  const requirements = await loadRequirements(kind, thesisId);
  if (!requirementsMet(requirements)) {
    throw createError(
      `Persetujuan ${config.noun} belum dapat diminta. Syarat yang belum terpenuhi: ${describeUnmet(requirements)}.`
    );
  }

  const main = thesis.thesisSupervisors.filter((p) => isMainSupervisorRole(p.role?.name));
  if (main.length === 0) {
    throw createError("Tugas akhir belum memiliki pembimbing aktif.");
  }
  const pending = main.filter((p) => !p[config.flag]);
  if (pending.length === 0) {
    throw createError(`Semua pembimbing sudah menyetujui kesiapan ${config.noun}.`);
  }

  const supervisorUserIds = pending.map((p) => p.lecturer?.user?.id).filter(Boolean);
  const studentName = thesis.student?.user?.fullName || "Mahasiswa";
  if (supervisorUserIds.length > 0) {
    await notifyUsers(supervisorUserIds, {
      title: `🔔 Permintaan Persetujuan ${config.title}`,
      message: `${studentName} meminta persetujuan kesiapan ${config.noun}. Syarat sistem sudah terpenuhi.`,
      data: { type: `${kind}_readiness_requested`, thesisId },
    });
  }

  await logAudit({
    actorUserId: userId,
    action: config.requestedAction,
    entityType: ENTITY_TYPES.THESIS,
    entityId: thesisId,
    newValues: { notifiedSupervisors: pending.map((p) => p.lecturerId) },
  });

  return {
    success: true,
    message: "Permintaan persetujuan berhasil dikirim ke pembimbing.",
    data: { thesisId, notifiedSupervisors: pending.length },
  };
}

export const approveSeminarReadiness = (thesisId, userId, notes = null) => approveReadiness("seminar", thesisId, userId, notes);
export const revokeSeminarReadiness = (thesisId, userId, notes = null) => revokeReadiness("seminar", thesisId, userId, notes);
export const requestSeminarApproval = (thesisId, userId) => requestReadinessApproval("seminar", thesisId, userId);
export const approveDefenceReadiness = (thesisId, userId, notes = null) => approveReadiness("defence", thesisId, userId, notes);
export const revokeDefenceReadiness = (thesisId, userId, notes = null) => revokeReadiness("defence", thesisId, userId, notes);
export const requestDefenceApproval = (thesisId, userId) => requestReadinessApproval("defence", thesisId, userId);

function mapReadyThesis(t, flag) {
  return {
    thesisId: t.id,
    thesisTitle: t.title,
    student: {
      name: t.student?.user?.fullName,
      nim: t.student?.user?.identityNumber,
      email: t.student?.user?.email,
    },
    supervisors: t.thesisSupervisors.map((p) => ({
      name: p.lecturer?.user?.fullName,
      role: p.role?.name,
      [flag]: p[flag] || false,
    })),
  };
}

/**
 * Get list of students ready for seminar registration
 */
export async function getStudentsReadyForSeminar() {
  const theses = await milestoneRepo.findStudentsReadyForSeminar();
  return theses.map((t) => mapReadyThesis(t, "seminarReady"));
}

/**
 * Get list of students ready for defence registration
 */
export async function getStudentsReadyForDefence() {
  const theses = await milestoneRepo.findStudentsReadyForDefence();
  return theses.map((t) => mapReadyThesis(t, "defenceReady"));
}

/**
 * Get all pending_review milestones across all theses supervised by this user.
 * Uses a single DB query instead of N+1 client-side aggregation.
 */
export async function getPendingReviewForSupervisor(userId) {
  const milestones = await milestoneRepo.findPendingReviewBySupervisor(userId);

  // Filter only milestones where this user is Pembimbing 1
  const filteredMilestones = milestones.filter((m) => {
    const userSupervisor = m.thesis?.thesisSupervisors?.find(
      (p) => p.lecturer?.user?.id === userId
    );
    return isPembimbing1(userSupervisor?.role?.name);
  });

  return filteredMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    progressPercentage: m.progressPercentage,
    status: m.status,
    studentNotes: m.studentNotes,
    targetDate: m.targetDate,
    updatedAt: m.updatedAt,
    thesisId: m.thesis?.id,
    thesisTitle: m.thesis?.title ?? "-",
    studentName: m.thesis?.student?.user?.fullName ?? "-",
    studentNim: m.thesis?.student?.user?.identityNumber ?? "",
  }));
}
