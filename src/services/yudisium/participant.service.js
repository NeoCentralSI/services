import fs from "fs";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import prisma from "../../config/prisma.js";
import * as participantRepo from "../../repositories/yudisium/participant.repository.js";
import * as requirementRepo from "../../repositories/yudisium/requirement.repository.js";
import * as xlsx from "xlsx";
import { ROLES } from "../../constants/roles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const isStudentViewer = (viewer) => (viewer?.roles ?? []).includes(ROLES.MAHASISWA);

const assertCanViewParticipant = (participant, viewer) => {
  if (!isStudentViewer(viewer)) return;
  if (!viewer?.studentId || participant.thesis?.student?.id !== viewer.studentId) {
    throwError("Anda tidak memiliki akses ke data peserta yudisium ini", 403);
  }
};

const notifyUsers = async (userIds, { title, message, data }) => {
  if (!userIds?.length) return;
  await Promise.all([
    import("../notification.service.js").then((m) =>
      m.createNotificationsForUsers(userIds, { title, message })
    ),
    import("../push.service.js").then((m) =>
      m.sendFcmToUsers(userIds, { title, body: message, data })
    ),
  ]);
};

const PARTICIPANT_STATUS_PRIORITY = {
  registered: 0,
  verified: 1,
  cpl_validated: 2,
  appointed: 3,
  finalized: 4,
  rejected: 99,
};

const deriveYudisiumStatus = (item) => {
  const now = new Date();
  const openDate = item.registrationOpenDate ? new Date(item.registrationOpenDate) : null;
  const closeDate = item.registrationCloseDate ? new Date(item.registrationCloseDate) : null;
  const eventDate = item.eventDate ? new Date(item.eventDate) : null;

  if (eventDate) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
    if (eventDate < todayStart) return "completed";
    if (eventDate >= todayStart && eventDate <= todayEnd) return "ongoing";
  }

  if (!openDate) return "draft";
  if (now < openDate) return "draft";
  if (closeDate && now > closeDate) return "closed";
  return "open";
};

const PARTICIPANT_IMPORT_REQUIRED_COLUMNS = [
  "No",
  "Nama Mahasiswa",
  "NIM",
  "Judul Tugas Akhir",
];

const isArchiveYudisium = (yudisium) => {
  return !yudisium.registrationOpenDate && !yudisium.registrationCloseDate;
};

const assertArchiveYudisium = (yudisium) => {
  if (!isArchiveYudisium(yudisium)) {
    throwError("Peserta manual hanya dapat dikelola pada yudisium arsip", 400);
  }
};

const assertParticipantReadyForCplValidation = (participant) => {
  if (participant.status === "verified") return;

  if (participant.status === "registered") {
    throwError(
      "Validasi CPL hanya dapat dilakukan setelah seluruh dokumen yudisium terverifikasi",
      400
    );
  }

  throwError("Validasi CPL tidak dapat diubah pada status peserta saat ini", 400);
};

const notifyCplValidationCompleted = async (participant) => {
  const studentUserId = participant.thesis?.student?.user?.id;
  if (!studentUserId) return;

  const yudisiumName = participant.yudisium?.name || "Yudisium";
  await notifyUsers([studentUserId], {
    title: "CPL Yudisium Tervalidasi",
    message: `Seluruh nilai CPL Anda untuk ${yudisiumName} telah divalidasi. Anda telah menjadi calon peserta yudisium.`,
    data: {
      yudisiumId: participant.yudisiumId,
      participantId: participant.id,
      type: "yudisium_cpl_validated",
    },
  });
};

const areAllRelevantCplScoresValidated = (activeCpls, scores) => {
  const activeCplIds = new Set(activeCpls.map((cpl) => cpl.id));
  const relevantScores = scores.filter((score) => activeCplIds.has(score.cplId));

  return (
    relevantScores.length > 0 &&
    relevantScores.every((score) => score.status === "validated")
  );
};

const normalizeImportText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const normalizeImportKey = (value) => normalizeImportText(value).toLowerCase();

const buildImportFailure = (row, error) => ({ row, error });

const getFriendlyImportError = (err) => {
  if (err?.code?.startsWith?.("P")) {
    return "Gagal menyimpan data peserta karena kendala database. Silakan periksa data dan coba lagi.";
  }
  if (String(err?.message || "").toLowerCase().includes("prisma")) {
    return "Gagal menyimpan data peserta karena kendala database. Silakan periksa data dan coba lagi.";
  }
  return err?.message || "Terjadi kesalahan saat memproses baris ini.";
};

// ============================================================
// PARTICIPANT LIST & DETAIL
// ============================================================

