import fs from "fs";
import path from "path";
import * as repo from "../repositories/metopen.repository.js";
import * as ta04BatchRepo from "../repositories/ta04Batch.repository.js";
import prisma from "../config/prisma.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { ENV } from "../config/env.js";
import { THESIS_STATUS, CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";
import { generateTA04Pdf } from "../utils/ta04.pdf.js";
import {
  ADVISOR_REQUEST_STATUS,
  ADVISOR_REQUEST_BOOKING_STATUSES,
  ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
} from "../constants/advisorRequestStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { syncLecturerQuotaCurrentCount } from "./advisorQuota.service.js";
import { resolveMetopenEligibilityState } from "./metopenEligibility.service.js";
import { createNotificationsForUsers } from "./notification.service.js";
import { sendFcmToUsers } from "./push.service.js";

// ============================================
// Phase Guard Helper
// ============================================

/**
 * Assert that the authenticated student is still in the Metopen phase.
 * Throws ForbiddenError if thesis status has already moved past "Metopel".
 * Used to block write operations from students who are now in the TA phase.
 */
async function assertMetopelWriteAccess(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    throw new ForbiddenError(
      "Data Tugas Akhir Anda belum tersedia. Silakan mulai alur TA-01 melalui pengajuan pembimbing."
    );
  }

  if (thesis.proposalStatus !== "accepted") {
    return thesis;
  }

  throw new ForbiddenError(
    "Anda sudah melewati fase Metode Penelitian. Halaman Metopen hanya dapat dilihat sebagai arsip."
  );
}

// ============================================
// Template Services
// ============================================

/**
 * Get all metopen templates
 */
export async function getTemplates({ isActive, topicId } = {}) {
  let activeFilter = null;
  if (isActive === "true") activeFilter = true;
  else if (isActive === "false") activeFilter = false;

  return repo.findAllTemplates({ isActive: activeFilter, topicId });
}

/**
 * Get template by ID
 */
export async function getTemplateById(templateId) {
  const template = await repo.findTemplateById(templateId);
  if (!template) throw new NotFoundError("Template tidak ditemukan");
  return template;
}

/**
 * Create a new metopen template
 */
export async function createTemplate(data) {
  const maxOrder = await repo.getMaxTemplateOrderIndex(data.topicId);

  const templateData = {
    name: data.name,
    description: data.description || null,
    topicId: data.topicId || null,
    phase: "metopen",
    orderIndex: data.orderIndex ?? maxOrder + 1,
    isActive: data.isActive ?? true,
    defaultDueDays: data.defaultDueDays ?? null,
    defaultDueDate: data.defaultDueDate ? new Date(data.defaultDueDate) : null,
    weightPercentage: data.weightPercentage ?? null,
    requiresAdvisor: data.requiresAdvisor ?? false,
  };

  return repo.createTemplate(templateData);
}

/**
 * Update metopen template
 */
export async function updateTemplate(templateId, data) {
  const existing = await repo.findTemplateById(templateId);
  if (!existing) throw new NotFoundError("Template tidak ditemukan");

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.topicId !== undefined) updateData.topicId = data.topicId;
  if (data.orderIndex !== undefined) updateData.orderIndex = data.orderIndex;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.defaultDueDays !== undefined) updateData.defaultDueDays = data.defaultDueDays;
  if (data.defaultDueDate !== undefined) updateData.defaultDueDate = data.defaultDueDate ? new Date(data.defaultDueDate) : null;
  if (data.weightPercentage !== undefined) updateData.weightPercentage = data.weightPercentage;
  if (data.requiresAdvisor !== undefined) updateData.requiresAdvisor = data.requiresAdvisor;

  return repo.updateTemplate(templateId, updateData);
}

/**
 * Delete metopen template
 */
export async function deleteTemplate(templateId) {
  const existing = await repo.findTemplateById(templateId);
  if (!existing) throw new NotFoundError("Template tidak ditemukan");

  // Check if template has active milestones
  const hasActiveMilestones = await repo.countActiveMilestones(templateId);

  if (hasActiveMilestones > 0) {
    // Soft-delete: just deactivate
    return repo.updateTemplate(templateId, { isActive: false });
  }

  await repo.deleteTemplate(templateId);
  return { deleted: true };
}

/**
 * Reorder templates by array of {id, orderIndex}
 */
export async function reorderTemplates(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new BadRequestError("Minimal satu item untuk reorder");
  }
  await repo.reorderTemplates(orders);
}

// ============================================
// Template Attachments
// ============================================

const MAX_TEMPLATE_ATTACHMENTS = 10;

/**
 * Upload a file and attach it to a template.
 * Creates a Document record + MilestoneTemplateAttachment link.
 * Max 10 attachments per template.
 */
export async function addAttachment(templateId, file, userId) {
  const template = await repo.findTemplateById(templateId);
  if (!template) throw new NotFoundError("Template tidak ditemukan");

  if (!file) throw new BadRequestError("File tidak ditemukan");

  const currentCount = template.attachments?.length ?? 0;
  if (currentCount >= MAX_TEMPLATE_ATTACHMENTS) {
    throw new BadRequestError(`Maksimal ${MAX_TEMPLATE_ATTACHMENTS} lampiran per template`);
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "metopen", "templates", templateId);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uniqueId = Date.now().toString(36);
  const fileName = `${uniqueId}-${file.originalname}`;
  const relativeFilePath = `uploads/metopen/templates/${templateId}/${fileName}`;
  const filePath = path.join(uploadsDir, fileName);

  fs.writeFileSync(filePath, file.buffer);

  const document = await repo.createDocument({
    userId,
    fileName: file.originalname,
    filePath: relativeFilePath,
  });

  return repo.addTemplateAttachment(templateId, document.id);
}

/**
 * Upload multiple files and attach to a template. Max 10 total per template.
 */
export async function addAttachmentsBatch(templateId, files, userId) {
  const template = await repo.findTemplateById(templateId);
  if (!template) throw new NotFoundError("Template tidak ditemukan");

  const fileList = Array.isArray(files) ? files : [];
  if (fileList.length === 0) throw new BadRequestError("Tidak ada file yang diunggah");

  const currentCount = template.attachments?.length ?? 0;
  const totalAfter = currentCount + fileList.length;
  if (totalAfter > MAX_TEMPLATE_ATTACHMENTS) {
    throw new BadRequestError(
      `Maksimal ${MAX_TEMPLATE_ATTACHMENTS} lampiran per template. Saat ini ada ${currentCount}, dapat menambah ${Math.max(0, MAX_TEMPLATE_ATTACHMENTS - currentCount)} lagi.`
    );
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "metopen", "templates", templateId);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const results = [];
  for (const file of fileList) {
    const uniqueId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const fileName = `${uniqueId}-${file.originalname}`;
    const relativeFilePath = `uploads/metopen/templates/${templateId}/${fileName}`;
    const filePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    const document = await repo.createDocument({
      userId,
      fileName: file.originalname,
      filePath: relativeFilePath,
    });

    const attachment = await repo.addTemplateAttachment(templateId, document.id);
    results.push(attachment);
  }

  return results;
}

/**
 * Remove attachment from template.
 */
export async function removeAttachment(attachmentId) {
  try {
    return await repo.removeTemplateAttachment(attachmentId);
  } catch {
    throw new NotFoundError("Attachment tidak ditemukan");
  }
}

/**
 * Get all attachments for a template.
 */
export async function getAttachments(templateId) {
  return repo.findTemplateAttachments(templateId);
}

// ============================================
// Publish Stats (Per-Template Per-Academic-Year Overview)
// ============================================

/**
 * Get publish status per template for active proposal cohorts.
 * Class-based Metopen orchestration has been removed; rows are grouped by academic year.
 */
export async function getPublishStats() {
  const milestones = await repo.findPublishStats();

  const statsMap = new Map();

  for (const m of milestones) {
    const templateId = m.milestoneTemplateId;
    const student = m.thesis?.student;
    const academicYear = m.thesis?.academicYear ?? null;
    const scopeId = academicYear?.id ?? "no-academic-year";
    const scopeName = academicYear
      ? `${academicYear.year ?? "-"} ${academicYear.semester === "genap" ? "Genap" : "Ganjil"}`
      : "Semua Proposal Aktif";

    const key = `${templateId}__${scopeId}`;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        templateId,
        scopeId,
        scopeName,
        academicYearId: academicYear?.id ?? null,
        academicYear,
        classId: null,
        className: null,
        deadline: null,
        total: 0,
        submitted: 0,
        completed: 0,
        late: 0,
        notStarted: 0,
        inProgress: 0,
        pendingReview: 0,
        students: [],
      });
    }

    const stat = statsMap.get(key);
    stat.total++;

    if (m.targetDate && !stat.deadline) {
      stat.deadline = m.targetDate;
    }

    // Count statuses
    if (m.status === "completed") stat.completed++;
    else if (m.status === "pending_review") stat.pendingReview++;
    else if (m.status === "in_progress") stat.inProgress++;
    else if (m.status === "not_started") stat.notStarted++;

    if (m.submittedAt) stat.submitted++;
    // Compute isLate dynamically
    const isLate = m.submittedAt && m.targetDate && new Date(m.submittedAt) > new Date(m.targetDate);
    if (isLate) stat.late++;

    stat.students.push({
      studentId: m.thesis?.studentId,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      status: m.status,
      submittedAt: m.submittedAt,
      isLate: !!isLate,
      targetDate: m.targetDate,
    });
  }

  return Array.from(statsMap.values());
}

// ============================================
// Student Task Services
// ============================================

/**
 * Compute latent "submitted late" flag: submittedAt > targetDate.
 */
function computeSubmittedLate(task) {
  if (!task?.targetDate || !task?.submittedAt) return false;
  return new Date(task.submittedAt) > new Date(task.targetDate);
}

/**
 * Get current student's metopen tasks
 */
export async function getMyTasks(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return { thesisId: null, tasks: [], progress: 0, gateOpen: false };
  }

  const tasks = await repo.findTasksByThesisId(thesis.id);
  const { total, completed } = await repo.getThesisMetopenProgress(thesis.id);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Gate: check if all gate milestones are completed
  const gateOpen = checkGateOpen(tasks);

  const tasksWithLate = tasks.map((t) => ({
    ...t,
    submittedLate: computeSubmittedLate(t),
  }));

  return { thesisId: thesis.id, tasks: tasksWithLate, progress, gateOpen };
}

/**
 * Get task detail
 */
export async function getTaskDetail(milestoneId, userId) {
  const task = await repo.findTaskById(milestoneId);
  if (!task) throw new NotFoundError("Tugas tidak ditemukan");

  // Access check: must be thesis owner or a lecturer
  const thesis = task.thesis;
  const isOwner = thesis?.student?.user?.id === userId;

  // Check if user is a lecturer
  const lecturer = await repo.findLecturerByUserId(userId);
  if (!isOwner && !lecturer) {
    throw new ForbiddenError("Anda tidak memiliki akses ke tugas ini");
  }

  return {
    ...task,
    submittedLate: computeSubmittedLate(task),
  };
}

/**
 * Get submission file for streaming (access-checked).
 * Returns { absolutePath, fileName, mimeType } for the route to send.
 */
export async function getSubmissionFileForStream(documentId, userId) {
  const doc = await repo.findMilestoneDocumentById(documentId);
  if (!doc) throw new NotFoundError("Dokumen tidak ditemukan");

  const thesis = doc.milestone?.thesis;
  const isOwner = thesis?.student?.user?.id === userId;
  const lecturer = await repo.findLecturerByUserId(userId);
  if (!isOwner && !lecturer) {
    throw new ForbiddenError("Anda tidak memiliki akses ke dokumen ini");
  }

  const filePath = doc.filePath;
  if (!filePath) throw new NotFoundError("Berkas tidak tersedia");

  const absolutePath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError("Berkas tidak ditemukan di server");
  }

  return {
    absolutePath,
    fileName: doc.fileName || "document",
    mimeType: doc.mimeType || null,
  };
}

/**
 * Submit a task (student submits work)
 */
