import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import prisma from "../config/prisma.js";
import * as participantRepo from "../repositories/yudisium-participant.repository.js";
import * as requirementRepo from "../repositories/yudisium-requirement.repository.js";

const REQUIRED_SKS = 146;

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

// ============================================================
// SHARED CONTEXT — student + their thesis + current yudisium period
// (exported so yudisium-exit-survey.service can reuse it)
// ============================================================

const exitSurveyFormInclude = {
  id: true,
  name: true,
  description: true,
  sessions: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      order: true,
      questions: {
        orderBy: { orderNumber: "asc" },
        select: {
          id: true,
          question: true,
          description: true,
          questionType: true,
          isRequired: true,
          orderNumber: true,
          options: {
            orderBy: { orderNumber: "asc" },
            select: { id: true, optionText: true, orderNumber: true },
          },
        },
      },
    },
  },
};

const yudisiumContextSelect = {
  id: true,
  name: true,
  registrationOpenDate: true,
  registrationCloseDate: true,
  eventDate: true,
  documentId: true,
  document: { select: { id: true, fileName: true, filePath: true } },
  exitSurveyForm: { select: exitSurveyFormInclude },
  requirementItems: { select: { id: true, yudisiumRequirementId: true } },
};

export const findStudentContext = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      skscompleted: true,
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      thesis: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          thesisDefences: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              revisionFinalizedAt: true,
              revisionFinalizedBy: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!student) throwError("Data mahasiswa tidak ditemukan", 404);

  const thesis = student.thesis[0] ?? null;
  let currentYudisium = null;

  // Prefer the yudisium where the student is currently registered (not rejected)
  if (thesis?.id) {
    const participantRecord = await prisma.yudisiumParticipant.findFirst({
      where: { 
        thesisId: thesis.id,
        status: { not: 'rejected' }
      },
      orderBy: { createdAt: "desc" },
      select: { yudisium: { select: yudisiumContextSelect } },
    });
    if (participantRecord) currentYudisium = participantRecord.yudisium;
  }

  // Otherwise fall back to the most recent published yudisium that is currently open
  // (status is derived from dates, DB stores 'published' as the base active state)
  if (!currentYudisium) {
    const now = new Date();
    currentYudisium = await prisma.yudisium.findFirst({
      where: {
        registrationOpenDate: { lte: now },
        registrationCloseDate: { gte: now },
      },
      orderBy: [{ registrationOpenDate: "desc" }, { createdAt: "desc" }],
      select: yudisiumContextSelect,
    });
  }

  return { student, currentYudisium, thesis };
};

// ============================================================
// OVERVIEW — student dashboard view of their yudisium status
// ============================================================

