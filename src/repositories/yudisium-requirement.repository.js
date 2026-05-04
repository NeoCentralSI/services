import prisma from "../config/prisma.js";

export const findAll = async () => {
  return await prisma.yudisiumRequirement.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          yudisiumRequirementItems: true,
        },
      },
    },
  });
};

export const findActive = async () => {
  return await prisma.yudisiumRequirement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
};

export const findById = async (id) => {
  return await prisma.yudisiumRequirement.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          yudisiumRequirementItems: true,
        },
      },
    },
  });
};

export const findByName = async (name, excludeId = null) => {
  const where = { name };
  if (excludeId) where.id = { not: excludeId };
  return await prisma.yudisiumRequirement.findFirst({ where });
};


export const create = async (data) => {
  return await prisma.yudisiumRequirement.create({ data });
};

export const update = async (id, data) => {
  return await prisma.yudisiumRequirement.update({ where: { id }, data });
};

export const remove = async (id) => {
  return await prisma.yudisiumRequirement.delete({ where: { id } });
};

export const hasRelatedData = async (id) => {
  const count = await prisma.yudisiumParticipantRequirement.count({
    where: {
      requirement: {
        yudisiumRequirementId: id,
      },
    },
  });
  return count > 0;
};

