import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as repo from "../repositories/metopenAssessmentAdmin.repository.js";

const METOPEN_SCORE_CAP = { supervisor: 75, default: 25 };
const SEMANTIC_CRITERIA_FIELDS = new Set(["metopenCpmkId", "name", "role", "maxScore"]);

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

async function ensureMetopenCpmk(cpmkId) {
  const cpmk = await repo.findCpmkById(cpmkId);
  if (!cpmk) {
    throw new NotFoundError("CPMK tidak ditemukan");
  }
  return cpmk;
}

async function ensureMetopenCriteria(criteriaId) {
  const criteria = await repo.findCriteriaById(criteriaId);
  if (!criteria) {
    throw new NotFoundError("Kriteria penilaian tidak ditemukan");
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
  await ensureMetopenCpmk(payload.metopenCpmkId);

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
    metopenCpmkId: payload.metopenCpmkId,
    name: payload.name,
    role: payload.role,
    maxScore: payload.maxScore,
    displayOrder,
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

  if (payload.metopenCpmkId) {
    await ensureMetopenCpmk(payload.metopenCpmkId);
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

  return repo.updateCriteria(id, payload);
}

export async function deleteCriteria(id) {
  await ensureMetopenCriteria(id);
  const hasData = await repo.criteriaHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Kriteria tidak dapat dihapus karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }
  return repo.deleteCriteria(id);
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
    metopenAssessmentCriteriaId: criteriaId,
    minScore: payload.minScore,
    maxScore: payload.maxScore,
    description: payload.description,
    displayOrder,
  });
}

export async function updateRubric(id, payload) {
  const existing = await repo.findRubricById(id);
  if (!existing) {
    throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  }

  const criteria = await ensureMetopenCriteria(existing.metopenAssessmentCriteriaId);
  const minScore = payload.minScore ?? existing.minScore;
  const maxScore = payload.maxScore ?? existing.maxScore;
  const rubrics = await repo.findRubricsByCriteria(existing.metopenAssessmentCriteriaId);
  assertRubricRange(criteria, rubrics, minScore, maxScore, id);

  return repo.updateRubric(id, payload);
}

export async function deleteRubric(id) {
  const existing = await repo.findRubricById(id);
  if (!existing) {
    throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  }
  const hasData = await repo.rubricHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Rubrik tidak dapat dihapus karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }

  return repo.deleteRubric(id);
}

export async function getCpmksWithRubrics(role = null) {
  return repo.findConfiguredMetopenCpmks(role);
}

export async function listAllMetopenCpmks(academicYearId = null) {
  return repo.findAllMetopenCpmks(academicYearId);
}

export async function createMetopenCpmk(payload) {
  const code = String(payload.code || "").trim().toUpperCase().replace(/\s+/g, "-");
  const description = String(payload.description || "").trim();
  const existing = await repo.findMetopenCpmkByCode(code, payload.academicYearId || null);
  if (existing) {
    throw new BadRequestError(`CPMK dengan kode '${code}' sudah ada`);
  }
  return repo.createMetopenCpmk({
    code,
    description,
    academicYearId: payload.academicYearId || null,
  });
}

export async function updateMetopenCpmk(id, payload) {
  const existing = await ensureMetopenCpmk(id);
  const hasScores = await repo.cpmkHasAssessmentData(id);

  const nextCode =
    payload.code !== undefined
      ? String(payload.code).trim().toUpperCase().replace(/\s+/g, "-")
      : undefined;
  const nextDescription =
    payload.description !== undefined ? String(payload.description).trim() : undefined;

  if (nextCode && nextCode !== existing.code) {
    if (hasScores) {
      throw new BadRequestError(
        "Kode CPMK tidak dapat diubah karena sudah dipakai pada data penilaian Metode Penelitian",
      );
    }
    const duplicate = await repo.findMetopenCpmkByCode(nextCode, existing.academicYearId || null);
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestError(`CPMK dengan kode '${nextCode}' sudah ada`);
    }
  }

  return repo.updateMetopenCpmk(id, {
    ...(nextCode ? { code: nextCode } : {}),
    ...(nextDescription !== undefined ? { description: nextDescription } : {}),
  });
}

export async function deleteMetopenCpmk(id) {
  await ensureMetopenCpmk(id);
  const hasScores = await repo.cpmkHasAssessmentData(id);
  if (hasScores) {
    throw new BadRequestError(
      "CPMK tidak dapat dihapus karena sudah dipakai pada data penilaian Metode Penelitian",
    );
  }
  return repo.deleteMetopenCpmk(id);
}

export async function removeCpmkConfig(cpmkId, role) {
  await ensureMetopenCpmk(cpmkId);

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