export const getOverview = async (userId) => {
  const { student, currentYudisium, thesis } = await findStudentContext(userId);

  const latestDefence = thesis?.thesisDefences?.[0] ?? null;
  const revisionFinalized =
    !!latestDefence?.revisionFinalizedAt && !!latestDefence?.revisionFinalizedBy;

  let submittedExitSurvey = null;
  let participant = null;
  let history = [];
  let activeRequirements = [];

  // Load all requirements - we filter them by whether they are linked to the current Yudisium period later.
  // This ensures that even if a global requirement is deactivated, it still shows for students if it's already assigned to this period.
  activeRequirements = await prisma.yudisiumRequirement.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, description: true },
  });

  if (thesis?.id) {
    // Fetch all participation records for this thesis
    const allParticipations = await prisma.yudisiumParticipant.findMany({
      where: { thesisId: thesis.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        yudisium: { select: yudisiumContextSelect },
        yudisiumParticipantRequirements: {
          select: {
            yudisiumRequirementItemId: true,
            status: true,
            submittedAt: true,
            verifiedAt: true,
            documentId: true,
          },
        },
      },
    });

  // Determine current participant: the most recent one that is NOT rejected
  // OR if all are rejected, the most recent one (but we'll filter it later in frontend)
  participant = allParticipations.find(p => p.status !== 'rejected') || null;
  
  // History is ONLY rejected ones
  history = allParticipations.filter(p => p.status === 'rejected');

  if (currentYudisium?.id && thesis?.id) {
    submittedExitSurvey = await prisma.studentExitSurveyResponse.findFirst({
      where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
      select: { id: true, submittedAt: true },
    });
  }
  }

  const uploadedByRequirement = new Map(
    (participant?.yudisiumParticipantRequirements ?? []).map((item) => [
      item.yudisiumRequirementItemId,
      item,
    ])
  );

  const requirements = activeRequirements
    .filter((req) => 
      currentYudisium?.requirementItems?.some(i => i.yudisiumRequirementId === req.id)
    )
    .map((req) => {
      // Find the item ID for this requirement in the current yudisium
      const item = currentYudisium?.requirementItems?.find(i => i.yudisiumRequirementId === req.id);
      const submitted = item ? uploadedByRequirement.get(item.id) : null;
      
      return {
        id: req.id,
        name: req.name,
        description: req.description,
        isUploaded: !!submitted,
        status: submitted ? "terunggah" : "menunggu",
        submittedAt: submitted?.submittedAt ?? null,
      };
    });

  const needsRevision = latestDefence?.status === 'passed_with_revision';
  
  const checklist = {
    sks: {
      label: `Menyelesaikan ${REQUIRED_SKS} SKS`,
      met: (student.skscompleted ?? 0) >= REQUIRED_SKS,
      current: student.skscompleted ?? 0,
      required: REQUIRED_SKS,
    },
    ...(needsRevision ? {
      revisiSidang: {
        label: "Menyelesaikan revisi sidang TA",
        met: revisionFinalized,
        revisionFinalizedAt: latestDefence?.revisionFinalizedAt ?? null,
      },
    } : {}),
    mataKuliahWajib: {
      label: "Lulus semua mata kuliah wajib",
      met: !!student.mandatoryCoursesCompleted,
    },
    mataKuliahMkwu: {
      label: "Lulus semua mata kuliah MKWU",
      met: !!student.mkwuCompleted,
    },
    mataKuliahKerjaPraktik: {
      label: "Lulus mata kuliah kerja praktik",
      met: !!student.internshipCompleted,
    },
    mataKuliahKkn: {
      label: "Lulus mata kuliah KKN",
      met: !!student.kknCompleted,
    },
    exitSurvey: {
      label: "Mengisi Exit Survey",
      met: !!submittedExitSurvey,
      submittedAt: submittedExitSurvey?.submittedAt ?? null,
      responseId: submittedExitSurvey?.id ?? null,
      isAvailable: !!currentYudisium, // Only available if there's an active yudisium
    },
  };

  const academicChecklistMet = 
    checklist.sks.met && 
    (!checklist.revisiSidang || checklist.revisiSidang.met) && 
    checklist.mataKuliahWajib.met && 
    checklist.mataKuliahMkwu.met && 
    checklist.mataKuliahKerjaPraktik.met && 
    checklist.mataKuliahKkn.met;

  const allChecklistMet = academicChecklistMet && checklist.exitSurvey.met;

  // CPL verification status
  let allCplVerified = false;
  let cplScores = [];
  if (thesis?.id) {
    const studentId = student.id;
    const activeCpls = await participantRepo.findCplsActive();
    const scores = await participantRepo.findStudentCplScores(studentId);
    const scoreMap = new Map(scores.map((s) => [s.cplId, s]));

    cplScores = activeCpls.map((cpl) => {
      const sc = scoreMap.get(cpl.id);
      return {
        code: cpl.code,
        description: cpl.description,
        score: sc?.score ?? null,
        minimalScore: cpl.minimalScore,
        status: sc?.status ?? "calculated",
        passed: sc ? sc.score >= cpl.minimalScore : false,
      };
    });

    allCplVerified =
      activeCpls.length > 0 &&
      activeCpls.every((cpl) => scoreMap.get(cpl.id)?.status === "verified");
  }

  return {
    yudisium: currentYudisium
      ? {
          id: currentYudisium.id,
          name: currentYudisium.name,
          registrationOpenDate: currentYudisium.registrationOpenDate,
          registrationCloseDate: currentYudisium.registrationCloseDate,
          eventDate: currentYudisium.eventDate,
          decreeDocument: currentYudisium.document
            ? {
                id: currentYudisium.document.id,
                fileName: currentYudisium.document.fileName,
                filePath: currentYudisium.document.filePath,
              }
            : null,
          exitSurveyForm: currentYudisium.exitSurveyForm
            ? { id: currentYudisium.exitSurveyForm.id, name: currentYudisium.exitSurveyForm.name }
            : null,
        }
      : null,
    participantStatus: participant?.status ?? null,
    history: history.map(h => ({
      id: h.id,
      status: h.status,
      createdAt: h.createdAt,
      yudisiumName: h.yudisium.name,
      yudisiumId: h.yudisium.id,
      registrationOpenDate: h.yudisium.registrationOpenDate,
      registrationCloseDate: h.yudisium.registrationCloseDate,
      eventDate: h.yudisium.eventDate,
    })),
    thesis: thesis ? { id: thesis.id, title: thesis.title } : null,
    checklist,
    allChecklistMet,
    allCplVerified,
    cplScores,
    requirements,
  };
};

