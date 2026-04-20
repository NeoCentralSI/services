import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId = null } = {}) => {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }

    return await prisma.cpmk.findMany({
        where,
        include: {
            academicYear: {
                select: {
                    id: true,
                    semester: true,
                    year: true,
                    isActive: true,
                },
            },
            _count: {
                select: {
                    assessmentCriterias: true,
                },
            },
        },
        orderBy: { code: "asc" },
    });
};

export const findById = async (id) => {
    return await prisma.cpmk.findUnique({
        where: { id },
        include: {
            academicYear: {
                select: {
                    id: true,
                    semester: true,
                    year: true,
                    isActive: true,
                },
            },
            _count: {
                select: {
                    assessmentCriterias: true,
                },
            },
        },
    });
};

export const findByCode = async (code, type, academicYearId, excludeId = null) => {
    const where = {
        code,
        type,
        academicYearId,
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.cpmk.findFirst({ where });
};

export const create = async (data) => {
    return await prisma.cpmk.create({ data });
};

export const update = async (id, data) => {
    return await prisma.cpmk.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.cpmk.delete({
        where: { id },
    });
};

export const hasRelatedData = async (id) => {
    const count = await prisma.assessmentCriteria.count({ where: { cpmkId: id } });
    return count > 0;
};

export const findCpmksWithCriteriaRubrics = async ({
    academicYearId,
    appliesTo,
    role = null,
    type = "thesis",
}) => {
    const criteriaWhere = {
        appliesTo,
    };

    if (role) {
        criteriaWhere.role = role;
    }

    return await prisma.cpmk.findMany({
        where: {
            academicYearId,
            type,
        },
        include: {
            assessmentCriterias: {
                where: criteriaWhere,
                include: {
                    assessmentRubrics: {
                        orderBy: { displayOrder: "asc" },
                    },
                },
                orderBy: { displayOrder: "asc" },
            },
            _count: {
                select: {
                    assessmentCriterias: true,
                },
            },
        },
        orderBy: {
            code: "asc",
        },
    });
};

export const copyTemplateAcrossAcademicYears = async ({
    sourceAcademicYearId,
    targetAcademicYearId,
}) => {
    return await prisma.$transaction(async (tx) => {
        const sourceCpmks = await tx.cpmk.findMany({
            where: { academicYearId: sourceAcademicYearId },
            include: {
                assessmentCriterias: {
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

        const targetCount = await tx.cpmk.count({
            where: { academicYearId: targetAcademicYearId },
        });

        if (targetCount > 0) {
            const err = new Error(
                "Tahun ajaran tujuan sudah memiliki data CPMK. Hapus data existing terlebih dahulu."
            );
            err.statusCode = 400;
            throw err;
        }

        const created = {
            cpmk: 0,
            criteria: 0,
            rubrics: 0,
        };

        for (const sourceCpmk of sourceCpmks) {
            const newCpmk = await tx.cpmk.create({
                data: {
                    academicYearId: targetAcademicYearId,
                    code: sourceCpmk.code,
                    description: sourceCpmk.description,
                    type: sourceCpmk.type,
                },
            });
            created.cpmk += 1;

            for (const sourceCriteria of sourceCpmk.assessmentCriterias) {
                const newCriteria = await tx.assessmentCriteria.create({
                    data: {
                        cpmkId: newCpmk.id,
                        name: sourceCriteria.name,
                        appliesTo: sourceCriteria.appliesTo,
                        role: sourceCriteria.role,
                        maxScore: sourceCriteria.maxScore,
                        displayOrder: sourceCriteria.displayOrder,
                    },
                });
                created.criteria += 1;

                if (sourceCriteria.assessmentRubrics.length > 0) {
                    await tx.assessmentRubric.createMany({
                        data: sourceCriteria.assessmentRubrics.map((rubric) => ({
                            assessmentCriteriaId: newCriteria.id,
                            minScore: rubric.minScore,
                            maxScore: rubric.maxScore,
                            description: rubric.description,
                            displayOrder: rubric.displayOrder,
                        })),
                    });
                    created.rubrics += sourceCriteria.assessmentRubrics.length;
                }
            }
        }

        return created;
    });
};
