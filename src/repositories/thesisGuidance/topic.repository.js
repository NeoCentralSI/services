import prisma from "../../config/prisma.js";

/**
 * Get all thesis topics
 */
export function findAll() {
  return prisma.thesisTopic.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          thesis: true,
          milestoneTemplates: true,
        },
      },
    },
  });
}

/**
 * Find topic by ID
 */
export function findById(id) {
  return prisma.thesisTopic.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          thesis: true,
          milestoneTemplates: true,
        },
      },
    },
  });
}

/**
 * Find topic by name (for uniqueness check)
 */
export function findByName(name) {
  return prisma.thesisTopic.findFirst({
    where: {
      name: {
        equals: name,
      },
    },
  });
}

/**
 * Create new topic
 */
export function create(data) {
  return prisma.thesisTopic.create({
    data,
    include: {
      _count: {
        select: {
          thesis: true,
          milestoneTemplates: true,
        },
      },
    },
  });
}

/**
 * Update topic
 */
export function update(id, data) {
  return prisma.thesisTopic.update({
    where: { id },
    data,
    include: {
      _count: {
        select: {
          thesis: true,
          milestoneTemplates: true,
        },
      },
    },
  });
}

/**
 * Delete topic
 */
export function remove(id) {
  return prisma.thesisTopic.delete({
    where: { id },
  });
}

/**
 * Bulk delete topics
 */
export function bulkDelete(ids) {
  return prisma.thesisTopic.deleteMany({
    where: {
      id: { in: ids },
    },
  });
}

/**
 * Find topics offered by a specific lecturer
 */
export function findByLecturerId(lecturerId) {
  return prisma.thesisTopic.findMany({
    where: { lecturerId },
    orderBy: { updatedAt: "desc" },
    include: {
      scienceGroup: { select: { id: true, name: true } },
      _count: {
        select: {
          thesis: true,
          advisorRequests: true,
        },
      },
    },
  });
}

/**
 * Check if topic has related data
 */
export async function hasRelatedData(id) {
  const topic = await prisma.thesisTopic.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          thesis: true,
          milestoneTemplates: true,
        },
      },
    },
  });

  if (!topic) return false;

  return topic._count.thesis > 0 || topic._count.milestoneTemplates > 0;
}
