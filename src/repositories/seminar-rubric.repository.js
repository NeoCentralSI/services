import prisma from "../config/prisma.js";

// ────────────────────────────────────────────
// Academic Year Query
// ────────────────────────────────────────────

export const updateSeminarMinimumScore = async (academicYearId, minimumScore) => {
    return await prisma.academicYear.update({
        where: { id: academicYearId },
        data: { thesisSeminarMinimumScore: minimumScore },
    });
};

// ────────────────────────────────────────────
// CPMK Queries
// ────────────────────────────────────────────

export const findThesisCpmkById = async (id) => {
    return await prisma.thesisCpmk.findUnique({
        where: { id },
        select: {
            id: true,
            code: true,
            description: true,
            academicYearId: true,
        },
    });
};

/**
 * Returns active thesis CPMKs that are already configured for seminar,
 * including criteria and rubrics.
 */
export const findConfiguredSeminarCpmks = async (academicYearId = null) => {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }

    return await prisma.thesisCpmk.findMany({
        where,
        include: {
            thesisSeminarAssessmentCriterias: {
                include: {
                    assessmentRubrics: {
                        orderBy: { displayOrder: "asc" },
                    },
                },
                orderBy: { displayOrder: "asc" },
            },
        },
        orderBy: { code: "asc" },
    });
};

// ────────────────────────────────────────────
// Criteria Queries
// ────────────────────────────────────────────

