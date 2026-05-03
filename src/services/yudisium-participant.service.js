import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as participantRepo from "../repositories/yudisium-participant.repository.js";
import * as requirementRepo from "../repositories/yudisium-requirement.repository.js";

function throwError(msg, code) {
  const e = new Error(msg);
  e.statusCode = code;
  throw e;
}

const PARTICIPANT_STATUS_PRIORITY = {
  registered: 0,
  under_review: 1,
  approved: 2,
  rejected: 3,
  finalized: 4,
};

// ============================================================
// PARTICIPANT LIST & DETAIL
// ============================================================

export const getParticipants = async (yudisiumId) => {
  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const activeRequirements = await requirementRepo.findActive();
  const totalRequirements = activeRequirements.length;

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
      appointedAt: p.appointedAt,
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
    yudisium: { id: yudisium.id, name: yudisium.name, status: yudisium.status },
    participants: mapped,
  };
};

export const getParticipantDetail = async (participantId) => {
  const participant = await participantRepo.findDetailById(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const allRequirements = await requirementRepo.findActive();

  const uploadedMap = new Map(
    participant.yudisiumParticipantRequirements.map((r) => [r.yudisiumRequirementId, r])
  );

  const documents = allRequirements.map((req) => {
    const uploaded = uploadedMap.get(req.id);
    return {
      requirementId: req.id,
      requirementName: req.name,
      description: req.description,
      order: req.order,
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
    appointedAt: participant.appointedAt,
    notes: participant.notes,
    yudisium: participant.yudisium,
    studentName: participant.thesis?.student?.user?.fullName || "-",
    studentNim: participant.thesis?.student?.user?.identityNumber || "-",
    thesisTitle: participant.thesis?.title || "-",
    supervisors,
    documents,
  };
};

// ============================================================
// DOCUMENT VALIDATION (Admin approves/declines a participant's doc)
// ============================================================

export const validateParticipantDocument = async (
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
      "Validasi dokumen hanya dapat dilakukan saat peserta berstatus 'registered'",
      400
    );
  }

  const docRecord = await participantRepo.findRequirementRecord(participantId, requirementId);
  if (!docRecord) {
    throwError("Dokumen persyaratan tidak ditemukan untuk divalidasi", 404);
  }

  const newStatus = action === "approve" ? "approved" : "declined";

  await participantRepo.updateRequirementRecord(participantId, requirementId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
    verifiedAt: new Date(),
  });

  // Auto-transition: when all docs approved → move participant to under_review
  let participantTransitioned = false;
  if (action === "approve") {
    const activeRequirements = await requirementRepo.findActive();
    const expectedCount = activeRequirements.length;

    const allDocs = await participantRepo.listRequirementRecords(participantId);
    const approvedCount = allDocs.filter((d) => {
      if (d.yudisiumRequirementId === requirementId) return true;
      return d.status === "approved";
    }).length;

    if (approvedCount >= expectedCount) {
      await participantRepo.updateStatus(participantId, "verified");
      participantTransitioned = true;
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

export const getParticipantCplScores = async (participantId) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const cpls = await participantRepo.findCplsActive();
  const scores = await participantRepo.findStudentCplScores(studentId);
  const scoreMap = new Map(scores.map((s) => [s.cplId, s]));

  const cplScores = cpls.map((cpl) => {
    const sc = scoreMap.get(cpl.id);
    return {
      cplId: cpl.id,
      code: cpl.code,
      description: cpl.description,
      score: sc?.score ?? null,
      oldScore: sc?.oldCplScore ?? null,
      minimalScore: cpl.minimalScore,
      status: sc?.status ?? "calculated",
      passed: sc ? sc.score >= cpl.minimalScore : false,
      recommendationDocument: sc?.recommendationDocument || null,
      settlementDocument: sc?.settlementDocument || null,
      verifiedAt: sc?.verifiedAt || null,
      verifiedBy: sc?.verifier?.fullName || null,
    };
  });

  return {
    participantId,
    participantStatus: participant.status,
    cplScores,
  };
};

export const verifyCplScore = async (participantId, cplId, userId) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);
  if (score.status === "verified") throwError("CPL ini sudah tervalidasi", 400);

  await participantRepo.verifyStudentCplScore(studentId, cplId, userId);

  // If all active CPLs verified and participant is under_review → transition to approved
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const scoreStatusMap = new Map(allScores.map((s) => [s.cplId, s.status]));
  const allVerified = activeCpls.every((cpl) => scoreStatusMap.get(cpl.id) === "verified");

  if (allVerified && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
  }

  return { cplId, status: "verified", allCplVerified: allVerified };
};

