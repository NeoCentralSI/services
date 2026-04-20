import * as repository from "../repositories/seminarRubric.repository.js";
import { getActiveAcademicYearId } from "../helpers/academicYear.helper.js";
import prisma from "../config/prisma.js";

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

const SEMINAR_CONTEXT = "seminar";
const DEFAULT_ROLE = "default";

const resolveAcademicYearId = async (academicYearId) => {
    if (academicYearId) return academicYearId;
    return await getActiveAcademicYearId();
};

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

const ensureSeminarDefaultCriteria = (criteria) => {
    if (!criteria) {
        throw new NotFoundError("Kriteria tidak ditemukan");
    }

    if (criteria.appliesTo !== SEMINAR_CONTEXT || criteria.role !== DEFAULT_ROLE) {
        throw new ValidationError("Kriteria bukan bagian konfigurasi rubrik seminar default");
    }
};

const criteriaHasAssessmentDetails = async (criteriaId) => {
    const [seminarDetails, defenceDetails] = await Promise.all([
        prisma.thesisSeminarExaminerAssessmentDetail.count({
            where: { assessmentCriteriaId: criteriaId },
        }),
        prisma.thesisDefenceExaminerAssessmentDetail.count({
            where: { assessmentCriteriaId: criteriaId },
        }),
    ]);

    return seminarDetails + defenceDetails > 0;
};

const mapCriteriaWithLock = async (criteria) => {
    const hasAssessmentDetails = await criteriaHasAssessmentDetails(criteria.id);
    return {
        ...criteria,
        hasAssessmentDetails,
        hasSubmittedScores: hasAssessmentDetails,
    };
};

const mapCpmkTreeWithLocks = async (cpmks) => {
    return await Promise.all(
        cpmks.map(async (cpmk) => {
            const assessmentCriterias = await Promise.all(
                cpmk.assessmentCriterias.map(mapCriteriaWithLock)
            );

            return {
                ...cpmk,
                hasAssessmentDetails: assessmentCriterias.some((criteria) => criteria.hasAssessmentDetails),
                assessmentCriterias,
            };
        })
    );
};

const ensureRubricMutationAllowed = async (criteriaId) => {
    const hasAssessmentDetails = await criteriaHasAssessmentDetails(criteriaId);
    if (hasAssessmentDetails) {
        throw new ValidationError(
            "Rubrik tidak dapat diubah karena kriteria sudah memiliki detail penilaian turunan"
        );
    }
};

// ────────────────────────────────────────────
// CPMK Tree (configured only)
// ────────────────────────────────────────────

export const getCpmksWithRubrics = async ({ academicYearId } = {}) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(academicYearId);
    if (!resolvedAcademicYearId) return [];

    const cpmks = await repository.findConfiguredSeminarCpmks(resolvedAcademicYearId);
    return await mapCpmkTreeWithLocks(cpmks);
};

// ────────────────────────────────────────────
// Criteria CRUD
// ────────────────────────────────────────────

export const createCriteria = async (data) => {
    const cpmk = await repository.findCpmkById(data.cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");
    if (cpmk.type !== "thesis") {
        throw new ValidationError("Hanya CPMK bertipe thesis yang dapat digunakan");
    }

    if (!Number.isInteger(data.maxScore) || data.maxScore <= 0) {
        throw new ValidationError("Skor maksimal kriteria harus bilangan bulat lebih dari 0");
    }

    const displayOrder = await repository.getNextCriteriaDisplayOrder(data.cpmkId);

    const created = await repository.createCriteria({
        cpmkId: data.cpmkId,
        name: data.name ?? null,
        appliesTo: SEMINAR_CONTEXT,
        role: DEFAULT_ROLE,
        maxScore: data.maxScore,
        displayOrder,
    });
    return await mapCriteriaWithLock({
        ...created,
        assessmentRubrics: [],
    });
};

export const updateCriteria = async (criteriaId, data) => {
    const existing = await repository.findCriteriaById(criteriaId);
    ensureSeminarDefaultCriteria(existing);

    const updateData = {};
    const hasAssessmentDetails = await criteriaHasAssessmentDetails(criteriaId);

    if (data.name !== undefined) {
        updateData.name = data.name;
    }

    if (data.maxScore !== undefined) {
        if (hasAssessmentDetails) {
            throw new ValidationError(
                "Skor maksimal tidak dapat diubah karena kriteria sudah memiliki detail penilaian turunan"
            );
        }

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

        updateData.maxScore = data.maxScore;
    }

    if (Object.keys(updateData).length === 0) {
        throw new ValidationError("Tidak ada data yang diperbarui");
    }

    const updated = await repository.updateCriteria(criteriaId, updateData);
    return await mapCriteriaWithLock({
        ...updated,
        assessmentRubrics: existing.assessmentRubrics,
    });
};

export const deleteCriteria = async (criteriaId) => {
    const existing = await repository.findCriteriaById(criteriaId);
    ensureSeminarDefaultCriteria(existing);

    const hasData = await criteriaHasAssessmentDetails(criteriaId);
    if (hasData) {
        throw new ValidationError(
            "Kriteria tidak dapat dihapus karena sudah memiliki detail penilaian turunan"
        );
    }

    await repository.removeCriteriaWithRubrics(criteriaId);
};

export const removeSeminarCpmkConfig = async (cpmkId) => {
    const cpmk = await repository.findCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");
    if (cpmk.type !== "thesis") {
        throw new ValidationError("Hanya CPMK bertipe thesis yang dapat dikonfigurasi");
    }

    const criteriaRows = await repository.findSeminarDefaultCriteriaByCpmk(cpmkId);

    for (const criteria of criteriaRows) {
        const hasData = await criteriaHasAssessmentDetails(criteria.id);
        if (hasData) {
            throw new ValidationError(
                "Konfigurasi CPMK tidak dapat dihapus karena ada kriteria yang sudah memiliki detail penilaian turunan"
            );
        }
    }

    return await repository.removeSeminarConfigByCpmk(cpmkId);
};

// ────────────────────────────────────────────
// Rubric CRUD
// ────────────────────────────────────────────

export const createRubric = async (criteriaId, data) => {
    const criteria = await repository.findCriteriaById(criteriaId);
    ensureSeminarDefaultCriteria(criteria);
    await ensureRubricMutationAllowed(criteriaId);

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

    ensureSeminarDefaultCriteria(existing.assessmentCriteria);
    await ensureRubricMutationAllowed(existing.assessmentCriteria.id);

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

    ensureSeminarDefaultCriteria(existing.assessmentCriteria);
    await ensureRubricMutationAllowed(existing.assessmentCriteria.id);

    await repository.removeRubric(id);
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
    ensureSeminarDefaultCriteria(criteria);

    return await repository.reorderRubrics(data.criteriaId, data.orderedIds);
};

// ────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────

export const getWeightSummary = async ({ academicYearId } = {}) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(academicYearId);
    if (!resolvedAcademicYearId) {
        return {
            totalScore: 0,
            isComplete: false,
            details: [],
        };
    }

    return await repository.getSeminarWeightSummary(resolvedAcademicYearId);
};
