import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { getStudentByUserId } from "../repositories/thesisGuidance/student.guidance.repository.js";
import * as docRepo from "../repositories/thesis-seminar-doc.repository.js";
import * as coreRepo from "../repositories/thesis-seminar.repository.js";

// ============================================================
// CONSTANTS
// ============================================================

const DOC_TYPE_CONFIG = {
  "Laporan Tugas Akhir": { accept: [".pdf"], label: "Laporan Tugas Akhir (PDF)" },
  "Slide Presentasi": { accept: [".pdf"], label: "Slide Presentasi (PDF)" },
  "Draft Jurnal TEKNOSI": { accept: [".pdf"], label: "Draft Jurnal TEKNOSI (PDF)" },
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
    throwError(`File untuk ${config.label} harus berformat ${config.accept.join(" atau ").toUpperCase()}.`, 400);
  }
}

async function getOrCreateSeminar(thesis) {
  const existing = thesis.thesisSeminars?.[0];
  if (existing && !["failed", "cancelled"].includes(existing.status)) return existing;
  const created = await coreRepo.createThesisSeminar(thesis.id);
  return { id: created.id, status: created.status };
}

// ============================================================
// PUBLIC: Document Types
// ============================================================

export async function getDocumentTypes() {
  const types = await docRepo.ensureSeminarDocumentTypes();
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

export async function getDocuments(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  const docs = await docRepo.findSeminarDocuments(seminarId);
  return {
    seminarId,
    documents: docs.map((d) => ({
      thesisSeminarId: d.thesisSeminarId,
      documentTypeId: d.documentTypeId,
      documentId: d.documentId,
      status: d.status,
      submittedAt: d.submittedAt,
      verifiedAt: d.verifiedAt,
      notes: d.notes,
      verifiedBy: d.verifier?.fullName || null,
      fileName: d.document?.fileName || null,
      filePath: d.document?.filePath || null,
    })),
  };
}

// ============================================================
// PUBLIC: Upload Document
// ============================================================

export async function uploadDocument(seminarId, studentId, file, docTypeName) {
  if (!file || !file.buffer) throwError("File tidak ditemukan.", 400);
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
  const normalizedFile = { ...file, originalname: originalName };

  const docType = await docRepo.getOrCreateDocumentType(docTypeName);
  validateFileExtension(normalizedFile, docTypeName);

  // If seminarId provided, use it; otherwise resolve from student
  let targetSeminarId = seminarId;
  let thesisId;

  if (!targetSeminarId || targetSeminarId === "active") {
    const thesis = await coreRepo.getThesisWithSeminar(studentId);
    if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
    thesisId = thesis.id;
    const seminar = await getOrCreateSeminar(thesis);
    targetSeminarId = seminar.id;
  } else {
    const seminar = await coreRepo.findSeminarBasicById(targetSeminarId);
    if (!seminar) throwError("Seminar tidak ditemukan.", 404);
    thesisId = seminar.thesisId;
  }

  const existing = await docRepo.findSeminarDocument(targetSeminarId, docType.id);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah diverifikasi dan tidak dapat diubah.", 403);
  }

  // Save file to disk
  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesisId, "seminar", targetSeminarId);
  await mkdir(uploadsRoot, { recursive: true });

  // Delete old file if re-uploading
  if (existing) {
    try {
      const oldDoc = await docRepo.findDocumentById(existing.documentId);
      if (oldDoc?.filePath) await unlink(path.join(process.cwd(), oldDoc.filePath));
      await docRepo.deleteDocument(existing.documentId);
    } catch (e) { console.warn("Could not delete old seminar document:", e.message); }
  }

  const ext = path.extname(originalName).toLowerCase();
  const safeName = `${docTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const filePath = path.join(uploadsRoot, safeName);
  await writeFile(filePath, file.buffer);
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  const doc = await docRepo.createDocument({
    userId: studentId,
    documentTypeId: docType.id,
    filePath: relPath,
    fileName: originalName,
  });

  const now = new Date();
  if (existing) {
    await docRepo.updateSeminarDocument(targetSeminarId, docType.id, {
      documentId: doc.id, submittedAt: now, status: "submitted",
      notes: null, verifiedBy: null, verifiedAt: null,
    });
  } else {
    await docRepo.createSeminarDocument({
      thesisSeminarId: targetSeminarId, documentTypeId: docType.id,
      documentId: doc.id, submittedAt: now, status: "submitted",
    });
  }

  return { documentTypeId: docType.id, documentId: doc.id, fileName: originalName, filePath: relPath, status: "submitted", submittedAt: now };
}

// ============================================================
// PUBLIC: View Document
// ============================================================

export async function viewDocument(seminarId, docTypeId) {
  const semDoc = await docRepo.findSeminarDocument(seminarId, docTypeId);
  if (!semDoc) throwError("Dokumen belum diupload.", 404);

  const doc = await docRepo.findDocumentById(semDoc.documentId);
  if (!doc) throwError("File dokumen tidak ditemukan.", 404);

  return {
    documentTypeId: semDoc.documentTypeId,
    documentId: semDoc.documentId,
    status: semDoc.status,
    submittedAt: semDoc.submittedAt,
    verifiedAt: semDoc.verifiedAt,
    notes: semDoc.notes,
    fileName: doc.fileName,
    filePath: doc.filePath,
  };
}

// ============================================================
// PUBLIC: Verify Document (Admin approve/decline)
// ============================================================

export async function verifyDocument(seminarId, docTypeId, { action, notes, userId }) {
  if (!["approve", "decline"].includes(action)) throwError('Action harus "approve" atau "decline".', 400);

  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.status !== "registered") throwError("Verifikasi dokumen hanya dapat dilakukan saat seminar berstatus 'registered'.", 400);

  const docWithFile = await docRepo.findDocumentWithFile(seminarId, docTypeId);
  if (!docWithFile) throwError("Dokumen tidak ditemukan untuk di-verifikasi.", 404);

  const newStatus = action === "approve" ? "approved" : "declined";
  await docRepo.updateDocumentStatus(seminarId, docTypeId, { status: newStatus, notes: notes || null, verifiedBy: userId });

  // Auto-transition to 'verified' when all docs approved
  let seminarTransitioned = false;
  if (action === "approve") {
    const allDocs = await docRepo.countDocumentsByStatus(seminarId);
    const docTypes = await docRepo.getSeminarDocumentTypes();
    const approvedCount = allDocs.filter((d) => d.documentTypeId === docTypeId ? true : d.status === "approved").length;
    if (approvedCount >= docTypes.length) {
      await coreRepo.updateSeminar(seminarId, { status: "verified" });
      seminarTransitioned = true;
    }
  }

  return { documentTypeId: docTypeId, status: newStatus, seminarTransitioned, newSeminarStatus: seminarTransitioned ? "verified" : seminar.status };
}
