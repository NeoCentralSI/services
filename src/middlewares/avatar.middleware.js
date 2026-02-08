import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");

// Ensure directory exists
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `${req.user.sub}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    cb(null, name);
  },
});

function imageFilter(_req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan"));
  }
  cb(null, true);
}

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single("avatar");
