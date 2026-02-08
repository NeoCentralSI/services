import { saveAvatar, deleteAvatar, resolveAvatarPath, getLecturerData } from "../services/profile.service.js";
import path from "path";

/**
 * POST /profile/avatar - Upload user avatar (file already saved by multer middleware)
 */
export async function uploadAvatarHandler(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error("File gambar wajib diunggah");
      err.statusCode = 400;
      throw err;
    }

    const avatarUrl = await saveAvatar(req.user.sub, req.file.filename);
    res.json({ success: true, data: { avatarUrl } });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /profile/avatar - Remove user avatar
 */
export async function deleteAvatarHandler(req, res, next) {
  try {
    await deleteAvatar(req.user.sub);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /profile/avatar/:fileName - Serve avatar file (protected)
 */
export async function serveAvatarHandler(req, res, next) {
  try {
    const sanitized = path.basename(req.params.fileName);
    const filePath = resolveAvatarPath(sanitized);

    if (!filePath) {
      const err = new Error("Avatar tidak ditemukan");
      err.statusCode = 404;
      throw err;
    }

    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /profile/lecturer-data - Get lecturer extended data
 */
export async function getLecturerDataHandler(req, res, next) {
  try {
    const data = await getLecturerData(req.user.sub);

    if (!data) {
      const err = new Error("Data dosen tidak ditemukan");
      err.statusCode = 404;
      throw err;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
