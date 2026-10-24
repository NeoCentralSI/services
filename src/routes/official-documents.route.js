import express from "express";
import multer from "multer";
import * as controller from "../controllers/official-document.controller.js";
import { createRateLimit } from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

/** "Unggah PDF" on Cek Dokumen: one PDF up to 10 MB, kept in memory only to hash it. */
const MAX_CHECK_FILE_BYTES = 10 * 1024 * 1024;
const checkFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHECK_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname ?? "");
    if (!isPdf) {
      const error = new Error("Hanya berkas PDF yang dapat diperiksa.");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
}).single("file");

function uploadCheckFile(req, res, next) {
  checkFileUpload(req, res, (error) => {
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "Ukuran berkas maksimal 10 MB." });
    }
    if (error) return res.status(error.statusCode ?? 400).json({ success: false, message: error.message });
    next();
  });
}

// Public (no login): find the official document of an uploaded PDF by its SHA-256.
// At most 20 requests per minute per IP.
export const findByFileRateLimit = createRateLimit({ limit: 20, windowMs: 60 * 1000 });
router.post("/find-by-file", findByFileRateLimit, uploadCheckFile, controller.findDocumentByFile);
router.get("/:token", controller.verifyDocument);

export default router;