// ============================================================
// REQUIREMENTS — student's own checklist with upload status
// ============================================================

export const getOwnRequirements = async (userId) => {
  const { currentYudisium, thesis } = await findStudentContext(userId);

  // Instead of throwing 404/400, return empty state for UI to handle gracefully
  if (!currentYudisium || !thesis?.id) {
    return {
      yudisiumId: currentYudisium?.id ?? null,
      participantId: null,
      participantStatus: null,
      requirements: [],
    };
  }

  const activeRequirements = await requirementRepo.findAll();
  const participant = await prisma.yudisiumParticipant.findFirst({
    where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
    select: {
      id: true,
      status: true,
      yudisiumParticipantRequirements: {
        select: {
          yudisiumRequirementItemId: true,
          status: true,
          submittedAt: true,
          verifiedAt: true,
          notes: true,
          documentId: true,
          document: { select: { id: true, fileName: true, filePath: true } },
        },
      },
    },
  });

  const uploadedMap = new Map(
    (participant?.yudisiumParticipantRequirements ?? []).map((r) => [r.yudisiumRequirementItemId, r])
  );

  const requirements = activeRequirements
    .filter((req) => 
      currentYudisium?.requirementItems?.some(i => i.yudisiumRequirementId === req.id)
    )
    .map((req) => {
      // Find the item ID for this requirement in the current yudisium
      const item = currentYudisium.requirementItems.find(i => i.yudisiumRequirementId === req.id);
      const uploaded = item ? uploadedMap.get(item.id) : null;
      
      return {
        id: req.id,
        name: req.name,
        description: req.description,
        status: uploaded?.status ?? null,
        submittedAt: uploaded?.submittedAt ?? null,
        verifiedAt: uploaded?.verifiedAt ?? null,
        validationNotes: uploaded?.notes ?? null,
        document: uploaded?.document
          ? {
              id: uploaded.document.id,
              fileName: uploaded.document.fileName,
              filePath: uploaded.document.filePath,
            }
          : null,
      };
    });

  return {
    yudisiumId: currentYudisium.id,
    participantId: participant?.id ?? null,
    participantStatus: participant?.status ?? null,
    requirements,
  };
};

// ============================================================
// UPLOAD — student submits a requirement document
// ============================================================

export const uploadOwnDocument = async (userId, file, requirementId) => {
  if (!file) throwError("File dokumen wajib diunggah", 400);
  if (!requirementId) throwError("ID persyaratan wajib diisi", 400);

  const { currentYudisium, thesis } = await findStudentContext(userId);

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);

  const requirement = await prisma.yudisiumRequirement.findUnique({
    where: { id: requirementId },
  });
  if (!requirement) {
    throwError("Persyaratan yudisium tidak valid", 400);
  }

  // Auto-create participant on first upload
  let participant = await participantRepo.findByThesisAndYudisium(currentYudisium.id, thesis.id);
  if (!participant) {
    participant = await participantRepo.createForThesis(currentYudisium.id, thesis.id);
  }

  // Resolve the global requirementId to the specific requirementItem for this yudisium
  const item = currentYudisium.requirementItems.find(i => i.yudisiumRequirementId === requirementId);
  if (!item) {
    throwError("Persyaratan ini tidak berlaku untuk periode yudisium ini", 400);
  }

  // Block re-upload for already-approved docs
  const existing = await participantRepo.findRequirementRecord(participant.id, item.id);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah diverifikasi dan tidak dapat diubah", 409);
  }

  const uploadsRoot = path.join(
    process.cwd(),
    "uploads",
    "yudisium",
    currentYudisium.id,
    participant.id
  );
  await mkdir(uploadsRoot, { recursive: true });

  // Best-effort cleanup of previous upload
  if (existing?.documentId) {
    try {
      const oldDoc = await prisma.document.findUnique({
        where: { id: existing.documentId },
        select: { filePath: true },
      });
      if (oldDoc?.filePath) {
        await unlink(path.join(process.cwd(), oldDoc.filePath));
      }
      await prisma.document.delete({ where: { id: existing.documentId } });
    } catch (delErr) {
      console.warn("Could not delete old yudisium document:", delErr.message);
    }
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `${requirement.name.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const absolutePath = path.join(uploadsRoot, safeName);
  await writeFile(absolutePath, file.buffer);
  const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

  const document = await participantRepo.createDocument({
    userId,
    fileName: file.originalname,
    filePath: relPath,
  });

  await participantRepo.upsertRequirementRecord(participant.id, item.id, {
    documentId: document.id,
  });

  return {
    documentId: document.id,
    requirementId,
    fileName: file.originalname,
    status: "submitted",
  };
};
