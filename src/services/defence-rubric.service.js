import * as repository from "../repositories/defence-rubric.repository.js";
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

const VALID_ROLES = ["examiner", "supervisor"];

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

const criteriaHasAssessmentDetails = async (role, criteriaId) => {
    return await repository.criteriaHasAssessmentData(role, criteriaId);
};

const mapCriteriaWithLock = async (role, criteria) => {
    const hasAssessmentDetails = await criteriaHasAssessmentDetails(role, criteria.id);
    return {
        ...criteria,
        hasAssessmentDetails,
        hasSubmittedScores: hasAssessmentDetails,
    };
};

const mapCpmkTreeWithLocks = async (role, cpmks) => {
    const criteriaField = role === "examiner" ? "thesisDefenceExaminerAssessmentCriterias" : "thesisDefenceSupervisorAssessmentCriterias";

    return await Promise.all(
        cpmks.map(async (cpmk) => {
            const criteriasWithLock = await Promise.all(
                cpmk[criteriaField].map((c) => mapCriteriaWithLock(role, c))
            );

            return {
                ...cpmk,
                hasAssessmentDetails: criteriasWithLock.some((c) => c.hasAssessmentDetails),
                assessmentCriterias: criteriasWithLock,
            };
        })
    );
};

const ensureRubricMutationAllowed = async (role, criteriaId) => {
    const hasAssessmentDetails = await criteriaHasAssessmentDetails(role, criteriaId);
    if (hasAssessmentDetails) {
        throw new ValidationError(
            "Rubrik tidak dapat diubah karena kriteria sudah memiliki detail penilaian turunan"
        );
    }
};

// ────────────────────────────────────────────
// Global validation helper (100 total across roles)
// ────────────────────────────────────────────

export const calculateDefenceTotals = async (academicYearId) => {
    const [examinerTotal, supervisorTotal] = await Promise.all([
        repository.getActiveCriteriaTotalScore("examiner", null, academicYearId),
        repository.getActiveCriteriaTotalScore("supervisor", null, academicYearId),
    ]);
    return {
        examinerTotal,
        supervisorTotal,
        combinedTotal: examinerTotal + supervisorTotal,
    };
};

// ────────────────────────────────────────────
// Service Methods
// ────────────────────────────────────────────

export const updateDefenceMinimumScore = async (academicYearId, minimumScore) => {
    const activeId = await resolveAcademicYearId(academicYearId);
    
    const hasData = await repository.hasAnyAssessmentDataForAcademicYear(activeId);
    if (hasData) {
        throw new ValidationError("Skor minimum tidak dapat diubah karena sudah ada data penilaian sidang pada tahun ajaran ini");
    }

    return await repository.updateDefenceMinimumScore(activeId, minimumScore);
};

export const getCpmksWithRubrics = async (role, { academicYearId } = {}) => {
    if (!VALID_ROLES.includes(role)) {
        throw new ValidationError("Role tidak valid");
    }

    const effectiveAcademicYearId = await resolveAcademicYearId(academicYearId);
    const cpmks = await repository.findConfiguredDefenceCpmks(role, effectiveAcademicYearId);

    return await mapCpmkTreeWithLocks(role, cpmks);
};

export const createCriteria = async (data) => {
    const cpmk = await repository.findThesisCpmkById(data.thesisCpmkId);
    if (!cpmk) {
        throw new NotFoundError("CPMK tidak ditemukan");
    }

    const totals = await calculateDefenceTotals(cpmk.academicYearId);
    if (totals.combinedTotal + data.maxScore > 100) {
        throw new ValidationError(
            `Total skor sidang gabungan (Pembimbing + Penguji) tidak boleh melebihi 100. ` +
            `Total saat ini: ${totals.combinedTotal} (Penguji: ${totals.examinerTotal}, Pembimbing: ${totals.supervisorTotal}).`
        );
    }

    const displayOrder = await repository.getNextCriteriaDisplayOrder(cpmk.id, data.role);

    return await repository.createCriteria(data.role, {
        thesisCpmkId: cpmk.id,
        name: data.name,
        maxScore: data.maxScore,
        displayOrder,
    });
};

export const updateCriteria = async (role, criteriaId, data) => {
    const criteria = await repository.findCriteriaById(role, criteriaId);
    ensureCriteriaExists(criteria);

    const hasAssessmentDetails = await criteriaHasAssessmentDetails(role, criteriaId);
    if (hasAssessmentDetails) {
        throw new ValidationError("Kriteria tidak dapat diubah karena sudah memiliki detail penilaian turunan");
    }

    if (data.maxScore !== undefined) {
        const otherRole = role === "examiner" ? "supervisor" : "examiner";
        const currentRoleTotalWithoutThis = await repository.getActiveCriteriaTotalScore(role, criteria.id, criteria.thesisCpmk.academicYearId);
        const otherRoleTotal = await repository.getActiveCriteriaTotalScore(otherRole, null, criteria.thesisCpmk.academicYearId);

        const newCombinedTotal = currentRoleTotalWithoutThis + otherRoleTotal + data.maxScore;

        if (newCombinedTotal > 100) {
            throw new ValidationError(
                `Total skor sidang gabungan (Pembimbing + Penguji) tidak boleh melebihi 100. ` +
                `Jika disimpan, total menjadi ${newCombinedTotal}.`
            );
        }

        const rubrics = await repository.findRubricsByCriteria(role, criteria.id);
        const hasExceedingRubric = rubrics.some((r) => r.maxScore > data.maxScore);

        if (hasExceedingRubric) {
            throw new ValidationError("Skor maksimal kriteria tidak boleh lebih kecil dari skor maksimal rubrik yang ada");
        }
    }

    return await repository.updateCriteria(role, criteriaId, data);
};