export async function submitTask(milestoneId, userId, data) {
  // Phase guard: students who have moved past Metopel cannot submit new work
  await assertMetopelWriteAccess(userId);

  const task = await repo.findTaskById(milestoneId);
  if (!task) throw new NotFoundError("Tugas tidak ditemukan");

  // Only the thesis owner can submit
  const isOwner = task.thesis?.student?.user?.id === userId;
  if (!isOwner) {
    throw new ForbiddenError("Hanya mahasiswa pemilik tugas yang dapat mengirim");
  }

  if (task.status === "completed") {
    throw new BadRequestError("Tugas sudah selesai dinilai");
  }

  // BR-08: Block submission for tasks requiring an advisor
  if (task.milestoneTemplate?.requiresAdvisor) {
    const supervisorCount = await repo.countSupervisorsForThesis(
      task.thesisId,
      [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]
    );
    if (supervisorCount === 0) {
      throw new ForbiddenError(
        "Tugas ini membutuhkan dosen pembimbing. Silakan cari dan dapatkan dosen pembimbing terlebih dahulu."
      );
    }
  }

  const now = new Date();
  const files = Array.isArray(data.files) ? data.files : data.file ? [data.file] : [];

  // Parse removeDocIds (sent as JSON string from FormData)
  let removeDocIds = data.removeDocIds;
  if (typeof removeDocIds === "string") {
    try { removeDocIds = JSON.parse(removeDocIds); } catch { removeDocIds = []; }
  }
  if (!Array.isArray(removeDocIds)) removeDocIds = [];

  const existingLatest = await repo.findLatestDocumentsByMilestoneId(milestoneId);
  const isEditMode = task.status === "pending_review" && existingLatest.length > 0;

  const keptCount = isEditMode ? existingLatest.length - removeDocIds.length : 0;
  if (keptCount + files.length > 10) {
    throw new BadRequestError("Maksimal 10 dokumen per pengumpulan");
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "metopen", "submissions", milestoneId);

  if (isEditMode) {
    const currentVersion = existingLatest[0]?.version ?? 1;

    // Validate and remove specified documents
    if (removeDocIds.length > 0) {
      const docsToRemove = await repo.findMilestoneDocumentsByIds(removeDocIds);
      for (const doc of docsToRemove) {
        if (doc.milestoneId !== milestoneId || !doc.isLatest) continue;
        await repo.updateMilestoneDocument(doc.id, { isLatest: false });
        if (doc.filePath) {
          const absolutePath = path.join(process.cwd(), doc.filePath);
          if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        }
      }
    }

    // Append new files (same version, no positional replacement)
    if (files.length > 0) {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uniqueId = `${Date.now().toString(36)}-${i}`;
        const fileName = `${uniqueId}-${file.originalname}`;
        const relativeFilePath = `uploads/metopen/submissions/${milestoneId}/${fileName}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        await repo.createMilestoneDocument({
          milestoneId,
          fileName: file.originalname,
          filePath: relativeFilePath,
          fileSize: file.size,
          mimeType: file.mimetype,
          isLatest: true,
          version: currentVersion,
        });
      }
    }
  } else if (files.length > 0) {
    // First submit or revision: create new version
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    await repo.markPreviousDocumentsNotLatest(milestoneId);
    const nextVersion = (await repo.countMilestoneDocuments(milestoneId)) + 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueId = `${Date.now().toString(36)}-${i}`;
      const fileName = `${uniqueId}-${file.originalname}`;
      const relativeFilePath = `uploads/metopen/submissions/${milestoneId}/${fileName}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, file.buffer);

      await repo.createMilestoneDocument({
        milestoneId,
        fileName: file.originalname,
        filePath: relativeFilePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        isLatest: true,
        version: nextVersion,
      });
    }
  }

  // Link guidance sessions if provided (FR-MHS-05: Tautkan Bukti Bimbingan)
  let rawGuidanceIds = data.guidanceIds;
  if (typeof rawGuidanceIds === "string") {
    try { rawGuidanceIds = JSON.parse(rawGuidanceIds); } catch { rawGuidanceIds = []; }
  }
  const guidanceIds = Array.isArray(rawGuidanceIds) ? rawGuidanceIds : [];
  if (guidanceIds.length > 0) {
    const validGuidances = await repo.findCompletedGuidances(task.thesisId, guidanceIds);

    if (validGuidances.length !== guidanceIds.length) {
      throw new BadRequestError(
        "Beberapa sesi bimbingan tidak valid atau belum disetujui dosen."
      );
    }

    // Remove existing links for this milestone, then create new ones
    await repo.deleteGuidanceMilestoneLinks(milestoneId);

    if (validGuidances.length > 0) {
      await repo.createGuidanceMilestoneLinks(
        validGuidances.map((g) => ({ guidanceId: g.id, milestoneId }))
      );
    }
  }

  const updateData = {
    status: "pending_review",
    submittedAt: now,
    studentNotes: data.notes || task.studentNotes,
    progressPercentage: 100,
  };

  return repo.updateTask(milestoneId, updateData);
}

/**
 * Get completed guidance sessions for the student's thesis (for linking to milestones)
 */
export async function getMyCompletedGuidances(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) return [];

  return repo.findCompletedGuidancesForThesis(thesis.id);
}

/**
 * Get guidance sessions linked to a specific milestone
 */
export async function getLinkedGuidances(milestoneId) {
  const links = await repo.findLinkedGuidances(milestoneId);
  /* Original inline query replaced. Shape preserved via repo function. */
  return links.map((l) => l.guidance).filter(Boolean);
}

/**
 * Get student's gate status
 */
export async function getMyGateStatus(userId) {
  void userId;

  return {
    gateOpen: true,
    reason: "Gate milestone Metopen sudah dihapus dari scope aktif SIMPTA.",
    gates: [],
  };
}

// ============================================
// Grading Services (Koordinator Matkul Metopen)
// ============================================

/**
 * Get metopen progress for students supervised by the authenticated lecturer (FR-PGP-04)
 */
export async function getMySupervisedProgress(lecturerId) {
  const supervisedTheses = await repo.findSupervisedThesesByLecturer(lecturerId);

  return supervisedTheses.map((s) => ({
    thesisId: s.thesis.id,
    thesisTitle: s.thesis.title,
    studentName: s.thesis.student?.user?.fullName,
    studentNim: s.thesis.student?.user?.identityNumber,
    supervisorRole: s.role?.name,
    milestones: s.thesis.thesisMilestones,
    score: s.thesis.researchMethodScores?.[0] ?? null,
  }));
}

/**
 * Get grading queue
 */
export async function getGradingQueue(status = null) {
  const milestones = await repo.findGradingQueue(status);

  return milestones.map((m) => ({
    id: m.id,
    thesisId: m.thesis?.id,
    title: m.title,
    description: m.description,
    orderIndex: m.orderIndex,
    targetDate: m.targetDate,
    startedAt: m.startedAt,
    completedAt: m.completedAt,
    status: m.status,
    progressPercentage: m.progressPercentage,
    studentNotes: m.studentNotes,
    supervisorNotes: m.supervisorNotes,
    feedback: m.feedback,
    submittedAt: m.submittedAt,
    assessedBy: m.assessedBy,
    assessedAt: m.assessedAt,
    totalScore: m.totalScore,
    isLate: !!(m.submittedAt && m.targetDate && new Date(m.submittedAt) > new Date(m.targetDate)),
    milestoneTemplateId: m.milestoneTemplateId,
    academicYearId: m.thesis?.academicYear?.id ?? null,
    academicYearLabel: m.thesis?.academicYear
      ? `${m.thesis.academicYear.year ?? "-"} ${m.thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"}`
      : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    milestoneTemplate: m.milestoneTemplate,
    milestoneDocuments: m.milestoneDocuments,
    assessmentDetails: m.assessmentDetails,
    studentName: m.thesis?.student?.user?.fullName ?? null,
    studentNim: m.thesis?.student?.user?.identityNumber ?? null,
    templateName: m.milestoneTemplate?.name ?? null,
  }));
}

/**
 * Grade a milestone (by dosen metopen)
 */
export async function gradeMilestone(milestoneId, userId, data) {
  const task = await repo.findTaskById(milestoneId);
  if (!task) throw new NotFoundError("Tugas tidak ditemukan");

  if (task.status !== "pending_review") {
    throw new BadRequestError("Tugas belum di-submit atau sudah dinilai");
  }

  const lecturer = await repo.findLecturerByUserId(userId);
  if (!lecturer) {
    throw new ForbiddenError("Hanya dosen yang dapat menilai tugas");
  }

  const now = new Date();

  // BR-09: Formative tasks (no weight) get feedback only; summative tasks require a score
  const weight = task.milestoneTemplate?.weightPercentage;
  const isFormative = !weight || weight === 0;

  const updateData = {
    status: data.status === "revision_needed" ? "revision_needed" : "completed",
    feedback: data.feedback || null,
    assessedBy: userId,
    assessedAt: now,
    completedAt: data.status === "revision_needed" ? null : now,
  };

  if (isFormative) {
    updateData.totalScore = null;
  } else {
    if (data.score == null) {
      throw new BadRequestError("Skor wajib diisi untuk tugas bernilai (summative)");
    }
    updateData.totalScore = data.score;
  }

  const updated = await repo.updateTask(milestoneId, updateData);

  if (data.rubricId && !isFormative) {
    await repo.createAssessmentDetail({
      milestoneId,
      lecturerId: lecturer.id,
      rubricId: data.rubricId,
      score: data.score,
      notes: data.feedback || null,
      assessedAt: now,
    });
  }

  if (updateData.status === "completed" && task.thesisId) {
    syncKadepProposalQueueByThesisId(task.thesisId).catch(() => {});
  }

  return updated;
}

// ============================================
// Progress & Gate Services
// ============================================

export async function getProgress(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      proposalStatus: true,
      finalProposalVersionId: true,
      student: {
        select: {
          takingThesisCourse: true,
        },
      },
      thesisSupervisors: {
        where: {
          status: "active",
          role: {
            is: {
              name: {
                in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
              },
            },
          },
        },
        select: { id: true },
      },
      researchMethodScores: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          supervisorScore: true,
          lecturerScore: true,
          finalScore: true,
          isFinalized: true,
        },
      },
    },
  });

  if (!thesis) {
    throw new NotFoundError("Thesis tidak ditemukan");
  }

  const score = thesis.researchMethodScores?.[0] ?? null;
  const hasSupervisor = thesis.thesisSupervisors.length > 0;
  const hasFinalProposal = !!thesis.finalProposalVersionId;
  const supervisorScored = score?.supervisorScore != null;
  const lecturerScored = score?.lecturerScore != null;
  const proposalAssessmentComplete = supervisorScored && lecturerScored;
  const takingThesisCourse = thesis.student?.takingThesisCourse === true;

  const milestones = [
    {
      id: "advisor-search",
      title: "Pencarian dosen pembimbing",
      status: hasSupervisor ? "completed" : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "final-proposal",
      title: "Submit proposal final",
      status: hasFinalProposal ? "completed" : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "proposal-assessment",
      title: "Penilaian proposal TA-03A / TA-03B",
      status: proposalAssessmentComplete
        ? "completed"
        : supervisorScored || lecturerScored
          ? "in_progress"
          : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "ta-course-and-ta04",
      title: "Konfirmasi ambil mata kuliah TA dan terbit TA-04",
      status:
        thesis.proposalStatus === "accepted"
          ? "completed"
          : thesis.proposalStatus === "submitted" || takingThesisCourse
            ? "in_progress"
            : "not_started",
      weight: 25,
      isGate: false,
    },
  ];

  const total = milestones.length;
  const completed = milestones.filter((item) => item.status === "completed").length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    progress,
    totalTasks: total,
    completedTasks: completed,
    gateOpen: true,
    milestones,
  };
}

const METOPEN_PROGRESS_STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.KOORDINATOR_METOPEN,
  ROLES.GKM,
];

/**
 * Progress Metopen per thesis: pemilik TA, pembimbing, atau staf Metopen/departemen.
 */
export async function getProgressWithAccess(thesisId, userId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, studentId: true },
  });
  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  if (thesis.studentId === userId) {
    return getProgress(thesisId);
  }

  const isSupervisor = await prisma.thesisSupervisors.findFirst({
    where: { thesisId, lecturerId: userId },
    select: { id: true },
  });
  if (isSupervisor) {
    return getProgress(thesisId);
  }

  const staffHit = await prisma.userHasRole.findFirst({
    where: {
      userId,
      status: "active",
      role: { name: { in: METOPEN_PROGRESS_STAFF_ROLES } },
    },
    select: { userId: true },
  });
  if (staffHit) {
    return getProgress(thesisId);
  }

  throw new ForbiddenError("Anda tidak memiliki akses ke progress Metopen untuk thesis ini");
}

