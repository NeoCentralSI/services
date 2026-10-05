import prisma from "../config/prisma.js";

const ASSESSOR_CONFIG = {
  supervisor: {
    criteriaDelegate: "researchMethodSupervisorAssessmentCriteria",
    rubricDelegate: "researchMethodSupervisorAssessmentRubric",
  },
  coordinator: {
    criteriaDelegate: "researchMethodCoordinatorAssessmentCriteria",
    rubricDelegate: "researchMethodCoordinatorAssessmentRubric",
  },
};

function configFor(assessor) {
  const config = ASSESSOR_CONFIG[assessor];
  if (!config) throw new Error("Aktor penilaian Metode Penelitian tidak valid");
  return config;
}

function criteriaDelegate(client, assessor) {
  return client[configFor(assessor).criteriaDelegate];
}

function rubricDelegate(client, assessor) {
  return client[configFor(assessor).rubricDelegate];
}


function criteriaInclude() {
  return {
    researchMethodCpmk: {
      select: { id: true, code: true, description: true, academicYearId: true },
    },
    assessmentRubrics: { orderBy: { displayOrder: "asc" } },
  };
}

export function normalizeCriteria(criteria, assessor) {
  return {
    ...criteria,
    assessor,
  };
}

export function findCpmkById(id, client = prisma) {
  return client.researchMethodCpmk.findUnique({
    where: { id },
    select: { id: true, code: true, description: true, academicYearId: true },
  });
}

