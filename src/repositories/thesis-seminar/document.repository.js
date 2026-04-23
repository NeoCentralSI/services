import prisma from "../../config/prisma.js";

// ============================================================
// Document Type helpers
// ============================================================

const SEMINAR_DOC_TYPES = [
  "Laporan Tugas Akhir",
  "Slide Presentasi",
  "Draft Jurnal TEKNOSI",
];

/**
 * Get or create a document type by name
 */
export async function getOrCreateDocumentType(name) {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
}

/**
 * Ensure all 3 seminar document types exist and return them keyed by name
 */
export async function ensureSeminarDocumentTypes() {
  const result = {};
  for (const name of SEMINAR_DOC_TYPES) {
    result[name] = await getOrCreateDocumentType(name);
  }
  return result;
}

/**
 * Get all seminar document types
 */
export async function getSeminarDocumentTypes() {
  return prisma.documentType.findMany({
    where: { name: { in: SEMINAR_DOC_TYPES } },
  });
}

// ============================================================
// ThesisSeminarDocument CRUD
// ============================================================

/**
 * Find a ThesisSeminarDocument by composite PK
 */
export async function findSeminarDocument(thesisSeminarId, documentTypeId) {
  return prisma.thesisSeminarDocument.findUnique({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
  });
}

/**
 * Get all seminar documents for a seminar, with document info
 */
export async function findSeminarDocuments(thesisSeminarId) {
  const semDocs = await prisma.thesisSeminarDocument.findMany({
    where: { thesisSeminarId },
    include: {
      verifier: { select: { fullName: true } },
    },
  });

  // Manually join Document data
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
 * Create a ThesisSeminarDocument record
 */
export async function createSeminarDocument(data) {
  return prisma.thesisSeminarDocument.create({ data });
}

/**
 * Update a ThesisSeminarDocument record
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
// Document CRUD
// ============================================================

/**
 * Create a Document record
 */
export async function createDocument(data) {
  return prisma.document.create({ data });
}

/**
 * Find a Document by id
 */
export async function findDocumentById(id) {
  return prisma.document.findUnique({ where: { id } });
}

/**
 * Delete a Document by id
 */
export async function deleteDocument(id) {
  return prisma.document.delete({ where: { id } });
}

// ============================================================
// Thesis / Seminar lookups
// ============================================================

/**
 * Get thesis with latest seminar for a student
 */
export async function getThesisWithSeminar(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      studentId: true,
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Create a new ThesisSeminar record with status 'registered'
 */
export async function createThesisSeminar(thesisId) {
  return prisma.thesisSeminar.create({
    data: {
      thesisId,
      registeredAt: new Date(),
      status: "registered",
    },
  });
}