export const saveCplRepairment = async (
  participantId,
  cplId,
  { newScore, oldScore, recommendationFile, settlementFile, userId }
) => {
  const participant = await participantRepo.findStudentByParticipant(participantId);
  if (!participant) throwError("Peserta yudisium tidak ditemukan", 404);

  const studentId = participant.thesis?.student?.id;
  if (!studentId) throwError("Data mahasiswa tidak ditemukan", 404);

  const score = await participantRepo.findStudentCplScore(studentId, cplId);
  if (!score) throwError("Skor CPL mahasiswa tidak ditemukan", 404);

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

  const result = await participantRepo.saveCplRepairment(studentId, cplId, {
    score: parseInt(newScore),
    oldCplScore: parseInt(oldScore),
    recommendationDocumentId: recDocId,
    settlementDocumentId: setDocId,
    verifiedBy: userId,
  });

  // Re-check overall transition if necessary
  const activeCpls = await participantRepo.findCplsActive();
  const allScores = await participantRepo.findStudentCplScores(studentId);
  const scoreStatusMap = new Map(allScores.map((s) => [s.cplId, s.status]));
  const allVerified = activeCpls.every((cpl) => scoreStatusMap.get(cpl.id) === "verified");

  if (allVerified && participant.status === "verified") {
    await participantRepo.updateStatus(participantId, "cpl_validated");
  }

  return { cplId, status: "verified", allCplVerified: allVerified };
};

// ============================================================
// SK (Decree) — Draft generation & official upload
// ============================================================

const STATUS_LABELS = {
  registered: "Terdaftar",
  under_review: "Dalam Review",
  approved: "Disetujui",
  rejected: "Ditolak",
  finalized: "Selesai",
};

export const generateDraftSk = async (yudisiumId) => {
  const yudisium = await participantRepo.findYudisiumWithParticipantsForDraft(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const margin = 50;

  const addPage = () => pdfDoc.addPage([595, 842]); // A4
  let page = addPage();
  const { width, height } = page.getSize();
  let y = height - margin;

  const drawText = (text, { x = margin, size = fontSize, f = font, color = rgb(0, 0, 0) } = {}) => {
    if (y < margin + 30) {
      page = addPage();
      y = height - margin;
    }
    page.drawText(text, { x, y, size, font: f, color });
    y -= size + 4;
  };

  drawText("DRAFT SURAT KEPUTUSAN YUDISIUM", { size: 14, f: fontBold, x: margin });
  y -= 10;
  drawText(`Periode: ${yudisium.name}`, { size: 11 });
  drawText(
    `Tanggal Generate: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`,
    { size: 11 }
  );
  if (yudisium.eventDate) {
    drawText(
      `Tanggal Yudisium: ${new Date(yudisium.eventDate).toLocaleDateString("id-ID", { dateStyle: "long" })}`,
      { size: 11 }
    );
  }
  y -= 15;

  drawText("DAFTAR PESERTA YUDISIUM", { size: 12, f: fontBold });
  y -= 5;

  const colX = [margin, margin + 30, margin + 130, margin + 280, margin + 420];
  const headers = ["No", "NIM", "Nama", "Judul TA", "Status"];
  headers.forEach((h, i) => {
    page.drawText(h, { x: colX[i], y, size: 9, font: fontBold });
  });
  y -= 14;

  page.drawLine({
    start: { x: margin, y: y + 10 },
    end: { x: width - margin, y: y + 10 },
    thickness: 0.5,
  });

  yudisium.participants.forEach((p, idx) => {
    if (y < margin + 30) {
      page = addPage();
      y = height - margin;
    }

    const nim = p.thesis?.student?.user?.identityNumber || "-";
    const name = p.thesis?.student?.user?.fullName || "-";
    const title = p.thesis?.title || "-";
    const truncTitle = title.length > 30 ? title.substring(0, 27) + "..." : title;
    const status = STATUS_LABELS[p.status] || p.status;

    const rowData = [String(idx + 1), nim, name, truncTitle, status];
    rowData.forEach((text, i) => {
      page.drawText(text, { x: colX[i], y, size: 8, font });
    });
    y -= 13;
  });

  y -= 20;
  drawText(`Total Peserta: ${yudisium.participants.length}`, { size: 10, f: fontBold });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};

export const uploadOfficialSk = async (
  yudisiumId,
  { file, eventDate, decreeNumber, decreeIssuedAt, userId }
) => {
  if (!file) throwError("File SK wajib diunggah", 400);

  const yudisium = await participantRepo.findYudisiumById(yudisiumId);
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  // Save file to disk
  const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", yudisiumId);
  await mkdir(uploadsRoot, { recursive: true });

  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `sk-resmi-${yudisiumId}${ext}`;
  const absolutePath = path.join(uploadsRoot, safeName);
  await writeFile(absolutePath, file.buffer);

  const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

  const document = await participantRepo.createDocument({
    userId,
    fileName: file.originalname,
    filePath: relPath,
  });

  const updateData = { 
    documentId: document.id, 
    decreeUploadedBy: userId,
    status: "scheduled" 
  };
  if (eventDate) updateData.eventDate = new Date(eventDate);
  if (decreeNumber) updateData.decreeNumber = decreeNumber;
  if (decreeIssuedAt) updateData.decreeIssuedAt = new Date(decreeIssuedAt);

  await participantRepo.updateYudisiumDecree(yudisiumId, updateData);

  return { documentId: document.id, fileName: file.originalname };
};