export const getParticipants = async (yudisiumId) => {
  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const totalRequirements = await prisma.yudisiumRequirementItem.count({
    where: { yudisiumId },
  });

  const participants = await participantRepo.findManyByYudisium(yudisiumId);

  const mapped = participants.map((p) => {
    const reqs = p.yudisiumParticipantRequirements;
    const approvedCount = reqs.filter((r) => r.status === "approved").length;
    const submittedCount = reqs.filter((r) => r.status === "submitted").length;
    const declinedCount = reqs.filter((r) => r.status === "declined").length;

    return {
      id: p.id,
      status: p.status,
      registeredAt: p.registeredAt,
      notes: p.notes,
      studentName: p.thesis?.student?.user?.fullName || "-",
      studentNim: p.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: p.thesis?.title || "-",
      thesisId: p.thesis?.id || null,
      documentSummary: {
        total: totalRequirements,
        submitted: submittedCount,
        approved: approvedCount,
        declined: declinedCount,
      },
    };
  });

  mapped.sort((a, b) => {
    const pa = PARTICIPANT_STATUS_PRIORITY[a.status] ?? 99;
    const pb = PARTICIPANT_STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return {
    yudisium: {
      id: yudisium.id,
      name: yudisium.name,
      status: deriveYudisiumStatus(yudisium),
      appointedAt: yudisium.appointedAt
    },
    participants: mapped,
  };
};

export const getParticipantDetail = async (participantId, viewer = null) => {
  const participant = await participantRepo.findDetailById(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);
  assertCanViewParticipant(participant, viewer);

  // Use requirements specifically assigned to this Yudisium period
  const yudisiumRequirements = await prisma.yudisiumRequirementItem.findMany({
    where: { yudisiumId: participant.yudisium.id },
    include: { yudisiumRequirement: true },
    orderBy: { order: "asc" },
  });

  const uploadedMap = new Map(
    participant.yudisiumParticipantRequirements.map((r) => [r.yudisiumRequirementItemId, r])
  );

  const documents = yudisiumRequirements.map((item) => {
    const uploaded = uploadedMap.get(item.id);
    return {
      requirementId: item.id,
      requirementName: item.yudisiumRequirement.name,
      description: item.yudisiumRequirement.description,
      order: item.order,
      status: uploaded?.status ?? null,
      submittedAt: uploaded?.submittedAt ?? null,
      verifiedAt: uploaded?.verifiedAt ?? null,
      notes: uploaded?.notes ?? null,
      verifiedBy: uploaded?.verifier?.fullName ?? null,
      document: uploaded?.document
        ? {
          id: uploaded.document.id,
          fileName: uploaded.document.fileName,
          filePath: uploaded.document.filePath,
        }
        : null,
    };
  });

  const supervisors = (participant.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  return {
    id: participant.id,
    status: participant.status,
    registeredAt: participant.registeredAt,
    appointedAt: participant.yudisium.appointedAt,
    notes: participant.notes,
    yudisium: {
      id: participant.yudisium.id,
      name: participant.yudisium.name,
      status: deriveYudisiumStatus(participant.yudisium),
    },
    studentName: participant.thesis?.student?.user?.fullName || "-",
    studentNim: participant.thesis?.student?.user?.identityNumber || "-",
    thesisTitle: participant.thesis?.title || "-",
    supervisors,
    documents,
  };
};

export const getArchiveParticipantOptions = async (yudisiumId) => {
  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);
  assertArchiveYudisium(yudisium);

  const theses = await participantRepo.findAvailableThesesForArchiveParticipant(yudisiumId);

  return theses
    .map((thesis) => ({
      thesisId: thesis.id,
      thesisTitle: thesis.title || "-",
      studentId: thesis.student?.id || null,
      studentName: thesis.student?.user?.fullName || "-",
      studentNim: thesis.student?.user?.identityNumber || "-",
    }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
};

export const addArchiveParticipant = async (yudisiumId, { thesisId }) => {
  if (!thesisId) throwError("Thesis wajib dipilih", 400);

  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);
  assertArchiveYudisium(yudisium);

  const thesis = await participantRepo.findThesisById(thesisId);
  if (!thesis) throwError("Data thesis tidak ditemukan", 404);

  const existing = await participantRepo.findByThesisAndYudisium(yudisiumId, thesisId);
  if (existing) throwError("Mahasiswa sudah terdaftar sebagai peserta yudisium ini", 409);

  const participant = await participantRepo.createFinalizedForThesis(yudisiumId, thesisId);

  return {
    id: participant.id,
    status: participant.status,
    registeredAt: participant.registeredAt,
    thesisId,
    studentName: thesis.student?.user?.fullName || "-",
    studentNim: thesis.student?.user?.identityNumber || "-",
    thesisTitle: thesis.title || "-",
  };
};

export const importArchiveParticipants = async (yudisiumId, file) => {
  if (!file?.buffer) throwError("File import peserta wajib diunggah", 400);

  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);
  assertArchiveYudisium(yudisium);

  let rows = [];
  try {
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) throw new Error("Sheet pertama tidak ditemukan");
    rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  } catch {
    throwError("File Excel tidak dapat dibaca. Pastikan format file sesuai template.", 400);
  }

  if (rows.length === 0) {
    throwError("File import tidak memiliki data peserta", 400);
  }

  const availableColumns = new Set(Object.keys(rows[0] || {}).map(normalizeImportKey));
  const missingColumns = PARTICIPANT_IMPORT_REQUIRED_COLUMNS.filter(
    (column) => !availableColumns.has(normalizeImportKey(column))
  );
  if (missingColumns.length > 0) {
    throwError(
      `Format file tidak sesuai. Kolom wajib: ${PARTICIPANT_IMPORT_REQUIRED_COLUMNS.join(", ")}`,
      400
    );
  }

  const result = {
    total: rows.length,
    successCount: 0,
    failed: 0,
    failedRows: [],
  };
  const seenNims = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const excelRowNumber = index + 2;
    const row = rows[index];
    const name = normalizeImportText(row["Nama Mahasiswa"]);
    const nim = normalizeImportText(row["NIM"]);
    const thesisTitle = normalizeImportText(row["Judul Tugas Akhir"]);

    const fail = (message) => {
      result.failed += 1;
      result.failedRows.push(buildImportFailure(excelRowNumber, message));
    };

    if (!name && !nim && !thesisTitle) {
      fail("Baris kosong tidak dapat diproses");
      continue;
    }
    if (!name) {
      fail("Nama Mahasiswa wajib diisi");
      continue;
    }
    if (!nim) {
      fail("NIM wajib diisi");
      continue;
    }
    if (!thesisTitle) {
      fail("Judul Tugas Akhir wajib diisi");
      continue;
    }

    const nimKey = normalizeImportKey(nim);
    if (seenNims.has(nimKey)) {
      fail(`NIM ${nim} duplikat pada file import`);
      continue;
    }
    seenNims.add(nimKey);

    try {
      const student = await participantRepo.findStudentWithThesesByNim(nim);
      if (!student) {
        fail(`Mahasiswa dengan NIM ${nim} tidak ditemukan di sistem`);
        continue;
      }

      const registeredName = normalizeImportText(student.user?.fullName);
      if (normalizeImportKey(registeredName) !== normalizeImportKey(name)) {
        fail(`Nama Mahasiswa tidak sesuai dengan NIM ${nim} di sistem`);
        continue;
      }

      const theses = student.thesis || [];
      if (theses.length === 0) {
        fail(`Mahasiswa ${registeredName} belum memiliki data Tugas Akhir di sistem`);
        continue;
      }

      const thesis = theses.find(
        (item) => normalizeImportKey(item.title) === normalizeImportKey(thesisTitle)
      );
      if (!thesis) {
        fail(`Judul Tugas Akhir tidak sesuai dengan data di sistem untuk NIM ${nim}`);
        continue;
      }

      const existing = await participantRepo.findByThesisAndYudisium(yudisiumId, thesis.id);
      if (existing) {
        fail(`Mahasiswa ${registeredName} sudah terdaftar sebagai peserta yudisium ini`);
        continue;
      }

      await participantRepo.createFinalizedForThesis(yudisiumId, thesis.id);
      result.successCount += 1;
    } catch (err) {
      fail(getFriendlyImportError(err));
    }
  }

  return result;
};

