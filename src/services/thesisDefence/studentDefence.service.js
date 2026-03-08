import {
  getStudentThesisWithDefenceInfo,
  countSeminarRevisions,
  getDefenceDocumentTypes,
  ensureDefenceDocumentTypes,
  findDefenceDocuments,
  upsertDefenceDocument,
  createThesisDefence,
  getAllStudentDefences,
  findStudentDefenceDetail,
  getStudentDefenceExaminerAssessmentDetails,
  getStudentDefenceSupervisorAssessmentDetails,
  getStudentDefenceRevisions,
  createStudentDefenceRevision,
  findDefenceRevisionById,
  submitDefenceRevisionAction,
} from "../../repositories/thesisDefence/studentDefence.repository.js";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import prisma from "../../config/prisma.js";
import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { computeEffectiveDefenceStatus } from "../../utils/defenceStatus.util.js";

const buildLecturerNameMap = async (lecturerIds = []) => {
  const uniqueIds = [...new Set(lecturerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });

  return new Map(lecturers.map((lecturer) => [lecturer.id, lecturer.user?.fullName || "-"]));
};

const mapScoreToGrade = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return "-";
  const numericScore = Number(score);
  if (numericScore >= 80 && numericScore <= 100) return "A";
  if (numericScore >= 76) return "A-";
  if (numericScore >= 70) return "B+";
  if (numericScore >= 65) return "B";
  if (numericScore >= 55) return "C+";
  if (numericScore >= 50) return "C";
  if (numericScore >= 45) return "D";
  return "E";
};

const sortGroupedDetails = (grouped) => {
  Object.values(grouped).forEach((group) => {
    group.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  });

  return Object.values(grouped).sort((a, b) =>
    (a.code || "").localeCompare(b.code || "")
  );
};

/**
 * Get student defence overview: checklist, status, documents
 */
export const getStudentDefenceOverview = async (userId) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  const thesis = await getStudentThesisWithDefenceInfo(studentId);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  const sks = student.skscompleted ?? 0;

  // --- Seminar pass status ---
  const passedSeminar = thesis.thesisSeminars?.[0] || null;
  const seminarStatus = passedSeminar?.status ?? null;
  const seminarId = passedSeminar?.id ?? null;
  const hasPassedSeminar = !!passedSeminar;

  // --- Seminar revision completion ---

  let seminarRevisionMet = false;
  let seminarRevisionTotal = 0;
  let seminarRevisionFinished = 0;

  if (seminarStatus === "passed") {
    // Lulus langsung → revisi tidak dibutuhkan
    seminarRevisionMet = true;
  } else if (seminarStatus === "passed_with_revision" && seminarId) {
    // Check if revisions are finalized
    if (passedSeminar.revisionFinalizedAt) {
      seminarRevisionMet = true;
    } else {
      const revCounts = await countSeminarRevisions(seminarId);
      seminarRevisionTotal = revCounts.total;
      seminarRevisionFinished = revCounts.finished;
      seminarRevisionMet =
        revCounts.total > 0 && revCounts.total === revCounts.finished;
    }
  }

  // --- Supervisor defenceReady ---
  const supervisors = thesis.thesisSupervisors || [];
  const allSupervisorsReady =
    supervisors.length > 0 && supervisors.every((s) => s.defenceReady);

  // --- Build checklist (4 items) ---
  const checklist = {
    lulusSeminar: {
      met: hasPassedSeminar,
      label: "Lulus Seminar Hasil",
      seminarStatus,
    },
    sks: {
      met: sks >= 142,
      current: sks,
      required: 142,
      label: "Menyelesaikan Minimal 142 SKS",
    },
    revisiSeminar: {
      met: seminarRevisionMet,
      label: "Penyelesaian Revisi Seminar Hasil",
      seminarStatus, // 'passed' | 'passed_with_revision' | null
      total: seminarRevisionTotal,
      finished: seminarRevisionFinished,
    },
    pembimbing: {
      met: allSupervisorsReady,
      label: "Persetujuan Dosen Pembimbing",
      supervisors: supervisors.map((s) => ({
        name: s.lecturer?.user?.fullName || "-",
        role: s.role?.name || "-",
        ready: s.defenceReady,
      })),
    },
  };

  const allChecklistMet =
    checklist.lulusSeminar.met &&
    checklist.sks.met &&
    checklist.revisiSeminar.met &&
    checklist.pembimbing.met;

  // --- Current defence ---
  const currentDefence = thesis.thesisDefences?.[0] || null;

  // Resolve examiner lecturer names
  let enrichedExaminers = [];
  if (currentDefence?.examiners?.length) {
    const examinerLecturerIds = [
      ...new Set(
        currentDefence.examiners.map((e) => e.lecturerId).filter(Boolean)
      ),
    ];
    const lecturerMap = new Map();
    if (examinerLecturerIds.length > 0) {
      const lecturers = await prisma.lecturer.findMany({
        where: { id: { in: examinerLecturerIds } },
        select: { id: true, user: { select: { fullName: true } } },
      });
      for (const l of lecturers) {
        lecturerMap.set(l.id, l.user?.fullName || "-");
      }
    }
    enrichedExaminers = currentDefence.examiners.map((e) => ({
      ...e,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
    }));
  }

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    checklist,
    allChecklistMet,
    defence: currentDefence
      ? {
          id: currentDefence.id,
          status: computeEffectiveDefenceStatus(
            currentDefence.status,
            currentDefence.date,
            currentDefence.startTime,
            currentDefence.endTime
          ),
          registeredAt: currentDefence.registeredAt,
          date: currentDefence.date,
          startTime: currentDefence.startTime,
          endTime: currentDefence.endTime,
          meetingLink: currentDefence.meetingLink,
          finalScore: currentDefence.finalScore,
          grade: currentDefence.grade,
          resultFinalizedAt: currentDefence.resultFinalizedAt,
          cancelledReason: currentDefence.cancelledReason,
          room: currentDefence.room,
          documents: currentDefence.documents,
          examiners: enrichedExaminers,
        }
      : null,
  };
};

