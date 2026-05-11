import {
  BadRequestError,
  NotFoundError,
} from "../utils/errors.js";
import * as repo from "../repositories/metopenAssessmentAdmin.repository.js";

const METOPEN_SCORE_CAP = { supervisor: 75, default: 25 };
const RESEARCH_METHOD_APPLIES_TO = new Set(["proposal", "metopen"]);
const SEMANTIC_CRITERIA_FIELDS = new Set(["cpmkId", "name", "role", "maxScore"]);

function hasSemanticCriteriaChange(payload) {
  return Object.keys(payload).some((key) => SEMANTIC_CRITERIA_FIELDS.has(key));
}

function findOverlappingRubric(rubrics, minScore, maxScore, excludeRubricId = null) {
  return rubrics.find((rubric) => (
    rubric.id !== excludeRubricId &&
    minScore <= rubric.maxScore &&
    maxScore >= rubric.minScore
  ));
}

function assertRubricRange(criteria, rubrics, minScore, maxScore, excludeRubricId = null) {
  if (maxScore < minScore) {
    throw new BadRequestError("Skor maksimal harus lebih besar atau sama dengan skor minimal");
  }

  if (criteria.maxScore != null && maxScore > criteria.maxScore) {
    throw new BadRequestError(
      `Skor maksimum rubrik tidak boleh melebihi skor maksimum kriteria (${criteria.maxScore})`,
    );
  }

  const overlap = findOverlappingRubric(rubrics, minScore, maxScore, excludeRubricId);
  if (overlap) {
    throw new BadRequestError(
      `Rentang rubrik tumpang tindih dengan rubrik ${overlap.minScore}-${overlap.maxScore}`,
    );
  }
}

async function ensureResearchMethodCpmk(cpmkId) {
  const cpmk = await repo.findCpmkById(cpmkId);

  if (!cpmk) {
    throw new NotFoundError("CPMK tidak ditemukan");
  }

  if (cpmk.type !== "research_method") {
    throw new BadRequestError("CPMK yang dipilih bukan CPMK Metode Penelitian (research_method)");
  }

  return cpmk;
}

async function ensureMetopenCriteria(criteriaId) {
  const criteria = await repo.findCriteriaById(criteriaId);
  if (!criteria || criteria.isDeleted) {
    throw new NotFoundError("Kriteria penilaian tidak ditemukan");
  }

  if (!RESEARCH_METHOD_APPLIES_TO.has(criteria.appliesTo)) {
    throw new BadRequestError("Kriteria ini bukan bagian dari penilaian proposal/TA-03 Metode Penelitian");
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

  const cap = METOPEN_SCORE_CAP[payload.role];
  if (cap != null) {
    const currentTotal = await repo.getActiveCriteriaTotalScore(payload.role);
    const remaining = cap - currentTotal;
    if (payload.maxScore > remaining) {
      throw new BadRequestError(
        `Skor melebihi batas ${payload.role === "supervisor" ? "TA-03A (75)" : "TA-03B (25)"}. Sisa skor yang tersedia: ${remaining}`,
      );
    }
  }

  const displayOrder =
    payload.displayOrder ?? (await repo.getNextCriteriaDisplayOrder(payload.role));

  return repo.createCriteria({
    cpmkId: payload.cpmkId,
    name: payload.name,
    appliesTo: "proposal",
    role: payload.role,
    maxScore: payload.maxScore,
    displayOrder,
    isActive: payload.isActive ?? true,
  });
}

export async function updateCriteria(id, payload) {
  const existing = await ensureMetopenCriteria(id);

  if (hasSemanticCriteriaChange(payload)) {
    const hasData = await repo.criteriaHasAssessmentData(id);
    if (hasData) {
      throw new BadRequestError(
        "Kriteria tidak dapat diubah maknanya karena sudah digunakan pada data penilaian Metode Penelitian",
      );
    }
  }

  if (payload.cpmkId) {
    await ensureResearchMethodCpmk(payload.cpmkId);
  }

  if (payload.maxScore !== undefined || payload.role !== undefined) {
    const role = payload.role ?? existing.role;
    const maxScore = payload.maxScore ?? existing.maxScore;
    const cap = METOPEN_SCORE_CAP[role];
    if (cap != null) {
      const currentTotal = await repo.getActiveCriteriaTotalScore(role, id);
      const remaining = cap - currentTotal;
      if (maxScore > remaining) {
        throw new BadRequestError(
          `Skor melebihi batas ${role === "supervisor" ? "TA-03A (75)" : "TA-03B (25)"}. Sisa skor yang tersedia: ${remaining}`,
        );
      }
    }
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
  const hasData = await repo.criteriaHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Kriteria tidak dapat dihapus karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }
  return repo.softDeleteCriteria(id);
}

export async function listRubrics(criteriaId) {
  await ensureMetopenCriteria(criteriaId);
  return repo.findRubricsByCriteria(criteriaId);
}

export async function createRubric(criteriaId, payload) {
  const criteria = await ensureMetopenCriteria(criteriaId);
  const rubrics = await repo.findRubricsByCriteria(criteriaId);
  assertRubricRange(criteria, rubrics, payload.minScore, payload.maxScore);

  const displayOrder =
    payload.displayOrder ??
    (await repo.getNextRubricDisplayOrder(criteriaId));

  return repo.createRubric({
    assessmentCriteriaId: criteriaId,
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
  const hasData = await repo.rubricHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Rubrik tidak dapat diubah karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }

  const criteria = await ensureMetopenCriteria(existing.assessmentCriteriaId);
  const minScore = payload.minScore ?? existing.minScore;
  const maxScore = payload.maxScore ?? existing.maxScore;
  const rubrics = await repo.findRubricsByCriteria(existing.assessmentCriteriaId);
  assertRubricRange(criteria, rubrics, minScore, maxScore, id);

  return repo.updateRubric(id, {
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
  const hasData = await repo.rubricHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Rubrik tidak dapat dihapus karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }

  return repo.softDeleteRubric(id);
}

export async function getCpmksWithRubrics(role = null) {
  return repo.findConfiguredMetopenCpmks(role);
}

export async function removeCpmkConfig(cpmkId, role) {
  await ensureResearchMethodCpmk(cpmkId);

  const criteriaRows = await repo.findMetopenCriteriaByCpmk(cpmkId, role);
  for (const criteria of criteriaRows) {
    const hasData = await repo.criteriaHasAssessmentData(criteria.id);
    if (hasData) {
      throw new BadRequestError(
        "Konfigurasi CPMK tidak dapat dihapus karena ada kriteria yang sudah digunakan pada data penilaian",
      );
    }
  }

  return repo.removeMetopenConfigByCpmk(cpmkId, role);
}

export async function getWeightSummary(role = null) {
  return repo.getMetopenWeightSummary(role);
}

export async function getTotalActiveScore() {
  const supervisorTotal = await repo.getActiveCriteriaTotalScore("supervisor");
  const defaultTotal = await repo.getActiveCriteriaTotalScore("default");
  return supervisorTotal + defaultTotal;
}

export async function reorderCriteria(data) {
  return repo.reorderCriteria(data.cpmkId, data.orderedIds);
}

export async function reorderRubrics(data) {
  return repo.reorderRubrics(data.criteriaId, data.orderedIds);
}
