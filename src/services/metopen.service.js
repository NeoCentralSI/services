import fs from "fs";
import path from "path";
import * as repo from "../repositories/metopen.repository.js";
import prisma from "../config/prisma.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { ENV } from "../config/env.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
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

  const isSupervisor = await prisma.thesisParticipant.findFirst({
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
    const supervisorRecord = await prisma.thesisParticipant.findFirst({
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
  };
}

// ============================================
// Seminar Eligibility Gate (FR-SYS-01)
// ============================================

/**
 * When Metopen prerequisites are met, move thesis into KaDep review queue without a
 * separate student action (PANDUAN TA 2025 §2.1.2 Langkah 4–6).
 * Idempotent. Safe to call from read paths (e.g. eligibility check).
 */
export async function syncKadepProposalQueueForStudent(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) return { synced: false };
  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  return { synced: result.updated, ...result };
}

/** Call after persisting TA-03A/TA-03B scores so antre KaDep updates without a student refresh. */
export async function syncKadepProposalQueueByThesisId(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { studentId: true },
  });
  if (!thesis) return { synced: false };
  return syncKadepProposalQueueForStudent(thesis.studentId);
}

/**
 * Pure read of seminar eligibility (FR-SYS-01). Does **not** run
 * `syncKadepProposalQueueForStudent` — safe for GET REST handlers (no hidden writes).
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
 * Side effect: runs `syncKadepProposalQueueForStudent` first (jobs/tests/backfill).
 * For HTTP GET, prefer `getSeminarEligibilitySnapshot` + explicit POST sync.
 */
export async function checkSeminarEligibility(userId) {
  await syncKadepProposalQueueForStudent(userId);
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
      proposalStatus: true,
      titleApprovalDocumentId: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      updatedAt: true,
      titleApprovalDocument: {
        select: { id: true, fileName: true, filePath: true },
      },
    },
  });

  return { thesis: row };
}

/**
 * BR-23 (canon §5.13): Endpoint mahasiswa-side untuk arsip Metopel pasca TA-04.
 *
 * SIMPTA = Single Source of Truth. Mahasiswa berhak melihat kembali 4 kategori
 * data setelah judul disahkan:
 *   1. Substansi pengajuan awal TA-01/TA-02 (latar belakang, tujuan, dst).
 *   2. Detail rubrik TA-03A per CPMK + descriptor + catatan P1 + co-sign P2.
 *   3. Detail rubrik TA-03B per kriteria + descriptor + catatan Koordinator.
 *   4. Dokumen SK Penugasan Pembimbing TA-04 PDF (tombol unduh).
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
          assessmentRubric: true,
          criteria: {
            include: {
              cpmk: { select: { code: true, description: true, type: true } },
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

  // (4) Dokumen SK TA-04 PDF
  const titleApproval = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    select: {
      title: true,
      proposalStatus: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      titleApprovalDocument: {
        select: { id: true, fileName: true, filePath: true },
      },
    },
  });

  // Bagi detail rubrik berdasarkan role kriteria (supervisor → TA-03A, default → TA-03B)
  const supervisorDetails = (score?.researchMethodScoreDetails ?? []).filter(
    (d) => d.criteria?.cpmk?.type === "research_method",
  );
  const ta03aDetails = supervisorDetails.filter((d) => {
    const criteriaName = d.criteria?.name ?? "";
    return criteriaName.toLowerCase().includes("presentasi")
      || criteriaName.toLowerCase().includes("penulisan")
      || criteriaName.toLowerCase().includes("respons")
      || criteriaName.toLowerCase().includes("kelayakan")
      || criteriaName.toLowerCase().includes("metodologi")
      || criteriaName.toLowerCase().includes("kajian")
      || criteriaName.toLowerCase().includes("pendahuluan");
  });
  // Untuk pembagian fallback bila kriteria tidak ter-tag berdasarkan nama,
  // gunakan total skor sebagai indikasi: yang berkontribusi ke supervisorScore vs lecturerScore.
  // Default: semua tampilkan apa adanya, biarkan UI yang menampilkan section.

  return {
    thesisId: thesis.id,
    thesisTitle: titleApproval?.title ?? null,
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
      reviewedAt: titleApproval?.proposalReviewedAt ?? null,
      document: titleApproval?.titleApprovalDocument ?? null,
    },
    readOnly: true,
  };
}

/**
 * Idempotent: sinkronkan antre KaDep lalu kembalikan ringkasan untuk UI.
 */
export async function syncProposalQueueAndSummarizeForStudent(userId) {
  const sync = await syncKadepProposalQueueForStudent(userId);
  const proposal = await getStudentProposalApprovalStatus(userId);
  const eligibility = await getSeminarEligibilitySnapshot(userId);
  return { sync, proposal, eligibility };
}

