import prisma from "../config/prisma.js";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";

const REDUNDANT_NAME_PREFIX = /^(KBK|Kelompok Bidang Keahlian|Kelompok Keilmuan)\s+/i;

export const CANONICAL_SCIENCE_GROUP_NAMES = [
  "Sistem Enterprise",
  "Rekayasa Data dan Business Intelligence",
  "Tata Kelola dan Infrastruktur Teknologi Informasi",
  "Pengembangan Sistem",
];

export function normalizeScienceGroupName(raw) {
  const name = String(raw ?? "").trim();
  if (!name) {
    throw new BadRequestError("Nama kelompok keilmuan wajib diisi");
  }
  if (REDUNDANT_NAME_PREFIX.test(name)) {
    throw new BadRequestError(
      "Nama kelompok keilmuan tidak perlu diawali 'KBK' atau 'Kelompok Keilmuan'. Gunakan nama bidangnya, misalnya Sistem Enterprise.",
    );
  }
  return name;
}

async function assertNameAvailable(name, excludeId) {
  const existing = await prisma.scienceGroup.findFirst({
    where: {
      name,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new ConflictError(`Kelompok keilmuan "${name}" sudah ada`);
  }
}

export async function getScienceGroups() {
  return prisma.scienceGroup.findMany({
    orderBy: { name: "asc" },
  });
}

export async function createScienceGroup(data) {
  const name = normalizeScienceGroupName(data?.name);
  await assertNameAvailable(name);
  return prisma.scienceGroup.create({ data: { name } });
}

export async function updateScienceGroup(id, data) {
  const existing = await prisma.scienceGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Kelompok keilmuan tidak ditemukan");
  }
  const name = normalizeScienceGroupName(data?.name);
  await assertNameAvailable(name, id);
  return prisma.scienceGroup.update({ where: { id }, data: { name } });
}

export async function deleteScienceGroup(id) {
  const existing = await prisma.scienceGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError("Kelompok keilmuan tidak ditemukan");
  }

  const [lecturerCount, topicCount] = await Promise.all([
    prisma.lecturer.count({ where: { scienceGroupId: id } }),
    prisma.thesisTopic.count({ where: { scienceGroupId: id } }),
  ]);

  if (lecturerCount > 0 || topicCount > 0) {
    throw new BadRequestError(
      `Kelompok keilmuan tidak dapat dihapus karena masih dipakai ${lecturerCount} dosen dan ${topicCount} topik. Pindahkan dulu, lalu hapus.`,
    );
  }

  return prisma.scienceGroup.delete({ where: { id } });
}