export async function getGateStatus(thesisId) {
  void thesisId;
  return { gateOpen: true, gates: [] };
}

// ============================================
// Proposal Version History (Audit Trail)
// ============================================

/**
 * Get all proposal document versions for a thesis.
 * Access: thesis owner, dosen pembimbing, or Koordinator Metopen.
 * The route already has auth middleware; this adds resource-level access control.
 */
export async function getProposalVersionHistory(thesisId, userId) {
  // Fetch thesis with student info
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, studentId: true },
  });
  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  // Access check: thesis owner (student)
  const isOwner = thesis.studentId === userId;

  // Access check: dosen pembimbing (supervisor of this thesis)
  let isSupervisor = false;
  if (!isOwner) {
    const supervisorRecord = await prisma.thesisSupervisors.findFirst({
      where: { thesisId, lecturerId: userId },
    });
    isSupervisor = !!supervisorRecord;
  }

  // Access check: Koordinator Metopen — the route already has role guard,
  // so if someone reaches here and is a lecturer, allow access.
  let isLecturer = false;
  if (!isOwner && !isSupervisor) {
    const lecturer = await prisma.lecturer.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    isLecturer = !!lecturer;
  }

  if (!isOwner && !isSupervisor && !isLecturer) {
    throw new ForbiddenError("Anda tidak memiliki akses ke riwayat proposal ini");
  }

  const versions = await prisma.thesisProposalVersion.findMany({
    where: { thesisId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      description: true,
      isLatest: true,
      submittedAsFinalAt: true,
      createdAt: true,
      document: {
        select: {
          filePath: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  });

  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    fileName: v.document?.fileName ?? null,
    filePath: v.document?.filePath ?? null,
    fileSize: v.document?.fileSize ?? null,
    mimeType: v.document?.mimeType ?? null,
    isLatest: v.isLatest,
    description: v.description,
    uploadedAt: v.createdAt,
    submittedAsFinalAt: v.submittedAsFinalAt ?? null,
    milestoneId: null,
    milestoneTitle: null,
    milestoneStatus: null,
    templateName: null,
    url: v.document?.filePath
      ? v.document.filePath.startsWith("uploads/")
        ? `/${v.document.filePath}`
        : `/uploads/${v.document.filePath}`
      : null,
  }));
}

// ============================================
// Monitoring
// ============================================

export async function getMonitoringSummary(academicYearId = null) {
  const activeAcademicYear = academicYearId ? null : await getActiveAcademicYear();
  const resolvedAcademicYearId = academicYearId || activeAcademicYear?.id || null;
  if (!resolvedAcademicYearId) {
    throw new BadRequestError("Tidak ada tahun ajaran aktif");
  }
  const theses = await repo.findAllMetopenTheses(resolvedAcademicYearId);

  const students = theses.map((thesis) => {
    const milestones = thesis.thesisMilestones;
    const total = milestones.length;
    const completed = milestones.filter((m) => m.status === "completed").length;
    const pendingReview = milestones.filter((m) => m.status === "pending_review").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const gateOpen = checkGateOpen(milestones);

    return {
      thesisId: thesis.id,
      studentId: thesis.student?.user?.id ?? thesis.studentId,
      studentName: thesis.student?.user?.fullName ?? "-",
      studentNim: thesis.student?.user?.identityNumber ?? "-",
      progress,
      gateOpen,
      totalTasks: total,
      completedTasks: completed,
      pendingReview,
    };
  });

  const totalStudents = students.length;
  const gateOpenCount = students.filter((s) => s.gateOpen).length;

  return {
    overview: {
      totalStudents,
      gateOpenCount,
      gateOpenPercentage: totalStudents > 0 ? Math.round((gateOpenCount / totalStudents) * 100) : 0,
      stuckCount: students.filter((s) => s.progress === 0 && s.totalTasks > 0).length,
    },
    students,
  };
}

// ============================================
// Publish & Eligibility
// ============================================

export async function getEligibleStudents(academicYearId = null) {
  const activeAcademicYear = academicYearId ? null : await getActiveAcademicYear();
  const resolvedAcademicYearId = academicYearId || activeAcademicYear?.id || null;
  if (!resolvedAcademicYearId) {
    throw new BadRequestError("Tidak ada tahun ajaran aktif");
  }

  const theses = await repo.findEligibleThesesForPublish(null, resolvedAcademicYearId);

  return theses.map((thesis) => ({
    thesisId: thesis.id,
    studentId: thesis.studentId,
    studentName: thesis.student?.user?.fullName ?? "-",
    studentNim: thesis.student?.user?.identityNumber ?? "-",
    topicId: thesis.thesisTopicId ?? null,
    academicYearId: thesis.academicYear?.id ?? null,
    academicYearLabel: thesis.academicYear
      ? `${thesis.academicYear.year ?? "-"} ${thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"}`
      : null,
    classId: null,
    className: null,
    classAssignments: [],
    classCount: 0,
    hasDuplicateEnrollment: false,
  }));
}

/**
 * Publish proposal deliverables without class-based grouping.
 */
export async function publishTasks({ startDate = null, templateDeadlines = null, studentIds = null, templateIds = null, classId = null } = {}) {
  void classId;
  const activeAcademicYear = await getActiveAcademicYear();
  const resolvedAcademicYearId = activeAcademicYear?.id || null;
  if (!resolvedAcademicYearId) {
    throw new BadRequestError("Tidak ada tahun ajaran aktif");
  }

  let templates = await repo.findAllTemplates({ isActive: true });
  if (templateIds?.length > 0) {
    templates = templates.filter(t => templateIds.includes(t.id));
  }

  if (templates.length === 0) {
    throw new BadRequestError("Belum ada template aktif yang dipilih");
  }

  const eligibleTheses = await repo.findEligibleThesesForPublish(studentIds, resolvedAcademicYearId);
  if (eligibleTheses.length === 0) return { assignedCount: 0, totalCreated: 0 };

  const baseDate = startDate ? new Date(startDate) : new Date();
  templates.sort((a, b) => a.orderIndex - b.orderIndex);

  const milestonesData = [];
  let assignedCount = 0;

  for (const thesis of eligibleTheses) {
    let createdForThesis = 0;
    const existingTemplateIds = new Set(thesis.thesisMilestones?.map(m => m.milestoneTemplateId) || []);

    for (let i = 0; i < templates.length; i++) {
      const tmpl = templates[i];
      if (existingTemplateIds.has(tmpl.id)) continue;

      let targetDate = templateDeadlines?.[tmpl.id] ? new Date(templateDeadlines[tmpl.id]) : new Date(baseDate.getTime() + i * (tmpl.defaultDueDays ?? 14) * 86400000);

      milestonesData.push({
        thesisId: thesis.id,
        title: tmpl.name,
        description: tmpl.description,
        orderIndex: tmpl.orderIndex ?? i,
        milestoneTemplateId: tmpl.id,
        targetDate,
        status: "not_started",
        progressPercentage: 0,
      });
      createdForThesis++;
    }
    if (createdForThesis > 0) assignedCount++;
  }

  if (milestonesData.length > 0) {
    await repo.createManyTasks(milestonesData);
  }

  return { assignedCount, tasksPerStudent: templates.length, totalCreated: milestonesData.length };
}

/**
 * Update deadline for a specific template across active proposal deliverables.
 * Class-based deadline management has been removed.
 */
export async function updatePublishDeadline(templateId, classId, newDeadline) {
  void classId;
  const result = await prisma.thesisMilestone.updateMany({
    where: {
      milestoneTemplateId: templateId,
      status: { notIn: ["completed", "deleted"] },
    },
    data: { targetDate: new Date(newDeadline) },
  });

  if (result.count === 0) {
    throw new NotFoundError("Tidak ada deliverable proposal aktif yang ditemukan untuk diperbarui.");
  }
  
  return { updatedCount: result.count };
}

/**
 * Delete all published tasks for a specific template.
 * Class-based publish deletion has been removed.
 */
export async function deletePublishedTasks(templateId, classId) {
  void classId;
  const baseWhere = { milestoneTemplateId: templateId };

  const totalCount = await prisma.thesisMilestone.count({ where: baseWhere });
  const submittedCount = await prisma.thesisMilestone.count({
    where: {
      ...baseWhere,
      status: { in: ["pending_review", "completed"] },
    },
  });

  const milestones = await prisma.thesisMilestone.findMany({
    where: baseWhere,
    select: { id: true },
  });
  
  const milestoneIds = milestones.map((m) => m.id);

  if (milestoneIds.length > 0) {
    // 1. Delete guidance links first
    await prisma.thesisGuidanceMilestone.deleteMany({
      where: { milestoneId: { in: milestoneIds } },
    });
    
    // 2. Delete assessment details
    await prisma.thesisMilestoneAssessmentDetail.deleteMany({
      where: { milestoneId: { in: milestoneIds } },
    });

    // 3. Delete documents
    await prisma.thesisMilestoneDocument.deleteMany({
      where: { milestoneId: { in: milestoneIds } },
    });

    // 4. Finally delete the milestones
    await prisma.thesisMilestone.deleteMany({
      where: { id: { in: milestoneIds } },
    });
  }

  return { deletedCount: totalCount, submittedCount };
}

// ============================================
// Helpers & Eligibility
// ============================================

/**
 * Check if student may access the Metopel guide surface.
 *
 * Active SIMPTA scope no longer gates this page behind Metopen class enrollment.
 * The endpoint is retained so the frontend can decide archive/read-only mode.
 */
export async function checkEligibility(userId) {
  const eligibility = await resolveMetopenEligibilityState(userId);

  return {
    eligibleMetopen: eligibility.eligibleMetopen,
    hasExternalStatus: eligibility.hasExternalStatus,
    hasMetopenCourse: eligibility.eligibleMetopen === true,
    canAccess: eligibility.canAccess,
    canSubmit: eligibility.canSubmit,
    readOnly: eligibility.readOnly,
    thesisPhase: eligibility.thesisPhase,
    source: eligibility.source ?? "db",
    updatedAt: eligibility.updatedAt,
    takingThesisCourse: eligibility.takingThesisCourse,
    hasThesisCourseStatus: eligibility.hasThesisCourseStatus,
    canAccessTugasAkhir: eligibility.canAccessTugasAkhir,
    thesisCourseSource: eligibility.thesisCourseEnrollmentSource,
    thesisCourseUpdatedAt: eligibility.thesisCourseEnrollmentUpdatedAt,
  };
}

// ============================================
// Seminar Eligibility Gate (FR-SYS-01)
// ============================================

/**
 * Legacy manual-review queue sync. Kept for deprecated title-report flows only.
 * New TA-04 early-batch lifecycle uses `syncBookingActivationForStudent`.
 */
export async function syncKadepProposalQueueForStudent(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) return { synced: false };
  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  return { synced: result.updated, ...result };
}

/** Backward-compatible export name: after TA-03 writes, run the new promotion/release lifecycle. */
export async function syncKadepProposalQueueByThesisId(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { studentId: true },
  });
  if (!thesis) return { synced: false };
  return syncBookingActivationForStudent(thesis.studentId);
}

function resolveLifecycleScoreDecision(score, takingThesisCourse) {
  if (!score?.isFinalized) {
    return { action: "skip", reason: "scores_not_finalized" };
  }
  if (score.attendanceAutoZeroedAt != null) {
    return { action: "release", reason: "metopen_auto_zeroed" };
  }
  if (takingThesisCourse === true) {
    return { action: "promote", reason: "ta03_final_and_krs_ta_confirmed" };
  }
  return { action: "release", reason: "thesis_course_not_confirmed" };
}

function collectLifecycleLecturerIds(request) {
  const ids = new Set();
  if (request?.lecturerId) ids.add(request.lecturerId);
  if (request?.redirectedTo) ids.add(request.redirectedTo);
  for (const supervisor of request?.thesis?.thesisSupervisors ?? []) {
    if (supervisor.lecturerId) ids.add(supervisor.lecturerId);
  }
  return [...ids];
}

