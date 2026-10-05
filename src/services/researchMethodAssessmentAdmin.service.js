import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as repo from "../repositories/researchMethodAssessmentAdmin.repository.js";

const VALID_ASSESSORS = new Set(["supervisor", "coordinator"]);

export function requireAssessor(value) {
  const assessor = String(value || "").trim().toLowerCase();
  if (!VALID_ASSESSORS.has(assessor)) {
    throw new BadRequestError(
      "assessor wajib diisi dengan nilai supervisor atau coordinator",
    );
  }
  return assessor;
}

function requireAcademicYearId(value) {
  const academicYearId = typeof value === "string" ? value.trim() : "";
  if (!academicYearId) {
    throw new BadRequestError(
      "academicYearId wajib diisi agar konfigurasi tidak tercampur lintas periode.",
    );
  }
  return academicYearId;
}


function findOverlappingRubric(rubrics, minScore, maxScore, excludeId = null) {
  return rubrics.find(
    (rubric) =>
      rubric.id !== excludeId &&
      minScore <= rubric.maxScore &&
      maxScore >= rubric.minScore,
  );
}

function assertRubricRange(criteria, rubrics, minScore, maxScore, excludeId = null) {
  if (maxScore < minScore) {
    throw new BadRequestError(
      "Skor maksimal harus lebih besar atau sama dengan skor minimal",
    );
  }
  if (maxScore > criteria.maxScore) {
    throw new BadRequestError(
      "Skor maksimum rubrik tidak boleh melebihi skor maksimum kriteria (" +
        criteria.maxScore +
        ")",
    );
  }
  const overlap = findOverlappingRubric(
    rubrics,
    minScore,
    maxScore,
    excludeId,
  );
  if (overlap) {
    throw new BadRequestError(
      "Rentang rubrik tumpang tindih dengan rubrik " +
        overlap.minScore +
        "-" +
        overlap.maxScore,
    );
  }
}

async function ensureCpmk(id) {
  const cpmk = await repo.findCpmkById(id);
  if (!cpmk) throw new NotFoundError("CPMK Metode Penelitian tidak ditemukan");
  return cpmk;
}

async function ensureCriteria(assessor, id) {
  const criteria = await repo.findCriteriaById(assessor, id);
  if (!criteria) throw new NotFoundError("Kriteria penilaian tidak ditemukan");
  return criteria;
}

async function assertGlobalMaximum(
  academicYearId,
  assessor,
  maxScore,
  excludeCriteriaId = null,
) {
  const exclusions = excludeCriteriaId
    ? { [assessor]: excludeCriteriaId }
    : {};
  const totals = await repo.getGlobalTotal(academicYearId, exclusions);
  if (totals.totalScore + maxScore > 100) {
    throw new BadRequestError(
      "Jumlah skor maksimum seluruh kriteria Pembimbing dan Koordinator tidak boleh melebihi 100. Sisa skor tersedia: " +
        Math.max(0, 100 - totals.totalScore),
    );
  }
}

export async function listCpmks(academicYearIdInput) {
  return repo.findAllCpmks(requireAcademicYearId(academicYearIdInput));
}

export async function createCpmk(payload) {
  const academicYearId = requireAcademicYearId(payload.academicYearId);
  const code = String(payload.code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
  const description = String(payload.description || "").trim();
  const duplicate = await repo.findCpmkByCode(code, academicYearId);
  if (duplicate) {
    throw new BadRequestError("CPMK dengan kode " + code + " sudah ada");
  }
  return repo.createCpmk({ code, description, academicYearId });
}

export async function updateCpmk(id, payload) {
  const existing = await ensureCpmk(id);
  const code =
    payload.code === undefined
      ? undefined
      : String(payload.code).trim().toUpperCase().replace(/\s+/g, "-");
  const description =
    payload.description === undefined
      ? undefined
      : String(payload.description).trim();

  if (code && code !== existing.code) {
    const duplicate = await repo.findCpmkByCode(code, existing.academicYearId);
    if (duplicate && duplicate.id !== id) {
      throw new BadRequestError("CPMK dengan kode " + code + " sudah ada");
    }
  }

  return repo.updateCpmk(id, {
    ...(code !== undefined ? { code } : {}),
    ...(description !== undefined ? { description } : {}),
  });
}

export async function deleteCpmk(id) {
  await ensureCpmk(id);
  return repo.deleteCpmk(id);
}

export async function getConfiguredCpmks(assessorInput, academicYearIdInput) {
  const assessor = requireAssessor(assessorInput);
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  return repo.findConfiguredCpmks(assessor, academicYearId);
}

export async function createCriteria(assessorInput, payload) {
  const assessor = requireAssessor(assessorInput);
  const cpmk = await ensureCpmk(payload.researchMethodCpmkId);
  await assertGlobalMaximum(cpmk.academicYearId, assessor, payload.maxScore);

  const displayOrder =
    payload.displayOrder ??
    (await repo.getNextCriteriaDisplayOrder(assessor, cpmk.id));

  return repo.createCriteria(assessor, {
    researchMethodCpmkId: cpmk.id,
    name: payload.name.trim(),
    maxScore: payload.maxScore,
    displayOrder,
  });
}

export async function updateCriteria(assessorInput, id, payload) {
  const assessor = requireAssessor(assessorInput);
  const existing = await ensureCriteria(assessor, id);
  let cpmk = existing.researchMethodCpmk;
  if (payload.researchMethodCpmkId) {
    cpmk = await ensureCpmk(payload.researchMethodCpmkId);
    if (cpmk.academicYearId !== existing.researchMethodCpmk.academicYearId) {
      throw new BadRequestError(
        "Kriteria tidak dapat dipindahkan ke CPMK pada tahun ajaran berbeda.",
      );
    }
  }

  if (payload.maxScore !== undefined) {
    const rubricAboveMaximum = existing.assessmentRubrics?.find(
      (rubric) => rubric.maxScore > payload.maxScore,
    );
    if (rubricAboveMaximum) {
      throw new BadRequestError(
        "Skor maksimum kriteria tidak boleh lebih kecil dari rentang rubrik yang sudah ada.",
      );
    }
    await assertGlobalMaximum(
      cpmk.academicYearId,
      assessor,
      payload.maxScore,
      id,
    );
  }

  return repo.updateCriteria(assessor, id, {
    ...(payload.researchMethodCpmkId
      ? { researchMethodCpmkId: payload.researchMethodCpmkId }
      : {}),
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.maxScore !== undefined
      ? { maxScore: payload.maxScore }
      : {}),
    ...(payload.displayOrder !== undefined
      ? { displayOrder: payload.displayOrder }
      : {}),
  });
}

