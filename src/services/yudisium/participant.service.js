import fs from "fs";

import path from "path";

import { mkdir, writeFile } from "fs/promises";

import { fileURLToPath } from "url";

import { convertHtmlToPdf } from "../../utils/pdf.util.js";
import { renderAndIssueOfficialHtmlDocument } from "../official-document.service.js";

import prisma from "../../config/prisma.js";

import * as participantRepo from "../../repositories/yudisium/participant.repository.js";

import * as requirementRepo from "../../repositories/yudisium/requirement.repository.js";

import * as xlsx from "xlsx";

import { ROLES } from "../../constants/roles.js";
import { GRADUATION_PREDICATE } from "../../constants/graduationPredicate.js";
import { getStudentGraduationSummary, summarize } from "../../helpers/graduation-predicate.helper.js";
import { DOCUMENT_QR_PLACEHOLDER, documentBaseStyles, findPositionHolder, formatDocumentDate, letterheadHtml, signatureBlockHtml } from "../../utils/document-template.util.js";



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
  eligible: 1,
  appointed: 2,
  finalized: 3,
  rejected: 4,
};

const areAllRelevantCplScoresValidated = (activeCpls = [], scores = []) => {
  const activeCplIds = new Set((activeCpls || []).map((cpl) => cpl.id));
  const relevantScores = (scores || []).filter((score) => activeCplIds.has(score.cplId));
  return (
    relevantScores.length > 0 &&
    relevantScores.every((score) => score.status === "validated")
  );
};

export async function recomputeParticipantEligibility(tx, participantId) {
  const dbClient = (tx && tx.yudisiumParticipant && typeof tx.yudisiumParticipant.findUnique === "function") ? tx : prisma;

  const p = await dbClient.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: { id: true, status: true, requirementVerifiedAt: true, cplValidatedAt: true, registeredAt: true, thesis: { select: { studentId: true } } }
  });

  if (!p || p.registeredAt === null || ["appointed", "finalized", "rejected"].includes(p.status)) return p;

  let cplValidatedAt = p.cplValidatedAt;

  // Auto-sync cplValidatedAt if all relevant CPL scores are already validated for this student
  if (cplValidatedAt === null && p.thesis?.studentId) {
    const activeCpls = await participantRepo.findCplsActive(dbClient);
    const allScores = await participantRepo.findStudentCplScores(p.thesis.studentId, dbClient);
    if (areAllRelevantCplScoresValidated(activeCpls, allScores)) {
      const latestValidation = allScores
        .map(s => s.validatedAt ? new Date(s.validatedAt).getTime() : 0)
        .reduce((max, cur) => Math.max(max, cur), 0);
      cplValidatedAt = latestValidation > 0 ? new Date(latestValidation) : new Date();

      await dbClient.yudisiumParticipant.update({
        where: { id: participantId },
        data: { cplValidatedAt },
      });
    }
  }

  const isBothComplete = p.requirementVerifiedAt !== null && cplValidatedAt !== null;
  const targetStatus = isBothComplete ? "eligible" : "registered";

  if (p.status !== targetStatus) {
    if (tx && tx.yudisiumParticipant && typeof tx.yudisiumParticipant.update === "function") {
      return await tx.yudisiumParticipant.update({
        where: { id: participantId },
        data: { status: targetStatus }
      });
    }
    return await participantRepo.updateStatus(participantId, targetStatus);
  }

  return p;
}



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

  if (!participant || participant.registeredAt === null || ["appointed", "finalized", "rejected"].includes(participant.status)) {

    throwError("Validasi CPL tidak dapat diubah pada status peserta saat ini", 400);

  }

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



const notifyFinalizedParticipants = async ({ yudisium, appointedParticipants, rejectedParticipants }) => {

  const yudisiumName = yudisium?.name || "Yudisium";

  const eventDateText = yudisium?.eventDate

    ? new Date(yudisium.eventDate).toLocaleDateString("id-ID", {

      weekday: "long",

      day: "numeric",

      month: "long",

      year: "numeric",

    })

    : "-";



  const appointedUserIds = appointedParticipants

    .map((p) => p.thesis?.student?.user?.id)

    .filter(Boolean);

  const rejectedUserIds = rejectedParticipants

    .map((p) => p.thesis?.student?.user?.id)

    .filter(Boolean);



  await notifyUsers(appointedUserIds, {

    title: "Ditetapkan sebagai Peserta Yudisium",

    message: `Anda telah ditetapkan sebagai peserta ${yudisiumName}. Jadwal pelaksanaan: ${eventDateText}.`,

    data: { yudisiumId: yudisium.id, type: "yudisium_participant_appointed" },

  });

  await notifyUsers(rejectedUserIds, {

    title: "Hasil Finalisasi Yudisium",

    message: `Anda belum dapat ditetapkan sebagai peserta ${yudisiumName} karena persyaratan belum lengkap atau CPL belum tervalidasi.`,

    data: { yudisiumId: yudisium.id, type: "yudisium_participant_rejected" },

  });

};



