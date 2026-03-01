import prisma from "../config/prisma.js";

// ────────────────────────────────────────────
// CPMK Queries
// ────────────────────────────────────────────

export const findCpmkById = async (id) => {
    return await prisma.cpmk.findUnique({
        where: { id },
        select: {
            id: true,
            code: true,
            description: true,
            type: true,
            isActive: true,
        },
    });
};

/**
 * Returns active thesis CPMKs that are already configured for seminar/default,
 * including criteria and rubrics.
 */
export const findConfiguredSeminarCpmks = async () => {
    return await prisma.cpmk.findMany({
        where: {
            type: "thesis",
            isActive: true,
            assessmentCriterias: {
                some: {
                    appliesTo: "seminar",
                    role: "default",
                },
            },
        },
        include: {
            assessmentCriterias: {
                where: {
                    appliesTo: "seminar",
                    role: "default",
                },
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
// Criteria Queries (seminar + default role)
// ────────────────────────────────────────────

export const getNextCriteriaDisplayOrder = async (cpmkId) => {
    const last = await prisma.assessmentCriteria.findFirst({
        where: {
            cpmkId,
            appliesTo: "seminar",
            role: "default",
        },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
};

export const createCriteria = async (data) => {
    return await prisma.assessmentCriteria.create({ data });
};

export const findCriteriaById = async (id) => {
    return await prisma.assessmentCriteria.findUnique({
        where: { id },
        include: {
            cpmk: {
                select: {
                    id: true,
                    code: true,
                    description: true,
                    type: true,
                    isActive: true,
                },
            },
            assessmentRubrics: {
                orderBy: { displayOrder: "asc" },
            },
        },
    });
};

export const updateCriteria = async (id, data) => {
    return await prisma.assessmentCriteria.update({
        where: { id },
        data,
    });
};

export const removeCriteria = async (id) => {
    return await prisma.assessmentCriteria.delete({ where: { id } });
};

export const removeCriteriaWithRubrics = async (criteriaId) => {
    return await prisma.$transaction(async (tx) => {
        await tx.assessmentRubric.deleteMany({
            where: { assessmentCriteriaId: criteriaId },
        });
        return await tx.assessmentCriteria.delete({ where: { id: criteriaId } });
    });
};

export const findSeminarDefaultCriteriaByCpmk = async (cpmkId) => {
    return await prisma.assessmentCriteria.findMany({
        where: {
            cpmkId,
            appliesTo: "seminar",
            role: "default",
        },
        select: { id: true },
    });
};

export const removeSeminarConfigByCpmk = async (cpmkId) => {
    return await prisma.$transaction(async (tx) => {
        const criteriaRows = await tx.assessmentCriteria.findMany({
            where: {
                cpmkId,
                appliesTo: "seminar",
                role: "default",
            },
            select: { id: true },
        });

        const criteriaIds = criteriaRows.map((row) => row.id);

        if (criteriaIds.length === 0) {
            return { deletedCriteria: 0, deletedRubrics: 0 };
        }

        const deletedRubrics = await tx.assessmentRubric.deleteMany({
            where: { assessmentCriteriaId: { in: criteriaIds } },
        });

        const deletedCriteria = await tx.assessmentCriteria.deleteMany({
            where: { id: { in: criteriaIds } },
        });

        return {
            deletedCriteria: deletedCriteria.count,
            deletedRubrics: deletedRubrics.count,
        };
    });
};

export const criteriaHasAssessmentData = async (id) => {
    const [seminar, defence, supervisor, researchMethod] = await Promise.all([
        prisma.thesisSeminarExaminerAssessmentDetail.count({
            where: { assessmentCriteriaId: id },
        }),
        prisma.thesisDefenceExaminerAssessmentDetail.count({
            where: { assessmentCriteriaId: id },
        }),
        prisma.thesisDefenceSupervisorAssessmentDetail.count({
            where: { assessmentCriteriaId: id },
        }),
        prisma.researchMethodScoreDetail.count({
            where: { assessmentCriteriaId: id },
        }),
    ]);
    return seminar + defence + supervisor + researchMethod > 0;
};

// ────────────────────────────────────────────
// Assessment Rubric Items
// ────────────────────────────────────────────

export const findRubricById = async (id) => {
    return await prisma.assessmentRubric.findUnique({
        where: { id },
        include: {
            assessmentCriteria: {
                select: { id: true, name: true, maxScore: true, cpmkId: true },
            },
        },
    });
};

export const createRubric = async (data) => {
    return await prisma.assessmentRubric.create({ data });
};

export const createRubricTx = async ({ criteriaId, data }) => {
    return await prisma.$transaction(async (tx) => {
        const last = await tx.assessmentRubric.findFirst({
            where: { assessmentCriteriaId: criteriaId },
            orderBy: { displayOrder: "desc" },
            select: { displayOrder: true },
        });

        const displayOrder = (last?.displayOrder ?? 0) + 1;

        return await tx.assessmentRubric.create({
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
    return await prisma.assessmentRubric.update({ where: { id }, data });
};

export const removeRubric = async (id) => {
    return await prisma.assessmentRubric.delete({ where: { id } });
};

export const getNextRubricDisplayOrder = async (criteriaId) => {
    const last = await prisma.assessmentRubric.findFirst({
        where: { assessmentCriteriaId: criteriaId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
};

export const countRubricsForCriteria = async (criteriaId) => {
    return await prisma.assessmentRubric.count({
        where: { assessmentCriteriaId: criteriaId },
    });
};

export const findRubricsByCriteria = async (criteriaId, excludeRubricId = null) => {
    const where = { assessmentCriteriaId: criteriaId };
    if (excludeRubricId) {
        where.id = { not: excludeRubricId };
    }

    return await prisma.assessmentRubric.findMany({
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
 * Get total maxScore of all active seminar/default criteria.
 * Optionally exclude a specific criteria (for update validation).
 */
export const getActiveCriteriaTotalScore = async (excludeCriteriaId = null) => {
    const where = {
        appliesTo: "seminar",
        role: "default",
        isActive: true,
    };
    if (excludeCriteriaId) {
        where.id = { not: excludeCriteriaId };
    }
    const result = await prisma.assessmentCriteria.aggregate({
        where,
        _sum: { maxScore: true },
    });
    return result._sum.maxScore || 0;
};

/**
 * Toggle isActive for a criteria.
 */
export const toggleCriteriaActive = async (id, isActive) => {
    return await prisma.assessmentCriteria.update({
        where: { id },
        data: { isActive },
    });
};

/**
 * Reorder criteria by setting displayOrder based on orderedIds index.
 */
export const reorderCriteria = async (cpmkId, orderedIds) => {
    return await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma.assessmentCriteria.update({
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
            prisma.assessmentRubric.update({
                where: { id },
                data: { displayOrder: index + 1 },
            })
        )
    );
};

export const getSeminarWeightSummary = async () => {
    const cpmks = await prisma.cpmk.findMany({
        where: {
            type: "thesis",
            isActive: true,
            assessmentCriterias: {
                some: {
                    appliesTo: "seminar",
                    role: "default",
                },
            },
        },
        select: {
            id: true,
            code: true,
            description: true,
            assessmentCriterias: {
                where: {
                    appliesTo: "seminar",
                    role: "default",
                },
                select: {
                    id: true,
                    name: true,
                    maxScore: true,
                    isActive: true,
                    assessmentRubrics: { select: { id: true } },
                },
                orderBy: { displayOrder: "asc" },
            },
        },
        orderBy: { code: "asc" },
    });

    let totalCriteriaScore = 0;
    const details = cpmks.map((c) => {
        const criteriaScore = c.assessmentCriterias
            .filter((criteria) => criteria.isActive)
            .reduce(
                (sum, criteria) => sum + (criteria.maxScore || 0),
                0,
            );

        totalCriteriaScore += criteriaScore;

        const rubricCount = c.assessmentCriterias.reduce(
            (sum, cr) => sum + cr.assessmentRubrics.length,
            0,
        );

        return {
            cpmkId: c.id,
            cpmkCode: c.code,
            cpmkDescription: c.description,
            criteriaCount: c.assessmentCriterias.length,
            criteriaScoreSum: criteriaScore,
            rubricCount,
        };
    });

    return {
        totalScore: totalCriteriaScore,
        isComplete: totalCriteriaScore > 0,
        details,
    };
};
