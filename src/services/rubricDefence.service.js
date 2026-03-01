import * as repository from "../repositories/rubricDefence.repository.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

const DEFENCE_CONTEXT = "defence";
const VALID_ROLES = ["examiner", "supervisor"];

const hasOverlapRange = (ranges, minScore, maxScore) => {
    return ranges.some((range) => {
        return !(maxScore < range.minScore || minScore > range.maxScore);
    });
};

const validateRange = (minScore, maxScore) => {
    if (minScore < 0) {
        throw new ValidationError("Skor minimum harus lebih besar atau sama dengan 0");
    }

    if (minScore > maxScore) {
        throw new ValidationError("Skor minimum harus lebih kecil atau sama dengan skor maksimum");
    }
};

const ensureDefenceCriteria = (criteria) => {
    if (!criteria) {
        throw new NotFoundError("Kriteria tidak ditemukan");
    }

    if (criteria.appliesTo !== DEFENCE_CONTEXT) {
        throw new ValidationError("Kriteria bukan bagian konfigurasi rubrik sidang");
    }

    if (!VALID_ROLES.includes(criteria.role)) {
        throw new ValidationError("Role kriteria tidak valid untuk konteks sidang");
    }
};

// ────────────────────────────────────────────
// CPMK Tree (configured only, per role)
// ────────────────────────────────────────────

export const getCpmksWithRubrics = async (role) => {
    return await repository.findConfiguredDefenceCpmks(role);
};

// ────────────────────────────────────────────
// Criteria CRUD
// ────────────────────────────────────────────

export const createCriteria = async (data) => {
    const cpmk = await repository.findCpmkById(data.cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");
    if (!cpmk.isActive) {
        throw new ValidationError("CPMK tidak aktif");
    }
    if (cpmk.type !== "thesis") {
        throw new ValidationError("Hanya CPMK bertipe thesis yang dapat digunakan");
    }

    if (!VALID_ROLES.includes(data.role)) {
        throw new ValidationError("Role tidak valid. Gunakan 'examiner' atau 'supervisor'");
    }

    if (!Number.isInteger(data.maxScore) || data.maxScore <= 0) {
        throw new ValidationError("Skor maksimal kriteria harus bilangan bulat lebih dari 0");
    }

    // Validate 100-point cap (shared across both roles)
    const currentTotal = await repository.getActiveCriteriaTotalScore();
    const remaining = 100 - currentTotal;
    if (data.maxScore > remaining) {
        throw new ValidationError(
            `Skor melebihi batas. Sisa skor yang tersedia: ${remaining} dari 100`
        );
    }

    const displayOrder = await repository.getNextCriteriaDisplayOrder(data.cpmkId, data.role);

    return await repository.createCriteria({
        cpmkId: data.cpmkId,
        name: data.name ?? null,
        appliesTo: DEFENCE_CONTEXT,
        role: data.role,
        maxScore: data.maxScore,
        displayOrder,
    });
};

export const updateCriteria = async (criteriaId, data) => {
    const existing = await repository.findCriteriaById(criteriaId);
    ensureDefenceCriteria(existing);

    const updateData = {};

    if (data.name !== undefined) {
        updateData.name = data.name;
    }

    if (data.maxScore !== undefined) {
        if (!Number.isInteger(data.maxScore) || data.maxScore <= 0) {
            throw new ValidationError("Skor maksimal kriteria harus bilangan bulat lebih dari 0");
        }

        const highestRubricMax = existing.assessmentRubrics.reduce(
            (max, rubric) => Math.max(max, rubric.maxScore),
            0,
        );

        if (highestRubricMax > data.maxScore) {
            throw new ValidationError(
                `Skor maksimal kriteria baru (${data.maxScore}) tidak boleh lebih kecil dari skor rubrik tertinggi (${highestRubricMax})`
            );
        }

        // Validate 100-point cap (exclude current criteria from total)
        if (existing.isActive) {
            const currentTotal = await repository.getActiveCriteriaTotalScore(criteriaId);
            const remaining = 100 - currentTotal;
            if (data.maxScore > remaining) {
                throw new ValidationError(
                    `Skor melebihi batas. Sisa skor yang tersedia: ${remaining} dari 100`
                );
            }
        }

        updateData.maxScore = data.maxScore;
    }

    if (Object.keys(updateData).length === 0) {
        throw new ValidationError("Tidak ada data yang diperbarui");
    }

    return await repository.updateCriteria(criteriaId, updateData);
};

export const deleteCriteria = async (criteriaId) => {
    const existing = await repository.findCriteriaById(criteriaId);
    ensureDefenceCriteria(existing);

    const hasData = await repository.criteriaHasAssessmentData(criteriaId);
    if (hasData) {
        throw new ValidationError(
            "Kriteria tidak dapat dihapus karena sudah digunakan pada data penilaian"
        );
    }

    await repository.removeCriteriaWithRubrics(criteriaId);
};

export const removeDefenceCpmkConfig = async (cpmkId, role) => {
    const cpmk = await repository.findCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");
    if (cpmk.type !== "thesis") {
        throw new ValidationError("Hanya CPMK bertipe thesis yang dapat dikonfigurasi");
    }

    if (!VALID_ROLES.includes(role)) {
        throw new ValidationError("Role tidak valid");
    }

    const criteriaRows = await repository.findDefenceCriteriaByCpmk(cpmkId, role);

    for (const criteria of criteriaRows) {
        const hasData = await repository.criteriaHasAssessmentData(criteria.id);
        if (hasData) {
            throw new ValidationError(
                "Konfigurasi CPMK tidak dapat dihapus karena ada kriteria yang sudah digunakan pada data penilaian"
            );
        }
    }

    return await repository.removeDefenceConfigByCpmk(cpmkId, role);
};

// ────────────────────────────────────────────
// Rubric CRUD
// ────────────────────────────────────────────

export const createRubric = async (criteriaId, data) => {
    const criteria = await repository.findCriteriaById(criteriaId);
    ensureDefenceCriteria(criteria);

    if (criteria.maxScore == null) {
        throw new ValidationError("Skor maksimal kriteria belum diatur");
    }

    validateRange(data.minScore, data.maxScore);

    if (data.maxScore > criteria.maxScore) {
        throw new ValidationError(
            `Skor maksimum rubrik (${data.maxScore}) tidak boleh melebihi skor maksimal kriteria (${criteria.maxScore})`
        );
    }

    const ranges = await repository.findRubricsByCriteria(criteriaId);
    if (hasOverlapRange(ranges, data.minScore, data.maxScore)) {
        throw new ValidationError("Rentang skor rubrik bertabrakan dengan rubrik lain");
    }

    return await repository.createRubricTx({ criteriaId, data });
};

export const updateRubric = async (id, data) => {
    const existing = await repository.findRubricById(id);
    if (!existing) throw new NotFoundError("Komponen rubrik tidak ditemukan");

    ensureDefenceCriteria(existing.assessmentCriteria);

    const updateData = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.minScore !== undefined) updateData.minScore = data.minScore;
    if (data.maxScore !== undefined) updateData.maxScore = data.maxScore;

    const newMin = data.minScore ?? existing.minScore;
    const newMax = data.maxScore ?? existing.maxScore;

    validateRange(newMin, newMax);

    const criteriaMaxScore = existing.assessmentCriteria.maxScore;
    if (criteriaMaxScore != null && newMax > criteriaMaxScore) {
        throw new ValidationError(
            `Skor maksimum rubrik (${newMax}) tidak boleh melebihi skor maksimal kriteria (${criteriaMaxScore})`
        );
    }

    const ranges = await repository.findRubricsByCriteria(
        existing.assessmentCriteriaId,
        existing.id,
    );
    if (hasOverlapRange(ranges, newMin, newMax)) {
        throw new ValidationError("Rentang skor rubrik bertabrakan dengan rubrik lain");
    }

    return await repository.updateRubric(id, updateData);
};