export async function findAllCpmks(academicYearId, client = prisma) {
  const rows = await client.researchMethodCpmk.findMany({
    where: { academicYearId },
    include: {
      _count: {
        select: {
          supervisorAssessmentCriterias: true,
          coordinatorAssessmentCriterias: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });

  return rows.map((row) => ({
    ...row,
    criteriaCount:
      row._count.supervisorAssessmentCriterias +
      row._count.coordinatorAssessmentCriterias,
  }));
}

export function findCpmkByCode(code, academicYearId, client = prisma) {
  return client.researchMethodCpmk.findFirst({
    where: { code, academicYearId },
  });
}

export function createCpmk(data, client = prisma) {
  return client.researchMethodCpmk.create({ data });
}

export function updateCpmk(id, data, client = prisma) {
  return client.researchMethodCpmk.update({ where: { id }, data });
}

export async function deleteCpmk(id) {
  return prisma.$transaction(async (tx) => {
    for (const assessor of Object.keys(ASSESSOR_CONFIG)) {
      const criterias = await criteriaDelegate(tx, assessor).findMany({
        where: { researchMethodCpmkId: id },
        select: { id: true },
      });
      const ids = criterias.map((row) => row.id);
      if (ids.length) {
        await rubricDelegate(tx, assessor).deleteMany({
          where: { assessmentCriteriaId: { in: ids } },
        });
        await criteriaDelegate(tx, assessor).deleteMany({
          where: { id: { in: ids } },
        });
      }
    }
    return tx.researchMethodCpmk.delete({ where: { id } });
  });
}

export async function findCriteria(assessor, academicYearId, client = prisma) {
  const rows = await criteriaDelegate(client, assessor).findMany({
    where: { researchMethodCpmk: { academicYearId } },
    include: criteriaInclude(),
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => normalizeCriteria(row, assessor));
}

export async function findCriteriaById(assessor, id, client = prisma) {
  const row = await criteriaDelegate(client, assessor).findUnique({
    where: { id },
    include: criteriaInclude(),
  });
  return row ? normalizeCriteria(row, assessor) : null;
}

export async function getNextCriteriaDisplayOrder(assessor, cpmkId, client = prisma) {
  const result = await criteriaDelegate(client, assessor).aggregate({
    where: { researchMethodCpmkId: cpmkId },
    _max: { displayOrder: true },
  });
  return (result._max.displayOrder ?? -1) + 1;
}

export async function createCriteria(assessor, data, client = prisma) {
  const row = await criteriaDelegate(client, assessor).create({
    data,
    include: criteriaInclude(),
  });
  return normalizeCriteria(row, assessor);
}

export async function updateCriteria(assessor, id, data, client = prisma) {
  const row = await criteriaDelegate(client, assessor).update({
    where: { id },
    data,
    include: criteriaInclude(),
  });
  return normalizeCriteria(row, assessor);
}

export function deleteCriteria(assessor, id, client = prisma) {
  return criteriaDelegate(client, assessor).delete({ where: { id } });
}

export function findRubricsByCriteria(assessor, criteriaId, client = prisma) {
  return rubricDelegate(client, assessor).findMany({
    where: { assessmentCriteriaId: criteriaId },
    orderBy: { displayOrder: "asc" },
  });
}

export function findRubricById(assessor, id, client = prisma) {
  return rubricDelegate(client, assessor).findUnique({
    where: { id },
    include: {
      assessmentCriteria: {
        select: { id: true, name: true, maxScore: true },
      },
    },
  });
}

export async function getNextRubricDisplayOrder(assessor, criteriaId, client = prisma) {
  const result = await rubricDelegate(client, assessor).aggregate({
    where: { assessmentCriteriaId: criteriaId },
    _max: { displayOrder: true },
  });
  return (result._max.displayOrder ?? -1) + 1;
}

export function createRubric(assessor, data, client = prisma) {
  return rubricDelegate(client, assessor).create({ data });
}

export function updateRubric(assessor, id, data, client = prisma) {
  return rubricDelegate(client, assessor).update({ where: { id }, data });
}

export function deleteRubric(assessor, id, client = prisma) {
  return rubricDelegate(client, assessor).delete({ where: { id } });
}

export async function findConfiguredCpmks(assessor, academicYearId, client = prisma) {
  const relation =
    assessor === "supervisor"
      ? "supervisorAssessmentCriterias"
      : "coordinatorAssessmentCriterias";

  const rows = await client.researchMethodCpmk.findMany({
    where: {
      academicYearId,
      [relation]: { some: {} },
    },
    include: {
      [relation]: {
        include: { assessmentRubrics: { orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    academicYearId: row.academicYearId,
    assessmentCriterias: row[relation].map((criteria) =>
      normalizeCriteria(criteria, assessor),
    ),
  }));
}

export function findCriteriaByCpmk(assessor, cpmkId, client = prisma) {
  return criteriaDelegate(client, assessor).findMany({
    where: { researchMethodCpmkId: cpmkId },
    select: { id: true },
  });
}

export async function removeConfigByCpmk(assessor, cpmkId) {
  return prisma.$transaction(async (tx) => {
    const criterias = await findCriteriaByCpmk(assessor, cpmkId, tx);
    const ids = criterias.map((row) => row.id);
    if (!ids.length) return { deletedCriteria: 0, deletedRubrics: 0 };

    const deletedRubrics = await rubricDelegate(tx, assessor).deleteMany({
      where: { assessmentCriteriaId: { in: ids } },
    });
    const deletedCriteria = await criteriaDelegate(tx, assessor).deleteMany({
      where: { id: { in: ids } },
    });
    return {
      deletedCriteria: deletedCriteria.count,
      deletedRubrics: deletedRubrics.count,
    };
  });
}

export async function getAssessorTotal(
  assessor,
  academicYearId,
  excludeCriteriaId = null,
  client = prisma,
) {
  const where = { researchMethodCpmk: { academicYearId } };
  if (excludeCriteriaId) where.id = { not: excludeCriteriaId };
  const result = await criteriaDelegate(client, assessor).aggregate({
    where,
    _sum: { maxScore: true },
  });
  return result._sum.maxScore || 0;
}

export async function getGlobalTotal(academicYearId, exclusions = {}, client = prisma) {
  const [supervisorTotal, coordinatorTotal] = await Promise.all([
    getAssessorTotal("supervisor", academicYearId, exclusions.supervisor, client),
    getAssessorTotal("coordinator", academicYearId, exclusions.coordinator, client),
  ]);
  return { supervisorTotal, coordinatorTotal, totalScore: supervisorTotal + coordinatorTotal };
}

export async function getWeightSummary(academicYearId, client = prisma) {
  const [supervisorCpmks, coordinatorCpmks, totals] = await Promise.all([
    findConfiguredCpmks("supervisor", academicYearId, client),
    findConfiguredCpmks("coordinator", academicYearId, client),
    getGlobalTotal(academicYearId, {}, client),
  ]);

  const summarize = (cpmks) =>
    cpmks.map((cpmk) => ({
      cpmkId: cpmk.id,
      cpmkCode: cpmk.code,
      cpmkDescription: cpmk.description,
      criteriaCount: cpmk.assessmentCriterias.length,
      criteriaScoreSum: cpmk.assessmentCriterias.reduce(
        (sum, criteria) => sum + criteria.maxScore,
        0,
      ),
      rubricCount: cpmk.assessmentCriterias.reduce(
        (sum, criteria) => sum + criteria.assessmentRubrics.length,
        0,
      ),
    }));

  return {
    ...totals,
    isComplete: totals.totalScore === 100,
    remainingScore: 100 - totals.totalScore,
    supervisor: summarize(supervisorCpmks),
    coordinator: summarize(coordinatorCpmks),
  };
}

export function reorderCriteria(assessor, orderedIds, client = prisma) {
  return client.$transaction(
    orderedIds.map((id, index) =>
      criteriaDelegate(client, assessor).update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}

export function reorderRubrics(assessor, orderedIds, client = prisma) {
  return client.$transaction(
    orderedIds.map((id, index) =>
      rubricDelegate(client, assessor).update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );
}
