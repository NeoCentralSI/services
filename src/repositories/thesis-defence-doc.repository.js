import prisma from "../config/prisma.js";

// ============================================================
// CONSTANTS
// ============================================================

export const DEFENCE_DOC_TYPES = [
  "Laporan Tugas Akhir",
  "Slide Presentasi",
  "Draft Jurnal TEKNOSI",
  "Sertifikat TOEFL",
  "Sertifikat SAPS",
];

// ============================================================
// DOCUMENT TYPES
// ============================================================

export async function getOrCreateDocumentType(name) {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
}

export async function ensureDefenceDocumentTypes() {
  const result = {};
  for (const name of DEFENCE_DOC_TYPES) {
    result[name] = await getOrCreateDocumentType(name);
  }
  return result;
}

export async function getDefenceDocumentTypes() {
  const types = await prisma.documentType.findMany({
    where: { name: { in: DEFENCE_DOC_TYPES } },
  });
  return DEFENCE_DOC_TYPES.map((name) => types.find((t) => t.name === name)).filter(Boolean);
}

// ============================================================
// THESIS DEFENCE DOCUMENT — CRUD
// ============================================================

export async function findDefenceDocument(thesisDefenceId, documentTypeId) {
  return prisma.thesisDefenceDocument.findUnique({
    where: { thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId } },
  });
}

export async function findDefenceDocuments(thesisDefenceId) {
  const docs = await prisma.thesisDefenceDocument.findMany({
    where: { thesisDefenceId },
    include: { verifier: { select: { fullName: true } } },
  });

  const docIds = docs.map((d) => d.documentId).filter(Boolean);
  const documents = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, fileName: true, filePath: true },
      })
    : [];
  const docMap = new Map(documents.map((d) => [d.id, d]));

  return docs.map((d) => ({
    thesisDefenceId: d.thesisDefenceId,
    documentTypeId: d.documentTypeId,
    documentId: d.documentId,
    status: d.status,
    submittedAt: d.submittedAt,
    verifiedAt: d.verifiedAt,
    notes: d.notes,
    verifiedBy: d.verifier?.fullName || null,
    fileName: docMap.get(d.documentId)?.fileName || null,
    filePath: docMap.get(d.documentId)?.filePath || null,
  }));
}

export async function findDefenceDocumentWithFile(thesisDefenceId, documentTypeId) {
  const defenceDoc = await prisma.thesisDefenceDocument.findUnique({
    where: { thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId } },
  });
  if (!defenceDoc) return null;

  const doc = await prisma.document.findUnique({
    where: { id: defenceDoc.documentId },
    select: { id: true, fileName: true, filePath: true },
  });
  return { ...defenceDoc, document: doc };
}

export async function upsertDefenceDocument({ thesisDefenceId, documentTypeId, documentId }) {
  return prisma.thesisDefenceDocument.upsert({
    where: { thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId } },
    update: {
      documentId,
      status: "submitted",
      submittedAt: new Date(),
      verifiedAt: null,
      verifiedBy: null,
      notes: null,
    },
    create: {
      thesisDefenceId,
      documentTypeId,
      documentId,
      status: "submitted",
      submittedAt: new Date(),
    },
  });
}

export async function updateDefenceDocumentStatus(thesisDefenceId, documentTypeId, { status, notes, verifiedBy }) {
  return prisma.thesisDefenceDocument.update({
    where: { thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId } },
    data: {
      status,
      notes: notes || null,
      verifiedBy,
      verifiedAt: new Date(),
    },
  });
}

export async function countDefenceDocumentsByStatus(thesisDefenceId) {
  return prisma.thesisDefenceDocument.findMany({
    where: { thesisDefenceId },
    select: { status: true, documentTypeId: true },
  });
}

// ============================================================
// GENERIC DOCUMENT (file metadata)
// ============================================================

export async function createDocument(data) {
  return prisma.document.create({ data });
}

export async function findDocumentById(id) {
  return prisma.document.findUnique({ where: { id } });
}

export async function deleteDocument(id) {
  return prisma.document.delete({ where: { id } });
}