export const deleteRubric = async (id) => {
    const existing = await repository.findRubricById(id);
    if (!existing) throw new NotFoundError("Komponen rubrik tidak ditemukan");

    ensureDefenceCriteria(existing.assessmentCriteria);

    await repository.removeRubric(id);
};

// ────────────────────────────────────────────
// Toggle Criteria Active
// ────────────────────────────────────────────

export const toggleCriteriaActive = async (criteriaId, data) => {
    const existing = await repository.findCriteriaById(criteriaId);
    ensureDefenceCriteria(existing);

    // If activating, validate 100-point cap (shared across both roles)
    if (data.isActive && !existing.isActive) {
        const currentTotal = await repository.getActiveCriteriaTotalScore();
        const remaining = 100 - currentTotal;
        if ((existing.maxScore || 0) > remaining) {
            throw new ValidationError(
                `Tidak dapat mengaktifkan kriteria. Skor (${existing.maxScore}) melebihi sisa yang tersedia (${remaining} dari 100)`
            );
        }
    }

    return await repository.toggleCriteriaActive(criteriaId, data.isActive);
};

// ────────────────────────────────────────────
// Reorder
// ────────────────────────────────────────────

export const reorderCriteria = async (data) => {
    const cpmk = await repository.findCpmkById(data.cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    return await repository.reorderCriteria(data.cpmkId, data.orderedIds);
};

export const reorderRubrics = async (data) => {
    const criteria = await repository.findCriteriaById(data.criteriaId);
    ensureDefenceCriteria(criteria);

    return await repository.reorderRubrics(data.criteriaId, data.orderedIds);
};

// ────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────

export const getWeightSummary = async (role) => {
    return await repository.getDefenceWeightSummary(role);
};

/**
 * Get total active score across both roles (for frontend display).
 */
export const getTotalActiveScore = async () => {
    return await repository.getActiveCriteriaTotalScore();
};