export const getNextCriteriaDisplayOrder = async (thesisCpmkId) => {
    const last = await prisma.thesisSeminarAssessmentCriteria.findFirst({
        where: { thesisCpmkId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
};

export const createCriteria = async (data) => {
    return await prisma.thesisSeminarAssessmentCriteria.create({ data });
};

export const findCriteriaById = async (id) => {
    return await prisma.thesisSeminarAssessmentCriteria.findUnique({
        where: { id },
        include: {
            thesisCpmk: {
                select: {
                    id: true,
                    code: true,
                    description: true,
                    academicYearId: true,
                },
            },
            assessmentRubrics: {
                orderBy: { displayOrder: "asc" },
            },
        },
    });
};

export const updateCriteria = async (id, data) => {
    return await prisma.thesisSeminarAssessmentCriteria.update({
        where: { id },
        data,
    });
};

export const removeCriteria = async (id) => {
    return await prisma.thesisSeminarAssessmentCriteria.delete({ where: { id } });
};

export const removeCriteriaWithRubrics = async (criteriaId) => {
    return await prisma.$transaction(async (tx) => {
        await tx.thesisSeminarAssessmentRubric.deleteMany({
            where: { assessmentCriteriaId: criteriaId },
        });
        return await tx.thesisSeminarAssessmentCriteria.delete({ where: { id: criteriaId } });
    });
};

export const findSeminarCriteriaByCpmk = async (thesisCpmkId) => {
    return await prisma.thesisSeminarAssessmentCriteria.findMany({
        where: { thesisCpmkId },
        select: { id: true },
    });
};

export const removeSeminarConfigByCpmk = async (thesisCpmkId) => {
    return await prisma.$transaction(async (tx) => {
        const criteriaRows = await tx.thesisSeminarAssessmentCriteria.findMany({
            where: { thesisCpmkId },
            select: { id: true },
        });

        const criteriaIds = criteriaRows.map((row) => row.id);

        if (criteriaIds.length === 0) {
            return { deletedCriteria: 0, deletedRubrics: 0 };
        }

        const deletedRubrics = await tx.thesisSeminarAssessmentRubric.deleteMany({
            where: { assessmentCriteriaId: { in: criteriaIds } },
        });

        const deletedCriteria = await tx.thesisSeminarAssessmentCriteria.deleteMany({
            where: { id: { in: criteriaIds } },
        });

        return {
            deletedCriteria: deletedCriteria.count,
            deletedRubrics: deletedRubrics.count,
        };
    });
};

export const criteriaHasAssessmentData = async (id) => {
    const seminarCount = await prisma.thesisSeminarExaminerAssessmentDetail.count({
        where: { assessmentCriteriaId: id },
    });
    return seminarCount > 0;
};

export const hasAnyAssessmentDataForAcademicYear = async (academicYearId) => {
    const count = await prisma.thesisSeminarExaminerAssessmentDetail.count({
        where: {
            criteria: {
                thesisCpmk: {
                    academicYearId: academicYearId
                }
            }
        }
    });
    return count > 0;
};

// ────────────────────────────────────────────
// Assessment Rubric Items
// ────────────────────────────────────────────

export const findRubricById = async (id) => {
    return await prisma.thesisSeminarAssessmentRubric.findUnique({
        where: { id },
        include: {
            assessmentCriteria: {
                select: { id: true, name: true, maxScore: true, thesisCpmkId: true },
            },
        },
    });
};

export const createRubric = async (data) => {
    return await prisma.thesisSeminarAssessmentRubric.create({ data });
};

export const createRubricTx = async ({ criteriaId, data }) => {
    return await prisma.$transaction(async (tx) => {
        const last = await tx.thesisSeminarAssessmentRubric.findFirst({
            where: { assessmentCriteriaId: criteriaId },
            orderBy: { displayOrder: "desc" },
            select: { displayOrder: true },
        });

        const displayOrder = (last?.displayOrder ?? 0) + 1;

        return await tx.thesisSeminarAssessmentRubric.create({
            data: {
                assessmentCriteriaId: criteriaId,
                description: data.description,
                minScore: data.minScore,
                maxScore: data.maxScore,
                displayOrder,
            },
        });
    });
};

export const updateRubric = async (id, data) => {
    return await prisma.thesisSeminarAssessmentRubric.update({ where: { id }, data });
};

export const removeRubric = async (id) => {
    return await prisma.thesisSeminarAssessmentRubric.delete({ where: { id } });
};

export const getNextRubricDisplayOrder = async (criteriaId) => {
    const last = await prisma.thesisSeminarAssessmentRubric.findFirst({
        where: { assessmentCriteriaId: criteriaId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
};

export const countRubricsForCriteria = async (criteriaId) => {
    return await prisma.thesisSeminarAssessmentRubric.count({
        where: { assessmentCriteriaId: criteriaId },
    });
};

export const findRubricsByCriteria = async (criteriaId, excludeRubricId = null) => {
    const where = { assessmentCriteriaId: criteriaId };
    if (excludeRubricId) {
        where.id = { not: excludeRubricId };
    }

    return await prisma.thesisSeminarAssessmentRubric.findMany({
        where,
        select: {
            id: true,
            minScore: true,
            maxScore: true,
        },
        orderBy: { displayOrder: "asc" },
    });
};

// ────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────

/**
 * Get total maxScore of all seminar criteria.
 * Optionally exclude a specific criteria (for update validation).
 */
export const getActiveCriteriaTotalScore = async (excludeCriteriaId = null, academicYearId = null) => {
    const where = {
        thesisCpmk: academicYearId ? { academicYearId } : undefined,
    };
    if (excludeCriteriaId) {
        where.id = { not: excludeCriteriaId };
    }
    const result = await prisma.thesisSeminarAssessmentCriteria.aggregate({
        where,
        _sum: { maxScore: true },
    });
    return result._sum.maxScore || 0;
};

/**
 * Reorder criteria by setting displayOrder based on orderedIds index.
 */
export const reorderCriteria = async (thesisCpmkId, orderedIds) => {
    return await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.thesisSeminarAssessmentCriteria.update({
                where: { id },
                data: { displayOrder: index + 1 },
            })
        )
    );
};

/**
 * Reorder rubrics by setting displayOrder based on orderedIds index.
 */
export const reorderRubrics = async (criteriaId, orderedIds) => {
    return await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.thesisSeminarAssessmentRubric.update({
                where: { id },
                data: { displayOrder: index + 1 },
            })
        )
    );
};

export const getSeminarWeightSummary = async (academicYearId = null) => {
    const cpmkWhere = {
        ...(academicYearId ? { academicYearId } : {}),
    };

    const cpmks = await prisma.thesisCpmk.findMany({
        where: cpmkWhere,
        select: {
            id: true,
            code: true,
            description: true,
            thesisSeminarAssessmentCriterias: {
                select: {
                    id: true,
                    name: true,
                    maxScore: true,
                    assessmentRubrics: { select: { id: true } },
                },
                orderBy: { displayOrder: "asc" },
            },
        },
        orderBy: { code: "asc" },
    });

    let totalCriteriaScore = 0;
    const details = cpmks.map((c) => {
        const criteriaScore = c.thesisSeminarAssessmentCriterias.reduce(
            (sum, criteria) => sum + (criteria.maxScore || 0),
            0,
        );

        totalCriteriaScore += criteriaScore;

        const rubricCount = c.thesisSeminarAssessmentCriterias.reduce(
            (sum, cr) => sum + cr.assessmentRubrics.length,
            0,
        );

        return {
            cpmkId: c.id,
            cpmkCode: c.code,
            cpmkDescription: c.description,
            criteriaCount: c.thesisSeminarAssessmentCriterias.length,
            criteriaScoreSum: criteriaScore,
            rubricCount,
        };
    });

    let activeAy = null;
    if (academicYearId) {
        activeAy = await prisma.academicYear.findUnique({
            where: { id: academicYearId },
            select: { thesisSeminarMinimumScore: true },
        });
    }

    return {
        totalScore: totalCriteriaScore,
        isComplete: totalCriteriaScore === 100,
        minimumScore: activeAy?.thesisSeminarMinimumScore || 0,
        details,
    };
};
