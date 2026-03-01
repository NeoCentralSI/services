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
 * Returns active thesis CPMKs that are already configured for defence + given role,
 * including criteria and rubrics.
 */
export const findConfiguredDefenceCpmks = async (role) => {
    return await prisma.cpmk.findMany({
        where: {
            type: "thesis",
            isActive: true,
            assessmentCriterias: {
                some: {
                    appliesTo: "defence",
                    role,
                },
            },
        },
        include: {
            assessmentCriterias: {
                where: {
                    appliesTo: "defence",
                    role,
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
// Criteria Queries (defence + role)
// ────────────────────────────────────────────

export const getNextCriteriaDisplayOrder = async (cpmkId, role) => {
    const last = await prisma.assessmentCriteria.findFirst({
        where: {
            cpmkId,
            appliesTo: "defence",
            role,
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

export const findDefenceCriteriaByCpmk = async (cpmkId, role) => {
    return await prisma.assessmentCriteria.findMany({
        where: {
            cpmkId,
            appliesTo: "defence",
            role,
        },
        select: { id: true },
    });
};

export const removeDefenceConfigByCpmk = async (cpmkId, role) => {
    return await prisma.$transaction(async (tx) => {
        const criteriaRows = await tx.assessmentCriteria.findMany({
            where: {
                cpmkId,
                appliesTo: "defence",
                role,
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
    const [defence, supervisor] = await Promise.all([
        prisma.thesisDefenceExaminerAssessmentDetail.count({
            where: { assessmentCriteriaId: id },
        }),
        prisma.thesisDefenceSupervisorAssessmentDetail.count({
            where: { assessmentCriteriaId: id },
        }),
    ]);
    return defence + supervisor > 0;
};

// ────────────────────────────────────────────
// Assessment Rubric Items
// ────────────────────────────────────────────

export const findRubricById = async (id) => {
    return await prisma.assessmentRubric.findUnique({
        where: { id },
        include: {
            assessmentCriteria: {
                select: {
                    id: true,
                    name: true,
                    maxScore: true,
                    cpmkId: true,
                    appliesTo: true,
                    role: true,
                },
            },
        },
    });
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
// Score Cap & Toggle
// ────────────────────────────────────────────

/**
 * Get total maxScore of all active defence criteria across BOTH roles.
 * The 100-point cap is shared between examiner and supervisor.
 */
export const getActiveCriteriaTotalScore = async (excludeCriteriaId = null) => {
    const where = {
        appliesTo: "defence",
        role: { in: ["examiner", "supervisor"] },
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

export const toggleCriteriaActive = async (id, isActive) => {
    return await prisma.assessmentCriteria.update({
        where: { id },
        data: { isActive },
    });
};

// ────────────────────────────────────────────
// Reorder
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────

export const getDefenceWeightSummary = async (role) => {
    const cpmks = await prisma.cpmk.findMany({
        where: {
            type: "thesis",
            isActive: true,
            assessmentCriterias: {
                some: {
                    appliesTo: "defence",
                    role,
                },
            },
        },
        select: {
            id: true,
            code: true,
            description: true,
            assessmentCriterias: {
                where: {
                    appliesTo: "defence",
                    role,
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
