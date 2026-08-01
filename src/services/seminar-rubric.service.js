import * as repository from "../repositories/seminar-rubric.repository.js";
import { getActiveAcademicYearId } from "../helpers/academicYear.helper.js";

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

const resolveAcademicYearId = async (academicYearId) => {
    if (academicYearId && academicYearId !== "undefined" && academicYearId !== "null") return academicYearId;
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

const ensureCriteriaExists = (criteria) => {
    if (!criteria) {
        throw new NotFoundError("Kriteria tidak ditemukan");
    }
};

const criteriaHasAssessmentDetails = async (criteriaId) => {
    return await repository.criteriaHasAssessmentData(criteriaId);
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
            const thesisSeminarAssessmentCriterias = await Promise.all(
                cpmk.thesisSeminarAssessmentCriterias.map(mapCriteriaWithLock)
            );

            return {
                ...cpmk,
                hasAssessmentDetails: thesisSeminarAssessmentCriterias.some((criteria) => criteria.hasAssessmentDetails),
                assessmentCriterias: thesisSeminarAssessmentCriterias, // Remap for frontend compatibility
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
// Service Methods
// ────────────────────────────────────────────

export const updateSeminarMinimumScore = async (academicYearId, minimumScore) => {
    const activeId = await resolveAcademicYearId(academicYearId);
    
    const hasData = await repository.hasAnyAssessmentDataForAcademicYear(activeId);
    if (hasData) {
        throw new ValidationError("Skor minimum tidak dapat diubah karena sudah ada data penilaian seminar pada tahun ajaran ini");
    }

    return await repository.updateSeminarMinimumScore(activeId, minimumScore);
};

export const getCpmksWithRubrics = async ({ academicYearId } = {}) => {
    const effectiveAcademicYearId = await resolveAcademicYearId(academicYearId);
    const cpmks = await repository.findConfiguredSeminarCpmks(effectiveAcademicYearId);
    
    return await mapCpmkTreeWithLocks(cpmks);
};

export const createCriteria = async (data) => {
    const cpmk = await repository.findThesisCpmkById(data.thesisCpmkId);
    if (!cpmk) {
        throw new NotFoundError("CPMK tidak ditemukan");
    }

    const currentTotalScore = await repository.getActiveCriteriaTotalScore(null, cpmk.academicYearId);
    if (currentTotalScore + data.maxScore > 100) {
        throw new ValidationError(`Total skor maksimal tidak boleh melebihi 100. Total skor saat ini: ${currentTotalScore}`);
    }

    const displayOrder = await repository.getNextCriteriaDisplayOrder(cpmk.id);

    return await repository.createCriteria({
        thesisCpmkId: cpmk.id,
        name: data.name,
        maxScore: data.maxScore,
        displayOrder,
    });
};

export const updateCriteria = async (criteriaId, data) => {
    const criteria = await repository.findCriteriaById(criteriaId);
    ensureCriteriaExists(criteria);

    const hasAssessmentDetails = await criteriaHasAssessmentDetails(criteriaId);
    if (hasAssessmentDetails && data.maxScore !== undefined) {
        throw new ValidationError("Kriteria tidak dapat diubah karena sudah memiliki detail penilaian turunan");
    }

    if (data.maxScore !== undefined) {
        const currentTotalScore = await repository.getActiveCriteriaTotalScore(criteria.id, criteria.thesisCpmk.academicYearId);
        if (currentTotalScore + data.maxScore > 100) {
            throw new ValidationError(`Total skor maksimal tidak boleh melebihi 100. Total skor kriteria lain: ${currentTotalScore}`);
        }

        const rubrics = await repository.findRubricsByCriteria(criteria.id);
        const hasExceedingRubric = rubrics.some((r) => r.maxScore > data.maxScore);

        if (hasExceedingRubric) {
            throw new ValidationError("Skor maksimal kriteria tidak boleh lebih kecil dari skor maksimal rubrik yang ada");
        }
    }

    return await repository.updateCriteria(criteriaId, data);
};

export const deleteCriteria = async (criteriaId) => {
    const criteria = await repository.findCriteriaById(criteriaId);
    ensureCriteriaExists(criteria);

    const hasAssessmentDetails = await criteriaHasAssessmentDetails(criteriaId);
    if (hasAssessmentDetails) {
        throw new ValidationError("Kriteria tidak dapat dihapus karena sudah memiliki detail penilaian turunan");
    }

    await repository.removeCriteriaWithRubrics(criteriaId);
    return { success: true };
};

export const removeSeminarCpmkConfig = async (cpmkId) => {
    const cpmk = await repository.findThesisCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    const criteriaList = await repository.findSeminarCriteriaByCpmk(cpmkId);
    const inUse = await Promise.all(criteriaList.map((c) => criteriaHasAssessmentDetails(c.id)));

    if (inUse.some((used) => used)) {
        throw new ValidationError("Konfigurasi CPMK tidak dapat dihapus karena salah satu kriterianya sudah memiliki detail penilaian turunan");
    }

    const result = await repository.removeSeminarConfigByCpmk(cpmkId);
    return { success: true, ...result };
};

export const createRubric = async (criteriaId, data) => {
    validateRange(data.minScore, data.maxScore);

    const criteria = await repository.findCriteriaById(criteriaId);
    ensureCriteriaExists(criteria);

    await ensureRubricMutationAllowed(criteriaId);

    if (data.maxScore > criteria.maxScore) {
        throw new ValidationError(`Skor maksimal rubrik (${data.maxScore}) melebihi bobot maksimal kriteria (${criteria.maxScore})`);
    }

    const existingRubrics = await repository.findRubricsByCriteria(criteriaId);
    if (hasOverlapRange(existingRubrics, data.minScore, data.maxScore)) {
        throw new ValidationError("Rentang skor tidak boleh tumpang tindih dengan rubrik yang sudah ada");
    }

    return await repository.createRubricTx({ criteriaId, data });
};

export const updateRubric = async (id, data) => {
    const rubric = await repository.findRubricById(id);
    if (!rubric) throw new NotFoundError("Rubrik tidak ditemukan");

    await ensureRubricMutationAllowed(rubric.assessmentCriteria.id);

    const newMinScore = data.minScore !== undefined ? data.minScore : rubric.minScore;
    const newMaxScore = data.maxScore !== undefined ? data.maxScore : rubric.maxScore;

    validateRange(newMinScore, newMaxScore);

    if (newMaxScore > rubric.assessmentCriteria.maxScore) {
        throw new ValidationError(`Skor maksimal rubrik (${newMaxScore}) melebihi bobot maksimal kriteria (${rubric.assessmentCriteria.maxScore})`);
    }

    const existingRubrics = await repository.findRubricsByCriteria(rubric.assessmentCriteria.id, id);
    if (hasOverlapRange(existingRubrics, newMinScore, newMaxScore)) {
        throw new ValidationError("Rentang skor tidak boleh tumpang tindih dengan rubrik yang sudah ada");
    }

    return await repository.updateRubric(id, data);
};

export const deleteRubric = async (id) => {
    const rubric = await repository.findRubricById(id);
    if (!rubric) throw new NotFoundError("Rubrik tidak ditemukan");

    await ensureRubricMutationAllowed(rubric.assessmentCriteria.id);

    await repository.removeRubric(id);
    return { success: true };
};

export const reorderCriteria = async (data) => {
    const criteriaList = await repository.findSeminarCriteriaByCpmk(data.thesisCpmkId);
    if (criteriaList.length !== data.orderedIds.length ||
        !data.orderedIds.every((id) => criteriaList.some((criteria) => criteria.id === id))) {
        throw new ValidationError("Urutan kriteria tidak sesuai dengan CPMK");
    }

    const inUse = await Promise.all(criteriaList.map((criteria) => criteriaHasAssessmentDetails(criteria.id)));
    if (inUse.some(Boolean)) {
        throw new ValidationError("Urutan kriteria tidak dapat diubah karena sudah memiliki detail penilaian");
    }

    return await repository.reorderCriteria(data.thesisCpmkId, data.orderedIds);
};

export const reorderRubrics = async (data) => {
    const criteria = await repository.findCriteriaById(data.criteriaId);
    ensureCriteriaExists(criteria);
    await ensureRubricMutationAllowed(data.criteriaId);

    const rubrics = await repository.findRubricsByCriteria(data.criteriaId);
    if (rubrics.length !== data.orderedIds.length ||
        !data.orderedIds.every((id) => rubrics.some((rubric) => rubric.id === id))) {
        throw new ValidationError("Urutan rubrik tidak sesuai dengan kriteria");
    }

    return await repository.reorderRubrics(data.criteriaId, data.orderedIds);
};

export const getWeightSummary = async ({ academicYearId } = {}) => {
    const effectiveAcademicYearId = await resolveAcademicYearId(academicYearId);
    return await repository.getSeminarWeightSummary(effectiveAcademicYearId);
};