// ============================================
// Antre KaDep / pengesahan judul (Panduan §2.1.2 Langkah 4–6, FR-MHS-06, FR-KDP-05)
// ============================================

/**
 * If submit proposal final, TA-03A, TA-03B, and SIA confirmation "sedang ambil
 * mata kuliah TA" are satisfied, set proposalStatus to "submitted" for KaDep
 * (Langkah 6) without requiring a separate student button.
 * @returns {{ updated: boolean, proposalStatus?: string, block?: string }}
 */
async function tryEnqueueThesisForKadepProposalReview(thesisId) {
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
  if (!thesis) return { updated: false, block: "no_thesis" };

  if (thesis.proposalStatus === "submitted") {
    return { updated: false, proposalStatus: "submitted" };
  }
  if (thesis.proposalStatus === "accepted") {
    return { updated: false, proposalStatus: "accepted" };
  }

  const supervisors = await prisma.thesisParticipant.count({
    where: {
      thesisId: thesis.id,
      status: "active",
      role: {
        is: {
          name: {
            in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
          },
        },
      },
    },
  });
  if (supervisors === 0) {
    return { updated: false, block: "no_supervisor" };
  }

  if (!thesis.title || !String(thesis.title).trim()) {
    return { updated: false, block: "no_title" };
  }

  if (!thesis.finalProposalVersionId) {
    return { updated: false, block: "proposal_final_not_submitted" };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
  });
  if (!rmScore || rmScore.supervisorScore == null || rmScore.lecturerScore == null) {
    return { updated: false, block: "missing_scores" };
  }

  const student = await prisma.student.findUnique({
    where: { id: thesis.studentId },
    select: { takingThesisCourse: true },
  });
  if (student?.takingThesisCourse !== true) {
    return { updated: false, block: "ta_course_not_confirmed" };
  }

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: {
      proposalStatus: "submitted",
      proposalReviewNotes: null,
      proposalReviewedAt: null,
      proposalReviewedByUserId: null,
    },
  });

  return { updated: true, proposalStatus: "submitted" };
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
  if (block === "ta_course_not_confirmed") {
    return new BadRequestError(
      "TA-04 hanya dapat diproses setelah data SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir."
    );
  }
  return new BadRequestError("Persyaratan belum terpenuhi");
}

/**
 * Legacy / idempotent hook: same as sistem otomatis. Panduan tidak mewajibkan aksi
 * mahasiswa terpisah; endpoint tetap ada agar klien lama tidak rusak.
 */
export async function submitTitleReport(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus === "submitted") {
    return { thesisId: thesis.id, title: thesis.title, proposalStatus: "submitted" };
  }
  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError("Judul TA sudah disetujui");
  }

  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  if (result.updated) {
    return { thesisId: thesis.id, title: thesis.title, proposalStatus: "submitted" };
  }
  throw badRequestForKadepEnqueueBlock(result.block);
}

/**
 * KaDep approves or rejects the reported title.
 *
 * Canonical rule (KONTEKS_KANONIS_SIMPTA.md §5.8): TA-04 only proceeds when
 * SIA confirms the student is currently enrolled in the Tugas Akhir course
 * (`students.taking_thesis_course = true`). The enqueue gate already enforces
 * this, but we re-validate here at accept-time to close the race window where
 * SIA changes between enqueue and KaDep approval.
 */
