import prisma from "../config/prisma.js";

// ============================================================
// CONSTANTS
// ============================================================

const SEMINAR_DOC_TYPES = [
  "Laporan Tugas Akhir",
  "Slide Presentasi",
  "Draft Jurnal TEKNOSI",
];

// ============================================================
// DOCUMENT TYPE MANAGEMENT
// ============================================================

/**
 * Get or create a single document type by name.
 */
export async function getOrCreateDocumentType(name) {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
}

/**
 * Ensure all required seminar document types exist and return them keyed by name.
 */
export async function ensureSeminarDocumentTypes() {
  const result = {};
  for (const name of SEMINAR_DOC_TYPES) {
    result[name] = await getOrCreateDocumentType(name);
  }
  return result;
}

/**
 * Get all seminar document types.
 */
export async function getSeminarDocumentTypes() {
  return prisma.documentType.findMany({
    where: { name: { in: SEMINAR_DOC_TYPES } },
  });
}

// ============================================================
// THESIS SEMINAR DOCUMENT — CRUD
// ============================================================

/**
 * Find a ThesisSeminarDocument by composite PK (seminarId + docTypeId).
 */
export async function findSeminarDocument(thesisSeminarId, documentTypeId) {
  return prisma.thesisSeminarDocument.findUnique({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
  });
}

/**
 * Get all seminar documents for a seminar with file info.
 * Manually joins the Document table since ThesisSeminarDocument
 * does not have a direct relation to Document in the schema.
 */
export async function findSeminarDocuments(thesisSeminarId) {
  const semDocs = await prisma.thesisSeminarDocument.findMany({
    where: { thesisSeminarId },
    include: {
      verifier: { select: { fullName: true } },
    },
  });

  // Batch-fetch document file info
  const docIds = semDocs.map((d) => d.documentId).filter(Boolean);
  const documents = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, filePath: true, fileName: true },
      })
    : [];
  const docMap = new Map(documents.map((d) => [d.id, d]));

  return semDocs.map((sd) => ({
    ...sd,
    document: docMap.get(sd.documentId) || null,
  }));
}

/**
 * Create a ThesisSeminarDocument record.
 */
export async function createSeminarDocument(data) {
  return prisma.thesisSeminarDocument.create({ data });
}

/**
 * Update a ThesisSeminarDocument record by composite key.
 */
export async function updateSeminarDocument(thesisSeminarId, documentTypeId, data) {
  return prisma.thesisSeminarDocument.update({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
    data,
  });
}

// ============================================================
// DOCUMENT STATUS VALIDATION (Admin)
// ============================================================

/**
 * Approve or decline a document submission.
 */
export async function updateDocumentStatus(
  thesisSeminarId,
  documentTypeId,
  { status, notes, verifiedBy }
) {
  return prisma.thesisSeminarDocument.update({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
    data: {
      status,
      notes: notes || null,
      verifiedBy,
      verifiedAt: new Date(),
    },
  });
}

/**
 * Count documents by status for a given seminar (for progress checks).
 */
export async function countDocumentsByStatus(thesisSeminarId) {
  return prisma.thesisSeminarDocument.findMany({
    where: { thesisSeminarId },
    select: { status: true, documentTypeId: true },
  });
}

/**
 * Get document with its file info (for download/view).
 */
export async function findDocumentWithFile(thesisSeminarId, documentTypeId) {
  const semDoc = await prisma.thesisSeminarDocument.findUnique({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
  });

  if (!semDoc) return null;

  const doc = await prisma.document.findUnique({
    where: { id: semDoc.documentId },
    select: { id: true, fileName: true, filePath: true },
  });

  return { ...semDoc, document: doc };
}

// ============================================================
// GENERIC DOCUMENT CRUD (File records in Document table)
// ============================================================

/**
 * Create a Document record (file metadata).
 */
export async function createDocument(data) {
  return prisma.document.create({ data });
}

/**
 * Find a Document by id.
 */
export async function findDocumentById(id) {
  return prisma.document.findUnique({ where: { id } });
}

/**
 * Delete a Document by id.
 */
export async function deleteDocument(id) {
  return prisma.document.delete({ where: { id } });
}
