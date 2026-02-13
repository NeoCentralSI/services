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
export const sopDeleteMiddleware = [authGuard, requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN])];

export async function listSop(req, res, next) {
  try {
    const { category } = req.query;
    const data = await sopService.listSop(category);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listSopPublic(req, res, next) {
  try {
    const data = await sopService.listSopPublic();
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
    const { type, title } = req.body;
    const userId = req.user.sub;

    const result = await sopService.saveSop({
      type,
      title,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function patchSop(req, res, next) {
  try {
    const { id } = req.params;
    const { type, title } = req.body;

    const result = await sopService.updateSop(id, { type, title });
    res.json({
      success: true,
      message: "Panduan berhasil diperbarui",
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteSop(req, res, next) {
  try {
    const { id } = req.params;
    const result = await sopService.deleteSop(id);
    res.json({ success: true, message: "Panduan berhasil dihapus" });
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

    // Normalize and ensure the target stays under /uploads/sop
    const sopRoot = path.join(process.cwd(), "uploads", "sop");
    const DecodedPath = decodeURIComponent(rawPath);
    const targetPath = path.join(process.cwd(), DecodedPath.replace(/^\//, ""));
    if (!targetPath.startsWith(sopRoot)) {
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
