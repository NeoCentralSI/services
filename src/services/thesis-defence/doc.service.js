import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import * as docRepo from "../../repositories/thesis-defence/doc.repository.js";
import * as coreRepo from "../../repositories/thesis-defence/thesis-defence.repository.js";
import prisma from "../../config/prisma.js";

// ============================================================
// CONSTANTS
// ============================================================

const DOC_TYPE_CONFIG = {
  "Laporan Tugas Akhir": { accept: [".pdf"], label: "Laporan Tugas Akhir (PDF)" },
  "Slide Presentasi": { accept: [".pdf"], label: "Slide Presentasi (PDF)" },
  "Draft Jurnal TEKNOSI": { accept: [".pdf"], label: "Draft Jurnal TEKNOSI (PDF)" },
  "Sertifikat TOEFL": { accept: [".pdf"], label: "Sertifikat TOEFL (PDF)" },
  "Sertifikat SAPS": { accept: [".pdf"], label: "Sertifikat SAPS (PDF)" },
};

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function validateFileExtension(file, documentTypeName) {
  const config = DOC_TYPE_CONFIG[documentTypeName];
  if (!config) throwError(`Tipe dokumen "${documentTypeName}" tidak valid.`, 400);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.accept.includes(ext)) {
    throwError(
      `File untuk ${config.label} harus berformat ${config.accept.join(" atau ").toUpperCase()}.`,
      400
    );
  }
}

async function getOrCreateDefence(thesis) {
  const existing = thesis.thesisDefences?.[0];
  if (existing && !["failed", "cancelled"].includes(existing.status)) return existing;

  // Verify requirements before auto-registration
  if (!thesis.studentId) {
    throwError("Data mahasiswa tidak ditemukan pada tugas akhir ini.", 400);
  }

  const student = await prisma.student.findUnique({ 
    where: { id: thesis.studentId },
    select: { skscompleted: true }
  });
  
  const passedSeminar = thesis.thesisSeminars?.[0] || null;
  const seminarStatus = passedSeminar?.status ?? null;
  const seminarId = passedSeminar?.id ?? null;
  
  let seminarRevisionMet = false;
  if (seminarStatus === "passed") {
    seminarRevisionMet = true;
  } else if (seminarStatus === "passed_with_revision" && seminarId) {
    if (passedSeminar.revisionFinalizedAt) {
      seminarRevisionMet = true;
    } else {
      const revCounts = await coreRepo.countSeminarRevisions(seminarId);
      seminarRevisionMet = revCounts.total > 0 && revCounts.total === revCounts.finished;
    }
  }

  const supervisors = thesis.thesisSupervisors || [];
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((s) => s.defenceReady);

  if (!passedSeminar || !seminarRevisionMet || (student?.skscompleted || 0) < 142 || !allSupervisorsReady) {
    throwError("Anda belum memenuhi persyaratan pendaftaran sidang tugas akhir.", 403);
  }

  const created = await coreRepo.createThesisDefence(thesis.id);
  return { id: created.id, status: created.status };
}

// ============================================================
// PUBLIC: Document Types
// ============================================================

export async function getDocumentTypes() {
  const types = await docRepo.ensureDefenceDocumentTypes();
  return Object.entries(types).map(([name, dt]) => ({
    id: dt.id,
    name: dt.name,
    accept: DOC_TYPE_CONFIG[name]?.accept || [],
    label: DOC_TYPE_CONFIG[name]?.label || name,
  }));
}

// ============================================================
// PUBLIC: Get Documents
// ============================================================

export async function getDocuments(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  const docs = await docRepo.findDefenceDocuments(defenceId);
  return { defenceId, documents: docs };
}

// ============================================================
// PUBLIC: Upload Document
// ============================================================

