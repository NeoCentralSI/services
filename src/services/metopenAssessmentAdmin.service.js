import prisma from "../config/prisma.js";
import {
  BadRequestError,
  NotFoundError,
} from "../utils/errors.js";
import * as repo from "../repositories/metopenAssessmentAdmin.repository.js";

async function ensureResearchMethodCpmk(cpmkId) {
  const cpmk = await prisma.cpmk.findUnique({
    where: { id: cpmkId },
    select: { id: true, type: true, code: true, isActive: true },
  });

  if (!cpmk) {
    throw new NotFoundError("CPMK tidak ditemukan");
  }

  if (cpmk.type !== "research_method") {
    throw new BadRequestError("CPMK yang dipilih bukan CPMK Metopel");
  }

  return cpmk;
}

async function ensureMetopenCriteria(criteriaId) {
  const criteria = await repo.findCriteriaById(criteriaId);
  if (!criteria || criteria.isDeleted) {
    throw new NotFoundError("Kriteria penilaian tidak ditemukan");
  }

  if (criteria.appliesTo !== "metopen") {
    throw new BadRequestError("Kriteria ini bukan bagian dari penilaian Metopen");
  }

  return criteria;
}

export async function listCriteria(role = null) {
  return repo.findCriteria({ role });
}

export async function getCriteria(id) {
  return ensureMetopenCriteria(id);
}

export async function createCriteria(payload) {
  await ensureResearchMethodCpmk(payload.cpmkId);

  const displayOrder =
    payload.displayOrder ?? (await repo.getNextCriteriaDisplayOrder(payload.role));

  return repo.createCriteria({
    cpmkId: payload.cpmkId,
    name: payload.name,
    appliesTo: "metopen",
    role: payload.role,
    maxScore: payload.maxScore,
    displayOrder,
    isActive: payload.isActive ?? true,
  });
}

export async function updateCriteria(id, payload) {
  const existing = await ensureMetopenCriteria(id);

  if (payload.cpmkId) {
    await ensureResearchMethodCpmk(payload.cpmkId);
  }

  return repo.updateCriteria(id, {
    ...(payload.cpmkId !== undefined ? { cpmkId: payload.cpmkId } : {}),
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.role !== undefined ? { role: payload.role } : {}),
    ...(payload.maxScore !== undefined ? { maxScore: payload.maxScore } : {}),
    ...(payload.displayOrder !== undefined ? { displayOrder: payload.displayOrder } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    appliesTo: existing.appliesTo,
  });
}

export async function deleteCriteria(id) {
  await ensureMetopenCriteria(id);
  return repo.softDeleteCriteria(id);
}

export async function listRubrics(criteriaId) {
  await ensureMetopenCriteria(criteriaId);
  return repo.findRubricsByCriteria(criteriaId);
}

export async function createRubric(payload) {
  await ensureMetopenCriteria(payload.assessmentCriteriaId);

  const displayOrder =
    payload.displayOrder ??
    (await repo.getNextRubricDisplayOrder(payload.assessmentCriteriaId));

  return repo.createRubric({
    assessmentCriteriaId: payload.assessmentCriteriaId,
    minScore: payload.minScore,
    maxScore: payload.maxScore,
    description: payload.description,
    displayOrder,
  });
}

export async function updateRubric(id, payload) {
  const existing = await repo.findRubricById(id);
  if (!existing || existing.isDeleted) {
    throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  }

  if (payload.assessmentCriteriaId) {
    await ensureMetopenCriteria(payload.assessmentCriteriaId);
  }

  return repo.updateRubric(id, {
    ...(payload.assessmentCriteriaId !== undefined
      ? { assessmentCriteriaId: payload.assessmentCriteriaId }
      : {}),
    ...(payload.minScore !== undefined ? { minScore: payload.minScore } : {}),
    ...(payload.maxScore !== undefined ? { maxScore: payload.maxScore } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.displayOrder !== undefined ? { displayOrder: payload.displayOrder } : {}),
  });
}

export async function deleteRubric(id) {
  const existing = await repo.findRubricById(id);
  if (!existing || existing.isDeleted) {
    throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  }

  return repo.softDeleteRubric(id);
}