export const removeArchiveParticipant = async (yudisiumId, participantId) => {
  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);
  assertArchiveYudisium(yudisium);

  const participant = await participantRepo.findByIdAndYudisium(participantId, yudisiumId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  await participantRepo.removeParticipant(participantId);

  return { id: participantId };
};

// ============================================================
// DOCUMENT VERIFICATION (Admin approves/declines a participant's doc)
// ============================================================

export const verifyParticipantDocument = async (
  participantId,
  requirementId,
  { action, notes, userId }
) => {
  if (!["approve", "decline"].includes(action)) {
    throwError('Action harus "approve" atau "decline"', 400);
  }

  const participant = await participantRepo.findStatusById(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  if (participant.status !== "registered") {
    throwError(
      "Verifikasi dokumen hanya dapat dilakukan saat peserta berstatus 'registered'",
      400
    );
  }

  const docRecord = await participantRepo.findRequirementRecord(participantId, requirementId);
  if (!docRecord) {
    throwError("Dokumen persyaratan tidak ditemukan untuk diverifikasi", 404);
  }

  const newStatus = action === "approve" ? "approved" : "declined";

  await participantRepo.updateRequirementRecord(participantId, requirementId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
    verifiedAt: new Date(),
  });

  const verificationContext = await participantRepo.findVerificationContext(participantId, requirementId);
  const studentUserId = verificationContext?.thesis?.student?.user?.id;
  const studentName = verificationContext?.thesis?.student?.user?.fullName || "Mahasiswa";
  const requirementName =
    verificationContext?.yudisiumParticipantRequirements?.[0]?.requirement?.yudisiumRequirement?.name ||
    "Dokumen Persyaratan";
  const yudisiumName = verificationContext?.yudisium?.name || "Yudisium";

  try {
    if (studentUserId) {
      const title = action === "approve" ? "Dokumen Yudisium Disetujui" : "Dokumen Yudisium Ditolak";
      const statusText = action === "approve" ? "disetujui" : "ditolak";
      const message = `Dokumen "${requirementName}" untuk ${yudisiumName} telah ${statusText}.${notes ? ` Catatan: ${notes}` : ""}`;
      await notifyUsers([studentUserId], {
        title,
        message,
        data: { yudisiumId: participant.yudisiumId, participantId, type: "yudisium_doc_verified" },
      });
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify student on yudisium doc verification:", err.message);
  }

  // Auto-transition: when all docs approved → move participant to verified
  let participantTransitioned = false;
  if (action === "approve") {
    // Count requirements specific to this yudisium
    const expectedCount = await prisma.yudisiumRequirementItem.count({
      where: { yudisiumId: participant.yudisiumId },
    });

    const allDocs = await participantRepo.listRequirementRecords(participantId);
    const approvedCount = allDocs.filter((d) => {
      // Current doc is already approved in DB or being approved now
      if (d.yudisiumRequirementItemId === requirementId) return true;
      return d.status === "approved";
    }).length;

    if (approvedCount >= expectedCount) {
      await participantRepo.updateStatus(participantId, "verified", { verifiedAt: new Date() });
      participantTransitioned = true;

      try {
        if (studentUserId) {
          const title = "Dokumen Yudisium Terverifikasi";
          const message = "Seluruh dokumen persyaratan yudisium Anda telah diverifikasi. Menunggu validasi CPL.";
          await notifyUsers([studentUserId], {
            title,
            message,
            data: { yudisiumId: participant.yudisiumId, participantId, type: "yudisium_docs_verified" },
          });
        }

        const gkmIds = await participantRepo.findUserIdsByRole(ROLES.GKM);
        if (gkmIds.length > 0) {
          const title = "Validasi CPL Yudisium";
          const message = `Mahasiswa ${studentName} telah melewati verifikasi dokumen yudisium. Mohon segera melakukan validasi CPL.`;
          await notifyUsers(gkmIds, {
            title,
            message,
            data: { yudisiumId: participant.yudisiumId, participantId, type: "yudisium_need_cpl_validation" },
          });
        }
      } catch (err) {
        console.error("[Notification Error] Failed to notify on yudisium verification transition:", err.message);
      }
    }
  }

  return {
    requirementId,
    status: newStatus,
    participantTransitioned,
    newParticipantStatus: participantTransitioned ? "verified" : participant.status,
  };
};

// ============================================================
// CPL — Scores, Verification, Recommendations
// ============================================================

export const getParticipantCplScores = async (participantId, viewer = null) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);
  assertCanViewParticipant(participant, viewer);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const scores = await participantRepo.findStudentCplScores(studentId);

  const cplScores = scores.map((sc) => {
    const cpl = sc.cpl;
    return {
      cplId: sc.cplId,
      code: cpl?.code || "-",
      description: cpl?.description || "-",
      score: sc.score ?? null,
      oldScore: sc.oldCplScore ?? null,
      minimalScore: cpl?.minimalScore ?? 0,
      status: sc.status ?? "calculated",
      passed: cpl ? sc.score >= cpl.minimalScore : false,
      recommendationDocument: sc.recommendationDocument || null,
      settlementDocument: sc.settlementDocument || null,
      validatedAt: sc.validatedAt || null,
      validatedBy: sc.validator?.fullName || null,
      validatedByNip: sc.validator?.identityNumber || null,
    };
  });

  return {
    participantId,
    participantStatus: participant.status,
    cplScores,
  };
};