async function syncQuotaForLecturers(lecturerIds, academicYearIds, tx) {
  const uniqueLecturerIds = [...new Set(lecturerIds.filter(Boolean))];
  const uniqueAcademicYearIds = [...new Set(academicYearIds.filter(Boolean))];
  for (const lecturerId of uniqueLecturerIds) {
    for (const academicYearId of uniqueAcademicYearIds) {
      await syncLecturerQuotaCurrentCount(lecturerId, academicYearId, { client: tx });
    }
  }
}

/**
 * Idempotent lifecycle sync for early TA-04:
 * - booking_approved + TA-04 issued + TA-03 final non-auto-zero + KRS TA true
 *   => active_official, thesis leaves Metopel phase.
 * - booking_approved + TA-04 issued + finalized auto-zero or finalized but KRS
 *   TA is not true => released, supervisor rows released, draft/request history kept.
 */
export async function syncBookingActivationForStudent(userId, activeAcademicYearId = null) {
  const activeAcademicYear =
    activeAcademicYearId ? { id: activeAcademicYearId } : await getActiveAcademicYear();
  const targetAcademicYearId = activeAcademicYear?.id ?? null;
  if (!userId || !targetAcademicYearId) {
    return { synced: false, promoted: 0, released: 0, skipped: 0 };
  }

  const requests = await prisma.thesisAdvisorRequest.findMany({
    where: {
      studentId: userId,
      status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      thesis: {
        ta04AssignmentIssuedAt: { not: null },
      },
    },
    select: {
      id: true,
      studentId: true,
      lecturerId: true,
      redirectedTo: true,
      academicYearId: true,
      thesisId: true,
      status: true,
      student: {
        select: {
          takingThesisCourse: true,
        },
      },
      thesis: {
        select: {
          id: true,
          academicYearId: true,
          proposalStatus: true,
          ta04AssignmentIssuedAt: true,
          ta04AssignmentAcademicYearId: true,
          activeAcademicYearId: true,
          researchMethodScores: {
            select: {
              id: true,
              isFinalized: true,
              attendanceAutoZeroedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          thesisSupervisors: {
            where: { status: "active" },
            select: {
              id: true,
              lecturerId: true,
              status: true,
              role: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (requests.length === 0) {
    return { synced: false, promoted: 0, released: 0, skipped: 0 };
  }

  const bimbinganStatus = await prisma.thesisStatus.findFirst({
    where: { name: THESIS_STATUS.BIMBINGAN },
    select: { id: true },
  });

  let promoted = 0;
  let released = 0;
  let skipped = 0;

  for (const request of requests) {
    if (!request.thesisId || !request.thesis) {
      skipped += 1;
      continue;
    }

    const assignmentAcademicYearId =
      request.thesis.ta04AssignmentAcademicYearId ??
      request.academicYearId ??
      request.thesis.academicYearId ??
      null;
    if (assignmentAcademicYearId && assignmentAcademicYearId === targetAcademicYearId) {
      skipped += 1;
      continue;
    }

    const score = request.thesis?.researchMethodScores?.[0] ?? null;
    const decision = resolveLifecycleScoreDecision(score, request.student?.takingThesisCourse);
    if (decision.action === "skip") {
      skipped += 1;
      continue;
    }

    const now = new Date();
    const oldAcademicYearId = request.academicYearId ?? request.thesis?.academicYearId ?? null;
    const lecturerIds = collectLifecycleLecturerIds(request);

    if (decision.action === "promote") {
      await prisma.$transaction(async (tx) => {
        await tx.thesis.update({
          where: { id: request.thesisId },
          data: {
            isProposal: false,
            proposalStatus: "accepted",
            thesisStatusId: bimbinganStatus?.id ?? undefined,
            activeAcademicYearId: targetAcademicYearId,
            activePromotedAt: now,
            proposalReviewedAt: now,
            proposalReviewedByUserId: null,
            proposalReviewNotes: null,
          },
        });

        await tx.thesisAdvisorRequest.update({
          where: { id: request.id },
          data: {
            status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
            academicYearId: targetAcademicYearId,
            releasedAt: null,
            releaseReason: null,
            releasedAcademicYearId: null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: null,
            action: AUDIT_ACTIONS.REQUEST_ADVISOR_PROMOTED_TO_ACTIVE,
            entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
            entityId: request.id,
            changes: {
              oldValues: {
                status: request.status,
                academicYearId: oldAcademicYearId,
              },
              newValues: {
                status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
                academicYearId: targetAcademicYearId,
              },
              metadata: {
                actorRole: "system",
                thesisId: request.thesisId,
                reason: decision.reason,
              },
            },
          },
        });

        await syncQuotaForLecturers(
          lecturerIds,
          [oldAcademicYearId, targetAcademicYearId],
          tx,
        );
      }, { isolationLevel: "Serializable" });
      promoted += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.thesis.update({
        where: { id: request.thesisId },
        data: {
          isProposal: true,
          proposalStatus: null,
          activeAcademicYearId: null,
          activePromotedAt: null,
          proposalReviewedAt: null,
          proposalReviewedByUserId: null,
          proposalReviewNotes: null,
        },
      });

      await tx.thesisAdvisorRequest.update({
        where: { id: request.id },
        data: {
          status: ADVISOR_REQUEST_STATUS.RELEASED,
          releasedAt: now,
          releaseReason: decision.reason,
          releasedAcademicYearId: targetAcademicYearId,
        },
      });

      await tx.thesisSupervisors.updateMany({
        where: {
          thesisId: request.thesisId,
          status: "active",
        },
        data: { status: "released" },
      });

      await tx.auditLog.create({
        data: {
          userId: null,
          action: AUDIT_ACTIONS.REQUEST_ADVISOR_RELEASED,
          entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
          entityId: request.id,
          changes: {
            oldValues: { status: request.status },
            newValues: {
              status: ADVISOR_REQUEST_STATUS.RELEASED,
              releaseReason: decision.reason,
            },
            metadata: {
              actorRole: "system",
              thesisId: request.thesisId,
              academicYearId: targetAcademicYearId,
            },
          },
        },
      });

      await syncQuotaForLecturers(lecturerIds, [oldAcademicYearId], tx);
    }, { isolationLevel: "Serializable" });
    released += 1;
  }

  return {
    synced: promoted + released > 0,
    promoted,
    released,
    skipped,
  };
}

/**
 * Pure read of seminar eligibility (FR-SYS-01). Does **not** run lifecycle sync
 * — safe for GET REST handlers (no hidden writes).
 */
export async function getSeminarEligibilitySnapshot(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return {
      eligible: false,
      reason: "Tugas Akhir tidak ditemukan",
      scenario: "C",
      canContinueThesis: false,
      seminarLocked: true,
      requirements: {
        metopelPassed: false,
        metopelScore: null,
        proposalAccepted: false,
        proposalStatus: null,
      },
    };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
  });
  const computedFinalScore =
    rmScore?.finalScore ??
    (rmScore?.supervisorScore != null && rmScore?.lecturerScore != null
      ? rmScore.supervisorScore + rmScore.lecturerScore
      : null);
  const isFinalized = rmScore?.isFinalized === true;
  const metopelPassed =
    isFinalized && computedFinalScore != null && computedFinalScore >= ENV.METOPEL_PASSING_SCORE;
  const proposalAccepted = thesis.proposalStatus === "accepted";
  const eligible = metopelPassed && proposalAccepted;

  let scenario = "C";
  let canContinueThesis = false;
  let seminarLocked = true;
  let reason = "Mahasiswa harus menyelesaikan penilaian Metopel dan pengesahan judul terlebih dahulu.";

  if (eligible) {
    scenario = "A";
    canContinueThesis = true;
    seminarLocked = false;
    reason = "Lulus Metopel dan judul/proposal telah disahkan. Akses Seminar Hasil terbuka.";
  } else if (!metopelPassed && proposalAccepted) {
    scenario = "B";
    canContinueThesis = true;
    seminarLocked = true;
    reason =
      "Proposal/judul sudah disahkan, tetapi Metopel belum lulus. Mahasiswa boleh melanjutkan pengerjaan TA, namun Seminar Hasil tetap terkunci.";
  } else if (metopelPassed && !proposalAccepted) {
    scenario = "C";
    canContinueThesis = true;
    seminarLocked = true;
    reason = "Metopel sudah lulus, tetapi judul/proposal belum disahkan oleh KaDep.";
  }

  return {
    eligible,
    reason,
    scenario,
    canContinueThesis,
    seminarLocked,
    requirements: {
      metopelPassed,
      metopelScore: computedFinalScore,
      proposalAccepted,
      proposalStatus: thesis.proposalStatus ?? null,
    },
  };
}

/**
 * Check if a student is eligible for Seminar Hasil registration.
 *
 * Side effect: runs early TA-04 promotion/release sync first (jobs/tests/backfill).
 * For HTTP GET, prefer `getSeminarEligibilitySnapshot` + explicit POST sync.
 */
export async function checkSeminarEligibility(userId) {
  await syncBookingActivationForStudent(userId);
  return getSeminarEligibilitySnapshot(userId);
}

/**
 * Status pengesahan judul untuk mahasiswa (transparansi alur Langkah 6).
 */
export async function getStudentProposalApprovalStatus(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return { thesis: null };
  }

  const row = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    select: {
      id: true,
      title: true,
      isProposal: true,
      proposalStatus: true,
      titleApprovalDocumentId: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
      ta04AssignmentSupervisorNames: true,
      activeAcademicYearId: true,
      activePromotedAt: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      updatedAt: true,
      titleApprovalDocument: {
        select: { id: true, fileName: true, filePath: true },
      },
    },
  });

  const queueReadiness = await evaluateKadepProposalQueueReadiness(thesis.id);
  const currentBatch = row?.ta04AssignmentIssuedAt
    ? await ta04BatchRepo.findCurrentTa04BatchForThesis(thesis.id)
    : null;
  const officialDocument = currentBatch?.document && isOfficialTitleApprovalDocument(currentBatch.document)
    ? currentBatch.document
    : null;

  return {
    thesis: row
      ? {
          ...row,
          titleApprovalDocumentId: officialDocument?.id ?? null,
          titleApprovalDocument: officialDocument,
          queueReadiness: {
            ready: queueReadiness.ready,
            block: queueReadiness.block ?? null,
            proposalStatus: queueReadiness.proposalStatus ?? row.proposalStatus ?? null,
          },
        }
      : null,
  };
}

/**
 * BR-23 (canon §5.13): Endpoint mahasiswa-side untuk arsip Metopel pasca promosi aktif TA.
 *
 * SIMPTA = Single Source of Truth. Mahasiswa berhak melihat kembali 4 kategori
 * data setelah promosi aktif:
 *   1. Substansi pengajuan awal TA-01/TA-02 (latar belakang, tujuan, dst).
 *   2. Detail rubrik TA-03A per CPMK + descriptor + catatan P1 + co-sign P2.
 *   3. Detail rubrik TA-03B per kriteria + descriptor + catatan Koordinator.
 *   4. Formulir TA-04 PDF (tombol unduh setelah batch periode difinalisasi).
 *
 * Endpoint ini READ-ONLY. Tidak mengizinkan modifikasi apa pun.
 */
export async function getStudentArchiveDetail(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return null;
  }

  // (1) Substansi pengajuan awal — historical submissions
  const advisorRequests = await prisma.thesisAdvisorRequest.findMany({
    where: { studentId: thesis.studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestType: true,
      status: true,
      proposedTitle: true,
      backgroundSummary: true,
      problemStatement: true,
      proposedSolution: true,
      researchObject: true,
      researchPermitStatus: true,
      justificationText: true,
      createdAt: true,
      lecturer: {
        select: { user: { select: { fullName: true } } },
      },
      topic: { select: { name: true } },
    },
  });

  // (2) + (3) Detail rubrik TA-03A & TA-03B + catatan
  const score = await prisma.researchMethodScore.findUnique({
    where: { thesisId: thesis.id },
    include: {
      researchMethodScoreDetails: {
        include: {
          criteria: {
            include: {
              metopenCpmk: { select: { code: true, description: true } },
            },
          },
        },
      },
      coSigner: {
        select: { user: { select: { fullName: true } } },
      },
      supervisor: {
        select: { user: { select: { fullName: true } } },
      },
      lecturerAssessor: {
        select: { user: { select: { fullName: true } } },
      },
    },
  });

  // (4) Formulir TA-04 PDF
  const titleApproval = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    select: {
      title: true,
      proposalStatus: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
      titleApprovalDocument: {
        select: { id: true, fileName: true, filePath: true },
      },
    },
  });
  const currentBatch = await ta04BatchRepo.findCurrentTa04BatchForThesis(thesis.id);
  const officialDocument = currentBatch?.document && isOfficialTitleApprovalDocument(currentBatch.document)
    ? currentBatch.document
    : null;

  // Bagi detail rubrik berdasarkan diskriminator kanonis `criteria.role`
  // (supervisor → TA-03A, default → TA-03B) — selaras export §5.7.4 dan
  // SupervisorScoreCard. Audit pass 2 F2-6: heuristik nama kriteria dihapus
  // karena rapuh terhadap rename kriteria oleh Sekdep di Kelola Master TA.
  const ta03aDetails = (score?.researchMethodScoreDetails ?? []).filter(
    (d) => d.criteria?.role === "supervisor",
  );

  return {
    thesisId: thesis.id,
    thesisTitle: titleApproval?.ta04AssignmentTitle ?? titleApproval?.title ?? null,
    proposalStatus: titleApproval?.proposalStatus ?? null,
    advisorRequests,
    score: score
      ? {
          supervisorScore: score.supervisorScore,
          lecturerScore: score.lecturerScore,
          finalScore: score.finalScore,
          isFinalized: score.isFinalized,
          coSignedAt: score.coSignedAt,
          coSignNote: score.coSignNote,
          coSignerName: score.coSigner?.user?.fullName ?? null,
          supervisorName: score.supervisor?.user?.fullName ?? null,
          lecturerAssessorName: score.lecturerAssessor?.user?.fullName ?? null,
          // Detail rubrik utuh (FE filter sendiri per role bila perlu)
          details: score.researchMethodScoreDetails ?? [],
          // Hint pembagian: detail terkait TA-03A (heuristik nama kriteria)
          ta03aDetailIds: ta03aDetails.map((d) => `${d.researchMethodScoreId}_${d.assessmentCriteriaId}`),
        }
      : null,
    titleApproval: {
      reviewNotes: titleApproval?.proposalReviewNotes ?? null,
      reviewedAt: titleApproval?.ta04AssignmentIssuedAt ?? titleApproval?.proposalReviewedAt ?? null,
      document: officialDocument,
      documentKind: officialDocument
        ? "batch"
        : null,
    },
    readOnly: true,
  };
}