export async function uploadDocument(defenceId, userId, file, docTypeName) {
  if (!file || !file.buffer) throwError("File tidak ditemukan.", 400);
  if (!docTypeName) throwError("Tipe dokumen wajib diisi.", 400);

  // UTF-8 filename normalization
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
  const normalizedFile = { ...file, originalname: originalName };

  validateFileExtension(normalizedFile, docTypeName);

  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);

  const docTypes = await docRepo.ensureDefenceDocumentTypes();
  const docType = docTypes[docTypeName];
  if (!docType) throwError(`Tipe dokumen "${docTypeName}" tidak valid.`, 400);

  let targetDefenceId = defenceId;
  let thesisId;

  if (!targetDefenceId || targetDefenceId === "active") {
    const thesis = await coreRepo.getStudentThesisWithDefenceInfo(student.id);
    if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
    thesisId = thesis.id;
    const defence = await getOrCreateDefence(thesis);
    if (defence.status !== "registered") throwError("Dokumen sudah tidak dapat diubah.", 403);
    targetDefenceId = defence.id;
  } else {
    const defence = await coreRepo.findDefenceBasicById(targetDefenceId);
    if (!defence) throwError("Sidang tidak ditemukan.", 404);
    if (defence.status !== "registered") throwError("Dokumen sudah tidak dapat diubah.", 403);
    thesisId = defence.thesisId;
  }

  const existing = await docRepo.findDefenceDocument(targetDefenceId, docType.id);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah diverifikasi dan tidak dapat diubah.", 403);
  }

  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesisId, "defence", targetDefenceId);
  await mkdir(uploadsRoot, { recursive: true });

  if (existing?.documentId) {
    try {
      const oldDoc = await docRepo.findDocumentById(existing.documentId);
      if (oldDoc?.filePath) await unlink(path.join(process.cwd(), oldDoc.filePath));
      await docRepo.deleteDocument(existing.documentId);
    } catch (e) {
      console.warn("Could not delete old defence document:", e.message);
    }
  }

  const ext = path.extname(originalName).toLowerCase();
  const safeName = `${docTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const absolutePath = path.join(uploadsRoot, safeName);
  await writeFile(absolutePath, file.buffer);
  const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

  const document = await docRepo.createDocument({
    userId,
    documentTypeId: docType.id,
    fileName: originalName,
    filePath: relPath,
  });

  await docRepo.upsertDefenceDocument({
    thesisDefenceId: targetDefenceId,
    documentTypeId: docType.id,
    documentId: document.id,
  });

  // Notify Admins
  try {
    const adminIds = await coreRepo.findUserIdsByRole("Admin");
    if (adminIds.length > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const studentName = user?.fullName || "Mahasiswa";
      const title = "Dokumen Sidang TA Baru";
      const message = `${studentName} telah mengunggah dokumen "${docTypeName}".`;

      await Promise.all([
        import("../notification.service.js").then(m => m.createNotificationsForUsers(adminIds, { title, message })),
        import("../push.service.js").then(m => m.sendFcmToUsers(adminIds, { title, body: message, data: { defenceId: targetDefenceId, type: "defence_doc_upload" } }))
      ]);
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify admins on defence doc upload:", err.message);
  }

  return {
    documentId: document.id,
    documentTypeId: docType.id,
    fileName: originalName,
    filePath: relPath,
    status: "submitted",
    submittedAt: new Date(),
  };
}

// ============================================================
// PUBLIC: View Document
// ============================================================

export async function viewDocument(defenceId, docTypeId) {
  const defenceDoc = await docRepo.findDefenceDocumentWithFile(defenceId, docTypeId);
  if (!defenceDoc) throwError("Dokumen belum diupload.", 404);
  if (!defenceDoc.document) throwError("File dokumen tidak ditemukan.", 404);

  return {
    documentTypeId: defenceDoc.documentTypeId,
    documentId: defenceDoc.documentId,
    status: defenceDoc.status,
    submittedAt: defenceDoc.submittedAt,
    verifiedAt: defenceDoc.verifiedAt,
    notes: defenceDoc.notes,
    fileName: defenceDoc.document.fileName,
    filePath: defenceDoc.document.filePath,
  };
}

// ============================================================
// PUBLIC: Verify Document (Admin approve/decline)
// ============================================================

export async function verifyDocument(defenceId, docTypeId, { action, notes, userId }) {
  if (!["approve", "decline"].includes(action)) {
    throwError('Action harus "approve" atau "decline".', 400);
  }

  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (defence.status !== "registered") {
    throwError("Verifikasi dokumen hanya dapat dilakukan saat sidang berstatus 'registered'.", 400);
  }

  const docWithFile = await docRepo.findDefenceDocumentWithFile(defenceId, docTypeId);
  if (!docWithFile) throwError("Dokumen tidak ditemukan untuk di-verifikasi.", 404);

  const docTypes = await docRepo.ensureDefenceDocumentTypes();
  const docTypeName = Object.keys(docTypes).find(key => docTypes[key].id === docTypeId) || "Dokumen Persyaratan";

  const newStatus = action === "approve" ? "approved" : "declined";
  await docRepo.updateDefenceDocumentStatus(defenceId, docTypeId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
  });

  const thesis = await coreRepo.findThesisById(defence.thesisId);

  // 1. Notify student about specific document status
  try {
    if (thesis?.studentId) {
      const title = action === "approve" ? "Dokumen Disetujui" : "Dokumen Ditolak";
      const statusText = action === "approve" ? "disetujui" : "ditolak";
      const message = `Dokumen "${docTypeName}" untuk sidang TA Anda telah ${statusText} oleh Admin.${notes ? ` Catatan: ${notes}` : ""}`;

      await Promise.all([
        import("../notification.service.js").then(m => m.createNotificationsForUsers([thesis.studentId], { title, message })),
        import("../push.service.js").then(m => m.sendFcmToUsers([thesis.studentId], { title, body: message, data: { defenceId, type: "defence_doc_verified" } }))
      ]);
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify student on doc verification:", err.message);
  }

  let defenceTransitioned = false;
  if (action === "approve") {
    const allDocs = await docRepo.countDefenceDocumentsByStatus(defenceId);
    const docTypesList = await docRepo.getDefenceDocumentTypes();
    const approvedCount = allDocs.filter((d) =>
      d.documentTypeId === docTypeId ? true : d.status === "approved"
    ).length;
    
    if (approvedCount >= docTypesList.length) {
      await coreRepo.updateDefence(defenceId, { 
        status: "verified",
        verifiedAt: new Date()
      });
      defenceTransitioned = true;

      // 2. Notify student & Kadep about verification transition
      try {
        const studentName = thesis?.student?.user?.fullName || "Mahasiswa";

        if (thesis?.studentId) {
          const title = "Sidang TA Terverifikasi";
          const message = "Seluruh dokumen persyaratan sidang TA Anda telah diverifikasi. Menunggu penetapan penguji.";
          await Promise.all([
            import("../notification.service.js").then(m => m.createNotificationsForUsers([thesis.studentId], { title, message })),
            import("../push.service.js").then(m => m.sendFcmToUsers([thesis.studentId], { title, body: message, data: { defenceId, type: "defence_verified" } }))
          ]);
        }

        const kadepIds = await coreRepo.findUserIdsByRole("Ketua Departemen");
        if (kadepIds.length > 0) {
          const kadepTitle = "Penetapan Penguji Sidang TA";
          const kadepMsg = `Mahasiswa ${studentName} telah melewati verifikasi dokumen sidang TA. Mohon untuk melakukan penetapan dosen penguji.`;
          await Promise.all([
            import("../notification.service.js").then(m => m.createNotificationsForUsers(kadepIds, { title: kadepTitle, message: kadepMsg })),
            import("../push.service.js").then(m => m.sendFcmToUsers(kadepIds, { title: kadepTitle, body: kadepMsg, data: { defenceId, type: "defence_need_examiner" } }))
          ]);
        }
      } catch (err) {
        console.error("[Notification Error] Failed to notify on defence verification:", err.message);
      }
    }
  }

  return {
    documentTypeId: docTypeId,
    status: newStatus,
    defenceTransitioned,
    newDefenceStatus: defenceTransitioned ? "verified" : defence.status,
  };
}
