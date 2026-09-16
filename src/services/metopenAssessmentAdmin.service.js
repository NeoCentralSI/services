import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as repo from "../repositories/metopenAssessmentAdmin.repository.js";
import {
  getCapForRole,
  getCompositionForAcademicYear,
  resolveAcademicYearIdForCpmk,
  assertCompositionEditable,
} from "./metopenScoreComposition.service.js";

const SEMANTIC_CRITERIA_FIELDS = new Set(["metopenCpmkId", "name", "role", "maxScore"]);

function requireAcademicYearId(value) {
  const academicYearId = typeof value === "string" ? value.trim() : "";
  if (!academicYearId) {
    throw new BadRequestError(
      "academicYearId wajib diisi agar katalog rubrik tidak tercampur lintas periode.",
    );
  }
  return academicYearId;
}

function roleLabel(role) {
  return role === "supervisor" ? "TA-03A" : "TA-03B";
}

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

export async function listCriteria(role = null, academicYearIdInput = null) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  return repo.findCriteria({ role, academicYearId });
}

export async function getCriteria(id) {
  return ensureMetopenCriteria(id);
}

export async function createCriteria(payload) {
  const cpmk = await ensureMetopenCpmk(payload.metopenCpmkId);
  const academicYearId = await resolveAcademicYearIdForCpmk(cpmk);
  await assertCompositionEditable(academicYearId);
  const { cap } = await getCapForRole(payload.role, academicYearId);

  if (cap != null) {
    const currentTotal = await repo.getActiveCriteriaTotalScore(
      payload.role,
      academicYearId,
    );
    const remaining = cap - currentTotal;
    if (payload.maxScore > remaining) {
      throw new BadRequestError(
        `Skor melebihi batas ${roleLabel(payload.role)} (${cap}). Sisa skor yang tersedia: ${remaining}`,
      );
    }
  }

  const displayOrder =
    payload.displayOrder
    ?? (await repo.getNextCriteriaDisplayOrder(payload.role, academicYearId));

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
  await assertCompositionEditable(existing.metopenCpmk.academicYearId);

  if (hasSemanticCriteriaChange(payload)) {
    const hasData = await repo.criteriaHasAssessmentData(id);
    if (hasData) {
      throw new BadRequestError(
        "Kriteria tidak dapat diubah maknanya karena sudah digunakan pada data penilaian Metode Penelitian",
      );
    }
  }

  let cpmk = existing.metopenCpmk;
  if (payload.metopenCpmkId) {
    cpmk = await ensureMetopenCpmk(payload.metopenCpmkId);
  } else if (!cpmk?.academicYearId && existing.metopenCpmkId) {
    cpmk = await ensureMetopenCpmk(existing.metopenCpmkId);
  }

  if (payload.maxScore !== undefined || payload.role !== undefined) {
    const role = payload.role ?? existing.role;
    const maxScore = payload.maxScore ?? existing.maxScore;
    const academicYearId = await resolveAcademicYearIdForCpmk(cpmk);
    const { cap } = await getCapForRole(role, academicYearId);
    if (cap != null) {
      const currentTotal = await repo.getActiveCriteriaTotalScore(
        role,
        academicYearId,
        id,
      );
      const remaining = cap - currentTotal;
      if (maxScore > remaining) {
        throw new BadRequestError(
          `Skor melebihi batas ${roleLabel(role)} (${cap}). Sisa skor yang tersedia: ${remaining}`,
        );
      }
    }
  }

  return repo.updateCriteria(id, payload);
}

export async function deleteCriteria(id) {
  const existing = await ensureMetopenCriteria(id);
  await assertCompositionEditable(existing.metopenCpmk.academicYearId);
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
  await assertCompositionEditable(criteria.metopenCpmk.academicYearId);
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
  await assertCompositionEditable(criteria.metopenCpmk.academicYearId);
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
  const criteria = await ensureMetopenCriteria(existing.metopenAssessmentCriteriaId);
  await assertCompositionEditable(criteria.metopenCpmk.academicYearId);
  const hasData = await repo.rubricHasAssessmentData(id);
  if (hasData) {
    throw new BadRequestError(
      "Rubrik tidak dapat dihapus karena sudah digunakan pada data penilaian Metode Penelitian",
    );
  }

  return repo.deleteRubric(id);
}

export async function getCpmksWithRubrics(role = null, academicYearIdInput = null) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  return repo.findConfiguredMetopenCpmks(role, academicYearId);
}

export async function listAllMetopenCpmks(academicYearIdInput = null) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  return repo.findAllMetopenCpmks(academicYearId);
}

export async function createMetopenCpmk(payload) {
  const academicYearId = requireAcademicYearId(payload.academicYearId);
  await assertCompositionEditable(academicYearId);
  const code = String(payload.code || "").trim().toUpperCase().replace(/\s+/g, "-");
  const description = String(payload.description || "").trim();
  const existing = await repo.findMetopenCpmkByCode(code, academicYearId);
  if (existing) {
    throw new BadRequestError(`CPMK dengan kode '${code}' sudah ada`);
  }
  return repo.createMetopenCpmk({
    code,
    description,
    academicYearId,
  });
}

export async function updateMetopenCpmk(id, payload) {
  const existing = await ensureMetopenCpmk(id);
  await assertCompositionEditable(existing.academicYearId);
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
  const existing = await ensureMetopenCpmk(id);
  await assertCompositionEditable(existing.academicYearId);
  const hasScores = await repo.cpmkHasAssessmentData(id);
  if (hasScores) {
    throw new BadRequestError(
      "CPMK tidak dapat dihapus karena sudah dipakai pada data penilaian Metode Penelitian",
    );
  }
  return repo.deleteMetopenCpmk(id);
}

export async function removeCpmkConfig(cpmkId, role) {
  const cpmk = await ensureMetopenCpmk(cpmkId);
  await assertCompositionEditable(cpmk.academicYearId);

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

export async function getWeightSummary(role = null, academicYearIdInput = null) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const summary = await repo.getMetopenWeightSummary(role, academicYearId);
  const composition = await getCompositionForAcademicYear(academicYearId);
  return {
    ...summary,
    ta03aCap: composition?.ta03aCap ?? 75,
    ta03bCap: composition?.ta03bCap ?? 25,
    academicYearId: composition.academicYearId,
  };
}

export async function getTotalActiveScore(academicYearIdInput) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const supervisorTotal = await repo.getActiveCriteriaTotalScore(
    "supervisor",
    academicYearId,
  );
  const defaultTotal = await repo.getActiveCriteriaTotalScore(
    "default",
    academicYearId,
  );
  return supervisorTotal + defaultTotal;
}

export async function reorderCriteria(data) {
  const cpmk = await ensureMetopenCpmk(data.cpmkId);
  await assertCompositionEditable(cpmk.academicYearId);
  return repo.reorderCriteria(data.cpmkId, data.orderedIds);
}

export async function reorderRubrics(data) {
  const criteria = await ensureMetopenCriteria(data.criteriaId);
  await assertCompositionEditable(criteria.metopenCpmk.academicYearId);
  return repo.reorderRubrics(data.criteriaId, data.orderedIds);
}
