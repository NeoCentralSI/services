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
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";

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
    weightPercentage: data.weightPercentage ?? null,
    isGateToAdvisorSearch: data.isGateToAdvisorSearch ?? false,
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
  if (data.weightPercentage !== undefined) updateData.weightPercentage = data.weightPercentage;
  if (data.isGateToAdvisorSearch !== undefined) updateData.isGateToAdvisorSearch = data.isGateToAdvisorSearch;

  return repo.updateTemplate(templateId, updateData);
}

/**
 * Delete metopen template
 */
export async function deleteTemplate(templateId) {
  const existing = await repo.findTemplateById(templateId);
  if (!existing) throw new NotFoundError("Template tidak ditemukan");

  // Check if template has active milestones
  const hasActiveMilestones = await prisma.thesisMilestone.count({
    where: { milestoneTemplateId: templateId, status: { not: "deleted" } },
  });

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

  const document = await prisma.document.create({
    data: {
      userId,
      fileName: file.originalname,
      filePath: relativeFilePath,
    },
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

    const document = await prisma.document.create({
      data: {
        userId,
        fileName: file.originalname,
        filePath: relativeFilePath,
      },
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
// Publish Stats (Per-Template Per-Class Overview)
// ============================================

/**
 * Get publish status per template per class.
 * Returns: array of { templateId, className, classId, deadline, total, submitted, completed, late, notStarted, students[] }
 */
export async function getPublishStats() {
  const milestones = await repo.findPublishStats();

  // Group by templateId → className
  const statsMap = new Map();

  for (const m of milestones) {
    const templateId = m.milestoneTemplateId;
    const student = m.thesis?.student;
    
    // Check if the milestone itself has a classId, otherwise fallback to student's current enrollment
    const classIdFromMilestone = m.metopenClassId;
    const enrollment = student?.metopenClassEnrollments?.[0];
    
    const actualClassId = classIdFromMilestone || enrollment?.metopenClass?.id || "none";
    const actualClassName = (classIdFromMilestone ? m.metopenClass?.name : enrollment?.metopenClass?.name) || "Tanpa Kelas";

    const key = `${templateId}__${actualClassId}`;

    if (!statsMap.has(key)) {
      statsMap.set(key, {
        templateId,
        classId: actualClassId,
        className: actualClassName,
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

    // Track deadline (use first one found, they should all be the same per class)
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

  return { thesisId: thesis.id, tasks, progress, gateOpen };
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

  return task;
}

/**
 * Submit a task (student submits work)
 */
export async function submitTask(milestoneId, userId, data) {
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
    const supervisorCount = await prisma.thesisSupervisors.count({
      where: {
        thesisId: task.thesisId,
        role: {
          is: {
            name: {
              in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
            },
          },
        },
      },
    });
    if (supervisorCount === 0) {
      throw new ForbiddenError(
        "Tugas ini membutuhkan dosen pembimbing. Silakan cari dan dapatkan dosen pembimbing terlebih dahulu."
      );
    }
  }

  const now = new Date();
  const files = Array.isArray(data.files) ? data.files : data.file ? [data.file] : [];

  if (files.length > 10) {
    throw new BadRequestError("Maksimal 10 dokumen per pengumpulan");
  }

  // Handle file uploads if present
  if (files.length > 0) {
    const uploadsDir = path.join(process.cwd(), "uploads", "metopen", "submissions", milestoneId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Set all previous documents for this milestone to isLatest = false
    await prisma.thesisMilestoneDocument.updateMany({
      where: { milestoneId },
      data: { isLatest: false },
    });

    const nextVersion = (await prisma.thesisMilestoneDocument.count({ where: { milestoneId } })) + 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueId = `${Date.now().toString(36)}-${i}`;
      const fileName = `${uniqueId}-${file.originalname}`;
      const relativeFilePath = `uploads/metopen/submissions/${milestoneId}/${fileName}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, file.buffer);

      await prisma.thesisMilestoneDocument.create({
        data: {
          milestoneId,
          fileName: file.originalname,
          filePath: relativeFilePath,
          fileSize: file.size,
          mimeType: file.mimetype,
          isLatest: true,
          version: nextVersion,
        },
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
    const validGuidances = await prisma.thesisGuidance.findMany({
      where: {
        id: { in: guidanceIds },
        thesisId: task.thesisId,
        status: "completed",
      },
      select: { id: true },
    });

    if (validGuidances.length !== guidanceIds.length) {
      throw new BadRequestError(
        "Beberapa sesi bimbingan tidak valid atau belum disetujui dosen."
      );
    }

    // Remove existing links for this milestone, then create new ones
    await prisma.thesisGuidanceMilestone.deleteMany({
      where: { milestoneId },
    });

    if (validGuidances.length > 0) {
      await prisma.thesisGuidanceMilestone.createMany({
        data: validGuidances.map((g) => ({
          guidanceId: g.id,
          milestoneId,
        })),
      });
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

  return prisma.thesisGuidance.findMany({
    where: {
      thesisId: thesis.id,
      status: "completed",
    },
    select: {
      id: true,
      requestedDate: true,
      approvedDate: true,
      completedAt: true,
      sessionSummary: true,
      supervisorFeedback: true,
      supervisor: {
        select: {
          user: { select: { id: true, fullName: true } },
        },
      },
      milestones: {
        select: { milestoneId: true },
      },
    },
    orderBy: { completedAt: "desc" },
  });
}

/**
 * Get guidance sessions linked to a specific milestone
 */
export async function getLinkedGuidances(milestoneId) {
  const links = await prisma.thesisGuidanceMilestone.findMany({
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
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  return links.map((l) => l.guidance);
}

/**
 * Get student's gate status
 */
export async function getMyGateStatus(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return { gateOpen: false, reason: "Thesis tidak ditemukan" };
  }

  const tasks = await repo.findTasksByThesisId(thesis.id);
  const gateOpen = checkGateOpen(tasks);

  const gates = tasks
    .filter((t) => t.milestoneTemplate?.isGateToAdvisorSearch)
    .map((t) => ({
      id: t.id,
      title: t.title,
      templateName: t.milestoneTemplate?.name ?? t.title,
      status: t.status,
      isCompleted: t.status === "completed",
    }));

  return {
    gateOpen,
    reason: gateOpen ? "Semua gate milestone sudah selesai" : "Masih ada gate milestone yang belum selesai",
    gates,
  };
}

// ============================================
// Grading Services (Dosen Metopen)
// ============================================

/**
 * Get metopen progress for students supervised by the authenticated lecturer (FR-PGP-04)
 */
export async function getMySupervisedProgress(lecturerId) {
  const supervisedTheses = await prisma.thesisSupervisors.findMany({
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
          researchMethodScores: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { supervisorScore: true, lecturerScore: true, finalScore: true, isFinalized: true },
          },
        },
      },
      role: { select: { name: true } },
    },
  });

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
    metopenClassId: m.metopenClassId,
    className: m.metopenClass?.name ?? "Tanpa Kelas",
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

  return updated;
}

// ============================================
// Progress & Gate Services
// ============================================

export async function getProgress(thesisId) {
  const tasks = await repo.findTasksByThesisId(thesisId);
  const { total, completed } = await repo.getThesisMetopenProgress(thesisId);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const gateOpen = checkGateOpen(tasks);

  const milestones = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    weight: t.milestoneTemplate?.weightPercentage ?? 0,
    isGate: t.milestoneTemplate?.isGateToAdvisorSearch ?? false,
  }));

  return { progress, totalTasks: total, completedTasks: completed, gateOpen, milestones };
}

export async function getGateStatus(thesisId) {
  const tasks = await repo.findTasksByThesisId(thesisId);
  const gateOpen = checkGateOpen(tasks);

  const gates = tasks
    .filter((t) => t.milestoneTemplate?.isGateToAdvisorSearch)
    .map((t) => ({
      id: t.id,
      title: t.title,
      templateName: t.milestoneTemplate?.name ?? t.title,
      status: t.status,
      isCompleted: t.status === "completed",
    }));

  return { gateOpen, gates };
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

  const where = { thesisStatus: { name: "Metopel" } };
  if (resolvedAcademicYearId) {
    where.academicYearId = resolvedAcademicYearId;
  }

  const theses = await prisma.thesis.findMany({
    where,
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
          metopenClassEnrollments: {
            where: resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : undefined,
            include: { metopenClass: true },
          },
        },
      },
    },
  });

  return theses.map((thesis) => {
    const classAssignments = (thesis.student?.metopenClassEnrollments ?? []).map((enrollment) => ({
      classId: enrollment.metopenClass?.id ?? enrollment.classId,
      className: enrollment.metopenClass?.name ?? "Kelas Tidak Diketahui",
    }));
    const enrollment = classAssignments[0];
    const uniqueClassIds = new Set(classAssignments.map((assignment) => assignment.classId).filter(Boolean));

    return {
      thesisId: thesis.id,
      studentId: thesis.studentId,
      studentName: thesis.student?.user?.fullName ?? "-",
      studentNim: thesis.student?.user?.identityNumber ?? "-",
      topicId: thesis.thesisTopicId ?? null,
      className: enrollment?.className || "Kelas Tidak Diketahui",
      classId: enrollment?.classId || null,
      classAssignments,
      classCount: uniqueClassIds.size,
      hasDuplicateEnrollment: uniqueClassIds.size > 1,
    };
  });
}

/**
 * Publish metopen tasks with re-assignment prevention.
 */
export async function publishTasks({ startDate = null, templateDeadlines = null, studentIds = null, templateIds = null, classId = null } = {}) {
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

  // Prevent re-assigning same template to same class/student group
  if (classId && templateIds?.length > 0) {
    const existing = await prisma.thesisMilestone.findFirst({
      where: {
        metopenClassId: classId,
        milestoneTemplateId: { in: templateIds },
        status: { not: "deleted" },
      },
    });
    if (existing) {
      const tmpl = templates.find(t => t.id === existing.milestoneTemplateId);
      throw new BadRequestError(`Tugas "${tmpl?.name}" sudah pernah di-publish ke kelas ini.`);
    }
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
        orderIndex: i,
        milestoneTemplateId: tmpl.id,
        metopenClassId: classId,
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
 * Update deadline for a specific template in a specific class.
 */
export async function updatePublishDeadline(templateId, classId, newDeadline) {
  // pastikan string kosong, undefined, dan "none" terpetakan ke null
  const actualClassId = (classId === "none" || !classId || classId === "") ? null : classId;
  const result = await prisma.thesisMilestone.updateMany({
    where: {
      milestoneTemplateId: templateId,
      metopenClassId: actualClassId,
      status: { notIn: ["completed", "deleted"] },
    },
    data: { targetDate: new Date(newDeadline) },
  });

  if (result.count === 0) {
    throw new NotFoundError("Tidak ada tugas berjalan yang ditemukan untuk diperbarui di kelas ini.");
  }
  
  return { updatedCount: result.count };
}

/**
 * Delete all published tasks for a specific template in a specific class.
 * Returns total deleted and how many were already submitted.
 */
export async function deletePublishedTasks(templateId, classId) {
  const actualClassId = (classId === "none" || !classId || classId === "") ? null : classId;

  // Build a where clause that matches how getPublishStats groups items
  // This ensures that what the user sees in the UI row is exactly what gets deleted
  const buildWhere = (countOnlySubmitted = false) => {
    const baseWhere = {
      milestoneTemplateId: templateId,
    };

    if (countOnlySubmitted) {
      baseWhere.status = { in: ["pending_review", "completed"] };
    }

    // Matching logic from getPublishStats:
    // actualClassId = m.metopenClassId || enrollment?.metopenClassId || "none"
    if (actualClassId) {
      // If we are deleting for a specific class
      return {
        ...baseWhere,
        OR: [
          { metopenClassId: actualClassId },
          {
            metopenClassId: null,
            thesis: {
              student: {
                metopenClassEnrollments: {
                  some: { classId: actualClassId }
                }
              }
            }
          }
        ]
      };
    } else {
      // If we are deleting for "Tanpa Kelas" (actualClassId is null)
      return {
        ...baseWhere,
        metopenClassId: null,
        thesis: {
          student: {
            metopenClassEnrollments: {
              none: {}
            }
          }
        }
      };
    }
  };

  const totalCount = await prisma.thesisMilestone.count({ where: buildWhere(false) });
  const submittedCount = await prisma.thesisMilestone.count({ where: buildWhere(true) });

  const milestones = await prisma.thesisMilestone.findMany({
    where: buildWhere(false),
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
 * Check if student is eligible for metopen.
 *
 * Requirements:
 *   1. Mengambil mata kuliah Metodologi Penelitian
 *
 * This should eventually come from real SIA API integration.
 */
export async function checkEligibility(userId) {
  // SIA integration deferred — thesis status "Metopel" acts as proxy for
  // department confirmation that the student is enrolled in Metodologi Penelitian.
  // Replace the DB check with a real SIA API call once the integration is available.
  const thesis = await repo.findStudentThesis(userId);

  const hasMetopenCourse = !!(thesis && thesis.thesisStatus?.name === "Metopel");
  const canAccess = hasMetopenCourse;

  return {
    hasMetopenCourse,
    canAccess,
    source: "db",
  };
}

// ============================================
// Seminar Eligibility Gate (FR-SYS-01)
// ============================================

/**
 * Check if a student is eligible for Seminar Hasil registration.
 *
 * All four gates must be satisfied:
 *   1. Lulus Metopel (ResearchMethodScore.finalScore >= 60, isFinalized)
 *   2. Proposal di-ACC (Thesis.proposalStatus === "accepted")
 *   3. Minimal 8 sesi bimbingan completed (ThesisGuidance.status === "completed")
 *   4. Minimal 8 kehadiran audiens seminar yang disetujui (ThesisSeminarAudience.isPresent)
 *
 * Returns eligibility status with a detailed per-requirement breakdown.
 */
export async function checkSeminarEligibility(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return {
      eligible: false,
      reason: "Tugas Akhir tidak ditemukan",
      requirements: {
        metopelPassed: false,
        metopelScore: null,
        proposalAccepted: false,
        proposalStatus: null,
        guidanceCompleted: 0,
        guidanceRequired: 8,
        guidanceMet: false,
        audienceAttended: 0,
        audienceRequired: 8,
        audienceMet: false,
      },
    };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id, isFinalized: true },
  });

  const metopelPassed = !!(rmScore && rmScore.finalScore != null && rmScore.finalScore >= 60);
  const proposalAccepted = thesis.proposalStatus === "accepted";

  const guidanceCompleted = await prisma.thesisGuidance.count({
    where: { thesisId: thesis.id, status: "completed" },
  });
  const guidanceMet = guidanceCompleted >= 8;

  const audienceAttended = await prisma.thesisSeminarAudience.count({
    where: {
      studentId: thesis.studentId,
      isPresent: true,
    },
  });
  const audienceMet = audienceAttended >= 8;

  const eligible = metopelPassed && proposalAccepted && guidanceMet && audienceMet;

  const missingParts = [];
  if (!metopelPassed) missingParts.push("Lulus Metopel");
  if (!proposalAccepted) missingParts.push("Proposal di-ACC");
  if (!guidanceMet) missingParts.push(`Minimal 8 sesi bimbingan (saat ini ${guidanceCompleted})`);
  if (!audienceMet) missingParts.push(`Minimal 8 kehadiran audiens (saat ini ${audienceAttended})`);

  const reason = eligible
    ? "Semua syarat terpenuhi. Anda dapat mendaftar Seminar Hasil."
    : `Syarat belum terpenuhi: ${missingParts.join("; ")}.`;

  return {
    eligible,
    reason,
    requirements: {
      metopelPassed,
      metopelScore: rmScore?.finalScore ?? null,
      proposalAccepted,
      proposalStatus: thesis.proposalStatus ?? null,
      guidanceCompleted,
      guidanceRequired: 8,
      guidanceMet,
      audienceAttended,
      audienceRequired: 8,
      audienceMet,
    },
  };
}

// ============================================
// Lapor Judul TA (FR-MHS-06, FR-KDP-05)
// ============================================

/**
 * Student submits their final thesis title for KaDep review.
 * Requires: proposal document uploaded and at least one supervisor.
 */
export async function submitTitleReport(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError("Judul TA sudah disetujui");
  }

  const supervisors = await prisma.thesisSupervisors.count({
    where: {
      thesisId: thesis.id,
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
    throw new BadRequestError("Anda harus memiliki dosen pembimbing sebelum melapor judul");
  }

  if (!thesis.title) {
    throw new BadRequestError("Judul TA belum diisi. Silakan isi judul terlebih dahulu.");
  }

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: { proposalStatus: "submitted" },
  });

  return { thesisId: thesis.id, title: thesis.title, proposalStatus: "submitted" };
}

/**
 * KaDep approves or rejects the reported title.
 */
export async function reviewTitleReport(thesisId, action, notes) {
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus !== "submitted") {
    throw new BadRequestError("Judul belum diajukan atau sudah diproses");
  }

  if (action === "accept") {
    await prisma.thesis.update({
      where: { id: thesisId },
      data: { proposalStatus: "accepted" },
    });

    // FR-KDP-05: Generate Surat Persetujuan Judul in background
    generateTitleApprovalLetter(thesisId).catch((err) => {
      console.error("Title approval letter generation failed:", err.message);
    });

    return { thesisId, proposalStatus: "accepted" };
  }

  if (action === "reject") {
    await prisma.thesis.update({
      where: { id: thesisId },
      data: { proposalStatus: "rejected" },
    });
    return { thesisId, proposalStatus: "rejected", notes };
  }

  throw new BadRequestError("Aksi tidak valid. Gunakan 'accept' atau 'reject'.");
}

/**
 * Get title reports pending KaDep review.
 */
export async function getPendingTitleReports() {
  const theses = await prisma.thesis.findMany({
    where: { proposalStatus: "submitted" },
    include: {
      student: {
        include: { user: { select: { fullName: true, identityNumber: true } } },
      },
      thesisSupervisors: {
        include: { lecturer: { include: { user: { select: { fullName: true } } } } },
      },
    },
  });

  return theses.map((t) => ({
    thesisId: t.id,
    title: t.title,
    studentName: t.student?.user?.fullName ?? "-",
    studentNim: t.student?.user?.identityNumber ?? "-",
    supervisors: t.thesisSupervisors?.map((s) => s.lecturer?.user?.fullName).join(", ") || "-",
    submittedAt: t.updatedAt,
  }));
}

function checkGateOpen(tasks) {
  const gateTasks = tasks.filter((t) => t.milestoneTemplate?.isGateToAdvisorSearch);
  if (gateTasks.length === 0) return false;
  return gateTasks.every((t) => t.status === "completed");
}

/**
 * Generate Surat Persetujuan Judul TA (background, non-blocking)
 */
async function generateTitleApprovalLetter(thesisId) {
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
      academicYear: { select: { name: true } },
    },
  });

  if (!thesis) return;

  const fsm = await import("fs/promises");
  const pathm = await import("path");
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const supervisorLines = thesis.thesisSupervisors
    .map((s) => `  ${s.role?.name ?? "Pembimbing"}: ${s.lecturer?.user?.fullName ?? "-"} (${s.lecturer?.user?.identityNumber ?? "-"})`)
    .join("\n");

  const content = `
SURAT PERSETUJUAN JUDUL TUGAS AKHIR

Nomor: SPJTA/${now.getFullYear()}/${thesisId.substring(0, 8).toUpperCase()}

Departemen Sistem Informasi Universitas Andalas menyatakan bahwa judul Tugas Akhir berikut
telah disetujui dan diterima:

Mahasiswa:
  Nama  : ${thesis.student?.user?.fullName}
  NIM   : ${thesis.student?.user?.identityNumber}

Judul Tugas Akhir:
  ${thesis.title || "Belum ditentukan"}

Tahun Akademik: ${thesis.academicYear?.name || "-"}

Pembimbing:
${supervisorLines || "  (Belum ada pembimbing)"}

Surat ini berlaku sejak tanggal ditetapkan.

Padang, ${dateStr}
Kepala Departemen Sistem Informasi
  `.trim();

  const outputDir = pathm.join(process.cwd(), "uploads", "documents", "title-approval");
  await fsm.mkdir(outputDir, { recursive: true });
  const fileName = `SPJTA_${thesis.student?.user?.identityNumber}_${Date.now()}.txt`;
  const filePath = pathm.join(outputDir, fileName);
  await fsm.writeFile(filePath, content, "utf-8");

  await prisma.document.create({
    data: {
      fileName,
      filePath: `uploads/documents/title-approval/${fileName}`,
      fileSize: Buffer.byteLength(content, "utf-8"),
      mimeType: "text/plain",
      description: `Surat Persetujuan Judul TA - ${thesis.student?.user?.fullName}`,
      documentTypeId: null,
    },
  });
}
