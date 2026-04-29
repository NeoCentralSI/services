import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { getStudentByUserId } from "../repositories/thesisGuidance/student.guidance.repository.js";
import * as docRepo from "../repositories/thesis-defence-doc.repository.js";
import * as coreRepo from "../repositories/thesis-defence.repository.js";

// ============================================================
// CONSTANTS
// ============================================================

const DOC_TYPE_CONFIG = {
  "Laporan Tugas Akhir": { accept: [".pdf", ".docx"], label: "Laporan Tugas Akhir (PDF/DOCX)" },
  "Slide Presentasi": { accept: [".ppt", ".pptx"], label: "Slide Presentasi (PPT)" },
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

  validateFileExtension(file, docTypeName);

  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);

  const docTypes = await docRepo.ensureDefenceDocumentTypes();
  const docType = docTypes[docTypeName];
  if (!docType) throwError(`Tipe dokumen "${docTypeName}" tidak valid.`, 400);

  let targetDefenceId = defenceId;
  let thesisId;

  if (!targetDefenceId) {
    const thesis = await coreRepo.getStudentThesisWithDefenceInfo(student.id);
    if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
    thesisId = thesis.id;
    const defence = await getOrCreateDefence(thesis);
    targetDefenceId = defence.id;
  } else {
    const defence = await coreRepo.findDefenceBasicById(targetDefenceId);
    if (!defence) throwError("Sidang tidak ditemukan.", 404);
    thesisId = defence.thesisId;
  }

  const existing = await docRepo.findDefenceDocument(targetDefenceId, docType.id);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah diverifikasi dan tidak dapat diubah.", 403);
  }

  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesisId, "defence");
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

  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `${docTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const absolutePath = path.join(uploadsRoot, safeName);
  await writeFile(absolutePath, file.buffer);
  const relPath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");

  const document = await docRepo.createDocument({
    userId,
    documentTypeId: docType.id,
    fileName: file.originalname,
    filePath: relPath,
  });

  await docRepo.upsertDefenceDocument({
    thesisDefenceId: targetDefenceId,
    documentTypeId: docType.id,
    documentId: document.id,
  });

  return {
    documentId: document.id,
    documentTypeId: docType.id,
    fileName: file.originalname,
    filePath: relPath,
    status: "submitted",
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
// PUBLIC: Validate Document (Admin approve/decline)
// ============================================================

export async function validateDocument(defenceId, docTypeId, { action, notes, userId }) {
  if (!["approve", "decline"].includes(action)) {
    throwError('Action harus "approve" atau "decline".', 400);
  }

  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  if (defence.status !== "registered") {
    throwError("Validasi dokumen hanya dapat dilakukan saat sidang berstatus 'registered'.", 400);
  }

  const docWithFile = await docRepo.findDefenceDocumentWithFile(defenceId, docTypeId);
  if (!docWithFile) throwError("Dokumen tidak ditemukan untuk di-validasi.", 404);

  const newStatus = action === "approve" ? "approved" : "declined";
  await docRepo.updateDefenceDocumentStatus(defenceId, docTypeId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
  });

  let defenceTransitioned = false;
  if (action === "approve") {
    const allDocs = await docRepo.countDefenceDocumentsByStatus(defenceId);
    const docTypes = await docRepo.getDefenceDocumentTypes();
    const approvedCount = allDocs.filter((d) =>
      d.documentTypeId === docTypeId ? true : d.status === "approved"
    ).length;
    if (approvedCount >= docTypes.length) {
      await coreRepo.updateDefenceStatus(defenceId, "verified");
      defenceTransitioned = true;
    }
  }

  return {
    documentTypeId: docTypeId,
    status: newStatus,
    defenceTransitioned,
    newDefenceStatus: defenceTransitioned ? "verified" : defence.status,
  };
}
