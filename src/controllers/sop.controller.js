import fs from "fs";
import path from "path";
import { ROLES } from "../constants/roles.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { uploadThesisFile } from "../middlewares/file.middleware.js";
import * as sopService from "../services/sop.service.js";

// Export middlewares for route wiring
export const sopUploadMiddleware = [authGuard, requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]), uploadThesisFile];
// Public read (landing page needs access)
export const sopReadMiddleware = [];

export async function listSop(req, res, next) {
  try {
    const { type } = req.query;
    const data = await sopService.getSop(type);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function uploadSop(req, res, next) {
  try {
    if (!req.file) {
      const error = new Error("File tidak ditemukan");
      error.statusCode = 400;
      throw error;
    }
    const { type } = req.body;
    const result = await sopService.saveSop({
      type,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /sop/download?path=/uploads/sop/sop-ta.pdf
 * Force download with Content-Disposition: attachment
 */
export async function downloadSop(req, res, next) {
  try {
    const rawPath = req.query.path;
    if (!rawPath || typeof rawPath !== "string") {
      const error = new Error("Path file tidak valid");
      error.statusCode = 400;
      throw error;
    }

    // Normalize and ensure the target stays under /uploads
    const uploadsRoot = path.join(process.cwd(), "uploads");
    const targetPath = path.join(process.cwd(), rawPath.replace(/^\//, ""));
    if (!targetPath.startsWith(uploadsRoot)) {
      const error = new Error("Path file tidak diizinkan");
      error.statusCode = 400;
      throw error;
    }

    if (!fs.existsSync(targetPath)) {
      const error = new Error("File tidak ditemukan");
      error.statusCode = 404;
      throw error;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(targetPath)}"`);
    res.sendFile(targetPath);
  } catch (err) {
    next(err);
  }
}
