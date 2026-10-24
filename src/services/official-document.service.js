import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import prisma from "../config/prisma.js";
import { ENV } from "../config/env.js";
import { convertHtmlToPdf } from "../utils/pdf.util.js";
import { appendOfficialDocumentValidation } from "../utils/official-document-html.util.js";

const MIME_TYPE_PDF = "application/pdf";
const CURRENT_STATUS = "current";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeSegment(value) {
  return String(value || "document")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
}

/** Public page of a verification link: `/cek-dokumen/<token>` (the old `/verify/document/` redirects there). */
export function officialDocumentVerificationUrl(token) {
  return `${String(ENV.FRONTEND_URL ?? "").replace(/\/$/, "")}/cek-dokumen/${token}`;
}

function toPublicData(record, replacement = null) {
  return {
    token: record.verificationToken,
    documentKind: record.documentKind,
    title: record.title,
    documentNumber: record.documentNumber,
    subjectName: record.subjectName,
    subjectIdentifier: record.subjectIdentifier,
    issuerName: record.issuerName,
    issuerRole: record.issuerRole,
    issuedAt: record.issuedAt,
    version: record.version,
    status: record.status,
    isCurrent: record.status === CURRENT_STATUS,
    supersededAt: record.supersededAt ?? null,
    // When a newer version replaced this one: its issue date.
    replacedByIssuedAt: replacement?.issuedAt ?? null,
    integrityCheckAvailable: Boolean(record.fileHash),
  };
}

/** The next version of the same document, for a superseded record. */
async function findReplacement(record) {
  if (record.status === CURRENT_STATUS) return null;
  return prisma.officialGeneratedDocument.findFirst({
    where: { documentKind: record.documentKind, sourceId: record.sourceId, version: { gte: record.version + 1 } },
    orderBy: { version: "asc" },
    select: { issuedAt: true, version: true },
  });
}

async function readReusableDocument(record) {
  if (!record?.filePath || !record.fileHash) return null;
  try {
    const buffer = await fs.readFile(path.resolve(process.cwd(), record.filePath));
    return sha256(buffer) === record.fileHash ? buffer : null;
  } catch {
    return null;
  }
}

export async function renderAndIssueOfficialHtmlDocument({
  documentKind,
  sourceId,
  title,
  documentNumber = null,
  subjectName = null,
  subjectIdentifier = null,
  issuerName = "NeoCentral",
  issuerRole = "Sistem Informasi NeoCentral",
  html,
}) {
  if (!documentKind || !sourceId || !title || !html) {
    const error = new Error("Konfigurasi penerbitan dokumen resmi tidak lengkap.");
    error.statusCode = 500;
    throw error;
  }

  const sourceFingerprint = sha256(Buffer.from(html, "utf8"));
  const current = await prisma.officialGeneratedDocument.findFirst({
    where: { documentKind, sourceId, status: CURRENT_STATUS },
    orderBy: { version: "desc" },
  });

  if (current?.sourceFingerprint === sourceFingerprint) {
    const reusable = await readReusableDocument(current);
    if (reusable) return reusable;
  }

  const latest = await prisma.officialGeneratedDocument.findFirst({
    where: { documentKind, sourceId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version || 0) + 1;
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationUrl = officialDocumentVerificationUrl(verificationToken);
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 260,
  });
  const finalHtml = appendOfficialDocumentValidation(html, { qrDataUrl });
  const pdfBuffer = await convertHtmlToPdf(finalHtml);
  const fileHash = sha256(pdfBuffer);

  const relativeDir = path.posix.join("uploads", "official-documents", safeSegment(documentKind));
  const fileName = `${safeSegment(documentKind)}-${safeSegment(sourceId)}-v${version}-${verificationToken.slice(0, 12)}.pdf`;
  const relativePath = path.posix.join(relativeDir, fileName);
  const absoluteDir = path.resolve(process.cwd(), relativeDir);
  const absolutePath = path.resolve(process.cwd(), relativePath);

  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(absolutePath, pdfBuffer);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.officialGeneratedDocument.updateMany({
        where: { documentKind, sourceId, status: CURRENT_STATUS },
        data: { status: "superseded", supersededAt: new Date() },
      });
      await tx.officialGeneratedDocument.create({
        data: {
          verificationToken,
          documentKind,
          sourceId,
          sourceFingerprint,
          version,
          status: CURRENT_STATUS,
          title,
          documentNumber,
          subjectName,
          subjectIdentifier,
          issuerName,
          issuerRole,
          filePath: relativePath,
          fileName,
          fileSize: pdfBuffer.length,
          mimeType: MIME_TYPE_PDF,
          fileHash,
        },
      });
    });
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => {});
    throw error;
  }

  return pdfBuffer;
}

export async function getOfficialDocumentVerification(token) {
  const record = await prisma.officialGeneratedDocument.findUnique({
    where: { verificationToken: token },
  });
  if (!record) {
    const error = new Error("Dokumen resmi tidak ditemukan atau token verifikasi tidak valid.");
    error.statusCode = 404;
    throw error;
  }
  return toPublicData(record, await findReplacement(record));
}

/** The message shown when an uploaded file matches no official document. */
export const NO_MATCHING_DOCUMENT_MESSAGE =
  "Berkas tidak cocok dengan dokumen resmi mana pun. Dokumen mungkin telah diubah atau bukan terbitan NeoCentral.";

/**
 * Finds the official document whose stored file has the same SHA-256 as the uploaded one. The
 * upload is only hashed, never stored. A superseded version is still found (and said so).
 */
export async function findOfficialDocumentByFile(fileBuffer) {
  if (!fileBuffer?.length) {
    const error = new Error("Berkas PDF wajib dilampirkan.");
    error.statusCode = 400;
    throw error;
  }
  const record = await prisma.officialGeneratedDocument.findFirst({
    where: { fileHash: sha256(fileBuffer) },
    orderBy: { version: "desc" },
  });
  if (!record) {
    const error = new Error(NO_MATCHING_DOCUMENT_MESSAGE);
    error.statusCode = 404;
    throw error;
  }
  return toPublicData(record, await findReplacement(record));
}

