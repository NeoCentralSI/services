import prisma from "../config/prisma.js";

const getCriteriaModel = (role) => {
    return role === "examiner" 
        ? prisma.thesisDefenceExaminerAssessmentCriteria 
        : prisma.thesisDefenceSupervisorAssessmentCriteria;
};

const getRubricModel = (role) => {
    return role === "examiner" 
        ? prisma.thesisDefenceExaminerAssessmentRubric 
        : prisma.thesisDefenceSupervisorAssessmentRubric;
};

const getCriteriaField = (role) => {
    return role === "examiner"
        ? "thesisDefenceExaminerAssessmentCriterias"
        : "thesisDefenceSupervisorAssessmentCriterias";
};

const getRubricField = (role) => {
    return "assessmentRubrics";
};

const getDetailModel = (role) => {
    return role === "examiner"
        ? prisma.thesisDefenceExaminerAssessmentDetail
        : prisma.thesisDefenceSupervisorAssessmentDetail;
};

const getDetailCriteriaIdField = (role) => {
    return "assessmentCriteriaId";
};

// ────────────────────────────────────────────
// Academic Year Query
// ────────────────────────────────────────────

export const updateDefenceMinimumScore = async (academicYearId, minimumScore) => {
    return await prisma.academicYear.update({
        where: { id: academicYearId },
        data: { thesisDefenceMinimumScore: minimumScore },
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

export const findConfiguredDefenceCpmks = async (role, academicYearId = null) => {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }

    const criteriaField = getCriteriaField(role);
    const rubricField = getRubricField(role);

    return await prisma.thesisCpmk.findMany({
        where,
        include: {
            [criteriaField]: {
                include: {
                    [rubricField]: {
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

export const getNextCriteriaDisplayOrder = async (thesisCpmkId, role) => {
    const model = getCriteriaModel(role);
    const last = await model.findFirst({
        where: { thesisCpmkId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
};

export const createCriteria = async (role, data) => {
    const model = getCriteriaModel(role);
    return await model.create({ data });
};

export const findCriteriaById = async (role, id) => {
    const model = getCriteriaModel(role);
    const rubricField = getRubricField(role);
    return await model.findUnique({
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
            [rubricField]: {
                orderBy: { displayOrder: "asc" },
            },
        },
    });
};

export const updateCriteria = async (role, id, data) => {
    const model = getCriteriaModel(role);
    return await model.update({
        where: { id },
        data,
    });
};

export const removeCriteriaWithRubrics = async (role, criteriaId) => {
    const criteriaModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentCriteria" : "thesisDefenceSupervisorAssessmentCriteria";
    const rubricModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentRubric" : "thesisDefenceSupervisorAssessmentRubric";
    const foreignKey = "assessmentCriteriaId";

    return await prisma.$transaction(async (tx) => {
        await tx[rubricModelName].deleteMany({
            where: { [foreignKey]: criteriaId },
        });
        return await tx[criteriaModelName].delete({ where: { id: criteriaId } });
    });
};

export const findDefenceCriteriaByCpmk = async (role, thesisCpmkId) => {
    const model = getCriteriaModel(role);
    return await model.findMany({
        where: { thesisCpmkId },
        select: { id: true },
    });
};

export const removeDefenceConfigByCpmk = async (role, thesisCpmkId) => {
    const criteriaModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentCriteria" : "thesisDefenceSupervisorAssessmentCriteria";
    const rubricModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentRubric" : "thesisDefenceSupervisorAssessmentRubric";
    const foreignKey = "assessmentCriteriaId";

    return await prisma.$transaction(async (tx) => {
        const criteriaRows = await tx[criteriaModelName].findMany({
            where: { thesisCpmkId },
            select: { id: true },
        });

        const criteriaIds = criteriaRows.map((row) => row.id);

        if (criteriaIds.length === 0) {
            return { deletedCriteria: 0, deletedRubrics: 0 };
        }

        const deletedRubrics = await tx[rubricModelName].deleteMany({
            where: { [foreignKey]: { in: criteriaIds } },
        });

        const deletedCriteria = await tx[criteriaModelName].deleteMany({
            where: { id: { in: criteriaIds } },
        });

        return {
            deletedCriteria: deletedCriteria.count,
            deletedRubrics: deletedRubrics.count,
        };
    });
};

export const criteriaHasAssessmentData = async (role, id) => {
    const detailModel = getDetailModel(role);
    const fk = getDetailCriteriaIdField(role);
    const count = await detailModel.count({
        where: { [fk]: id },
    });
    return count > 0;
};

export const hasAnyAssessmentDataForAcademicYear = async (academicYearId) => {
    const examinerCount = await prisma.thesisDefenceExaminerAssessmentDetail.count({
        where: {
            criteria: {
                thesisCpmk: {
                    academicYearId: academicYearId
                }
            }
        }
    });

    const supervisorCount = await prisma.thesisDefenceSupervisorAssessmentDetail.count({
        where: {
            criteria: {
                thesisCpmk: {
                    academicYearId: academicYearId
                }
            }
        }
    });

    return examinerCount > 0 || supervisorCount > 0;
};

// ────────────────────────────────────────────
// Assessment Rubric Items
// ────────────────────────────────────────────

export const findRubricById = async (role, id) => {
    const model = getRubricModel(role);
    const criteriaField = "assessmentCriteria";
    
    return await model.findUnique({
        where: { id },
        include: {
            [criteriaField]: {
                select: { id: true, name: true, maxScore: true, thesisCpmkId: true },
            },
        },
    });
};

export const createRubricTx = async (role, { criteriaId, data }) => {
    const criteriaModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentCriteria" : "thesisDefenceSupervisorAssessmentCriteria";
    const rubricModelName = role === "examiner" ? "thesisDefenceExaminerAssessmentRubric" : "thesisDefenceSupervisorAssessmentRubric";
    const foreignKey = "assessmentCriteriaId";

    return await prisma.$transaction(async (tx) => {
        const last = await tx[rubricModelName].findFirst({
            where: { [foreignKey]: criteriaId },
            orderBy: { displayOrder: "desc" },
            select: { displayOrder: true },
        });

        const displayOrder = (last?.displayOrder ?? 0) + 1;

        return await tx[rubricModelName].create({
            data: {
                [foreignKey]: criteriaId,
                description: data.description,
                minScore: data.minScore,
                maxScore: data.maxScore,
                displayOrder,
            },
        });
    });
};

export const updateRubric = async (role, id, data) => {
    const model = getRubricModel(role);
    return await model.update({ where: { id }, data });
};

export const removeRubric = async (role, id) => {
    const model = getRubricModel(role);
    return await model.delete({ where: { id } });
};

export const findRubricsByCriteria = async (role, criteriaId, excludeRubricId = null) => {
    const model = getRubricModel(role);
    const foreignKey = "assessmentCriteriaId";
    
    const where = { [foreignKey]: criteriaId };
    if (excludeRubricId) {
        where.id = { not: excludeRubricId };
    }

    return await model.findMany({
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

export const getActiveCriteriaTotalScore = async (role, excludeCriteriaId = null, academicYearId = null) => {
    const model = getCriteriaModel(role);
    const where = {
        thesisCpmk: academicYearId ? { academicYearId } : undefined,
    };
    if (excludeCriteriaId) {
        where.id = { not: excludeCriteriaId };
    }
    const result = await model.aggregate({
        where,
        _sum: { maxScore: true },
    });
    return result._sum.maxScore || 0;
};

export const reorderCriteria = async (role, thesisCpmkId, orderedIds) => {
    const modelName = role === "examiner" ? "thesisDefenceExaminerAssessmentCriteria" : "thesisDefenceSupervisorAssessmentCriteria";
    return await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma[modelName].update({
                where: { id },
                data: { displayOrder: index + 1 },
            })
        )
    );
};

export const reorderRubrics = async (role, criteriaId, orderedIds) => {
    const modelName = role === "examiner" ? "thesisDefenceExaminerAssessmentRubric" : "thesisDefenceSupervisorAssessmentRubric";
    return await prisma.$transaction(
        orderedIds.map((id, index) =>
            prisma[modelName].update({
                where: { id },
                data: { displayOrder: index + 1 },
            })
        )
    );
};

export const getDefenceWeightSummary = async (role, academicYearId = null) => {
    const criteriaField = getCriteriaField(role);
    const rubricField = getRubricField(role);

    const cpmkWhere = {
        ...(academicYearId ? { academicYearId } : {}),
    };

    const cpmks = await prisma.thesisCpmk.findMany({
        where: cpmkWhere,
        select: {
            id: true,
            code: true,
            description: true,
            [criteriaField]: {
                select: {
                    id: true,
                    name: true,
                    maxScore: true,
                    [rubricField]: { select: { id: true } },
                },
                orderBy: { displayOrder: "asc" },
            },
        },
        orderBy: { code: "asc" },
    });

    let totalCriteriaScore = 0;
    const details = cpmks.map((c) => {
        const criterias = c[criteriaField];
        const criteriaScore = criterias.reduce(
            (sum, cr) => sum + (cr.maxScore || 0),
            0,
        );

        totalCriteriaScore += criteriaScore;

        const rubricCount = criterias.reduce(
            (sum, cr) => sum + cr[rubricField].length,
            0,
        );

        return {
            cpmkId: c.id,
            cpmkCode: c.code,
            cpmkDescription: c.description,
            criteriaCount: criterias.length,
            criteriaScoreSum: criteriaScore,
            rubricCount,
        };
    });

    let activeAy = null;
    if (academicYearId) {
        activeAy = await prisma.academicYear.findUnique({
            where: { id: academicYearId },
            select: { thesisDefenceMinimumScore: true },
        });
    }

    return {
        totalScore: totalCriteriaScore,
        isComplete: totalCriteriaScore > 0,
        minimumScore: activeAy?.thesisDefenceMinimumScore || 0,
        details,
    };
};