/**
 * Formulir TA-04 resmi selalu berbentuk batch per periode sesuai panduan.
 * Dokumen lain yang mungkin tersisa dari data lama tidak dilayani sebagai
 * output resmi dan harus diganti lewat finalisasi batch.
 */
function resolveTitleApprovalDocumentKind(fileName) {
  if (!fileName) return null;
  if (String(fileName).startsWith("TA04_BATCH_")) return "batch";
  return "legacy";
}

function isOfficialTitleApprovalDocument(documentRow) {
  return resolveTitleApprovalDocumentKind(documentRow?.fileName) === "batch";
}

function getTa04BatchEligibilitySnapshot(thesis) {
  if (thesis.ta04AssignmentIssuedAt) {
    return { eligible: true, block: null };
  }

  const hasBooking = (thesis.advisorRequests ?? []).some(
    (request) => request.status === ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
  );
  if (!hasBooking) {
    return { eligible: false, block: "booking_not_approved" };
  }

  const supervisors = thesis.thesisSupervisors ?? [];
  const hasP1 = supervisors.some(
    (supervisor) =>
      supervisor.status === "active" &&
      supervisor.role?.name === ROLES.PEMBIMBING_1,
  );
  if (!hasP1) {
    return { eligible: false, block: "no_active_pembimbing_1" };
  }

  return { eligible: true, block: null };
}

function buildCurrentBatchByThesisId(batches = []) {
  const map = new Map();
  for (const batch of batches) {
    for (const member of batch.members ?? []) {
      if (!map.has(member.thesisId)) {
        map.set(member.thesisId, batch);
      }
    }
  }
  return map;
}

/**
 * Read-only riwayat penilaian TA-03 untuk mahasiswa sejak skor tersedia.
 * Berbeda dari arsip pasca promosi aktif, endpoint ini boleh dipakai sebelum
 * promosi agar mahasiswa tidak kehilangan transparansi setelah TA-03 final.
 */
export async function getStudentAssessmentHistory(userId) {
  return getStudentArchiveDetail(userId);
}

/**
 * Idempotent: sinkronkan promosi/release otomatis lalu kembalikan ringkasan untuk UI.
 */
export async function syncProposalQueueAndSummarizeForStudent(userId) {
  const sync = await syncBookingActivationForStudent(userId);
  const proposal = await getStudentProposalApprovalStatus(userId);
  const eligibility = await getSeminarEligibilitySnapshot(userId);
  return { sync, proposal, eligibility };
}

// ============================================
// Legacy antre KaDep / pengesahan judul manual (deprecated)
// ============================================

/**
 * Evaluate whether a thesis satisfies the 5 canonical prerequisites for
 * KaDep TA-04 review (canon §5.8, §5.10, §5.7.1):
 *   1. Pembimbing resmi (P1) aktif di thesis_supervisors
 *   2. Proposal final disubmit (finalProposalVersionId non-null)
 *   3. TA-03A: P1 submit + P2 co-sign bila ada P2 (isFinalized gate)
 *   4. TA-03B: Koordinator submit (lecturerScore non-null)
 *   5. SIA mengonfirmasi students.taking_thesis_course = true
 *
 * Re-validates the 5 prerequisites regardless of current proposalStatus —
 * including thesis already in queue ("submitted"). This closes the post-enqueue
 * degradation gap (audit F-4.4 follow-up): if a "submitted" thesis later loses
 * a prerequisite (e.g. P2 added without co-sign, SIA flips takingThesisCourse,
 * auto-zero applied), the gate reports `ready: false` and `tryEnqueueThesisForKadepProposalReview`
 * performs an automatic dequeue.
 *
 * @returns {{
 *   ready: boolean,
 *   proposalStatus?: string,
 *   currentProposalStatus?: string|null,
 *   block?: string,
 * }}
 * - `proposalStatus`: status refleksi readiness untuk UI (matched to current
 *   status, or "ready" when null+ready). Callers that only need ready/block
 *   (e.g. getStudentProposalApprovalStatus) can ignore currentProposalStatus.
 * - `currentProposalStatus`: status asli thesis di DB ("submitted"|"accepted"
 *   |"rejected"|"revision_in_progress"|null). Dipakai oleh
 *   `tryEnqueueThesisForKadepProposalReview` untuk bedakan enqueue baru vs
 *   dequeue pasca-degradasi.
 */
async function evaluateKadepProposalQueueReadiness(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      studentId: true,
      title: true,
      proposalStatus: true,
      finalProposalVersionId: true,
    },
  });
  if (!thesis) return { ready: false, block: "no_thesis" };

  const currentProposalStatus = thesis.proposalStatus ?? null;

  // Terminal state: accepted — never re-evaluate, never dequeue.
  if (currentProposalStatus === "accepted") {
    return { ready: true, proposalStatus: "accepted", currentProposalStatus };
  }
  // User-driven non-queueable states — not eligible for enqueue, but not
  // auto-dequeued either (revision/reject flow is owned by reviewer action).
  if (currentProposalStatus === "rejected" || currentProposalStatus === "revision_in_progress") {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "pending_revision",
    };
  }

  // Re-validate the 5 canonical prerequisites for both "submitted" and null.
  // For "submitted" → if any prerequisite fails, caller (tryEnqueue) dequeues.
  // For null → if any prerequisite fails, caller reports block (no-op).

  const activeSupervisors = await prisma.thesisSupervisors.findMany({
    where: {
      thesisId: thesis.id,
      status: "active",
      role: { is: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
    },
    select: { role: { select: { name: true } } },
  });
  const hasP1Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_1);
  const hasP2Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_2);
  if (activeSupervisors.length === 0 || !hasP1Active) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "no_supervisor" };
  }

  if (!thesis.title || !String(thesis.title).trim()) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "no_title" };
  }

  if (!thesis.finalProposalVersionId) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "proposal_final_not_submitted",
    };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
  });
  if (!rmScore || rmScore.supervisorScore == null || rmScore.lecturerScore == null) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "missing_scores" };
  }
  // BR-20 / FR-SCR-07 (F-4.4): antrean KaDep hanya dibuka setelah siklus
  // penilaian FINAL — P1 submit + P2 co-sign (bila ada P2) + TA-03B.
  // `isFinalized` adalah flag kanonis "siklus selesai" (di-set oleh
  // isScoreReadyToFinalize / publishFinalScore; auto-zero juga isFinalized=true).
  // Tanpa gate ini, thesis ber-P2 yang belum co-sign bisa masuk antrean KaDep
  // secara prematur dan disahkan tanpa konsensus P2.
  //
  // Celah #2 recovery: Jika P2 terminated sebelum co-sign, score stuck
  // isFinalized=false. Dalam kasus ini (P2 tidak aktif + kedua score ada +
  // belum co-sign), auto-finalize agar thesis tidak deadlock permanen.
  if (!rmScore.isFinalized) {
    const canAutoRecover = !hasP2Active
      && rmScore.supervisorScore != null
      && rmScore.lecturerScore != null
      && rmScore.coSignedAt == null;
    if (canAutoRecover) {
      await prisma.researchMethodScore.update({
        where: { id: rmScore.id },
        data: { isFinalized: true, finalizedAt: new Date(), finalizedBy: null },
      });
    } else {
      return {
        ready: false,
        proposalStatus: currentProposalStatus,
        currentProposalStatus,
        block: "scores_not_finalized",
      };
    }
  }
  // Konsistensi co-sign P2 (selaras getPendingTitleReports + reviewTitleReport):
  // `isFinalized` bisa stale true jika P2 ditambahkan setelah finalize P1-only.
  // Re-assert co-sign eksplisit untuk thesis ber-P2 agar dequeue konsisten.
  if (hasP2Active && (rmScore.coSignedAt == null || rmScore.coSignedByLecturerId == null)) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "scores_not_finalized",
    };
  }
  // §5.7.3 (BR-28): thesis yang di-auto-zero karena presensi Metopel <75% GAGAL
  // prasyarat Metopel dan WAJIB mengulang kelas — BUKAN lanjut ke TA-04. Karena
  // auto-zero menulis `isFinalized=true`, gate isFinalized di atas lolos, jadi
  // blokir eksplisit di sini agar mahasiswa gagal-Metopel tidak ter-enqueue.
  if (rmScore.attendanceAutoZeroedAt != null) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "metopel_auto_zeroed",
    };
  }

  const student = await prisma.student.findUnique({
    where: { id: thesis.studentId },
    select: { takingThesisCourse: true },
  });
  if (student?.takingThesisCourse !== true) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "ta_course_not_confirmed",
    };
  }

  // All 5 prerequisites satisfied.
  // `proposalStatus` field reflects readiness: "submitted" if already queued
  // (caller treats as no-op enqueue), or "ready" if null (caller enqueues).
  return {
    ready: true,
    proposalStatus: currentProposalStatus === "submitted" ? "submitted" : "ready",
    currentProposalStatus,
  };
}

async function tryEnqueueThesisForKadepProposalReview(thesisId) {
  const readiness = await evaluateKadepProposalQueueReadiness(thesisId);

  // Terminal: accepted — no-op.
  if (readiness.proposalStatus === "accepted") {
    return { updated: false, proposalStatus: "accepted", queued: false };
  }
  // User-driven non-queueable (rejected / revision_in_progress) — no-op.
  if (readiness.proposalStatus === "rejected" || readiness.proposalStatus === "revision_in_progress") {
    return { updated: false, proposalStatus: readiness.proposalStatus, block: readiness.block };
  }

  const currentStatus = readiness.currentProposalStatus;

  if (readiness.ready) {
    // All 5 prerequisites satisfied.
    if (currentStatus === "submitted") {
      // Already queued and still valid — no-op (idempotent).
      return { updated: false, proposalStatus: "submitted", queued: true };
    }
    // Enqueue baru (status null → submitted).
    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        proposalStatus: "submitted",
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
      },
    });
    return { updated: true, proposalStatus: "submitted", queued: true };
  }

  // !ready: prerequisite(s) fail.
  if (currentStatus === "submitted") {
    // Post-enqueue degradation (audit F-4.4 follow-up): a previously-enqueued
    // thesis lost a prerequisite (e.g. P2 added without co-sign, SIA flipped
    // takingThesisCourse, auto-zero applied). Auto-dequeue to keep KaDep queue
    // consistent with the 5 canonical prerequisites (canon §5.8).
    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        proposalStatus: null,
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
      },
    });
    return {
      updated: false,
      proposalStatus: null,
      dequeued: true,
      block: readiness.block,
    };
  }
  // Not queued yet, not ready — no-op.
  return { updated: false, proposalStatus: null, block: readiness.block };
}

