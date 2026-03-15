import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import {
  getOrCreateDocumentType,
  ensureSeminarDocumentTypes,
  findSeminarDocument,
  findSeminarDocuments,
  createSeminarDocument,
  updateSeminarDocument,
  createDocument,
  findDocumentById,
  deleteDocument,
  getThesisWithSeminar,
  createThesisSeminar,
} from "../../repositories/thesisSeminar/seminarDocument.repository.js";

// Map from document type name → accepted extensions
const DOC_TYPE_CONFIG = {
  "Laporan Tugas Akhir": { accept: [".pdf", ".docx"], label: "Laporan Tugas Akhir (PDF/DOCX)" },
  "Slide Presentasi": { accept: [".ppt", ".pptx"], label: "Slide Presentasi (PPT)" },
  "Draft Jurnal TEKNOSI": { accept: [".pdf"], label: "Draft Jurnal TEKNOSI (PDF)" },
};

// ============================================================
// HELPERS
// ============================================================

function ensureStudent(student) {
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
}

function ensureThesis(thesis) {
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }
}

/**
 * Get existing active seminar or auto-create one for the thesis.
 * Called during upload — the first upload triggers seminar creation.
 * If latest seminar is failed/cancelled, create a new one for re-registration.
 */
async function getOrCreateSeminar(thesis) {
  const existing = thesis.thesisSeminars?.[0];
  if (existing && !['failed', 'cancelled'].includes(existing.status)) {
    return existing;
  }

  // Auto-create seminar with status 'registered'
  const created = await createThesisSeminar(thesis.id);
  return { id: created.id, status: created.status };
}

function validateFileExtension(file, documentTypeName) {
  const config = DOC_TYPE_CONFIG[documentTypeName];
  if (!config) {
    const err = new Error(`Tipe dokumen "${documentTypeName}" tidak valid.`);
    err.statusCode = 400;
    throw err;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.accept.includes(ext)) {
    const err = new Error(
      `File untuk ${config.label} harus berformat ${config.accept.join(" atau ").toUpperCase()}.`
    );
    err.statusCode = 400;
    throw err;
  }
}

// ============================================================
// PUBLIC SERVICE FUNCTIONS
// ============================================================

/**
 * Get document types for seminar (ensures they exist in DB)
 */
export async function getSeminarDocTypes() {
  const types = await ensureSeminarDocumentTypes();
  return Object.entries(types).map(([name, dt]) => ({
    id: dt.id,
    name: dt.name,
    accept: DOC_TYPE_CONFIG[name]?.accept || [],
    label: DOC_TYPE_CONFIG[name]?.label || name,
  }));
}

/**
 * Get all seminar documents for the current student's latest seminar
 */
export async function getStudentSeminarDocuments(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  const thesis = await getThesisWithSeminar(student.id);
  if (!thesis) {
    return { seminarId: null, documents: [] };
  }

  const seminar = thesis.thesisSeminars?.[0];
  if (!seminar) {
    return { seminarId: null, documents: [] };
  }

  const docs = await findSeminarDocuments(seminar.id);

  return {
    seminarId: seminar.id,
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

/**
 * Upload or re-upload a seminar document
 *
 * Business rules:
 *  - Student must have an active thesis and a registered seminar
 *  - documentTypeName must be one of the 3 seminar doc types
 *  - If status is 'approved', upload is blocked (locked)
 *  - If re-uploading, old file is deleted from disk and document record is replaced
 *  - New status is always 'submitted'
 */
export async function uploadSeminarDocument(userId, documentTypeName, file) {
  if (!file || !file.buffer) {
    const err = new Error("File tidak ditemukan.");
    err.statusCode = 400;
    throw err;
  }

  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  const thesis = await getThesisWithSeminar(student.id);
  ensureThesis(thesis);

  // Ensure document type exists
  const docType = await getOrCreateDocumentType(documentTypeName);

  // Validate file extension matches document type
  validateFileExtension(file, documentTypeName);

  // Get or auto-create seminar (first upload triggers creation)
  const seminar = await getOrCreateSeminar(thesis);

  // Check if document already exists (re-upload scenario)
  const existing = await findSeminarDocument(seminar.id, docType.id);

  if (existing && existing.status === "approved") {
    const err = new Error(
      "Dokumen ini sudah diverifikasi dan tidak dapat diubah."
    );
    err.statusCode = 403;
    throw err;
  }

  // Prepare directory: uploads/thesis/{thesisId}/seminar/
  const uploadsRoot = path.join(
    process.cwd(),
    "uploads",
    "thesis",
    thesis.id,
    "seminar"
  );
  await mkdir(uploadsRoot, { recursive: true });

  // Delete old file if re-uploading
  if (existing) {
    try {
      const oldDoc = await findDocumentById(existing.documentId);
      if (oldDoc?.filePath) {
        const oldFilePath = path.join(process.cwd(), oldDoc.filePath);
        await unlink(oldFilePath);
      }
      await deleteDocument(existing.documentId);
    } catch (delErr) {
      console.warn("Could not delete old seminar document:", delErr.message);
    }
  }

  // Save new file to disk
  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `${documentTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const filePath = path.join(uploadsRoot, safeName);
  await writeFile(filePath, file.buffer);

  const relPath = path
    .relative(process.cwd(), filePath)
    .replace(/\\/g, "/");

  // Create Document record
  const doc = await createDocument({
    userId,
    documentTypeId: docType.id,
    filePath: relPath,
    fileName: file.originalname,
  });

  // Create or update ThesisSeminarDocument record
  const now = new Date();
  if (existing) {
    await updateSeminarDocument(seminar.id, docType.id, {
      documentId: doc.id,
      submittedAt: now,
      status: "submitted",
      notes: null,
      verifiedBy: null,
      verifiedAt: null,
    });
  } else {
    await createSeminarDocument({
      thesisSeminarId: seminar.id,
      documentTypeId: docType.id,
      documentId: doc.id,
      submittedAt: now,
      status: "submitted",
    });
  }

  return {
    documentTypeId: docType.id,
    documentId: doc.id,
    fileName: file.originalname,
    filePath: relPath,
    status: "submitted",
    submittedAt: now,
  };
}

/**
 * View/download a specific seminar document
 */
export async function viewSeminarDocument(userId, documentTypeId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  const thesis = await getThesisWithSeminar(student.id);
  ensureThesis(thesis);

  const seminar = thesis.thesisSeminars?.[0];
  if (!seminar) {
    const err = new Error("Dokumen belum diupload.");
    err.statusCode = 404;
    throw err;
  }

  const semDoc = await findSeminarDocument(seminar.id, documentTypeId);
  if (!semDoc) {
    const err = new Error("Dokumen belum diupload.");
    err.statusCode = 404;
    throw err;
  }

  const doc = await findDocumentById(semDoc.documentId);
  if (!doc) {
    const err = new Error("File dokumen tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

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
