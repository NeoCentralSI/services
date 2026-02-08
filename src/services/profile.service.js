import path from "path";
import fs from "fs";
import prisma from "../config/prisma.js";

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");

// Ensure avatar directory exists
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

/**
 * Save avatar URL to DB and delete old file
 */
export async function saveAvatar(userId, fileName) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });

  // Delete old avatar file if exists
  if (user?.avatarUrl) {
    const oldFile = path.join(AVATAR_DIR, path.basename(user.avatarUrl));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  const avatarUrl = `/avatars/${fileName}`;
  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });

  return avatarUrl;
}

/**
 * Delete avatar file and clear DB
 */
export async function deleteAvatar(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });

  if (user?.avatarUrl) {
    const filePath = path.join(AVATAR_DIR, path.basename(user.avatarUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  }
}

/**
 * Resolve avatar file path (for protected serving)
 */
export function resolveAvatarPath(fileName) {
  const filePath = path.join(AVATAR_DIR, path.basename(fileName));
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Get lecturer extended data (JSON field)
 */
export async function getLecturerData(userId) {
  const lecturer = await prisma.lecturer.findUnique({
    where: { id: userId },
    include: { scienceGroup: true },
  });

  if (!lecturer) return null;

  return {
    id: lecturer.id,
    scienceGroup: lecturer.scienceGroup?.name || null,
    data: lecturer.data || null,
  };
}
