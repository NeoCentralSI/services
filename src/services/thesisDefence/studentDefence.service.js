import {
  getStudentThesisWithDefenceInfo,
  countSeminarRevisions,
  getDefenceDocumentTypes,
  ensureDefenceDocumentTypes,
  findDefenceDocuments,
  upsertDefenceDocument,
} from "../../repositories/thesisDefence/studentDefence.repository.js";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import prisma from "../../config/prisma.js";

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
          status: currentDefence.status,
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

  const currentDefence = thesis.thesisDefences?.[0] || null;
  if (!currentDefence) {
    const err = new Error("Belum ada pendaftaran sidang.");
    err.statusCode = 400;
    throw err;
  }

  // Ensure document types exist
  const docTypeMap = await ensureDefenceDocumentTypes();
  const docType = docTypeMap[documentTypeName];
  if (!docType) {
    const err = new Error(`Tipe dokumen "${documentTypeName}" tidak valid.`);
    err.statusCode = 400;
    throw err;
  }

  // Create document record
  const document = await prisma.document.create({
    data: {
      fileName: file.originalname,
      filePath: file.path,
      documentType: { connect: { id: docType.id } },
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
