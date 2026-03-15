import prisma from "../config/prisma.js";

function buildCriteriaInclude() {
  return {
    cpmk: { select: { id: true, code: true, description: true, type: true, isActive: true } },
    assessmentRubrics: {
      where: { isDeleted: false },
      orderBy: { displayOrder: "asc" },
    },
  };
}

export function findCriteria({ role = null } = {}) {
  return prisma.assessmentCriteria.findMany({
    where: {
      appliesTo: "metopen",
      isDeleted: false,
      ...(role ? { role } : {}),
      cpmk: { type: "research_method" },
    },
    include: buildCriteriaInclude(),
    orderBy: [{ role: "asc" }, { displayOrder: "asc" }],
  });
}

export function findCriteriaById(id) {
  return prisma.assessmentCriteria.findUnique({
    where: { id },
    include: buildCriteriaInclude(),
  });
}

export async function getNextCriteriaDisplayOrder(role) {
  const result = await prisma.assessmentCriteria.aggregate({
    where: {
      appliesTo: "metopen",
      role,
      isDeleted: false,
      cpmk: { type: "research_method" },
    },
    _max: { displayOrder: true },
  });

  return (result._max.displayOrder ?? -1) + 1;
}

export function createCriteria(data) {
  return prisma.assessmentCriteria.create({
    data,
    include: buildCriteriaInclude(),
  });
}

export function updateCriteria(id, data) {
  return prisma.assessmentCriteria.update({
    where: { id },
    data,
    include: buildCriteriaInclude(),
  });
}

export function softDeleteCriteria(id, deletedAt = new Date()) {
  return prisma.assessmentCriteria.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt,
      isActive: false,
    },
  });
}

export function findRubricsByCriteria(criteriaId) {
  return prisma.assessmentRubric.findMany({
    where: {
      assessmentCriteriaId: criteriaId,
      isDeleted: false,
    },
    orderBy: { displayOrder: "asc" },
  });
}

export function findRubricById(id) {
  return prisma.assessmentRubric.findUnique({
    where: { id },
    include: {
      assessmentCriteria: {
        select: { id: true, name: true, role: true, appliesTo: true },
      },
    },
  });
}

export async function getNextRubricDisplayOrder(assessmentCriteriaId) {
  const result = await prisma.assessmentRubric.aggregate({
    where: {
      assessmentCriteriaId,
      isDeleted: false,
    },
    _max: { displayOrder: true },
  });

  return (result._max.displayOrder ?? -1) + 1;
}

export function createRubric(data) {
  return prisma.assessmentRubric.create({
    data,
    include: {
      assessmentCriteria: {
        select: { id: true, name: true, role: true, appliesTo: true },
      },
    },
  });
}

export function updateRubric(id, data) {
  return prisma.assessmentRubric.update({
    where: { id },
    data,
    include: {
      assessmentCriteria: {
        select: { id: true, name: true, role: true, appliesTo: true },
      },
    },
  });
}

export function softDeleteRubric(id, deletedAt = new Date()) {
  return prisma.assessmentRubric.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt,
    },
  });
}