function badRequestForKadepEnqueueBlock(block) {
  if (block === "no_thesis") {
    return new BadRequestError("Tugas Akhir tidak ditemukan");
  }
  if (block === "no_supervisor") {
    return new BadRequestError("Anda harus memiliki dosen pembimbing terlebih dahulu");
  }
  if (block === "no_title") {
    return new BadRequestError("Judul TA belum diisi. Silakan isi judul terlebih dahulu.");
  }
  if (block === "proposal_final_not_submitted") {
    return new BadRequestError(
      "Mahasiswa harus submit proposal final terlebih dahulu sebelum masuk antrean KaDep."
    );
  }
  if (block === "missing_scores") {
    return new BadRequestError(
      "Antre KaDep dibuka setelah nilai TA-03A dan TA-03B tersedia."
    );
  }
  if (block === "scores_not_finalized") {
    return new BadRequestError(
      "Promosi aktif menunggu penilaian TA-03A (termasuk co-sign Pembimbing 2 bila ada) dan TA-03B difinalisasi."
    );
  }
  if (block === "metopel_auto_zeroed") {
    return new BadRequestError(
      "Mahasiswa tidak memenuhi prasyarat presensi Metopel (≥75%) sehingga nilai TA-03 otomatis 0. Promosi aktif tidak dapat diproses; mahasiswa wajib mengulang kelas Metopel (canon §5.7.3)."
    );
  }
  if (block === "ta_course_not_confirmed") {
    return new BadRequestError(
      "Promosi aktif hanya dapat diproses setelah data SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir."
    );
  }
  return new BadRequestError("Persyaratan belum terpenuhi");
}

/**
 * Legacy / idempotent hook: same as sistem otomatis. Panduan tidak mewajibkan aksi
 * mahasiswa terpisah; endpoint tetap ada agar klien lama tidak rusak.
 *
 * Side effect: if the thesis was previously "submitted" but a prerequisite has
 * since degraded (e.g. P2 added without co-sign), this call auto-dequeues it
 * (resets proposalStatus to null) and throws with the block reason — so the
 * student UI refresh shows the correct "Belum Masuk Antrean" state instead of
 * a stale "Menunggu Review KaDep".
 */
export async function submitTitleReport(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError("Judul TA sudah disetujui");
  }

  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  if (result.queued) {
    return { thesisId: thesis.id, title: thesis.title, proposalStatus: "submitted" };
  }
  throw badRequestForKadepEnqueueBlock(result.block);
}

/**
 * Helper: kumpulkan userId pembimbing aktif (P1/P2) untuk sebuah thesis.
 * Dipakai untuk notifikasi pasca legacy manual accept agar pembimbing tahu
 * bimbingan formal fase Tugas Akhir aktif (canon §5.5).
 */
async function getActiveSupervisorUserIds(thesisId) {
  const participants = await prisma.thesisSupervisors.findMany({
    where: {
      thesisId,
      status: "active",
      role: { is: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
    },
    select: { lecturer: { select: { userId: true } } },
  });
  return participants
    .map((p) => p.lecturer?.userId)
    .filter(Boolean);
}

/**
 * Helper: fetch userId mahasiswa pemilik thesis.
 */
async function getStudentUserIdForThesis(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { studentId: true },
  });
  return thesis?.studentId ?? null;
}

/**
 * Helper: fetch data ringkas thesis untuk konteks notifikasi pasca-accept.
 */
async function getThesisNotificationContext(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      studentId: true,
      academicYear: { select: { year: true, semester: true } },
    },
  });
  return thesis;
}

/**
 * Fire-and-forget: notifikasi mahasiswa + pembimbing untuk legacy manual accept.
 * Failure di-swallow (hanya log) supaya tidak membatalkan accept yang sudah commit.
 *
 * Endpoint ini deprecated; happy path baru memakai TA-04 awal + promosi otomatis.
 */
async function notifyTa04Accepted(thesis) {
  if (!thesis) return;
  const studentUserId = thesis.studentId;
  const supervisorUserIds = await getActiveSupervisorUserIds(thesis.id);

  const semesterPretty = thesis.academicYear
    ? `${thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${thesis.academicYear.year ?? ""}`.trim()
    : "periode ini";

  // Notifikasi mahasiswa.
  if (studentUserId) {
    const studentTitle = "Fase Tugas Akhir Aktif";
    const studentMessage = `Review legacy KaDep telah mengaktifkan fase Tugas Akhir. Formulir TA-04 resmi tersedia melalui batch periode ${semesterPretty}.`;
    const studentData = {
      type: "ta04_accepted",
      thesisId: thesis.id,
      route: "/metopel",
    };
    try {
      await createNotificationsForUsers([studentUserId], {
        title: studentTitle,
        message: studentMessage,
        type: "ta04_accepted",
        data: studentData,
      });
      await sendFcmToUsers([studentUserId], {
        title: studentTitle,
        body: studentMessage,
        data: studentData,
        dataOnly: true,
      });
    } catch (err) {
      console.error("[reviewTitleReport] notifikasi mahasiswa gagal:", err?.message || err);
    }
  }

  // Notifikasi pembimbing P1/P2.
  if (supervisorUserIds.length > 0) {
    const supervisorTitle = "Mahasiswa Bimbingan Aktif TA";
    const supervisorMessage = "Review legacy KaDep telah mengaktifkan fase Tugas Akhir mahasiswa bimbingan Anda. Bimbingan formal (logbook phase=thesis) kini aktif.";
    const supervisorData = {
      type: "ta04_accepted_supervisor",
      thesisId: thesis.id,
    };
    try {
      await createNotificationsForUsers(supervisorUserIds, {
        title: supervisorTitle,
        message: supervisorMessage,
        type: "ta04_accepted_supervisor",
        data: supervisorData,
      });
      await sendFcmToUsers(supervisorUserIds, {
        title: supervisorTitle,
        body: supervisorMessage,
        data: supervisorData,
        dataOnly: true,
      });
    } catch (err) {
      console.error("[reviewTitleReport] notifikasi pembimbing gagal:", err?.message || err);
    }
  }
}

/**
 * Fire-and-forget: notifikasi mahasiswa bahwa TA-04 ditolak KaDep.
 * Membawa catatan KaDep supaya mahasiswa tahu arahan revisi.
 */
async function notifyTa04Rejected(thesisId, notes) {
  const studentUserId = await getStudentUserIdForThesis(thesisId);
  if (!studentUserId) return;

  const title = "Judul Tugas Akhir Ditolak KaDep";
  const message = notes?.trim()
    ? `Ketua Departemen menolak pengesahan judul. Catatan: ${notes.trim()}`
    : "Ketua Departemen menolak pengesahan judul. Silakan hubungi pembimbing untuk arahan revisi.";
  const data = {
    type: "ta04_rejected",
    thesisId,
    route: "/metopel",
  };
  try {
    await createNotificationsForUsers([studentUserId], {
      title,
      message,
      type: "ta04_rejected",
      data,
    });
    await sendFcmToUsers([studentUserId], {
      title,
      body: message,
      data,
      dataOnly: true,
    });
  } catch (err) {
    console.error("[reviewTitleReport] notifikasi reject gagal:", err?.message || err);
  }
}

/**
 * KaDep approves or rejects the reported title.
 *
 * Canonical rule (KONTEKS_KANONIS_SIMPTA.md §5.8): TA-04 only proceeds when
 * all 5 prerequisites are satisfied at accept-time:
 *   1. Pembimbing resmi (P1) aktif
 *   2. Proposal final disubmit (`finalProposalVersionId`)
 *   3. TA-03A final (P1 submit + P2 co-sign bila ada) — `isFinalized`
 *   4. TA-03B final (Koordinator submit) — `isFinalized`
 *   5. SIA `taking_thesis_course = true`
 * The enqueue gate + getPendingTitleReports filter already enforce these, but
 * accept-time re-validation closes the race window where state changes between
 * enqueue and KaDep approval (audit F-5.1 + F-4.4 follow-up).
 */
