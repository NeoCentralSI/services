/**
 * Penetapan Pembimbing as an official document with a verification QR.
 *
 * The PDF keeps its own renderer (pdf-lib); the record follows the rules of
 * `official-document.service.js` (same table, read by the Cek Dokumen page `/cek-dokumen/:token`):
 * one record per issued version, keyed by the period (`sourceId`), the previous version of the
 * period becomes "superseded", and the stored file is checked against its hash when downloaded.
 * Previews get no QR and no record.
 */
import crypto from "crypto";
import QRCode from "qrcode";

import prisma from "../../config/prisma.js";
import { officialDocumentVerificationUrl } from "../official-document.service.js";
import { renderAssignmentPdf, semesterLabel } from "../../helpers/supervisor-assignment.helper.js";

export const SUPERVISOR_ASSIGNMENT_DOCUMENT_KIND = "supervisor_assignment";
export const SUPERVISOR_ASSIGNMENT_DOCUMENT_TITLE = "Penetapan Pembimbing Tugas Akhir";
const CURRENT = "current";
const SUPERSEDED = "superseded";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const verificationUrlOf = officialDocumentVerificationUrl;

/**
 * Renders an issued version with its verification QR. Returns the PDF and the record to write
 * once the file is stored (see `recordIssuedAssignmentDocument`).
 */
export async function renderIssuedAssignmentPdf({ academicYear, entries, kadep, now = new Date(), version, cohortHash }) {
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const url = verificationUrlOf(verificationToken);
  const qrPng = await QRCode.toBuffer(url, { errorCorrectionLevel: "H", margin: 1, width: 260, type: "png" });
  const buffer = await renderAssignmentPdf({ academicYear, entries, kadep, now, verification: { qrPng, url } });
  return {
    buffer,
    document: {
      verificationToken,
      documentKind: SUPERVISOR_ASSIGNMENT_DOCUMENT_KIND,
      sourceId: academicYear.id,
      sourceFingerprint: cohortHash ? sha256(String(cohortHash)) : sha256(buffer),
      version,
      title: SUPERVISOR_ASSIGNMENT_DOCUMENT_TITLE,
      // The verification page already shows the version.
      documentNumber: null,
      subjectName: `Semester ${semesterLabel(academicYear)}`,
      subjectIdentifier: `${entries.length} mahasiswa`,
      issuerName: kadep?.fullName ?? "Ketua Departemen Sistem Informasi",
      issuerRole: "Ketua Departemen Sistem Informasi",
      issuedAt: now,
      fileHash: sha256(buffer),
    },
  };
}

/**
 * In the caller's transaction: the period's current official version becomes superseded and the
 * new one is recorded with the stored file.
 */
export async function recordIssuedAssignmentDocument(tx, document, stored) {
  await tx.officialGeneratedDocument.updateMany({
    where: { documentKind: SUPERVISOR_ASSIGNMENT_DOCUMENT_KIND, sourceId: document.sourceId, status: CURRENT },
    data: { status: SUPERSEDED, supersededAt: new Date() },
  });
  return tx.officialGeneratedDocument.create({
    data: {
      ...document,
      status: CURRENT,
      filePath: stored.filePath,
      fileName: stored.fileName,
      fileSize: stored.fileSize,
      mimeType: stored.mimeType ?? "application/pdf",
    },
  });
}

export { sha256 as hashAssignmentFile };