const syncYudisiumToOutlook = async ({ yudisium, appointedParticipants, organizerId }) => {

  if (!yudisium?.eventDate || appointedParticipants.length === 0) return;



  try {

    const outlook = await import("../outlook-calendar.service.js");

    const startTime = new Date(yudisium.eventDate);

    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const location = yudisium.room?.name || "Departemen Sistem Informasi";

    const attendees = [

      ...new Set(appointedParticipants.map((p) => p.thesis?.student?.user?.email).filter(Boolean)),

    ];

    const participantNames = appointedParticipants

      .map((p, index) => `${index + 1}. ${p.thesis?.student?.user?.fullName || "-"}`)

      .join("\n");



    const eventData = {

      subject: `${yudisium.name} - Yudisium`,

      body: `Pelaksanaan ${yudisium.name}\n\nPeserta:\n${participantNames}\n\nDisinkronkan dari Neo Central.`,

      startTime,

      endTime,

      location,

      attendees,

    };



    const organizerCandidates = [

      organizerId,

      ...appointedParticipants.map((p) => p.thesis?.student?.user?.id),

    ].filter(Boolean);



    let selectedOrganizer = null;

    for (const userId of organizerCandidates) {

      const access = await outlook.hasCalendarAccess(userId);

      if (typeof access === "object" ? access.hasAccess : access) {

        selectedOrganizer = userId;

        break;

      }

    }



    if (selectedOrganizer) {

      await outlook.createCalendarEvent(selectedOrganizer, eventData);

    }

  } catch (err) {

    console.error("[OutlookSync] Failed to sync yudisium finalization:", err.message);

  }

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

      requirementVerifiedAt: p.requirementVerifiedAt,
      cplValidatedAt: p.cplValidatedAt,
      isRequirementVerified: !!p.requirementVerifiedAt || (totalRequirements > 0 && approvedCount === totalRequirements),
      isCplValidated: !!p.cplValidatedAt,
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

    if (dateA !== dateB) return dateA - dateB;

    return a.studentName.localeCompare(b.studentName);

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
  await recomputeParticipantEligibility(null, participantId);
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

      document: (uploaded && uploaded.filePath)
        ? {
          id: item.id,
          fileName: uploaded.fileName,
          filePath: uploaded.filePath,
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
      `Format file tidak sesuai. Kolom wajib yang belum ada: ${missingColumns.join(", ")}`,
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



  if (["appointed", "finalized", "rejected"].includes(participant.status) || participant.registeredAt === null) {

    throwError(

      "Verifikasi dokumen tidak dapat dilakukan pada status peserta saat ini",

      400

    );

  }



  const docRecord = await participantRepo.findRequirementRecord(participantId, requirementId);

  if (!docRecord) {

    throwError("Dokumen persyaratan tidak ditemukan untuk diverifikasi", 404);

  }



  const newStatus = action === "approve" ? "approved" : "declined";



  const { allReqsVerified, updatedParticipant } = await prisma.$transaction(async (tx) => {

    await tx.yudisiumParticipantRequirement.updateMany({

      where: {

        yudisiumParticipantId: participantId,

        yudisiumRequirementItemId: requirementId,

      },

      data: {

        status: newStatus,

        notes: notes || null,

        verifiedBy: userId,

        verifiedAt: new Date(),

      },

    });



    const expectedCount = await tx.yudisiumRequirementItem.count({

      where: { yudisiumId: participant.yudisiumId },

    });



    const allDocs = await tx.yudisiumParticipantRequirement.findMany({

      where: { yudisiumParticipantId: participantId },

      select: { yudisiumRequirementItemId: true, status: true },

    });



    const approvedCount = (allDocs || []).filter((d) => d.status === "approved").length;

    const allReqsVerified = expectedCount > 0 && approvedCount >= expectedCount;

    const newReqVerifiedAt = allReqsVerified ? new Date() : null;



    await tx.yudisiumParticipant.update({

      where: { id: participantId },

      data: { requirementVerifiedAt: newReqVerifiedAt },

    });



    const updatedParticipant = await recomputeParticipantEligibility(tx, participantId);



    return { allReqsVerified, updatedParticipant };

  });



  try {

    const verificationContext = await participantRepo.findVerificationContext(participantId, requirementId);

    const studentUserId = verificationContext?.thesis?.student?.user?.id;

    const requirementName =

      verificationContext?.yudisiumParticipantRequirements?.[0]?.requirement?.yudisiumRequirement?.name ||

      "Dokumen Persyaratan";

    const yudisiumName = verificationContext?.yudisium?.name || "Yudisium";

    if (studentUserId) {

      const title = action === "approve" ? "Verifikasi Dokumen Disetujui" : "Verifikasi Dokumen Ditolak";

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



  return {

    requirementId,

    status: newStatus,

    requirementVerified: allReqsVerified,

    participantStatus: updatedParticipant?.status ?? participant.status,

  };

};



export const getRequirementFilePath = async (yudisiumId, participantId, itemId, user) => {

  const participant = await prisma.yudisiumParticipant.findUnique({

    where: { id: participantId },

    include: {

      thesis: {

        select: { studentId: true },

      },

    },

  });



  if (!participant || participant.yudisiumId !== yudisiumId) {

    throwError("Peserta yudisium tidak ditemukan", 404);

  }



  const role = user?.role || user?.currentRole;

  if (role === "Mahasiswa") {

    if (participant.thesis?.studentId !== user.id) {

      throwError("Anda tidak berhak mengakses dokumen mahasiswa lain", 403);

    }

  }



  const record = await participantRepo.findRequirementRecord(participantId, itemId);

  if (!record || !record.filePath) {

    throwError("Dokumen persyaratan tidak ditemukan", 404);

  }



  const absolutePath = path.resolve(process.cwd(), record.filePath);

  if (!fs.existsSync(absolutePath)) {

    throwError("File dokumen fisik tidak ditemukan", 404);

  }



  return {

    absolutePath,

    fileName: record.fileName || "dokumen.pdf",

    mimeType: record.mimeType || "application/pdf",

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
      recommendationDocument: (sc.recommendationDocumentPath || sc.recommendationDocument?.filePath) ? {
        filePath: sc.recommendationDocumentPath || sc.recommendationDocument?.filePath,
        fileName: sc.recommendationDocumentName || sc.recommendationDocument?.fileName || 'Surat Rekomendasi.pdf',
        mimeType: sc.recommendationDocumentMimeType || 'application/pdf',
        fileSize: sc.recommendationDocumentSize || null,
      } : (sc.recommendationDocument || null),
      settlementDocument: (sc.settlementDocumentPath || sc.settlementDocument?.filePath) ? {
        filePath: sc.settlementDocumentPath || sc.settlementDocument?.filePath,
        fileName: sc.settlementDocumentName || sc.settlementDocument?.fileName || 'Bukti Penyelesaian.pdf',
        mimeType: sc.settlementDocumentMimeType || 'application/pdf',
        fileSize: sc.settlementDocumentSize || null,
      } : (sc.settlementDocument || null),
      validatedAt: sc.validatedAt || null,
      validatedBy: sc.validatorName || null,
      validatedByNip: sc.validatorNip || null,
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



  const { allValidated, updatedParticipant } = await prisma.$transaction(async (tx) => {

    await participantRepo.validateStudentCplScore(studentId, cplId, userId, tx);



    const activeCpls = await participantRepo.findCplsActive(tx);

    const allScores = await participantRepo.findStudentCplScores(studentId, tx);

    const allValidated = areAllRelevantCplScoresValidated(activeCpls, allScores);

    const newCplValidatedAt = allValidated ? new Date() : null;



    await tx.yudisiumParticipant.update({

      where: { id: participantId },

      data: { cplValidatedAt: newCplValidatedAt },

    });



    const updatedParticipant = await recomputeParticipantEligibility(tx, participantId);



    return { allValidated, updatedParticipant };

  });



  if (allValidated) {

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



  const cpl = await participantRepo.findCplById(cplId);

  if (!cpl) throwError("Data CPL tidak ditemukan", 404);



  const parsedNewScore = Number.parseInt(newScore, 10);

  const parsedOldScore = Number.parseInt(oldScore, 10);

  if (Number.isNaN(parsedNewScore)) throwError("Skor baru wajib diisi", 400);

  if (parsedNewScore < cpl.minimalScore) {

    throwError("Skor baru harus memenuhi nilai minimal CPL", 400);

  }

  if (!recommendationFile && !score.recommendationDocumentPath) {

    throwError("Dokumen rekomendasi CPL wajib diunggah", 400);

  }

  if (!settlementFile && !score.settlementDocumentPath) {

    throwError("Dokumen penyelesaian CPL wajib diunggah", 400);

  }



  // Handle files

  const uploadsRoot = path.join(process.cwd(), "uploads", "yudisium", "cpl-repair", studentId);

  await mkdir(uploadsRoot, { recursive: true });



  let recPath = score.recommendationDocumentPath ?? null;

  let recName = score.recommendationDocumentName ?? null;

  let recMime = score.recommendationDocumentMimeType ?? null;

  let recSize = score.recommendationDocumentSize ?? null;



  let setPath = score.settlementDocumentPath ?? null;

  let setName = score.settlementDocumentName ?? null;

  let setMime = score.settlementDocumentMimeType ?? null;

  let setSize = score.settlementDocumentSize ?? null;



  if (recommendationFile) {

    const ext = path.extname(recommendationFile.originalname).toLowerCase();

    const safeName = `rec-${cplId}-${Date.now()}${ext}`;

    const absPath = path.join(uploadsRoot, safeName);

    await writeFile(absPath, recommendationFile.buffer);

    recPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");

    recName = recommendationFile.originalname;

    recMime = recommendationFile.mimetype || "application/pdf";

    recSize = recommendationFile.size;

  }



  if (settlementFile) {

    const ext = path.extname(settlementFile.originalname).toLowerCase();

    const safeName = `set-${cplId}-${Date.now()}${ext}`;

    const absPath = path.join(uploadsRoot, safeName);

    await writeFile(absPath, settlementFile.buffer);

    setPath = path.relative(process.cwd(), absPath).replace(/\\/g, "/");

    setName = settlementFile.originalname;

    setMime = settlementFile.mimetype || "application/pdf";

    setSize = settlementFile.size;

  }



  const { allValidated, updatedParticipant } = await prisma.$transaction(async (tx) => {

    await participantRepo.saveCplRepairment(studentId, cplId, {

      score: parsedNewScore,

      oldCplScore: Number.isNaN(parsedOldScore) ? score.score : parsedOldScore,

      recommendationDocumentPath: recPath,

      recommendationDocumentName: recName,

      recommendationDocumentMimeType: recMime,

      recommendationDocumentSize: recSize,

      settlementDocumentPath: setPath,

      settlementDocumentName: setName,

      settlementDocumentMimeType: setMime,

      settlementDocumentSize: setSize,

      verifiedBy: userId,

    }, tx);



    const activeCpls = await participantRepo.findCplsActive(tx);

    const allScores = await participantRepo.findStudentCplScores(studentId, tx);

    const allValidated = areAllRelevantCplScoresValidated(activeCpls, allScores);

    const newCplValidatedAt = allValidated ? new Date() : null;



    await tx.yudisiumParticipant.update({

      where: { id: participantId },

      data: { cplValidatedAt: newCplValidatedAt },

    });



    const updatedParticipant = await recomputeParticipantEligibility(tx, participantId);



    return { allValidated, updatedParticipant };

  });



  if (allValidated) {

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

  registered: "Menunggu Kelengkapan Syarat & Validasi CPL",

  eligible: "Calon Peserta Yudisium (Syarat & CPL Lengkap)",

  appointed: "Peserta Yudisium",

  finalized: "Lulus",

  rejected: "Belum Lulus",

};



const CPL_REPORT_ALLOWED_STATUSES = ["eligible", "appointed", "finalized"];

const CERTIFICATE_ALLOWED_STATUSES = ["appointed", "finalized"];



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



const formatGpa = (value) => {

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return "-";

  return numeric.toFixed(2);

};






const padCertificateNumber = (value) => String(Math.max(1, Number(value) || 1)).padStart(2, "0");



let iabeeLogoCache = null;
/** The IABEE accreditation logo (CPL certificate only), or "" when the asset is missing. */
const getIabeeLogoBase64 = () => {
  if (iabeeLogoCache === null) {
    try {
      iabeeLogoCache = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, "../../assets/iabee-logo.png")).toString("base64")}`;
    } catch {
      iabeeLogoCache = "";
    }
  }
  return iabeeLogoCache;
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

  const width = 310;

  const height = 338;

  const centerX = width / 2;

  const centerY = 142;

  const radius = 102;

  const axisCount = Math.max(scores.length, 3);

  const getPoint = (index, value) => {

    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / axisCount;

    const r = radius * Math.max(0, Math.min(100, Number(value) || 0)) / 100;

    return [centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r];

  };

  const polygon = (values) =>

    values

      .map((value, index) => getPoint(index, value).map((n) => n.toFixed(1)).join(","))

      .join(" ");

  const labelPoint = (index) => {

    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / axisCount;

    const r = radius + 20;

    return [centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r];

  };



  const rings = [50, 60, 70, 80, 90, 100]

    .map((value) => {

      const points = Array.from({ length: axisCount }, (_, index) =>

        getPoint(index, value).map((n) => n.toFixed(1)).join(",")

      ).join(" ");

      return `<polygon points="${points}" fill="none" stroke="#cccccc" stroke-width="1" />`;

    })

    .join("");



  const axes = scores

    .map((score, index) => {

      const [x, y] = getPoint(index, 100);

      const [lx, ly] = labelPoint(index);

      return `

        <line x1="${centerX}" y1="${centerY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#dddddd" stroke-width="1" />

        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#000000">${escapeHtml(score.code)}</text>

      `;

    })

    .join("");



  const scoreValues = scores.map((score) => score.score ?? 0);

  const thresholdValues = scores.map((score) => score.minimalScore || 0);



  return `

    <svg viewBox="0 0 ${width} ${height}" class="radar-chart" xmlns="http://www.w3.org/2000/svg">

      ${rings}

      ${axes}

      <polygon points="${polygon(scoreValues)}" fill="#555555" fill-opacity="0.55" stroke="#000000" stroke-width="2" />

      <polygon points="${polygon(thresholdValues)}" fill="none" stroke="#000000" stroke-width="1.5" stroke-dasharray="4 3" />

      <rect x="92" y="314" width="8" height="8" fill="#555555" />

      <text x="104" y="321" font-size="8" fill="#000000">Nilai CPL</text>

      <rect x="158" y="314" width="8" height="8" fill="none" stroke="#000000" stroke-dasharray="2 1" />

      <text x="170" y="321" font-size="8" fill="#000000">Threshold</text>

    </svg>

  `;

};



const buildCplReportPdf = async ({ sourceId, studentName, studentNim, scores }) => {


  const mappedScores = mapCplScoresForReport(scores);
  // Dated by the last CPL validation, so the same scores give the same document.
  const validatedDates = scores.map((score) => score.validatedAt).filter(Boolean).map((date) => new Date(date).getTime());
  const issuedOn = validatedDates.length ? new Date(Math.max(...validatedDates)) : new Date();

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

  const allPassed = mappedScores.length > 0 && mappedScores.every((score) => score.status === "Tercapai");



  // The Koordinator Yudisium signs the CPL report.
  const signer = await findPositionHolder(ROLES.KOORDINATOR_YUDISIUM);
  const html = `<!DOCTYPE html>

<html lang="id">

<head>

  <meta charset="UTF-8">

  <title>Formulir Penilaian CPL</title>

  <style>${documentBaseStyles()}








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

      color: #000;

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

      background: #f2f2f2;

    }

    .text-center { text-align: center; }

    .conclusion-list { margin: 2px 0 0 14px; padding: 0; list-style: none; }

  </style>

</head>

<body>
  ${letterheadHtml()}



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




  ${signatureBlockHtml({ date: issuedOn, title: "Koordinator Yudisium", name: signer?.name, nip: signer?.nip, withQr: true })}
</body>

</html>`;



  return await renderAndIssueOfficialHtmlDocument({
    documentKind: "yudisium_cpl_report",
    sourceId,
    title: "Formulir Penilaian Capaian Pembelajaran Lulusan",
    subjectName: studentName,
    subjectIdentifier: studentNim,
    issuerName: "Departemen Sistem Informasi Universitas Andalas",
    issuerRole: "Penerbit dokumen",
    html,
  });

};



const getCertificatePeriodCode = async (yudisium) => {

  const eventDate = yudisium?.eventDate ? new Date(yudisium.eventDate) : null;

  const year = eventDate && !Number.isNaN(eventDate.getTime())

    ? eventDate.getFullYear()

    : new Date().getFullYear();

  const startOfYear = new Date(year, 0, 1);

  const startOfNextYear = new Date(year + 1, 0, 1);

  const periods = await prisma.yudisium.findMany({

    where: {

      eventDate: {

        gte: startOfYear,

        lt: startOfNextYear,

      },

    },

    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],

    select: { id: true },

  });

  const index = periods.findIndex((period) => period.id === yudisium?.id);

  return `YD.${padCertificateNumber(index >= 0 ? index + 1 : periods.length + 1)}/${year}`;

};



const getCertificateParticipantNumber = async (participant) => {

  const participants = await prisma.yudisiumParticipant.findMany({

    where: {

      yudisiumId: participant.yudisiumId,

      status: { in: CERTIFICATE_ALLOWED_STATUSES },

    },

    orderBy: [{ registeredAt: "asc" }, { createdAt: "asc" }],

    select: { id: true },

  });

  const index = participants.findIndex((item) => item.id === participant.id);

  return padCertificateNumber(index >= 0 ? index + 1 : participants.length + 1);

};



const buildLearningCertificatePdf = async ({

  participant,

  scores,

  certificateNumber,

}) => {

  const logoBase64 = getUnandLogoBase64();
  const iabeeLogo = getIabeeLogoBase64();
  // The Ketua Departemen signs the certificate; the QR replaces the handwritten signature and stamp.
  const signer = await findPositionHolder(ROLES.KETUA_DEPARTEMEN);

  const student = participant.thesis?.student || {};

  const user = student.user || {};

  const yudisium = participant.yudisium || {};

  const thesis = participant.thesis || {};

  const mappedScores = mapCplScoresForReport(scores);

  const signatureDate = yudisium.appointedAt || yudisium.eventDate || new Date();

  // Predicate and study length are computed up to the semester of this yudisium period.
  const graduation = await getStudentGraduationSummary(student.id, { academicYear: yudisium.academicYear ?? null });

  const studentName = user.fullName || "-";

  const studentNim = user.identityNumber || "-";

  const rows = mappedScores.length > 0

    ? mappedScores.map((score, index) => `

      <tr>

        <td class="text-center">${index + 1}</td>

        <td class="text-center">${escapeHtml(score.code)}</td>

        <td>${escapeHtml(score.description)}</td>

        <td class="text-center score-cell">${score.score ?? "-"}</td>

      </tr>

    `).join("")

    : `<tr><td colspan="4" class="text-center">Belum ada data nilai CPL</td></tr>`;



  const html = `<!DOCTYPE html>

<html lang="id">

<head>

  <meta charset="UTF-8">

  <title>Surat Keterangan Capaian Pembelajaran</title>

  <style>

    @page { size: A4; margin: 1.05cm 1.2cm; }

    body {

      font-family: 'Times New Roman', Times, serif;

      font-size: 10pt;

      line-height: 1.28;

      color: #001b3d;

      margin: 0;

    }

    .header-table {

      width: 100%;

      border-collapse: collapse;

      border-bottom: 2px solid #000;

      margin-bottom: 12px;

    }

    .logo-cell { width: 88px; vertical-align: middle; padding-bottom: 7px; }

    .logo-img { width: 78px; height: auto; display: block; }

    .header-text { text-align: center; vertical-align: middle; padding-right: 88px; color: #000; }

    .header-text h3, .header-text h4 {

      margin: 0;

      font-size: 11pt;

      font-weight: bold;

      text-transform: uppercase;

    }

    .header-text h2 {

      margin: 2px 0 1px;

      font-size: 15pt;

      font-weight: bold;

      text-transform: uppercase;

      color: #000;

    }

    .header-text p { margin: 1px 0; font-size: 8.7pt; color: #000; }

    .title {

      text-align: center;

      color: #000;

      font-weight: bold;

      text-transform: uppercase;

      text-decoration: underline;

      font-size: 13pt;

      margin: 8px 0 0;

    }

    .number {

      text-align: center;

      color: #000;

      font-size: 10.5pt;

      margin-bottom: 16px;

    }

    .content-grid {

      display: grid;

      grid-template-columns: 30% minmax(0, 1fr);

      gap: 18px;

      align-items: start;

    }

    .identity {

      border-right: 1.5px solid #2f78c4;

      padding-right: 16px;

      min-height: 520px;

    }

    .identity p { margin: 0 0 11px; }

    .student-name {

      color: #003c73;

      font-size: 13pt;

      font-weight: bold;

      text-decoration: underline;

      text-transform: uppercase;

      margin-top: 10px;

    }

    .student-nim {

      font-weight: bold;

      color: #003c73;

      margin-bottom: 18px;

    }

    .study-program {

      color: #003c73;

      font-weight: bold;

      text-transform: uppercase;

      line-height: 1.25;

      margin: 13px 0;

    }

    .metric-list { margin: 10px 0 18px; color: #000; }

    .metric-list div { margin: 2px 0; }

    .thesis-title {

      color: #003c73;

      font-weight: bold;

      text-transform: uppercase;

      line-height: 1.35;

      margin-top: 7px;

    }

    .statement { color: #000; text-align: justify; margin-bottom: 10px; }

    .data-table {

      width: calc(100% - 1px);

      border-collapse: collapse;

      table-layout: fixed;

      color: #000;

      box-sizing: border-box;

      margin-right: 1px;

    }

    .data-table th, .data-table td {

      border: 1px solid #0a4f86;

      padding: 5px 6px;

      vertical-align: top;

      font-size: 8.4pt;

      box-sizing: border-box;

      overflow-wrap: anywhere;

    }

    .data-table th {

      text-align: center;

      font-weight: bold;

      background: #f6fbff;

    }

    .text-center { text-align: center; }

    .score-cell {

      color: #003c73;

      font-size: 15pt !important;

      font-weight: bold;

      vertical-align: middle !important;

    }

    .certificate-footer { width: 100%; border-collapse: collapse; margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
    .certificate-footer td { vertical-align: bottom; padding: 0; }
    .accreditation { width: 45%; color: #003c73; font-size: 8pt; font-weight: bold; line-height: 1.3; }
    .accreditation img { display: block; width: 46px; height: auto; margin-bottom: 4px; }
    .certificate-signature { text-align: right; color: #000; }
    .certificate-signature p { margin: 0; }
    .certificate-signature .signature-space { height: 26mm; margin: 4px 0; line-height: 0; text-align: right; }
    .signer-name { color: #003c73; font-weight: bold; text-decoration: underline; }
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

        <p>Kampus Universitas Andalas, Limau Manis 25163</p>

        <p>Website: http://si.fti.unand.ac.id dan email: jurusan_si@fti.unand.ac.id</p>

      </td>

    </tr>

  </table>



  <div class="title">Surat Keterangan Capaian Pembelajaran</div>

  <div class="number">No: ${escapeHtml(certificateNumber)}</div>



  <div class="content-grid">

    <aside class="identity">

      <p>Menyatakan, bahwa</p>

      <div class="student-name">${escapeHtml(studentName)}</div>

      <div class="student-nim">NIM: ${escapeHtml(studentNim)}</div>



      <p>telah menyelesaikan studi di:</p>

      <div class="study-program">

        Program Studi Sistem Informasi<br />

        Fakultas Teknologi Informasi<br />

        Universitas Andalas

      </div>



      <p>dengan capaian:</p>

      <div class="metric-list">

        <div>IPK: <strong>${escapeHtml(formatGpa(student.gpa))}</strong></div>

        <div>Total SKS Lulus: <strong>${escapeHtml(student.sksCompleted ?? "-")} SKS</strong></div>

        <div>Lama Studi: <strong>${escapeHtml(graduation.studyLength)}</strong></div>

        <div>Predikat: <strong>${escapeHtml(graduation.predicate || "—")}</strong></div>

      </div>



      <p>Gelar Lulusan: <strong>S. Kom</strong></p>

      <p>Judul Tugas Akhir:</p>

      <div class="thesis-title">${escapeHtml(thesis.title || "-")}</div>

    </aside>



    <main>

      <p class="statement">

        Berdasarkan hasil evaluasi pembelajaran, mahasiswa yang bersangkutan telah mencapai

        Capaian Pembelajaran Lulusan (CPL) dengan rincian sebagai berikut:

      </p>

      <table class="data-table">

        <thead>

          <tr>

            <th style="width: 9%;">No.</th>

            <th style="width: 15%;">Kode CPL</th>

            <th>Deskripsi Capaian Pembelajaran</th>

            <th style="width: 13%;">Nilai</th>

          </tr>

        </thead>

        <tbody>${rows}</tbody>

      </table>




    </main>

  </div>

  <table class="certificate-footer">
    <tr>
      <td class="accreditation">
        ${iabeeLogo ? `<img src="${iabeeLogo}" alt="Logo IABEE" />` : ""}
        <div>Program Studi Terakreditasi IABEE</div>
        <div>Sertifikat No. 000255.A</div>
      </td>
      <td class="certificate-signature">
        <p>Padang, ${escapeHtml(formatDocumentDate(signatureDate))}</p>
        <p>Ketua Departemen Sistem Informasi</p>
        <p>Fakultas Teknologi Informasi, Universitas Andalas</p>
        <div class="signature-space">${DOCUMENT_QR_PLACEHOLDER}</div>
        <p class="signer-name">${signer?.name ? escapeHtml(signer.name) : "______________________________"}</p>
        <p>NIP. ${signer?.nip ? escapeHtml(signer.nip) : "____________________"}</p>
      </td>
    </tr>
  </table>
</body>

</html>`;



  return await renderAndIssueOfficialHtmlDocument({
    documentKind: "yudisium_learning_certificate",
    sourceId: participant.id,
    title: "Surat Keterangan Capaian Pembelajaran",
    documentNumber: certificateNumber,
    subjectName: studentName,
    subjectIdentifier: studentNim,
    issuerName: "Departemen Sistem Informasi Universitas Andalas",
    issuerRole: "Penerbit dokumen",
    html,
  });

};



const assertCplReportDownloadable = (participant) => {

  if (!CPL_REPORT_ALLOWED_STATUSES.includes(participant.status)) {

    throwError("Laporan CPL hanya dapat diunduh setelah validasi CPL selesai", 400);

  }

};



const assertCertificateDownloadable = (participant) => {

  if (!CERTIFICATE_ALLOWED_STATUSES.includes(participant.status)) {

    throwError("Sertifikat hanya dapat diunduh setelah peserta yudisium ditetapkan", 400);

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

    sourceId: participant.id,

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

    sourceId: participant.id,

    studentName: student.user?.fullName || "-",

    studentNim: student.user?.identityNumber || "-",

    scores,

  });

};



export const exportCurrentStudentCertificate = async (userId) => {

  const student = await prisma.student.findUnique({

    where: { id: userId },

    select: {

      id: true,

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

      status: { in: CERTIFICATE_ALLOWED_STATUSES },

    },

    orderBy: [{ registeredAt: "desc" }, { createdAt: "desc" }],

    include: {

      yudisium: true,

      thesis: {

        include: {

          student: {

            include: {

              user: true,

            },

          },

        },

      },

    },

  });



  if (!participant) {

    throwError("Sertifikat hanya dapat diunduh setelah peserta yudisium ditetapkan", 400);

  }



  assertCertificateDownloadable(participant);



  const [scores, participantNumber, periodCode] = await Promise.all([

    participantRepo.findStudentCplScores(student.id),

    getCertificateParticipantNumber(participant),

    getCertificatePeriodCode(participant.yudisium),

  ]);



  return await buildLearningCertificatePdf({

    participant,

    scores,


    certificateNumber: `${participantNumber}/UN.16.15.3.2/${periodCode}`,

  });

};



export const exportParticipants = async (yudisiumId, _userId) => {

  const yudisium = await prisma.yudisium.findUnique({

    where: { id: yudisiumId },

    include: {

      room: true,

      participants: {

        where: {

          status: { in: ["appointed", "finalized"] }

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






  const participants = [...(yudisium.participants || [])].sort((a, b) => {

    const nimA = a.thesis?.student?.user?.identityNumber || "";

    const nimB = b.thesis?.student?.user?.identityNumber || "";

    if (nimA !== nimB) return nimA.localeCompare(nimB);

    return (a.thesis?.student?.user?.fullName || "").localeCompare(

      b.thesis?.student?.user?.fullName || ""

    );

  });

  const studentCount = participants.length;

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



  // The Koordinator Yudisium signs the participant list.
  const signer = await findPositionHolder(ROLES.KOORDINATOR_YUDISIUM);
  const html = `<!DOCTYPE html>

<html lang="id">

<head>

  <meta charset="UTF-8">

  <title>Daftar Peserta Yudisium</title>

  <style>${documentBaseStyles()}








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

    .page-break-before { page-break-before: auto; }

    .avoid-break { page-break-inside: avoid; }

    .small-note {

      font-size: 10pt;

    }

  </style>

</head>

<body>
  ${letterheadHtml()}



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




  ${signatureBlockHtml({ date: yudisium.appointedAt ?? yudisium.eventDate ?? new Date(), title: "Koordinator Yudisium", name: signer?.name, nip: signer?.nip, withQr: true })}
</body>

</html>`;



  return await renderAndIssueOfficialHtmlDocument({
    documentKind: "yudisium_participant_list",
    sourceId: yudisiumId,
    title: "Daftar Peserta Yudisium",
    subjectName: yudisium.name,
    issuerName: "Departemen Sistem Informasi Universitas Andalas",
    issuerRole: "Penerbit dokumen",
    html,
  });

};



export const finalizeParticipants = async (yudisiumId, userId = null) => {

  const yudisium = await prisma.yudisium.findUnique({

    where: { id: yudisiumId },

    include: {

      room: true,

      participants: {
        where: { status: { in: ["registered", "eligible"] } },
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
  if (yudisium.appointedAt) {
    throwError("Peserta yudisium sudah difinalisasi", 409);
  }

  const now = new Date();
  const isClosed = yudisium.registrationCloseDate && now > new Date(yudisium.registrationCloseDate);
  if (!isClosed) {
    throwError("Finalisasi hanya dapat dilakukan setelah pendaftaran ditutup", 400);
  }

  const appointedParticipants = yudisium.participants.filter((p) => p.status === "eligible");
  const rejectedParticipants = yudisium.participants.filter((p) => p.status === "registered");

  const appointedAt = new Date();



  const [appointedResult, rejectedResult] = await participantRepo.finalizeAllParticipants(

    yudisiumId,

    appointedAt

  );



  try {

    await notifyFinalizedParticipants({ yudisium, appointedParticipants, rejectedParticipants });

  } catch (err) {

    console.error("[Notification Error] Failed to notify yudisium finalization:", err.message);

  }



  await syncYudisiumToOutlook({ yudisium, appointedParticipants, organizerId: userId });



  return {

    appointed: appointedResult?.count ?? appointedParticipants.length,

    rejected: rejectedResult?.count ?? rejectedParticipants.length,

    appointedAt,

  };

};

const TOP_TOPICS = 5;
// Best first; students below the last threshold have no predicate.
const PREDICATE_ORDER = [...Object.values(GRADUATION_PREDICATE), "none"];

/**
 * The charts of a yudisium period: participants per cohort, per graduation predicate (computed,
 * F2) and per thesis topic (five largest plus "Lainnya"). Rejected participants are left out.
 */
export const getParticipantSummary = async (yudisiumId) => {
  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    select: { id: true, academicYear: { select: { year: true, semester: true } } },
  });
  if (!yudisium) throwError("Periode yudisium tidak ditemukan", 404);

  const participants = await prisma.yudisiumParticipant.findMany({
    where: { yudisiumId, status: { not: "rejected" } },
    select: {
      thesis: {
        select: {
          thesisTopic: { select: { id: true, name: true } },
          student: { select: { id: true, enrollmentYear: true, gpa: true } },
        },
      },
    },
  });
  const activeYear = yudisium.academicYear
    ? null
    : await prisma.academicYear.findFirst({ where: { isActive: true }, select: { year: true, semester: true } });
  const academicYear = yudisium.academicYear ?? activeYear;

  const count = (map, key, name) => {
    const entry = map.get(key) ?? { id: key, name, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  };
  const cohorts = new Map();
  const predicates = new Map();
  const topics = new Map();
  for (const participant of participants) {
    const student = participant.thesis?.student;
    const cohort = student?.enrollmentYear ? String(student.enrollmentYear) : "none";
    count(cohorts, cohort, cohort === "none" ? "Belum diisi" : cohort);
    const predicate = summarize(student, academicYear).predicate ?? "none";
    count(predicates, predicate, predicate === "none" ? "Tanpa predikat" : predicate);
    const topic = participant.thesis?.thesisTopic;
    count(topics, topic?.id ?? "none", topic?.name ?? "Belum diisi");
  }

  const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);
  const sortedTopics = [...topics.values()].sort(byCount);
  const topTopics = sortedTopics.slice(0, TOP_TOPICS);
  const others = sortedTopics.slice(TOP_TOPICS).reduce((sum, topic) => sum + topic.count, 0);
  if (others > 0) topTopics.push({ id: "others", name: "Lainnya", count: others });

  return {
    total: participants.length,
    enrollmentYears: [...cohorts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    predicates: PREDICATE_ORDER.map((name) => predicates.get(name)).filter(Boolean).map((entry) => ({ ...entry, value: entry.id })),
    topics: topTopics,
  };
};

