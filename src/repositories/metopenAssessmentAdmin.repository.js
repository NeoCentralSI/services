import prisma from "../config/prisma.js";

const RESEARCH_METHOD_APPLIES_TO = ["proposal", "metopen"];

export function findCpmkById(id) {
  return prisma.cpmk.findUnique({
    where: { id },
    select: { id: true, type: true, code: true, isActive: true },
  });
}

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
      appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
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
      appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
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
        select: { id: true, name: true, role: true, appliesTo: true, maxScore: true },
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
        select: { id: true, name: true, role: true, appliesTo: true, maxScore: true },
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
        select: { id: true, name: true, role: true, appliesTo: true, maxScore: true },
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

export function findConfiguredMetopenCpmks(role) {
  return prisma.cpmk.findMany({
    where: {
      type: "research_method",
      assessmentCriterias: {
        some: {
          appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
          isDeleted: false,
          ...(role ? { role } : {}),
        },
      },
    },
    include: {
      assessmentCriterias: {
        where: {
          appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
          isDeleted: false,
          ...(role ? { role } : {}),
        },
        include: {
          assessmentRubrics: {
            where: { isDeleted: false },
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });
}

export function findMetopenCriteriaByCpmk(cpmkId, role) {
  return prisma.assessmentCriteria.findMany({
    where: {
      cpmkId,
      appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
      isDeleted: false,
      ...(role ? { role } : {}),
    },
    select: { id: true },
  });
}

export async function removeMetopenConfigByCpmk(cpmkId, role) {
  return prisma.$transaction(async (tx) => {
    const criteriaRows = await tx.assessmentCriteria.findMany({
      where: {
        cpmkId,
        appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
        isDeleted: false,
        ...(role ? { role } : {}),
      },
      select: { id: true },
    });

    const criteriaIds = criteriaRows.map((r) => r.id);
    if (criteriaIds.length === 0) {
      return { deletedCriteria: 0, deletedRubrics: 0 };
    }

    const deletedRubrics = await tx.assessmentRubric.deleteMany({
      where: { assessmentCriteriaId: { in: criteriaIds } },
    });

    const deletedCriteria = await tx.assessmentCriteria.deleteMany({
      where: { id: { in: criteriaIds } },
    });

    return {
      deletedCriteria: deletedCriteria.count,
      deletedRubrics: deletedRubrics.count,
    };
  });
}

export async function getActiveCriteriaTotalScore(role, excludeCriteriaId = null) {
  const where = {
    appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
    role,
    isDeleted: false,
    cpmk: { type: "research_method" },
  };
  if (excludeCriteriaId) {
    where.id = { not: excludeCriteriaId };
  }
  const result = await prisma.assessmentCriteria.aggregate({
    where,
    _sum: { maxScore: true },
  });
  return result._sum.maxScore || 0;
}

export async function getMetopenWeightSummary(role) {
  const cpmks = await prisma.cpmk.findMany({
    where: {
      type: "research_method",
      assessmentCriterias: {
        some: {
          appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
          isDeleted: false,
          ...(role ? { role } : {}),
        },
      },
    },
    select: {
      id: true,
      code: true,
      description: true,
      assessmentCriterias: {
        where: {
          appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
          isDeleted: false,
          ...(role ? { role } : {}),
        },
        select: {
          id: true,
          name: true,
          maxScore: true,
          assessmentRubrics: {
            where: { isDeleted: false },
            select: { id: true },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  let totalCriteriaScore = 0;
  const details = cpmks.map((c) => {
    const criteriaScore = c.assessmentCriterias.reduce(
      (sum, cr) => sum + (cr.maxScore || 0),
      0,
    );
    totalCriteriaScore += criteriaScore;
    const rubricCount = c.assessmentCriterias.reduce(
      (sum, cr) => sum + cr.assessmentRubrics.length,
      0,
    );
    return {
      cpmkId: c.id,
      cpmkCode: c.code,
      cpmkDescription: c.description,
      criteriaCount: c.assessmentCriterias.length,
      criteriaScoreSum: criteriaScore,
      rubricCount,
    };
  });

  return { totalScore: totalCriteriaScore, isComplete: totalCriteriaScore > 0, details };
}

export function reorderCriteria(cpmkId, orderedIds) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.assessmentCriteria.update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}

export function reorderRubrics(criteriaId, orderedIds) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.assessmentRubric.update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}

export async function criteriaHasAssessmentData(id) {
  const count = await prisma.researchMethodScoreDetail.count({
    where: { assessmentCriteriaId: id },
  });
  return count > 0;
}

export async function rubricHasAssessmentData(id) {
  const count = await prisma.researchMethodScoreDetail.count({
    where: { assessmentRubricId: id },
  });
  return count > 0;
}
