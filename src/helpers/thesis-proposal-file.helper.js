import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { safeUploadName } from "./guidanceFile.helper.js";

/**
 * Where proposal-domain files live (K17: file columns in the owner table).
 * - final proposal of one attempt: uploads/thesis/<thesis_id>/proposal/<assessment_id>/
 *   (served by /uploads/thesis with checkThesisFileAccess);
 * - Penetapan Pembimbing PDF of a batch: uploads/thesis-proposal/supervisor-assignments/<batch_id>/
 *   (served only through an authenticated endpoint);
 * - attendance files: uploads/research-method/attendance/<import_id>/ (same).
 */
export function proposalFileDir(thesisId, assessmentId) {
  return path.posix.join("uploads", "thesis", thesisId, "proposal", assessmentId);
}

export function assignmentBatchDir(batchId) {
  return path.posix.join("uploads", "thesis-proposal", "supervisor-assignments", batchId);
}

export function attendanceImportDir(importId) {
  return path.posix.join("uploads", "research-method", "attendance", importId);
}

/**
 * Write a file under `relDir` and return its file columns.
 * @param {{ relDir: string, file: { buffer: Buffer, originalname?: string, mimetype?: string, size?: number }, now?: Date, root?: string }} input
 */
export async function storeFile({ relDir, file, now = new Date(), root = process.cwd() }) {
  const storedName = `${now.getTime()}-${safeUploadName(file.originalname || "berkas")}`;
  const relPath = path.posix.join(relDir, storedName);
  await fs.mkdir(path.join(root, relDir), { recursive: true });
  await fs.writeFile(path.join(root, relPath), file.buffer);
  return {
    filePath: relPath,
    fileName: file.originalname || storedName,
    mimeType: file.mimetype || "application/octet-stream",
    fileSize: typeof file.size === "number" ? file.size : file.buffer.length,
    fileHash: createHash("sha256").update(file.buffer).digest("hex"),
  };
}

/** Remove a stored file (best effort), for example when saving its row failed. */
export async function removeFile(relPath, root = process.cwd()) {
  if (!relPath) return;
  await fs.rm(path.join(root, relPath), { force: true }).catch(() => {});
}