export async function deleteCriteria(assessorInput, id) {
  const assessor = requireAssessor(assessorInput);
  await ensureCriteria(assessor, id);
  return repo.deleteCriteria(assessor, id);
}

export async function removeCpmkConfig(
  assessorInput,
  cpmkId,
) {
  const assessor = requireAssessor(assessorInput);
  await ensureCpmk(cpmkId);
  return repo.removeConfigByCpmk(assessor, cpmkId);
}

export async function listRubrics(assessorInput, criteriaId) {
  const assessor = requireAssessor(assessorInput);
  await ensureCriteria(assessor, criteriaId);
  return repo.findRubricsByCriteria(assessor, criteriaId);
}

export async function createRubric(assessorInput, criteriaId, payload) {
  const assessor = requireAssessor(assessorInput);
  const criteria = await ensureCriteria(assessor, criteriaId);
  const rubrics = await repo.findRubricsByCriteria(assessor, criteriaId);
  assertRubricRange(
    criteria,
    rubrics,
    payload.minScore,
    payload.maxScore,
  );
  const displayOrder =
    payload.displayOrder ??
    (await repo.getNextRubricDisplayOrder(assessor, criteriaId));
  return repo.createRubric(assessor, {
    assessmentCriteriaId: criteriaId,
    minScore: payload.minScore,
    maxScore: payload.maxScore,
    description: payload.description.trim(),
    displayOrder,
  });
}

export async function updateRubric(assessorInput, id, payload) {
  const assessor = requireAssessor(assessorInput);
  const existing = await repo.findRubricById(assessor, id);
  if (!existing) throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  const criteria = await ensureCriteria(
    assessor,
    existing.assessmentCriteriaId,
  );
  const minScore = payload.minScore ?? existing.minScore;
  const maxScore = payload.maxScore ?? existing.maxScore;
  const rubrics = await repo.findRubricsByCriteria(
    assessor,
    existing.assessmentCriteriaId,
  );
  assertRubricRange(criteria, rubrics, minScore, maxScore, id);
  return repo.updateRubric(assessor, id, payload);
}

export async function deleteRubric(assessorInput, id) {
  const assessor = requireAssessor(assessorInput);
  const existing = await repo.findRubricById(assessor, id);
  if (!existing) throw new NotFoundError("Rubrik penilaian tidak ditemukan");
  await ensureCriteria(assessor, existing.assessmentCriteriaId);
  return repo.deleteRubric(assessor, id);
}

export async function getWeightSummary(academicYearIdInput) {
  return repo.getWeightSummary(requireAcademicYearId(academicYearIdInput));
}

function assertExactIds(actualRows, orderedIds, label) {
  const actualIds = new Set(actualRows.map((row) => row.id));
  const requestedIds = new Set(orderedIds);
  const hasExactMembers =
    actualIds.size === requestedIds.size &&
    requestedIds.size === orderedIds.length &&
    [...actualIds].every((id) => requestedIds.has(id));
  if (!hasExactMembers) {
    throw new BadRequestError(
      "Daftar urutan " + label + " tidak sesuai dengan konfigurasi yang dipilih.",
    );
  }
}

export async function reorderCriteria(assessorInput, payload) {
  const assessor = requireAssessor(assessorInput);
  const cpmk = await ensureCpmk(payload.cpmkId);
  const criterias = await repo.findCriteriaByCpmk(assessor, cpmk.id);
  assertExactIds(criterias, payload.orderedIds, "kriteria");
  return repo.reorderCriteria(assessor, payload.orderedIds);
}

export async function reorderRubrics(assessorInput, payload) {
  const assessor = requireAssessor(assessorInput);
  const criteria = await ensureCriteria(assessor, payload.criteriaId);
  const rubrics = await repo.findRubricsByCriteria(assessor, criteria.id);
  assertExactIds(rubrics, payload.orderedIds, "rubrik");
  return repo.reorderRubrics(assessor, payload.orderedIds);
}