export const validateCplScore = async (participantId, cplId, userId) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);
  assertParticipantReadyForCplValidation(participant);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);
  if (score.status === "validated") throwError("CPL ini sudah tervalidasi", 400);

  await participantRepo.validateStudentCplScore(studentId, cplId, userId);

  // If all of the student's scores for active CPLs are validated, move verified participants.
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const allValidated = areAllRelevantCplScoresValidated(activeCpls, allScores);

  if (allValidated && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
    try {
      await notifyCplValidationCompleted(participant);
    } catch (err) {
      console.error("[Notification Error] Failed to notify student on CPL validation completion:", err.message);
    }
  }

  return { cplId, status: "validated", allCplValidated: allValidated };
};

export const saveCplRepairment = async (
  participantId,
  cplId,
  { newScore, oldScore, recommendationFile, settlementFile, userId }
) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);
  assertParticipantReadyForCplValidation(participant);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);
  if (score.status === "validated") throwError("CPL ini sudah tervalidasi", 400);

  const cpl = await participantRepo.findCplById(cplId);
  if (!cpl) throwError("Data CPL tidak ditemukan", 404);

  const parsedNewScore = Number.parseInt(newScore, 10);
  const parsedOldScore = Number.parseInt(oldScore, 10);
  if (Number.isNaN(parsedNewScore)) throwError("Skor baru wajib diisi", 400);
  if (parsedNewScore < cpl.minimalScore) {
    throwError("Skor baru harus memenuhi nilai minimal CPL", 400);
  }
  if (!recommendationFile || !settlementFile) {
    throwError("Dokumen rekomendasi dan penyelesaian CPL wajib diunggah", 400);
  }

  // Handle files
  const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", "cpl-repair", studentId);
  await mkdir(uploadsRoot, { recursive: true });

  let recDocId = null;
  let setDocId = null;

  if (recommendationFile) {
    const ext = path.extname(recommendationFile.originalname).toLowerCase();
    const safeName = `rec-${cplId}-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, recommendationFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    const doc = await participantRepo.createDocument({
      userId,
      fileName: recommendationFile.originalname,
      filePath: relPath,
    });
    recDocId = doc.id;
  }

  if (settlementFile) {
    const ext = path.extname(settlementFile.originalname).toLowerCase();
    const safeName = `set-${cplId}-${Date.now()}${ext}`;
    const absPath = path.join(uploadsRoot, safeName);
    await writeFile(absPath, settlementFile.buffer);
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");
    const doc = await participantRepo.createDocument({
      userId,
      fileName: settlementFile.originalname,
      filePath: relPath,
    });
    setDocId = doc.id;
  }

  await participantRepo.saveCplRepairment(studentId, cplId, {
    score: parsedNewScore,
    oldCplScore: Number.isNaN(parsedOldScore) ? score.score : parsedOldScore,
    recommendationDocumentId: recDocId,
    settlementDocumentId: setDocId,
    verifiedBy: userId,
  });

  // Re-check overall transition if necessary
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const allValidated = areAllRelevantCplScoresValidated(activeCpls, allScores);

  if (allValidated && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
    try {
      await notifyCplValidationCompleted(participant);
    } catch (err) {
      console.error("[Notification Error] Failed to notify student on CPL validation completion:", err.message);
    }
  }

  return { cplId, status: "validated", allCplValidated: allValidated };
};

// ============================================================
// SK (Decree) — Draft generation & official upload
// ============================================================

const STATUS_LABELS = {
  registered: "Menunggu Verifikasi Dokumen",
  verified: "Menunggu Validasi CPL",
  cpl_validated: "Calon Peserta Yudisium",
  appointed: "Peserta Yudisium",
  finalized: "Lulus",
  rejected: "Belum Lulus",
};

const CPL_REPORT_ALLOWED_STATUSES = ["cpl_validated", "appointed", "finalized"];

const escapeHtml = (value) =>
  String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDateLong = (dateObj) => {
  if (!dateObj) return "-";
  return new Date(dateObj).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const getUnandLogoBase64 = () => {
  const possibleLogoPaths = [
    path.resolve(__dirname, "../../assets/unand-logo.png"),
    path.resolve(__dirname, "../assets/unand-logo.png"),
    path.resolve(process.cwd(), "src/assets/unand-logo.png"),
  ];

  for (const p of possibleLogoPaths) {
    try {
      if (fs.existsSync(p)) {
        const logoBuffer = fs.readFileSync(p);
        return `data:image/png;base64,${logoBuffer.toString("base64")}`;
      }
    } catch {
      // Continue to the next known path.
    }
  }

  return "";
};

const mapCplScoresForReport = (scores) =>
  scores.map((sc) => {
    const cpl = sc.cpl || {};
    const score = sc.score ?? null;
    const minimalScore = cpl.minimalScore ?? 0;
    return {
      code: cpl.code || "-",
      description: cpl.description || "-",
      score,
      minimalScore,
      status: score !== null && score >= minimalScore ? "Tercapai" : "Belum Tercapai",
    };
  });

const buildRadarSvg = (scores) => {
  const size = 310;
  const center = size / 2;
  const radius = 108;
  const axisCount = Math.max(scores.length, 3);
  const getPoint = (index, value) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / axisCount;
    const r = radius * Math.max(0, Math.min(100, Number(value) || 0)) / 100;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r];
  };
  const polygon = (values) =>
    values
      .map((value, index) => getPoint(index, value).map((n) => n.toFixed(1)).join(","))
      .join(" ");
  const labelPoint = (index) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / axisCount;
    const r = radius + 20;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r];
  };

  const rings = [50, 60, 70, 80, 90, 100]
    .map((value) => {
      const points = Array.from({ length: axisCount }, (_, index) =>
        getPoint(index, value).map((n) => n.toFixed(1)).join(",")
      ).join(" ");
      return `<polygon points="${points}" fill="none" stroke="#d8dee9" stroke-width="1" />`;
    })
    .join("");

  const axes = scores
    .map((score, index) => {
      const [x, y] = getPoint(index, 100);
      const [lx, ly] = labelPoint(index);
      return `
        <line x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1" />
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#41668f">${escapeHtml(score.code)}</text>
      `;
    })
    .join("");

  const scoreValues = scores.map((score) => score.score ?? 0);
  const thresholdValues = scores.map((score) => score.minimalScore || 0);

  return `
    <svg viewBox="0 0 ${size} ${size}" class="radar-chart" xmlns="http://www.w3.org/2000/svg">
      ${rings}
      ${axes}
      <polygon points="${polygon(scoreValues)}" fill="#2f78c4" fill-opacity="0.84" stroke="#2f78c4" stroke-width="2" />
      <polygon points="${polygon(thresholdValues)}" fill="#df4b43" fill-opacity="0.82" stroke="#df4b43" stroke-width="2" />
      <rect x="92" y="286" width="8" height="8" fill="#2f78c4" />
      <text x="104" y="293" font-size="8" fill="#45556c">Nilai CPL</text>
      <rect x="158" y="286" width="8" height="8" fill="#df4b43" />
      <text x="170" y="293" font-size="8" fill="#45556c">Threshold</text>
    </svg>
  `;
};

const buildCplReportPdf = async ({ studentName, studentNim, scores }) => {
  const logoBase64 = getUnandLogoBase64();
  const mappedScores = mapCplScoresForReport(scores);
  const rows = mappedScores.length > 0
    ? mappedScores.map((score) => `
      <tr>
        <td class="text-center">${escapeHtml(score.code)}</td>
        <td>${escapeHtml(score.description)}</td>
        <td class="text-center">${score.score ?? "-"}</td>
        <td class="text-center">${escapeHtml(score.status)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="text-center">Belum ada data nilai CPL</td></tr>`;
  const today = formatDateLong(new Date());
  const allPassed = mappedScores.length > 0 && mappedScores.every((score) => score.status === "Tercapai");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Formulir Penilaian CPL</title>
  <style>
    @page { size: A4; margin: 1.25cm 1.6cm; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 10.5pt;
      line-height: 1.22;
      color: #000;
      margin: 0;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #000;
      margin-bottom: 10px;
    }
    .logo-cell { width: 78px; vertical-align: middle; padding-bottom: 8px; }
    .logo-img { width: 70px; height: auto; display: block; }
    .header-text { text-align: center; vertical-align: middle; padding-right: 78px; }
    .header-text h3, .header-text h4 {
      margin: 0;
      font-size: 10.5pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text h2 {
      margin: 1px 0;
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text p { margin: 1px 0; font-size: 8.5pt; }
    .title {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 9px 0 8px;
    }
    .section-title {
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 9px;
      margin-bottom: 4px;
    }
    .info-table { border-collapse: collapse; margin-left: 12px; }
    .info-table td { padding: 1px 0; vertical-align: top; }
    .info-label { width: 115px; }
    .info-colon { width: 14px; text-align: center; }
    .assessment-grid {
      display: grid;
      grid-template-columns: 42% minmax(0, 1fr);
      gap: 8px;
      align-items: stretch;
      width: 100%;
      box-sizing: border-box;
    }
    .chart-box {
      border: 1px solid #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      padding: 2px;
      box-sizing: border-box;
      min-width: 0;
    }
    .chart-title {
      text-align: center;
      font-size: 9.5pt;
      font-weight: bold;
      color: #2f5597;
      line-height: 1.15;
      margin-bottom: 2px;
    }
    .radar-chart { width: 100%; max-width: 315px; height: auto; display: block; }
    .data-table {
      width: 100%;
      max-width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      box-sizing: border-box;
    }
    .data-table th, .data-table td {
      border: 1px solid #000;
      padding: 3px 4px;
      font-size: 7.8pt;
      vertical-align: top;
      box-sizing: border-box;
      overflow-wrap: anywhere;
    }
    .data-table th {
      font-weight: bold;
      text-align: center;
      background: #f3f3f3;
    }
    .text-center { text-align: center; }
    .conclusion-list { margin: 2px 0 0 14px; padding: 0; list-style: none; }
    .signature {
      width: 255px;
      margin-left: auto;
      margin-top: 22px;
      text-align: left;
      page-break-inside: avoid;
    }
    .signature-space { height: 58px; }
    .signature-name { font-weight: bold; text-decoration: underline; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ""}
      </td>
      <td class="header-text">
        <h3>Kementerian Pendidikan Tinggi, Sains, dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis, Padang, Kode Pos 25163</p>
        <p>Email: jurusan_si@fti.unand.ac.id dan website: http://si.fti.unand.ac.id</p>
      </td>
    </tr>
  </table>

  <div class="title">Formulir Penilaian Capaian Pembelajaran Lulusan (CPL)</div>

  <div class="section-title">A. Data Mahasiswa</div>
  <table class="info-table">
    <tr><td class="info-label">Nama Lengkap</td><td class="info-colon">:</td><td>${escapeHtml(studentName)}</td></tr>
    <tr><td class="info-label">NIM</td><td class="info-colon">:</td><td>${escapeHtml(studentNim)}</td></tr>
  </table>

  <div class="section-title">B. Penilaian Capaian Pembelajaran Lulusan (CPL)</div>
  <div class="assessment-grid">
    <div class="chart-box">
      <div class="chart-title">${escapeHtml(studentName)}<br />${escapeHtml(studentNim)}</div>
      ${buildRadarSvg(mappedScores)}
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 14%;">Kode CPL</th>
          <th style="width: 54%;">Deskripsi CPL</th>
          <th style="width: 11%;">Nilai</th>
          <th style="width: 21%;">Status Capaian</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="section-title">C. Kesimpulan Asesmen</div>
  <ul class="conclusion-list">
    <li>${allPassed ? "☑" : "☐"} Seluruh CPL telah dicapai sesuai standar minimum kelulusan.</li>
    <li>${allPassed ? "☐" : "☑"} Ada CPL yang belum tercapai.</li>
    <li>☐ Perlu tindak lanjut.</li>
  </ul>

  <div class="signature">
    <div>Padang, ${escapeHtml(today)}</div>
    <div>Koordinator Asesmen CPL.</div>
    <div class="signature-space"></div>
    <div class="signature-name">Ullya Mega Wahyuni, M.Kom</div>
    <div>NIP: 199011032019032008</div>
  </div>
</body>
</html>`;

  return await convertHtmlToPdf(html);
};

const assertCplReportDownloadable = (participant) => {
  if (!CPL_REPORT_ALLOWED_STATUSES.includes(participant.status)) {
    throwError("Laporan CPL hanya dapat diunduh setelah validasi CPL selesai", 400);
  }
};

export const exportParticipantCplReport = async (participantId, viewer = null) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);
  assertCanViewParticipant(participant, viewer);
  assertCplReportDownloadable(participant);

  const student = participant.thesis?.student;
  if (!student?.id) throwError("Data mahasiswa tidak ditemukan", 404);
  const scores = await participantRepo.findStudentCplScores(student.id);

  return await buildCplReportPdf({
    studentName: student.user?.fullName || "-",
    studentNim: student.user?.identityNumber || "-",
    scores,
  });
};