export async function reviewTitleReport(thesisId, action, notes, reviewedBy) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      studentId: true,
      title: true,
      proposalStatus: true,
      finalProposalVersionId: true,
      academicYearId: true,
    },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus !== "submitted") {
    throw new BadRequestError("Judul belum diajukan atau sudah diproses");
  }

  const now = new Date();
  const reviewAudit = {
    proposalReviewedAt: now,
    proposalReviewedByUserId: reviewedBy,
    proposalReviewNotes: notes?.trim() ? notes.trim() : null,
  };

  if (action === "accept") {
    // Canon §5.8 — re-assert all 5 canonical prerequisites at accept-time.
    // The enqueue gate + getPendingTitleReports filter already enforce these,
    // but accept-time re-validation closes the race window where state changes
    // between enqueue and KaDep decision (audit F-5.1 + F-4.4 follow-up).

    // Syarat 2: Proposal final disubmit.
    if (!thesis.finalProposalVersionId) {
      throw new BadRequestError(
        "Proposal final belum disubmit. TA-04 belum dapat disahkan (canon §5.8).",
      );
    }
    // Syarat 1: Pembimbing resmi (P1) aktif. Sekaligus deteksi P2 untuk
    // re-assert co-sign (konsisten dengan getPendingTitleReports).
    const activeSupervisors = await prisma.thesisSupervisors.findMany({
      where: {
        thesisId,
        status: "active",
        role: { is: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
      },
      select: { role: { select: { name: true } } },
    });
    const hasP1Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_1);
    const hasP2Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_2);
    if (activeSupervisors.length === 0 || !hasP1Active) {
      throw new BadRequestError(
        "Tidak ada pembimbing resmi aktif (P1) pada thesis ini. TA-04 belum dapat disahkan (canon §5.8).",
      );
    }

    // Syarat 5: SIA mengonfirmasi ambil MK Tugas Akhir.
    const student = await prisma.student.findUnique({
      where: { id: thesis.studentId },
      select: { takingThesisCourse: true },
    });
    if (student?.takingThesisCourse !== true) {
      throw new BadRequestError(
        "TA-04 hanya dapat diproses setelah data SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir.",
      );
    }

    // BR-20 / FR-SCR-07 (F-5.1): re-assert kelengkapan penilaian di server,
    // bukan hanya mengandalkan gate enqueue + checklist UI (client-side).
    // Syarat 3 + 4: TA-03A (P1 + P2 co-sign bila ada) + TA-03B final.
    const reviewScore = await prisma.researchMethodScore.findUnique({
      where: { thesisId },
      select: {
        isFinalized: true,
        attendanceAutoZeroedAt: true,
        supervisorScore: true,
        lecturerScore: true,
        coSignedAt: true,
        coSignedByLecturerId: true,
      },
    });
    if (!reviewScore?.isFinalized) {
      throw new BadRequestError(
        "Penilaian TA-03A/TA-03B belum final (termasuk co-sign Pembimbing 2 bila ada). TA-04 belum dapat disahkan.",
      );
    }
    // Konsistensi co-sign P2 (selaras getPendingTitleReports): isFinalized bisa
    // stale true jika P2 ditambah setelah finalize P1-only. Re-assert co-sign
    // eksplisit untuk thesis ber-P2 agar KaDep tidak sahkan tanpa konsensus P2.
    if (
      hasP2Active &&
      (reviewScore.coSignedAt == null || reviewScore.coSignedByLecturerId == null)
    ) {
      throw new BadRequestError(
        "Pembimbing 2 belum co-sign penilaian TA-03A. TA-04 belum dapat disahkan tanpa konsensus P2 (canon §5.7.1).",
      );
    }
    if (reviewScore.supervisorScore == null || reviewScore.lecturerScore == null) {
      throw new BadRequestError(
        "Nilai TA-03A atau TA-03B belum lengkap. TA-04 belum dapat disahkan (canon §5.7).",
      );
    }
    // §5.7.3 (BR-28): auto-zero presensi <75% = gagal Metopel → wajib mengulang,
    // bukan disahkan TA-04. Blokir di accept-time juga (menutup data lama yang
    // mungkin sudah ter-enqueue sebelum gate ini ada).
    if (reviewScore.attendanceAutoZeroedAt != null) {
      throw new BadRequestError(
        "Mahasiswa tidak memenuhi prasyarat presensi Metopel (≥75%); nilai TA-03 auto-zero. TA-04 tidak dapat disahkan — mahasiswa wajib mengulang kelas Metopel (canon §5.7.3).",
      );
    }

    // Canon §5.5 + §5.10: pasca-accept thesis masuk fase Tugas Akhir penuh.
    // Set thesisStatus = "Bimbingan" supaya monitoring modul TA & eligibility
    // service (`resolveMetopenEligibilityState.thesisPhase`) refleksi fase aktif.
    // Tanpa ini, `thesisPhase` null walau `isProposal=false` → UX gap.
    const bimbinganStatus = await prisma.thesisStatus.findFirst({
      where: { name: THESIS_STATUS.BIMBINGAN },
      select: { id: true, name: true },
    });
    if (!bimbinganStatus) {
      throw new BadRequestError(
        "Status thesis 'Bimbingan' belum dikonfigurasi di database. Jalankan seed: npx prisma db seed",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.thesis.update({
        where: { id: thesisId },
        data: {
          proposalStatus: "accepted",
          isProposal: false,
          thesisStatusId: bimbinganStatus.id,
          ...reviewAudit,
        },
      });

      const promotableRequests = await tx.thesisAdvisorRequest.findMany({
        where: {
          studentId: thesis.studentId,
          status: {
            in: [
              ...ADVISOR_REQUEST_BOOKING_STATUSES,
              ...ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
            ],
          },
          OR: [{ thesisId }, { thesisId: null }],
        },
        select: {
          id: true,
          lecturerId: true,
          thesisId: true,
          academicYearId: true,
          status: true,
        },
      });

      for (const requestRow of promotableRequests) {
        await tx.thesisAdvisorRequest.update({
          where: { id: requestRow.id },
          data: {
            status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
            thesisId,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: reviewedBy,
            action: AUDIT_ACTIONS.REQUEST_ADVISOR_PROMOTED_TO_ACTIVE,
            entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
            entityId: requestRow.id,
            changes: {
              oldValues: { status: requestRow.status },
              newValues: { status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL },
              metadata: {
                actorRole: "kadep",
                thesisId,
                lecturerId: requestRow.lecturerId,
                reason: reviewAudit.proposalReviewNotes,
              },
            },
          },
        });
      }

      for (const lecturerId of [...new Set(promotableRequests.map((item) => item.lecturerId))]) {
        const requestAcademicYearId =
          promotableRequests.find((item) => item.lecturerId === lecturerId)?.academicYearId ??
          thesis.academicYearId;
        if (!lecturerId || !requestAcademicYearId) continue;
        await syncLecturerQuotaCurrentCount(lecturerId, requestAcademicYearId, { client: tx });
      }
    }, { isolationLevel: "Serializable" });

    // Fire-and-forget: notifikasi mahasiswa + pembimbing pasca-accept (canon §5.10 + §5.5).
    // Di-swallow error supaya accept yang sudah commit tidak terganggu.
    try {
      const notifCtx = await getThesisNotificationContext(thesisId);
      await notifyTa04Accepted(notifCtx);
    } catch (err) {
      console.error("[reviewTitleReport] notifyTa04Accepted gagal:", err?.message || err);
    }

    return { thesisId, proposalStatus: "accepted" };
  }

  if (action === "reject") {
    if (!notes?.trim()) {
      throw new BadRequestError(
        "Catatan revisi wajib diisi saat menolak judul.",
      );
    }

    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        proposalStatus: "rejected",
        ...reviewAudit,
      },
    });

    // Fire-and-forget: notifikasi mahasiswa bahwa TA-04 ditolak + catatan KaDep.
    try {
      await notifyTa04Rejected(thesisId, notes);
    } catch (err) {
      console.error("[reviewTitleReport] notifyTa04Rejected gagal:", err?.message || err);
    }

    return { thesisId, proposalStatus: "rejected" };
  }

  throw new BadRequestError("Aksi tidak valid. Gunakan 'accept' atau 'reject'.");
}

/**
 * Mahasiswa menandai bahwa proposal telah direvisi sesuai catatan KaDep.
 * Transition: rejected → revision_in_progress (menunggu telaah pembimbing).
 */
export async function submitRevisionAfterKadepReject(thesisId, userId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, studentId: true, proposalStatus: true, student: { select: { userId: true } } },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (thesis.student?.userId !== userId) {
    throw new ForbiddenError("Hanya mahasiswa pemilik thesis yang dapat mengirim revisi");
  }
  if (thesis.proposalStatus !== "rejected") {
    throw new BadRequestError(
      "Revisi pasca-KaDep hanya dapat diajukan pada proposal berstatus 'rejected'.",
    );
  }

  await prisma.thesis.update({
    where: { id: thesisId },
    data: { proposalStatus: "revision_in_progress" },
  });

  return { thesisId, proposalStatus: "revision_in_progress" };
}

/**
 * Pembimbing menelaah revisi proposal pasca-reject KaDep (BPMN Task_ReviewRevisionAfterKadep).
 * Jika approve → reset proposalStatus ke null sehingga tryEnqueueThesisForKadepProposalReview
 * dapat me-re-queue thesis ke antrean KaDep.
 */
export async function approveRevisionAfterKadepReject(thesisId, lecturerUserId, notes) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, proposalStatus: true, studentId: true },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (thesis.proposalStatus !== "revision_in_progress") {
    throw new BadRequestError(
      "Telaah revisi hanya dapat dilakukan pada proposal berstatus 'revision_in_progress'.",
    );
  }

  const isSupervisor = await prisma.thesisSupervisors.count({
    where: {
      thesisId,
      status: "active",
      lecturer: { userId: lecturerUserId },
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
  });
  if (isSupervisor === 0) {
    throw new ForbiddenError("Hanya pembimbing aktif yang dapat menelaah revisi pasca-KaDep");
  }

  await prisma.thesis.update({
    where: { id: thesisId },
    data: {
      proposalStatus: null,
      proposalReviewNotes: notes?.trim() || null,
      proposalReviewedAt: null,
      proposalReviewedByUserId: null,
    },
  });

  const result = await syncKadepProposalQueueByThesisId(thesisId);

  return { thesisId, reQueued: result.synced, proposalStatus: result.synced ? "submitted" : null };
}

/**
 * Get title reports pending KaDep review (optional filter by academic year).
 *
 * Legacy manual review: setiap row memuat snapshot prasyarat lama agar UI KaDep
 * dapat menampilkan checklist visual untuk endpoint deprecated:
 *   1. Pembimbing resmi (≥1 active thesis_participant)
 *   2. Proposal final ditetapkan (`finalProposalVersionId` non-null)
 *   3. TA-03A diisi P1 master + (jika P2 ada) P2 co-sign
 *   4. TA-03B diisi Koordinator Metopen
 *   5. SIA mengonfirmasi mahasiswa ambil MK Tugas Akhir (`students.taking_thesis_course`)
 *
 * Server-side re-validation (audit F-4.4 follow-up): thesis dengan
 * `proposalStatus="submitted"` yang salah satu prasyarat lama terdegradasi TIDAK
 * ditampilkan ke KaDep. Sebagai best-effort cleanup, thesis seperti itu
 * di-dequeue secara async (fire-and-forget) sehingga query berikutnya konsisten.
 * Dequeue authoritative tetap berada di `tryEnqueueThesisForKadepProposalReview`
 * yang dipicu oleh SIA sync, assessment update, P2 approval, dan submitTitleReport.
 */