/**
 * Get defence document types
 */
export const getDefenceDocumentTypesService = async () => {
  let docTypes = await getDefenceDocumentTypes();
  if (docTypes.length < 5) {
    // Auto-create missing document types
    await ensureDefenceDocumentTypes();
    docTypes = await getDefenceDocumentTypes();
  }
  return docTypes;
};

/**
 * Get student's defence documents
 */
export const getStudentDefenceDocuments = async (userId) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) {
    return { documents: [] };
  }

  const currentDefence = thesis.thesisDefences?.[0] || null;
  if (!currentDefence) {
    return { documents: [] };
  }

  // Failed/cancelled attempts must re-upload all defence documents on a new attempt.
  if (["failed", "cancelled"].includes(currentDefence.status)) {
    return { documents: [] };
  }

  const documents = await findDefenceDocuments(currentDefence.id);
  return { documents };
};

/**
 * Upload a defence document
 */
export const uploadDefenceDocumentService = async (
  userId,
  file,
  documentTypeName
) => {
  if (!file) {
    const err = new Error("File dokumen wajib diunggah.");
    err.statusCode = 400;
    throw err;
  }

  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  if (!documentTypeName) {
    const err = new Error("Tipe dokumen wajib diisi.");
    err.statusCode = 400;
    throw err;
  }

  // Get or auto-create defence (first upload triggers creation)
  // If latest defence is failed/cancelled, create a new one for re-registration
  let currentDefence = thesis.thesisDefences?.[0] || null;
  if (!currentDefence || ['failed', 'cancelled'].includes(currentDefence.status)) {
    const created = await createThesisDefence(thesis.id);
    currentDefence = { id: created.id, status: created.status };
  }

  // Ensure document types exist
  const docTypeMap = await ensureDefenceDocumentTypes();
  const docType = docTypeMap[documentTypeName];
  if (!docType) {
    const err = new Error(`Tipe dokumen "${documentTypeName}" tidak valid.`);
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.thesisDefenceDocument.findUnique({
    where: {
      thesisDefenceId_documentTypeId: {
        thesisDefenceId: currentDefence.id,
        documentTypeId: docType.id,
      },
    },
  });

  if (existing && existing.status === "approved") {
    const err = new Error("Dokumen ini sudah diverifikasi dan tidak dapat diubah.");
    err.statusCode = 403;
    throw err;
  }

  const uploadsRoot = path.join(
    process.cwd(),
    "uploads",
    "thesis",
    thesis.id,
    "defence"
  );
  await mkdir(uploadsRoot, { recursive: true });

  if (existing?.documentId) {
    try {
      const oldDoc = await prisma.document.findUnique({
        where: { id: existing.documentId },
        select: { filePath: true },
      });
      if (oldDoc?.filePath) {
        const oldFilePath = path.join(process.cwd(), oldDoc.filePath);
        await unlink(oldFilePath);
      }
      await prisma.document.delete({ where: { id: existing.documentId } });
    } catch (delErr) {
      console.warn("Could not delete old defence document:", delErr.message);
    }
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `${documentTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const absolutePath = path.join(uploadsRoot, safeName);
  await writeFile(absolutePath, file.buffer);

  const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

  // Create document record
  const document = await prisma.document.create({
    data: {
      userId,
      documentTypeId: docType.id,
      fileName: file.originalname,
      filePath: relPath,
    },
  });

  // Upsert defence document
  await upsertDefenceDocument({
    thesisDefenceId: currentDefence.id,
    documentTypeId: docType.id,
    documentId: document.id,
  });

  return {
    documentId: document.id,
    documentTypeId: docType.id,
    fileName: file.originalname,
    status: "submitted",
  };
};

/**
 * Get student defence history list (all attempts)
 */
export const getStudentDefenceHistoryService = async (userId) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const attempts = await getAllStudentDefences(student.id);

  const lecturerNameMap = await buildLecturerNameMap(
    attempts.flatMap((attempt) => (attempt.examiners || []).map((examiner) => examiner.lecturerId))
  );

  return attempts.map((attempt) => ({
    ...attempt,
    examiners: (attempt.examiners || []).map((examiner) => ({
      ...examiner,
      lecturerName: lecturerNameMap.get(examiner.lecturerId) || "-",
    })),
    status: computeEffectiveDefenceStatus(
      attempt.status,
      attempt.date,
      attempt.startTime,
      attempt.endTime
    ),
  }));
};

/**
 * Get student defence detail by id
 */
export const getStudentDefenceDetailService = async (userId, defenceId) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const detail = await findStudentDefenceDetail(defenceId);
  if (!detail) {
    const err = new Error("Data sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (detail.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke data sidang ini.");
    err.statusCode = 403;
    throw err;
  }

  const lecturerNameMap = await buildLecturerNameMap(
    (detail.examiners || []).map((examiner) => examiner.lecturerId)
  );

  const docTypes = await getDefenceDocumentTypes();
  const docTypeMap = new Map(docTypes.map((docType) => [docType.id, docType.name]));

  const docIds = (detail.documents || []).map((doc) => doc.documentId).filter(Boolean);
  const docFiles = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, fileName: true, filePath: true },
      })
    : [];
  const docFileMap = new Map(docFiles.map((doc) => [doc.id, doc]));

  return {
    ...detail,
    examiners: (detail.examiners || []).map((examiner) => ({
      ...examiner,
      lecturerName: lecturerNameMap.get(examiner.lecturerId) || "-",
    })),
    documents: (detail.documents || []).map((doc) => {
      const fileMeta = docFileMap.get(doc.documentId);
      return {
        ...doc,
        documentTypeName: docTypeMap.get(doc.documentTypeId) || "-",
        fileName: fileMeta?.fileName || null,
        filePath: fileMeta?.filePath || null,
      };
    }),
    status: computeEffectiveDefenceStatus(
      detail.status,
      detail.date,
      detail.startTime,
      detail.endTime
    ),
  };
};

/**
 * Get student defence assessment summary
 */
export const getStudentDefenceAssessmentService = async (userId, defenceId) => {
  const detail = await getStudentDefenceDetailService(userId, defenceId);

  if (!["passed", "passed_with_revision", "failed"].includes(detail.status)) {
    const err = new Error("Berita acara sidang belum tersedia.");
    err.statusCode = 400;
    throw err;
  }

  const [examinerAssessmentDetails, supervisorAssessmentDetails] = await Promise.all([
    getStudentDefenceExaminerAssessmentDetails(defenceId),
    getStudentDefenceSupervisorAssessmentDetails(defenceId),
  ]);

  const lecturerNameMap = await buildLecturerNameMap(
    (detail.examiners || []).map((item) => item.lecturerId)
  );

  const examinerGroupsByExaminer = {};
  (examinerAssessmentDetails || []).forEach((item) => {
    const examinerId = item.thesisDefenceExaminerId;
    const cpmk = item.criteria?.cpmk;
    if (!examinerId || !cpmk) return;

    if (!examinerGroupsByExaminer[examinerId]) {
      examinerGroupsByExaminer[examinerId] = {};
    }
    if (!examinerGroupsByExaminer[examinerId][cpmk.id]) {
      examinerGroupsByExaminer[examinerId][cpmk.id] = {
        id: cpmk.id,
        code: cpmk.code,
        description: cpmk.description,
        criteria: [],
      };
    }

    examinerGroupsByExaminer[examinerId][cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });

  const supervisorGroups = {};
  (supervisorAssessmentDetails || []).forEach((item) => {
    const cpmk = item.criteria?.cpmk;
    if (!cpmk) return;

    if (!supervisorGroups[cpmk.id]) {
      supervisorGroups[cpmk.id] = {
        id: cpmk.id,
        code: cpmk.code,
        description: cpmk.description,
        criteria: [],
      };
    }

    supervisorGroups[cpmk.id].criteria.push({
      id: item.criteria.id,
      name: item.criteria.name,
      maxScore: item.criteria.maxScore,
      score: item.score,
      displayOrder: item.criteria.displayOrder,
    });
  });

  const supervisorNames = (detail.thesis?.thesisSupervisors || []).map(
    (item) => item?.lecturer?.user?.fullName
  ).filter(Boolean);

  const computedSupervisorScoreFromDetails = (supervisorAssessmentDetails || []).reduce(
    (sum, item) => sum + Number(item?.score || 0),
    0
  );
  const resolvedSupervisorScore = detail.supervisorScore ?? computedSupervisorScoreFromDetails;
  const hasSupervisorSubmission =
    detail.supervisorScore !== null && detail.supervisorScore !== undefined
      ? true
      : (supervisorAssessmentDetails || []).length > 0;
  const resolvedSupervisorName =
    detail.resultFinalizer?.lecturer?.user?.fullName ||
    supervisorNames[0] ||
    "-";

  return {
    defence: {
      id: detail.id,
      status: detail.status,
      examinerAverageScore: detail.examinerAverageScore,
      supervisorScore: resolvedSupervisorScore,
      finalScore: detail.finalScore,
      grade: detail.grade || mapScoreToGrade(detail.finalScore),
      resultFinalizedAt: detail.resultFinalizedAt,
      room: detail.room,
      date: detail.date,
      startTime: detail.startTime,
      endTime: detail.endTime,
      meetingLink: detail.meetingLink,
    },
    examiners: (detail.examiners || []).map((item) => ({
      ...item,
      lecturerName: lecturerNameMap.get(item.lecturerId) || "-",
      assessmentDetails: sortGroupedDetails(examinerGroupsByExaminer[item.id] || {}),
    })),
    supervisorAssessment: {
      name: resolvedSupervisorName,
      assessmentScore: resolvedSupervisorScore,
      supervisorNotes: detail.supervisorNotes,
      assessmentSubmittedAt: hasSupervisorSubmission ? detail.updatedAt || detail.resultFinalizedAt || null : null,
      assessmentDetails: sortGroupedDetails(supervisorGroups),
    },
  };
};

/**
 * Get student defence revisions for a specific defence attempt
 */
export const getStudentDefenceRevisionService = async (userId, defenceId) => {
  await getStudentDefenceDetailService(userId, defenceId);
  const revisions = await getStudentDefenceRevisions(defenceId);

  const lecturerNameMap = await buildLecturerNameMap(
    revisions.map((revision) => revision.defenceExaminer?.lecturerId)
  );

  return revisions.map((revision) => ({
    ...revision,
    examinerName:
      lecturerNameMap.get(revision.defenceExaminer?.lecturerId) || "-",
    examinerOrder: revision.defenceExaminer?.order ?? null,
  }));
};

/**
 * Get revisions for student's current defence (seminar-style response shape)
 */
export const getCurrentStudentDefenceRevisionsService = async (userId) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  const defence = thesis.thesisDefences?.[0] || null;
  if (!defence) {
    const err = new Error("Anda belum memiliki sidang.");
    err.statusCode = 404;
    throw err;
  }

  if (defence.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk sidang berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  const revisions = await getStudentDefenceRevisions(defence.id);

  const lecturerNameMap = await buildLecturerNameMap([
    ...revisions.map((revision) => revision.defenceExaminer?.lecturerId),
    ...(defence.examiners || []).map((examiner) => examiner.lecturerId),
  ]);

  const examinerNotes = (defence.examiners || [])
    .filter((examiner) => !!examiner.revisionNotes)
    .map((examiner) => ({
      examinerOrder: examiner.order,
      lecturerName: lecturerNameMap.get(examiner.lecturerId) || "-",
      revisionNotes: examiner.revisionNotes,
    }));

  const totalRevisions = revisions.length;
  const finishedRevisions = revisions.filter((revision) => revision.isFinished).length;
  const pendingApproval = revisions.filter(
    (revision) => revision.studentSubmittedAt && !revision.isFinished
  ).length;

  return {
    defenceId: defence.id,
    examinerNotes,
    summary: {
      total: totalRevisions,
      finished: finishedRevisions,
      pendingApproval,
    },
    revisions: revisions.map((revision) => ({
      id: revision.id,
      examinerOrder: revision.defenceExaminer?.order || null,
      examinerLecturerId: revision.defenceExaminer?.lecturerId || null,
      examinerName: lecturerNameMap.get(revision.defenceExaminer?.lecturerId) || "-",
      description: revision.description,
      revisionAction: revision.revisionAction,
      isFinished: revision.isFinished,
      studentSubmittedAt: revision.studentSubmittedAt,
      supervisorApprovedAt: revision.supervisorApprovedAt,
      approvedBySupervisorName: revision.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
};

/**
 * Create one revision item for defence
 */
export const createStudentDefenceRevisionService = async (
  userId,
  defenceId,
  payload
) => {
  const detail = await getStudentDefenceDetailService(userId, defenceId);

  if (detail.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya dapat ditambahkan pada status lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  const examinerId = String(payload?.defenceExaminerId || "").trim();
  const examiner = detail.examiners.find((e) => e.id === examinerId);
  if (!examiner) {
    const err = new Error("Penguji tidak valid untuk sidang ini.");
    err.statusCode = 400;
    throw err;
  }

  const description = String(payload?.description || "").trim();
  if (!description) {
    const err = new Error("Deskripsi revisi wajib diisi.");
    err.statusCode = 400;
    throw err;
  }

  return createStudentDefenceRevision({
    defenceExaminerId: examinerId,
    description,
  });
};

/**
 * Create revision item for student's current defence (seminar-style route)
 */
export const createCurrentStudentDefenceRevisionService = async (userId, payload) => {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  const defence = thesis.thesisDefences?.[0] || null;
  if (!defence || defence.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk sidang berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  return createStudentDefenceRevisionService(userId, defence.id, payload);
};

/**
 * Save revision action draft (without submit)
 */
export const saveStudentDefenceRevisionActionService = async (
  userId,
  revisionId,
  payload
) => {
  const revision = await findDefenceRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Data revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const ownerId = revision.defenceExaminer?.defence?.thesis?.studentId;
  if (ownerId !== (await getStudentByUserId(userId))?.id) {
    const err = new Error("Anda tidak memiliki akses ke data revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (revision.defenceExaminer?.defence?.status !== "passed_with_revision") {
    const err = new Error("Revisi tidak dapat diubah pada status sidang saat ini.");
    err.statusCode = 400;
    throw err;
  }

  const nextDescription =
    typeof payload?.description === "string"
      ? payload.description.trim()
      : revision.description;
  const nextAction =
    typeof payload?.revisionAction === "string"
      ? payload.revisionAction.trim()
      : revision.revisionAction;

  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data: {
      description: nextDescription,
      revisionAction: nextAction,
    },
  });
};

/**
 * Submit revision action
 */
export const submitStudentDefenceRevisionActionService = async (
  userId,
  revisionId,
  revisionAction
) => {
  const revision = await findDefenceRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Data revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const ownerId = revision.defenceExaminer?.defence?.thesis?.studentId;
  if (ownerId !== (await getStudentByUserId(userId))?.id) {
    const err = new Error("Anda tidak memiliki akses ke data revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (!revisionAction || !String(revisionAction).trim()) {
    const err = new Error("Tindakan revisi wajib diisi sebelum submit.");
    err.statusCode = 400;
    throw err;
  }

  return submitDefenceRevisionAction(revisionId, revisionAction);
};

/**
 * Cancel submitted revision action
 */
export const cancelStudentDefenceRevisionActionService = async (
  userId,
  revisionId
) => {
  const revision = await findDefenceRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Data revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const ownerId = revision.defenceExaminer?.defence?.thesis?.studentId;
  if (ownerId !== (await getStudentByUserId(userId))?.id) {
    const err = new Error("Anda tidak memiliki akses ke data revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data: {
      studentSubmittedAt: null,
      revisionAction: null,
    },
  });
};

/**
 * Delete student defence revision while still draft (before submit).
 */
export const deleteStudentDefenceRevisionService = async (userId, revisionId) => {
  const revision = await findDefenceRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Data revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const student = await getStudentByUserId(userId);
  const ownerId = revision.defenceExaminer?.defence?.thesis?.studentId;
  if (!student || ownerId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke data revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (revision.defenceExaminer?.defence?.status !== "passed_with_revision") {
    const err = new Error("Revisi tidak dapat dihapus pada status sidang saat ini.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi yang sudah disetujui tidak dapat dihapus.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.studentSubmittedAt) {
    const err = new Error("Revisi yang sudah diajukan tidak dapat dihapus.");
    err.statusCode = 400;
    throw err;
  }

  const deleted = await prisma.thesisDefenceRevision.delete({
    where: { id: revisionId },
  });

  return { id: deleted.id };
};
