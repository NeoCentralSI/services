import prisma from "../config/prisma.js";

export function findCpmkById(id) {
  return prisma.metopenCpmk.findUnique({
    where: { id },
    select: { id: true, code: true },
  });
}

export function findAllMetopenCpmks(academicYearId = null) {
  return prisma.metopenCpmk.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
    },
    orderBy: { code: "asc" },
  });
}

export function createMetopenCpmk(data) {
  return prisma.metopenCpmk.create({ data });
}

export function findMetopenCpmkByCode(code, academicYearId = null) {
  return prisma.metopenCpmk.findFirst({
    where: {
      code,
      ...(academicYearId ? { academicYearId } : {}),
    },
  });
}

function buildCriteriaInclude() {
  return {
    metopenCpmk: { select: { id: true, code: true, description: true } },
    metopenAssessmentRubrics: {
      orderBy: { displayOrder: "asc" },
    },
  };
}

export function findCriteria({ role = null } = {}) {
  return prisma.metopenAssessmentCriteria.findMany({
    where: {
      ...(role ? { role } : {}),
    },
    include: buildCriteriaInclude(),
    orderBy: [{ role: "asc" }, { displayOrder: "asc" }],
  });
}

export function findCriteriaById(id) {
  return prisma.metopenAssessmentCriteria.findUnique({
    where: { id },
    include: buildCriteriaInclude(),
  });
}

export async function getNextCriteriaDisplayOrder(role) {
  const result = await prisma.metopenAssessmentCriteria.aggregate({
    where: { role },
    _max: { displayOrder: true },
  });

  return (result._max.displayOrder ?? -1) + 1;
}

export function createCriteria(data) {
  return prisma.metopenAssessmentCriteria.create({
    data,
    include: buildCriteriaInclude(),
  });
}

export function updateCriteria(id, data) {
  return prisma.metopenAssessmentCriteria.update({
    where: { id },
    data,
    include: buildCriteriaInclude(),
  });
}

export function deleteCriteria(id) {
  return prisma.metopenAssessmentCriteria.delete({
    where: { id },
  });
}

export function findRubricsByCriteria(criteriaId) {
  return prisma.metopenAssessmentRubric.findMany({
    where: { metopenAssessmentCriteriaId: criteriaId },
    orderBy: { displayOrder: "asc" },
  });
}

export function findRubricById(id) {
  return prisma.metopenAssessmentRubric.findUnique({
    where: { id },
    include: {
      metopenAssessmentCriteria: {
        select: { id: true, name: true, role: true, maxScore: true },
      },
    },
  });
}

export async function getNextRubricDisplayOrder(metopenAssessmentCriteriaId) {
  const result = await prisma.metopenAssessmentRubric.aggregate({
    where: { metopenAssessmentCriteriaId },
    _max: { displayOrder: true },
  });

  return (result._max.displayOrder ?? -1) + 1;
}

export function createRubric(data) {
  return prisma.metopenAssessmentRubric.create({
    data,
    include: {
      metopenAssessmentCriteria: {
        select: { id: true, name: true, role: true, maxScore: true },
      },
    },
  });
}

export function updateRubric(id, data) {
  return prisma.metopenAssessmentRubric.update({
    where: { id },
    data,
    include: {
      metopenAssessmentCriteria: {
        select: { id: true, name: true, role: true, maxScore: true },
      },
    },
  });
}

export function deleteRubric(id) {
  return prisma.metopenAssessmentRubric.delete({
    where: { id },
  });
}

export function findConfiguredMetopenCpmks(role) {
  return prisma.metopenCpmk.findMany({
    where: {
      metopenAssessmentCriterias: {
        some: {
          ...(role ? { role } : {}),
        },
      },
    },
    include: {
      metopenAssessmentCriterias: {
        where: {
          ...(role ? { role } : {}),
        },
        include: {
          metopenAssessmentRubrics: {
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
  return prisma.metopenAssessmentCriteria.findMany({
    where: {
      metopenCpmkId: cpmkId,
      ...(role ? { role } : {}),
    },
    select: { id: true },
  });
}

export async function removeMetopenConfigByCpmk(cpmkId, role) {
  return prisma.$transaction(async (tx) => {
    const criteriaRows = await tx.metopenAssessmentCriteria.findMany({
      where: {
        metopenCpmkId: cpmkId,
        ...(role ? { role } : {}),
      },
      select: { id: true },
    });

    const criteriaIds = criteriaRows.map((r) => r.id);
    if (criteriaIds.length === 0) {
      return { deletedCriteria: 0, deletedRubrics: 0 };
    }

    const deletedRubrics = await tx.metopenAssessmentRubric.deleteMany({
      where: { metopenAssessmentCriteriaId: { in: criteriaIds } },
    });

    const deletedCriteria = await tx.metopenAssessmentCriteria.deleteMany({
      where: { id: { in: criteriaIds } },
    });

    return {
      deletedCriteria: deletedCriteria.count,
      deletedRubrics: deletedRubrics.count,
    };
  });
}

export async function getActiveCriteriaTotalScore(role, excludeCriteriaId = null) {
  const where = { role };
  if (excludeCriteriaId) {
    where.id = { not: excludeCriteriaId };
  }
  const result = await prisma.metopenAssessmentCriteria.aggregate({
    where,
    _sum: { maxScore: true },
  });
  return result._sum.maxScore || 0;
}

export async function getMetopenWeightSummary(role) {
  const cpmks = await prisma.metopenCpmk.findMany({
    where: {
      metopenAssessmentCriterias: {
        some: {
          ...(role ? { role } : {}),
        },
      },
    },
    select: {
      id: true,
      code: true,
      description: true,
      metopenAssessmentCriterias: {
        where: {
          ...(role ? { role } : {}),
        },
        select: {
          id: true,
          name: true,
          maxScore: true,
          metopenAssessmentRubrics: {
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
    const criteriaScore = c.metopenAssessmentCriterias.reduce(
      (sum, cr) => sum + (cr.maxScore || 0),
      0,
    );
    totalCriteriaScore += criteriaScore;
    const rubricCount = c.metopenAssessmentCriterias.reduce(
      (sum, cr) => sum + cr.metopenAssessmentRubrics.length,
      0,
    );
    return {
      cpmkId: c.id,
      cpmkCode: c.code,
      cpmkDescription: c.description,
      criteriaCount: c.metopenAssessmentCriterias.length,
      criteriaScoreSum: criteriaScore,
      rubricCount,
    };
  });

  return { totalScore: totalCriteriaScore, isComplete: totalCriteriaScore > 0, details };
}

export function reorderCriteria(cpmkId, orderedIds) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.metopenAssessmentCriteria.update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}

export function reorderRubrics(criteriaId, orderedIds) {
  return prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.metopenAssessmentRubric.update({
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

export async function rubricHasAssessmentData(_id) {
  return false;
}