export async function getPendingTitleReports({ academicYearId } = {}) {
  const theses = await prisma.thesis.findMany({
    where: {
      proposalStatus: "submitted",
      ...(academicYearId ? { academicYearId } : {}),
    },
    include: {
      academicYear: { select: { id: true, year: true, semester: true } },
      student: {
        select: {
          // Legacy review hint. TA-04 awal v2.6 tidak memakai KRS TA sebagai
          // syarat penerbitan; KRS TA dipakai saat promosi aktif.
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        where: { status: "active" },
        include: {
          lecturer: { include: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
      researchMethodScores: {
        select: {
          supervisorScore: true,
          lecturerScore: true,
          coSignedAt: true,
          coSignedByLecturerId: true,
          isFinalized: true,
          finalScore: true,
          attendanceAutoZeroedAt: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const eligibleRows = [];
  for (const t of theses) {
    const score = t.researchMethodScores?.[0] ?? null;
    const hasP2Active = (t.thesisSupervisors ?? []).some(
      (s) => s.role?.name === ROLES.PEMBIMBING_2,
    );
    const hasP1Active = (t.thesisSupervisors ?? []).some(
      (s) => s.role?.name === ROLES.PEMBIMBING_1,
    );

    const ta03aReady =
      score?.supervisorScore != null &&
      (!hasP2Active || (score?.coSignedAt != null && score?.coSignedByLecturerId != null));
    const ta03bReady = score?.lecturerScore != null;
    const proposalFinalReady = Boolean(t.finalProposalVersionId);
    const supervisorReady = hasP1Active; // minimum P1 sebagai pembimbing resmi
    const takingThesisReady = t.student?.takingThesisCourse === true;
    // BR-28 + BR-21: auto-zero (presensi <75%) = gagal Metopel, tidak boleh TA-04.
    const notAutoZeroed = score?.attendanceAutoZeroedAt == null;
    // BR-20: isFinalized menjamin konsensus P2 + TA-03B complete.
    const finalized = score?.isFinalized === true;

    const allMet =
      supervisorReady &&
      proposalFinalReady &&
      ta03aReady &&
      ta03bReady &&
      takingThesisReady &&
      notAutoZeroed &&
      finalized;

    if (!allMet) {
      // Best-effort dequeue: reset proposalStatus di background. Errors di-swallow
      // karena ini hanya cleanup; authoritative dequeue ada di sync triggers.
      tryEnqueueThesisForKadepProposalReview(t.id).catch(() => {});
      continue;
    }

    eligibleRows.push({
      thesisId: t.id,
      title: t.title,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      supervisors: t.thesisSupervisors?.map((s) => s.lecturer?.user?.fullName).join(", ") || "-",
      submittedAt: t.updatedAt,
      academicYear: t.academicYear,
      // Snapshot prasyarat legacy untuk UI KaDep deprecated.
      requirements: {
        supervisorAssigned: supervisorReady,
        proposalFinalSubmitted: proposalFinalReady,
        ta03aComplete: ta03aReady,
        ta03bComplete: ta03bReady,
        // BR-18 (canon §5.8): re-validasi dilakukan saat accept-time juga.
        // Snapshot di sini hanya hint UI; backend tetap re-fetch saat decision.
        takingThesisCourse: takingThesisReady,
      },
      finalScore: score?.finalScore ?? null,
      isFinalized: finalized,
      hasP2: hasP2Active,
    });
  }

  return eligibleRows;
}

/**
 * Riwayat TA-04 (batch awal + legacy accepted/rejected)
 * untuk dashboard KaDep. Mendukung filter academicYearId agar KaDep dapat
 * melihat keputusan antar-periode. Mencatat audit lengkap: tanggal keputusan,
 * KaDep yang memutuskan, catatan, ketersediaan dokumen SK.
 *
 * Canon §5.8 + BR-24: KaDep adalah approver tunggal; melihat riwayat keputusan
 * sendiri adalah bagian akuntabilitas workflow pengesahan, BUKAN surface arsip
 * §5.13 (yang mahasiswa-only).
 */
export async function getKadepTitleReportHistory({ academicYearId } = {}) {
  const theses = await prisma.thesis.findMany({
    where: {
      AND: [
        {
          OR: [
            { proposalStatus: { in: ["accepted", "rejected"] } },
            { ta04AssignmentIssuedAt: { not: null } },
          ],
        },
        academicYearId
          ? {
              OR: [
                { academicYearId },
                { ta04AssignmentAcademicYearId: academicYearId },
              ],
            }
          : {},
      ],
    },
    include: {
      academicYear: { select: { id: true, year: true, semester: true } },
      ta04AssignmentAcademicYear: { select: { id: true, year: true, semester: true } },
      activeAcademicYear: { select: { id: true, year: true, semester: true } },
      finalProposalVersion: { select: { id: true } },
      student: {
        select: {
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      advisorRequests: {
        where: { status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED },
        select: { id: true, status: true },
      },
      thesisSupervisors: {
        where: { status: "active" },
        include: {
          lecturer: { include: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
      researchMethodScores: {
        select: {
          supervisorScore: true,
          lecturerScore: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      titleApprovalDocument: { select: { id: true, fileName: true } },
      proposalReviewedBy: { select: { fullName: true } },
    },
    orderBy: [{ ta04AssignmentIssuedAt: "desc" }, { proposalReviewedAt: "desc" }],
  });

  const academicYearIds = theses
    .map((t) => t.ta04AssignmentAcademicYear?.id ?? t.academicYear?.id)
    .filter(Boolean);
  const currentBatches = await ta04BatchRepo.findCurrentTa04BatchesByAcademicYears(academicYearIds);
  const currentBatchByThesisId = buildCurrentBatchByThesisId(currentBatches);

  return theses.map((t) => {
    const currentBatch = currentBatchByThesisId.get(t.id) ?? null;
    const pointerDocumentKind = resolveTitleApprovalDocumentKind(t.titleApprovalDocument?.fileName);
    const documentKind = currentBatch
      ? "batch"
      : pointerDocumentKind === "batch"
        ? "stale_batch"
        : pointerDocumentKind;
    const batchEligibility = getTa04BatchEligibilitySnapshot(t);

    return {
      thesisId: t.id,
      title: t.ta04AssignmentTitle ?? t.title,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      supervisors: t.ta04AssignmentSupervisorNames ||
        t.thesisSupervisors
          ?.filter((s) => s.role?.name === ROLES.PEMBIMBING_1 || s.role?.name === ROLES.PEMBIMBING_2)
          .map((s) => s.lecturer?.user?.fullName)
          .filter(Boolean)
          .join(", ") || "-",
      proposalStatus: t.proposalStatus,
      isProposal: t.isProposal,
      ta04AssignmentIssuedAt: t.ta04AssignmentIssuedAt,
      activeAcademicYear: t.activeAcademicYear,
      activePromotedAt: t.activePromotedAt,
      reviewedAt: t.ta04AssignmentIssuedAt ?? t.proposalReviewedAt,
      reviewedByName: t.proposalReviewedBy?.fullName ?? null,
      reviewNotes: t.proposalReviewNotes,
      academicYear: t.ta04AssignmentAcademicYear ?? t.academicYear,
      titleApprovalDocument: currentBatch
        ? currentBatch.document
        : documentKind
          ? t.titleApprovalDocument
          : null,
      documentKind,
      ta04BatchEligible: batchEligibility.eligible,
      ta04BatchBlock: batchEligibility.block,
      ta04Batch: currentBatch
        ? {
            id: currentBatch.id,
            documentId: currentBatch.documentId,
            version: currentBatch.version,
            cohortHash: currentBatch.cohortHash,
            memberCount: currentBatch.members?.length ?? 0,
          }
        : null,
    };
  });
}

function checkGateOpen(tasks) {
  void tasks;
  return true;
}

/**
 * Legacy compatibility export.
 * Formulir TA-04 resmi tidak lagi dibuat per thesis. Dokumen resmi hanya
 * diterbitkan melalui finalisasi batch periode di advisorRequest.service.js.
 */
export async function generateTitleApprovalLetter(thesisId) {
  void thesisId;
  return null;
}

/**
 * Legacy compatibility export. Tidak menghasilkan dokumen per mahasiswa.
 */
export async function generateTitleApprovalLetterWithRetry(thesisId, { attempts = 3 } = {}) {
  void thesisId;
  void attempts;
  return { ok: true, document: null };
}

/**
 * Daftar booking TA-01/TA-02 yang belum terhubung ke Formulir TA-04 awal
 * batch resmi. Dokumen lama non-batch diperlakukan belum resmi.
 */
export async function getAcceptedThesesMissingApprovalDocument({ academicYearId } = {}) {
  const theses = await prisma.thesis.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      advisorRequests: {
        some: {
          status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
          ...(academicYearId ? { academicYearId } : {}),
        },
      },
    },
    select: {
      id: true,
      title: true,
      proposalStatus: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
      ta04AssignmentSupervisorNames: true,
      advisorRequests: {
        where: { status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED },
        select: { id: true, status: true },
      },
      finalProposalVersionId: true,
      proposalReviewedAt: true,
      academicYear: { select: { id: true, year: true, semester: true } },
      student: {
        select: {
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          status: true,
          role: { select: { name: true } },
        },
      },
      researchMethodScores: {
        select: {
          supervisorScore: true,
          lecturerScore: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      titleApprovalDocument: { select: { id: true, fileName: true, filePath: true } },
    },
    orderBy: [{ ta04AssignmentIssuedAt: "desc" }, { updatedAt: "desc" }],
  });

  const academicYearIds = theses.map((t) => t.academicYear?.id).filter(Boolean);
  const currentBatches = await ta04BatchRepo.findCurrentTa04BatchesByAcademicYears(academicYearIds);
  const currentBatchByThesisId = buildCurrentBatchByThesisId(currentBatches);

  return theses
    .filter((t) => getTa04BatchEligibilitySnapshot(t).eligible)
    .filter((t) => !currentBatchByThesisId.has(t.id))
    .map((t) => ({
      thesisId: t.id,
      title: t.ta04AssignmentTitle ?? t.title ?? null,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      approvedAt: t.ta04AssignmentIssuedAt ?? t.proposalReviewedAt,
      academicYear: t.academicYear,
    }));
}

/**
 * Regenerasi dokumen per mahasiswa tidak lagi menjadi jalur resmi. Formulir TA-04
 * harus diterbitkan lewat finalisasi batch periode agar satu dokumen resmi
 * memuat seluruh mahasiswa pada semester tersebut.
 */
export async function regenerateTitleApprovalLetter(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  throw new BadRequestError(
    "Formulir TA-04 hanya diterbitkan melalui finalisasi batch periode. Gunakan aksi finalisasi/perbarui batch pada riwayat TA-04.",
  );
}

/**
 * FR-ARC-05: Mahasiswa mengunduh Formulir TA-04 PDF miliknya.
 * Verifikasi kepemilikan via `findStudentThesis` (hanya pemilik thesis yang boleh).
 * Mengembalikan { absolutePath, fileName } untuk di-stream controller.
 *
 * Catatan canon §5.13 / OQ-2.3 v2.4: surface arsip 4-kategori = mahasiswa-only.
 * Endpoint ini adalah jalur download terautentikasi untuk kategori ke-4 (Formulir TA-04),
 * bukan surface "arsip dosen" baru — tetap mahasiswa-only via RBAC route.
 */
export async function getTitleApprovalDocumentForStudent(userId) {
  const thesis = await ta04BatchRepo.findAcceptedThesisForStudentTitleApproval(userId);
  if (!thesis) {
    throw new NotFoundError("Tugas Akhir tidak ditemukan");
  }

  const batch = await ta04BatchRepo.findCurrentTa04BatchForThesis(thesis.id);
  if (!batch?.document || !isOfficialTitleApprovalDocument(batch.document)) {
    throw new NotFoundError(
      "Formulir TA-04 resmi belum tersedia untuk periode ini. KaDep perlu memfinalisasi batch periode terlebih dahulu.",
    );
  }

  return resolveTitleApprovalDocumentPath(batch.document);
}

/**
 * KaDep mengunduh Formulir TA-04 PDF untuk thesis yang sudah terhubung ke batch.
 * KaDep adalah approver tunggal (BR-24) sekaligus penandatangan SK — mengunduh
 * dokumen kerja pengesahan adalah bagian workflow KaDep, BUKAN surface arsip
 * dosen baru (OQ-2.3 v2.4 tetap dijaga: arsip surface §5.13 = mahasiswa-only).
 */
export async function getTitleApprovalDocumentForKadep(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      ta04AssignmentIssuedAt: true,
    },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (!thesis.ta04AssignmentIssuedAt) {
    throw new NotFoundError("Formulir TA-04 hanya tersedia untuk thesis yang sudah masuk batch TA-04 awal.");
  }

  const batch = await ta04BatchRepo.findCurrentTa04BatchForThesis(thesisId);
  if (!batch?.document || !isOfficialTitleApprovalDocument(batch.document)) {
    throw new NotFoundError(
      "Formulir TA-04 belum tersedia untuk thesis ini. Finalisasi batch periode terlebih dahulu.",
    );
  }

  return resolveTitleApprovalDocumentPath(batch.document);
}

/**
 * Helper: resolve document.filePath (relative, mis.
 * "uploads/documents/ta04/TA04_BATCH_...pdf") ke absolute path yang aman
 * untuk di-stream. Anti path-traversal: resolved path wajib berada di bawah
 * <cwd>/uploads. Verifikasi file eksis di disk.
 */
function resolveTitleApprovalDocumentPath(documentRow) {
  const relativePath = String(documentRow.filePath || "").trim();
  if (!relativePath) {
    throw new NotFoundError("Path Formulir TA-04 tidak valid");
  }

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const absolutePath = path.resolve(process.cwd(), relativePath);
  if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
    throw new NotFoundError("Akses Formulir TA-04 ditolak (path di luar folder uploads)");
  }
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError("File Formulir TA-04 tidak ditemukan di disk");
  }

  return {
    absolutePath,
    fileName: documentRow.fileName || path.basename(absolutePath),
  };
}

/**
 * Bulk ACC gate milestones (legacy Koordinator Metopen batch action).
 * Gate milestone sudah dihapus dari scope aktif SIMPTA.
 */
export async function bulkAccGateMilestones(milestoneIds, lecturerId) {
  void milestoneIds;
  void lecturerId;
  throw new BadRequestError(
    "Gate milestone Metopen sudah dihapus. Gunakan penilaian TA-03A/TA-03B dan deliverable proposal biasa."
  );
}

// ============================================
// Academic Year
// ============================================

export async function getAcademicYears() {
  const { getAcademicYearsWithStatus } = await import("../helpers/academicYear.helper.js");
  return getAcademicYearsWithStatus();
}

// ============================================
// Deprecated Class Management
// ============================================

function throwMetopenClassRemoved() {
  throw new BadRequestError(
    "Kelas Metopen sudah dihapus dari scope aktif SIMPTA. Gunakan deliverable proposal berbasis thesis dan academic year."
  );
}

export async function getClasses(lecturerId, academicYearId = null) {
  void lecturerId;
  void academicYearId;
  throwMetopenClassRemoved();
}

export async function getClassById(classId) {
  void classId;
  throwMetopenClassRemoved();
}

export async function createClass(lecturerId, data) {
  void lecturerId;
  void data;
  throwMetopenClassRemoved();
}

export async function updateClass(classId, data) {
  void classId;
  void data;
  throwMetopenClassRemoved();
}

export async function deleteClass(classId) {
  void classId;
  throwMetopenClassRemoved();
}

export async function enrollStudents(classId, studentIds) {
  void classId;
  void studentIds;
  throwMetopenClassRemoved();
}

export async function unenrollStudent(classId, studentId) {
  void classId;
  void studentId;
  throwMetopenClassRemoved();
}

export async function publishToClass(classId, data, lecturerId) {
  void classId;
  void data;
  void lecturerId;
  throwMetopenClassRemoved();
}

export async function getClassTasks(classId) {
  void classId;
  throwMetopenClassRemoved();
}

export async function getPublishedTemplateIds(classId) {
  void classId;
  throwMetopenClassRemoved();
}

export async function getRoster(lecturerId, academicYearId = null) {
  void lecturerId;
  void academicYearId;
  throwMetopenClassRemoved();
}

export async function autoSyncClass(lecturerId) {
  void lecturerId;
  throwMetopenClassRemoved();
}