export const exportCurrentStudentCplReport = async (userId) => {
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
      thesis: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!student) throwError("Data mahasiswa tidak ditemukan", 404);
  const thesisId = student.thesis?.[0]?.id;
  if (!thesisId) throwError("Data tugas akhir mahasiswa tidak ditemukan", 404);

  const participant = await prisma.yudisiumParticipant.findFirst({
    where: {
      thesisId,
      status: { in: CPL_REPORT_ALLOWED_STATUSES },
    },
    orderBy: { registeredAt: "desc" },
    select: { id: true, status: true },
  });

  if (!participant) {
    throwError("Laporan CPL hanya dapat diunduh setelah validasi CPL selesai", 400);
  }

  const scores = await participantRepo.findStudentCplScores(student.id);
  return await buildCplReportPdf({
    studentName: student.user?.fullName || "-",
    studentNim: student.user?.identityNumber || "-",
    scores,
  });
};

export const exportParticipants = async (yudisiumId, userId) => {
  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    include: {
      room: true,
      participants: {
        where: {
          status: { in: ["cpl_validated", "appointed", "finalized"] }
        },
        include: {
          thesis: {
            include: {
              student: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  // Fetch Signatories
  const koordinator = await prisma.user.findUnique({ where: { id: userId } });
  const ketuaDept = await prisma.user.findFirst({
    where: {
      userHasRoles: {
        some: {
          role: { name: "Ketua Departemen" },
          status: "active",
        },
      },
    },
  });

  const formatDayDate = (dateObj) => {
    if (!dateObj) return "-";
    return new Date(dateObj).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (dateObj) => {
    if (!dateObj) return "-";
    return new Date(dateObj).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    });
  };

  const logoBase64 = getUnandLogoBase64();

  const participants = [...(yudisium.participants || [])].sort((a, b) => {
    const nimA = a.thesis?.student?.user?.identityNumber || "";
    const nimB = b.thesis?.student?.user?.identityNumber || "";
    if (nimA !== nimB) return nimA.localeCompare(nimB);
    return (a.thesis?.student?.user?.fullName || "").localeCompare(
      b.thesis?.student?.user?.fullName || ""
    );
  });
  const studentCount = participants.length;
  const dateStr = formatDateLong(new Date());

  const participantRows = participants.length > 0 ? participants.map((p, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td class="text-center">${escapeHtml(p.thesis?.student?.user?.identityNumber)}</td>
          <td>${escapeHtml(p.thesis?.student?.user?.fullName)}</td>
        </tr>
      `).join("") : `
        <tr>
          <td colspan="3" class="text-center">Belum ada peserta yudisium</td>
        </tr>
      `;

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Daftar Peserta Yudisium</title>
  <style>
    @page {
      size: A4;
      margin: 1.5cm 2cm 1.5cm 2.5cm;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .logo-cell {
      width: 80px;
      vertical-align: middle;
      padding-bottom: 10px;
    }
    .logo-img {
      width: 75px;
      height: auto;
      display: block;
    }
    .header-text {
      text-align: center;
      vertical-align: middle;
      padding-right: 80px;
    }
    .header-text h3, .header-text h4 {
      margin: 0;
      font-size: 11pt;
      font-weight: normal;
      text-transform: uppercase;
    }
    .header-text h2 {
      margin: 1px 0;
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .header-text p {
      margin: 1px 0;
      font-size: 9pt;
      font-weight: normal;
    }
    .title {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      text-decoration: underline;
      text-transform: uppercase;
      margin: 14px 0 18px 0;
    }
    .section-title {
      font-weight: bold;
      margin-top: 16px;
      margin-bottom: 5px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-left: 20px;
      margin-bottom: 10px;
    }
    .info-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .info-label { width: 180px; }
    .info-colon { width: 15px; text-align: center; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }
    .data-table th, .data-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      font-size: 10pt;
      vertical-align: top;
    }
    .data-table th {
      text-align: center;
      background-color: #f2f2f2;
      font-weight: bold;
    }
    .text-center { text-align: center; }
    .signature-note { margin: 0 0 18px 20px; }
    .signature-block {
      margin-left: 20px;
      margin-top: 18px;
      width: 100%;
    }
    .signature-table {
      border-collapse: collapse;
      margin-top: 8px;
      margin-left: 18px;
      width: 80%;
    }
    .signature-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .signature-label { width: 92px; }
    .signature-colon { width: 14px; text-align: center; }
    .signature-line { border-bottom: 1px dotted #000; min-width: 220px; display: inline-block; }
    .signature-gap { height: 22px; }
    .page-break-before { page-break-before: auto; }
    .avoid-break { page-break-inside: avoid; }
    .small-note {
      font-size: 10pt;
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo UNAND" />` : ''}
      </td>
      <td class="header-text">
        <h3>Kementerian Pendidikan Tinggi, Sains, dan Teknologi</h3>
        <h4>Universitas Andalas</h4>
        <h4>Fakultas Teknologi Informasi</h4>
        <h2>Departemen Sistem Informasi</h2>
        <p>Kampus Universitas Andalas, Limau Manis 25163</p>
        <p>Website: http://si.fti.unand.ac.id dan email: jurusan_si@fti.unand.ac.id</p>
      </td>
    </tr>
  </table>

  <div class="title">Daftar Peserta Yudisium</div>

  <div class="section-title">A. INFORMASI UMUM</div>
  <table class="info-table">
    <tr>
      <td class="info-label">Periode Yudisium</td>
      <td class="info-colon">:</td>
      <td>${escapeHtml(yudisium.name)}</td>
    </tr>
    <tr>
      <td class="info-label">Jumlah Mahasiswa Lulus</td>
      <td class="info-colon">:</td>
      <td>${studentCount}</td>
    </tr>
  </table>

  <div class="section-title">B. JADWAL PELAKSANAAN YUDISIUM</div>
  <table class="info-table">
    <tr>
      <td class="info-label">Hari / Tanggal</td>
      <td class="info-colon">:</td>
      <td>${escapeHtml(formatDayDate(yudisium.eventDate))}</td>
    </tr>
    <tr>
      <td class="info-label">Waktu</td>
      <td class="info-colon">:</td>
      <td>${escapeHtml(formatTime(yudisium.eventDate))} WIB</td>
    </tr>
    <tr>
      <td class="info-label">Tempat Pelaksanaan</td>
      <td class="info-colon">:</td>
      <td>${escapeHtml(yudisium.room?.name)}</td>
    </tr>
  </table>

  <div class="section-title">C. DAFTAR MAHASISWA PESERTA YUDISIUM</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 38px;">No</th>
        <th style="width: 105px;">NIM</th>
        <th>Nama Mahasiswa</th>
      </tr>
    </thead>
    <tbody>
      ${participantRows}
    </tbody>
  </table>

  <div class="avoid-break">
    <div class="section-title">D. TANDA TANGAN KOORDINATOR YUDISIUM</div>
    <p class="signature-note">
      Dengan ini menetapkan jadwal pelaksanaan yudisium berdasarkan data mahasiswa yang telah memenuhi seluruh persyaratan akademik dan administratif.
    </p>

    <div class="signature-block">
      <p>Koordinator Yudisium</p>
      <table class="signature-table">
        <tr>
          <td class="signature-label">Nama</td>
          <td class="signature-colon">:</td>
          <td>${escapeHtml(koordinator?.fullName || "-")}</td>
        </tr>
        <tr>
          <td>Tanda Tangan</td>
          <td class="signature-colon">:</td>
          <td><span class="signature-line">&nbsp;</span></td>
        </tr>
        <tr>
          <td>Tanggal</td>
          <td class="signature-colon">:</td>
          <td><span class="signature-line">${escapeHtml(dateStr)}</span></td>
        </tr>
      </table>
    </div>

    <div class="signature-block" style="margin-top: 30px;">
      <p>Mengetahui,</p>
      <p>Ketua Departemen Sistem Informasi,</p>
      <table class="signature-table">
        <tr>
          <td class="signature-label">Nama</td>
          <td class="signature-colon">:</td>
          <td>${escapeHtml(ketuaDept?.fullName || "-")}</td>
        </tr>
        <tr>
          <td>Tanda Tangan</td>
          <td class="signature-colon">:</td>
          <td><span class="signature-line">&nbsp;</span></td>
        </tr>
        <tr>
          <td>Tanggal</td>
          <td class="signature-colon">:</td>
          <td><span class="signature-line">&nbsp;</span></td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;

  return await convertHtmlToPdf(html);
};

export const finalizeParticipants = async (yudisiumId) => {
  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    select: { registrationCloseDate: true },
  });

  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const now = new Date();
  const isClosed = yudisium.registrationCloseDate && now > new Date(yudisium.registrationCloseDate);
  if (!isClosed) {
    throwError("Finalisasi hanya dapat dilakukan setelah pendaftaran ditutup", 400);
  }

  // Finalize statuses
  // 1. cpl_validated -> appointed
  // 2. registered, verified -> rejected
  const result = await participantRepo.finalizeAllParticipants(yudisiumId);

  return result;
};
