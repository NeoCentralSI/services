/**
 * Lampiran sesi bimbingan (K17). Metadata file disimpan di baris `thesis_guidances`
 * (tanpa tabel `documents`); file di disk mengikuti hierarki
 * uploads/thesis/<thesis_id>/guidance/<guidance_id>/<timestamp>-<nama_aman>.<ext>.
 */
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { TA_PHASE } from "../constants/thesisStatus.js";

/** Kolom file sesi untuk `select`/`include` Prisma. */
export const GUIDANCE_FILE_SELECT = Object.freeze({
  filePath: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  fileUploadedAt: true,
});

export function guidanceUploadDir(thesisId, guidanceId) {
  return path.join("uploads", "thesis", thesisId, "guidance", guidanceId);
}

/** Nama file aman: hanya huruf, angka, titik, minus dan garis bawah. */
export function safeUploadName(originalName = "", fallback = "lampiran.pdf") {
  const ext = path.extname(originalName).toLowerCase() || path.extname(fallback);
  const stem = path
    .basename(originalName, path.extname(originalName))
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 100);
  return `${stem || path.basename(fallback, path.extname(fallback))}${ext}`;
}

/**
 * Tulis lampiran ke disk dan kembalikan kolom file untuk baris sesi.
 * Kegagalan dilempar ke pemanggil (tidak ditelan) agar pengajuan dibatalkan.
 */
export async function storeGuidanceAttachment({ thesisId, guidanceId, file, now = new Date(), root = process.cwd() }) {
  const relDir = guidanceUploadDir(thesisId, guidanceId);
  const storedName = `${now.getTime()}-${safeUploadName(file.originalname)}`;
  const relPath = path.join(relDir, storedName).replace(/\\/g, "/");
  await fs.mkdir(path.join(root, relDir), { recursive: true });
  await fs.writeFile(path.join(root, relPath), file.buffer);
  return {
    filePath: relPath,
    fileName: file.originalname || storedName,
    mimeType: file.mimetype || "application/pdf",
    fileSize: typeof file.size === "number" ? file.size : file.buffer.length,
    fileHash: createHash("sha256").update(file.buffer).digest("hex"),
    fileUploadedAt: now,
  };
}

/** Hapus file yang sudah ditulis ketika penyimpanan baris sesi gagal. */
export async function removeStoredAttachment(relPath, root = process.cwd()) {
  if (!relPath) return;
  await fs.rm(path.join(root, relPath), { force: true }).catch(() => {});
}

/** URL publik (dijaga authGuard + checkThesisFileAccess) dari path relatif; null bila tidak ada file. */
export function uploadUrl(filePath) {
  if (!filePath) return null;
  return filePath.startsWith("uploads/") ? `/${filePath}` : `/uploads/${filePath}`;
}

/**
 * Bentuk respons `document` yang dipertahankan untuk frontend.
 * `id` berisi id sesi bimbingan (tidak ada lagi baris `documents`).
 */
export function guidanceDocument(guidance) {
  if (!guidance?.filePath) return null;
  return {
    id: guidance.id,
    fileName: guidance.fileName || path.basename(guidance.filePath),
    filePath: guidance.filePath,
    url: uploadUrl(guidance.filePath),
  };
}

/**
 * "Laporan terbaru" TA (pengganti `thesis.document`): lampiran dari sesi fase TA
 * terbaru yang punya file.
 */
export function findLatestThesisReport(db, thesisId) {
  return db.thesisGuidance.findFirst({
    where: { thesisId, ...TA_PHASE, filePath: { not: null } },
    orderBy: [{ fileUploadedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, ...GUIDANCE_FILE_SELECT },
  });
}