export const deleteCriteria = async (role, criteriaId) => {
    const criteria = await repository.findCriteriaById(role, criteriaId);
    ensureCriteriaExists(criteria);

    const hasAssessmentDetails = await criteriaHasAssessmentDetails(role, criteriaId);
    if (hasAssessmentDetails) {
        throw new ValidationError("Kriteria tidak dapat dihapus karena sudah memiliki detail penilaian turunan");
    }

    await repository.removeCriteriaWithRubrics(role, criteriaId);
    return { success: true };
};

export const removeDefenceCpmkConfig = async (role, cpmkId) => {
    const cpmk = await repository.findThesisCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    const criteriaList = await repository.findDefenceCriteriaByCpmk(role, cpmkId);
    const inUse = await Promise.all(criteriaList.map((c) => criteriaHasAssessmentDetails(role, c.id)));

    if (inUse.some((used) => used)) {
        throw new ValidationError("Konfigurasi CPMK tidak dapat dihapus karena salah satu kriterianya sudah memiliki detail penilaian turunan");
    }

    const result = await repository.removeDefenceConfigByCpmk(role, cpmkId);
    return { success: true, ...result };
};

export const createRubric = async (role, criteriaId, data) => {
    validateRange(data.minScore, data.maxScore);

    const criteria = await repository.findCriteriaById(role, criteriaId);
    ensureCriteriaExists(criteria);

    await ensureRubricMutationAllowed(role, criteriaId);

    if (data.maxScore > criteria.maxScore) {
        throw new ValidationError(`Skor maksimal rubrik (${data.maxScore}) melebihi bobot maksimal kriteria (${criteria.maxScore})`);
    }

    const existingRubrics = await repository.findRubricsByCriteria(role, criteriaId);
    if (hasOverlapRange(existingRubrics, data.minScore, data.maxScore)) {
        throw new ValidationError("Rentang skor tidak boleh tumpang tindih dengan rubrik yang sudah ada");
    }

    return await repository.createRubricTx(role, { criteriaId, data });
};

export const updateRubric = async (role, id, data) => {
    const rubric = await repository.findRubricById(role, id);
    if (!rubric) throw new NotFoundError("Rubrik tidak ditemukan");

    const criteria = rubric.thesisDefenceExaminerAssessmentCriteria || rubric.thesisDefenceSupervisorAssessmentCriteria;

    await ensureRubricMutationAllowed(role, criteria.id);

    const newMinScore = data.minScore !== undefined ? data.minScore : rubric.minScore;
    const newMaxScore = data.maxScore !== undefined ? data.maxScore : rubric.maxScore;

    validateRange(newMinScore, newMaxScore);

    if (newMaxScore > criteria.maxScore) {
        throw new ValidationError(`Skor maksimal rubrik (${newMaxScore}) melebihi bobot maksimal kriteria (${criteria.maxScore})`);
    }

    const existingRubrics = await repository.findRubricsByCriteria(role, criteria.id, id);
    if (hasOverlapRange(existingRubrics, newMinScore, newMaxScore)) {
        throw new ValidationError("Rentang skor tidak boleh tumpang tindih dengan rubrik yang sudah ada");
    }

    return await repository.updateRubric(role, id, data);
};

export const deleteRubric = async (role, id) => {
    const rubric = await repository.findRubricById(role, id);
    if (!rubric) throw new NotFoundError("Rubrik tidak ditemukan");

    const criteria = rubric.thesisDefenceExaminerAssessmentCriteria || rubric.thesisDefenceSupervisorAssessmentCriteria;

    await ensureRubricMutationAllowed(role, criteria.id);

    await repository.removeRubric(role, id);
    return { success: true };
};

export const reorderCriteria = async (role, data) => {
    return await repository.reorderCriteria(role, data.thesisCpmkId, data.orderedIds);
};

export const reorderRubrics = async (role, data) => {
    return await repository.reorderRubrics(role, data.criteriaId, data.orderedIds);
};

export const getWeightSummary = async (role, { academicYearId } = {}) => {
    const effectiveAcademicYearId = await resolveAcademicYearId(academicYearId);
    const summary = await repository.getDefenceWeightSummary(role, effectiveAcademicYearId);
    const totals = await calculateDefenceTotals(effectiveAcademicYearId);

    return {
        ...summary,
        examinerTotal: totals.examinerTotal,
        supervisorTotal: totals.supervisorTotal,
        combinedTotal: totals.combinedTotal,
    };
};

export const getTotalActiveScore = async () => {
    const activeAyId = await resolveAcademicYearId();
    const totals = await calculateDefenceTotals(activeAyId);
    return totals.combinedTotal;
};