export async function reviewTitleReport(thesisId, action, notes, reviewedBy) {
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
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
    const student = await prisma.student.findUnique({
      where: { id: thesis.studentId },
      select: { takingThesisCourse: true },
    });
    if (student?.takingThesisCourse !== true) {
      throw new BadRequestError(
        "TA-04 hanya dapat diproses setelah data SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.thesis.update({
        where: { id: thesisId },
        data: {
          proposalStatus: "accepted",
          isProposal: false,
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

    generateTitleApprovalLetter(thesisId).catch((err) => {
      console.error("[reviewTitleReport] generateTitleApprovalLetter failed:", err);
    });

    return { thesisId, proposalStatus: "accepted" };
  }

  if (action === "reject") {
    throw new BadRequestError(
      "Proposal final tidak ditolak pada scope aktif. Revisi wajib diselesaikan melalui logbook/progress sebelum submit final.",
    );
  }

  throw new BadRequestError("Aksi tidak valid. Gunakan 'accept'.");
}

/**
 * Get title reports pending KaDep review (optional filter by academic year).
 *
 * P0-05 + BR-18 + P1-11 (audit 2026-05-10): Setiap row memuat snapshot
 * 5 syarat TA-04 yang harus dipenuhi sebelum disahkan, agar UI KaDep
 * dapat menampilkan checklist visual:
 *   1. Pembimbing resmi (≥1 active thesis_participant)
 *   2. Proposal final ditetapkan (`finalProposalVersionId` non-null)
 *   3. TA-03A diisi P1 master + (jika P2 ada) P2 co-sign
 *   4. TA-03B diisi Koordinator Metopen
 *   5. SIA mengonfirmasi mahasiswa ambil MK Tugas Akhir (`students.taking_thesis_course`)
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
          // BR-18: re-validasi takingThesisCourse pada accept-time, tetapi
          // snapshot juga dikirim ke UI sebagai hint checklist 5 syarat.
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
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  return theses.map((t) => {
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

    return {
      thesisId: t.id,
      title: t.title,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      supervisors: t.thesisSupervisors?.map((s) => s.lecturer?.user?.fullName).join(", ") || "-",
      submittedAt: t.updatedAt,
      academicYear: t.academicYear,
      // P0-05 + P1-11: snapshot 5 syarat TA-04 untuk UI KaDep
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
      isFinalized: score?.isFinalized ?? false,
      hasP2: hasP2Active,
    };
  });
}

function checkGateOpen(tasks) {
  void tasks;
  return true;
}

/**
 * Generate Surat Persetujuan Judul TA (background, non-blocking).
 * Exported for BullMQ worker.
 */
export async function generateTitleApprovalLetter(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: { include: { user: { select: { fullName: true, identityNumber: true } } } },
      thesisSupervisors: {
        include: {
          lecturer: { include: { user: { select: { fullName: true, identityNumber: true } } } },
          role: { select: { name: true } },
        },
      },
      academicYear: { select: { year: true, semester: true } },
    },
  });

  if (!thesis) return;

  const fsm = await import("fs/promises");
  const pathm = await import("path");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const academicYearLabel = thesis.academicYear
    ? `${thesis.academicYear.year ?? "-"} ${thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"}`
    : "-";
  const letterNumber = `SPJTA/${now.getFullYear()}/${thesisId.substring(0, 8).toUpperCase()}`;

  const thesisSupervisors = thesis.thesisSupervisors ?? [];
  const supervisorNames = [...new Set(thesisSupervisors
    .slice()
    .sort((a, b) => {
      const order = (roleName) => {
        if (roleName === ROLES.PEMBIMBING_1) return 0;
        if (roleName === ROLES.PEMBIMBING_2) return 1;
        return 99;
      };
      return order(a.role?.name) - order(b.role?.name);
    })
    .map((s) => s.lecturer?.user?.fullName ?? "-")
    .filter(Boolean))]
    .join(", ");

  // Find active KaDep for pengesahan
  const kadepRole = await prisma.userRole?.findFirst?.({
    where: { name: ROLES.KETUA_DEPARTEMEN },
    select: { id: true },
  });
  let kadep = null;
  if (kadepRole) {
    const assignment = await prisma.userHasRole?.findFirst?.({
      where: { roleId: kadepRole.id, status: "active" },
      include: { user: { select: { fullName: true, identityNumber: true } } },
    });
    kadep = assignment?.user ?? null;
  }

  const semesterLabel = thesis.academicYear
    ? `${thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${thesis.academicYear.year ?? ""}`
    : "-";

  const pdfBuffer = await generateTA04Pdf({
    semester: semesterLabel,
    entries: [{
      studentName: thesis.student?.user?.fullName ?? "-",
      nim: thesis.student?.user?.identityNumber ?? "-",
      title: thesis.title || "Belum ditentukan",
      supervisorName: supervisorNames || "-",
    }],
    dateGenerated: dateStr,
    kadepName: kadep?.fullName ?? "(...............................)",
    kadepNip: kadep?.identityNumber ?? "(...............................)",
  });

  const outputDir = pathm.join(process.cwd(), "uploads", "documents", "title-approval");
  await fsm.mkdir(outputDir, { recursive: true });
  const fileName = `SPJTA_${thesis.student?.user?.identityNumber}_${Date.now()}.pdf`;
  const filePath = pathm.join(outputDir, fileName);
  await fsm.writeFile(filePath, pdfBuffer);

  const document = await prisma.document.create({
    data: {
      fileName,
      filePath: `uploads/documents/title-approval/${fileName}`,
      fileSize: pdfBuffer.length,
      mimeType: "application/pdf",
      documentTypeId: null,
    },
  });

  await prisma.thesis.update({
    where: { id: thesisId },
    data: { titleApprovalDocumentId: document.id },
  });
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
