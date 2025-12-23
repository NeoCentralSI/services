import fs from "fs/promises";
import path from "path";

const SOP_ROOT = path.join(process.cwd(), "uploads", "sop");
const VALID_TYPES = {
  TA: "tugas-akhir",
  KP: "kerja-praktik",
};

const normalizeType = (rawType) => {
  const t = String(rawType || "").trim().toLowerCase();
  if (t === "ta" || t === "tugas-akhir" || t === "tugasakhir") return VALID_TYPES.TA;
  if (t === "kp" || t === "kerja-praktek" || t === "kerja-praktik") return VALID_TYPES.KP;
  return null;
};

function buildFileName(typeKey) {
  return typeKey === VALID_TYPES.KP ? "sop-kp.pdf" : "sop-ta.pdf";
}

async function ensureDir() {
  await fs.mkdir(SOP_ROOT, { recursive: true });
}

export async function saveSop({ type, buffer, originalName, mimeType, size }) {
  const normalized = normalizeType(type);
  if (!normalized) {
    const err = new Error("Tipe SOP tidak valid (gunakan TA atau KP)");
    err.statusCode = 400;
    throw err;
  }

  await ensureDir();
  const fileName = buildFileName(normalized);
  const filePath = path.join(SOP_ROOT, fileName);
  await fs.writeFile(filePath, buffer);

  return {
    type: normalized,
    fileName: originalName || fileName,
    mimeType,
    size,
    url: `/uploads/sop/${fileName}`,
    updatedAt: new Date().toISOString(),
  };
}

export async function getSop(type) {
  const normalized = normalizeType(type);
  const types = normalized ? [normalized] : Object.values(VALID_TYPES);
  await ensureDir();

  const results = [];
  for (const t of types) {
    const fileName = buildFileName(t);
    const filePath = path.join(SOP_ROOT, fileName);
    try {
      const stat = await fs.stat(filePath);
      results.push({
        type: t,
        fileName,
        url: `/uploads/sop/${fileName}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  return results;
}
