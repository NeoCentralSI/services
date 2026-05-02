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
      order: true,
      questions: {
        orderBy: { orderNumber: "asc" },
        select: {
          id: true,
          question: true,
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
  status: true,
  registrationOpenDate: true,
  registrationCloseDate: true,
  eventDate: true,
  decreeNumber: true,
  decreeIssuedAt: true,
  documentId: true,
  document: { select: { id: true, fileName: true, filePath: true } },
  exitSurveyForm: { select: exitSurveyFormInclude },
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

  // Prefer the yudisium where the student is already registered
  if (thesis?.id) {
    const participantRecord = await prisma.yudisiumParticipant.findFirst({
      where: { thesisId: thesis.id },
      orderBy: { createdAt: "desc" },
      select: { yudisium: { select: yudisiumContextSelect } },
    });
    if (participantRecord) currentYudisium = participantRecord.yudisium;
  }

  // Otherwise fall back to the most recent open yudisium
  if (!currentYudisium) {
    currentYudisium = await prisma.yudisium.findFirst({
      where: { status: "open" },
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
  let activeRequirements = [];

  if (currentYudisium?.id) {
    activeRequirements = await prisma.yudisiumRequirement.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true, notes: true },
    });
  }

  if (currentYudisium?.id && thesis?.id) {
    submittedExitSurvey = await prisma.studentExitSurveyResponse.findFirst({
      where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
      select: { id: true, submittedAt: true },
    });

    participant = await prisma.yudisiumParticipant.findFirst({
      where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
      select: {
        status: true,
        yudisiumParticipantRequirements: {
          select: {
            yudisiumRequirementId: true,
            status: true,
            submittedAt: true,
            verifiedAt: true,
            documentId: true,
          },
        },
      },
    });
  }

  const uploadedByRequirement = new Map(
    (participant?.yudisiumParticipantRequirements ?? []).map((item) => [
      item.yudisiumRequirementId,
      item,
    ])
  );

  const requirements = activeRequirements.map((req) => {
    const submitted = uploadedByRequirement.get(req.id);
    return {
      id: req.id,
      name: req.name,
      description: req.description,
      notes: req.notes,
      isUploaded: !!submitted,
      status: submitted ? "terunggah" : "menunggu",
      submittedAt: submitted?.submittedAt ?? null,
    };
  });

  const checklist = {
    sks: {
      label: `Menyelesaikan ${REQUIRED_SKS} SKS`,
      met: (student.skscompleted ?? 0) >= REQUIRED_SKS,
      current: student.skscompleted ?? 0,
      required: REQUIRED_SKS,
    },
    revisiSidang: {
      label: "Menyelesaikan revisi sidang TA",
      met: revisionFinalized,
      revisionFinalizedAt: latestDefence?.revisionFinalizedAt ?? null,
    },
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
    },
  };

  const allChecklistMet = Object.values(checklist).every((item) => item.met);

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
          status: currentYudisium.status,
          registrationOpenDate: currentYudisium.registrationOpenDate,
          registrationCloseDate: currentYudisium.registrationCloseDate,
          eventDate: currentYudisium.eventDate,
          decreeNumber: currentYudisium.decreeNumber ?? null,
          decreeIssuedAt: currentYudisium.decreeIssuedAt ?? null,
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

  if (!currentYudisium) throwError("Belum ada periode yudisium yang berlangsung", 404);
  if (!thesis?.id) throwError("Data tugas akhir mahasiswa belum tersedia", 400);

  const activeRequirements = await requirementRepo.findActive();
  const participant = await prisma.yudisiumParticipant.findFirst({
    where: { yudisiumId: currentYudisium.id, thesisId: thesis.id },
    select: {
      id: true,
      status: true,
      yudisiumParticipantRequirements: {
        select: {
          yudisiumRequirementId: true,
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
    (participant?.yudisiumParticipantRequirements ?? []).map((r) => [r.yudisiumRequirementId, r])
  );

  const requirements = activeRequirements.map((req) => {
    const uploaded = uploadedMap.get(req.id);
    return {
      id: req.id,
      name: req.name,
      description: req.description,
      notes: req.notes,
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
  if (!requirement || !requirement.isActive) {
    throwError("Persyaratan yudisium tidak valid atau sudah tidak aktif", 400);
  }

  // Auto-create participant on first upload
  let participant = await participantRepo.findByThesisAndYudisium(currentYudisium.id, thesis.id);
  if (!participant) {
    participant = await participantRepo.createForThesis(currentYudisium.id, thesis.id);
  }

  // Block re-upload for already-approved docs
  const existing = await participantRepo.findRequirementRecord(participant.id, requirementId);
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

  await participantRepo.upsertRequirementRecord(participant.id, requirementId, {
    documentId: document.id,
  });

  return {
    documentId: document.id,
    requirementId,
    fileName: file.originalname,
    status: "submitted",
  };
};
