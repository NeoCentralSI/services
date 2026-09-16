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
    const oldCount = await prisma.assessmentCriteria.count({ where: { cpmkId: id } });
    const metopenCount = await prisma.metopenAssessmentCriteria.count({ where: { metopenCpmkId: id } });
    return oldCount > 0 || metopenCount > 0;
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
        // ── Old CPMK copy ────────────────────────────────────────────
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

        const targetCpmkCount = await tx.cpmk.count({
            where: { academicYearId: targetAcademicYearId },
        });

        if (targetCpmkCount > 0) {
            const err = new Error(
                "Tahun ajaran tujuan sudah memiliki data CPMK. Hapus data existing terlebih dahulu."
            );
            err.statusCode = 400;
            throw err;
        }

        // ── Metopen CPMK copy ─────────────────────────────────────────
        const sourceMetopenCpmks = await tx.metopenCpmk.findMany({
            where: { academicYearId: sourceAcademicYearId },
            include: {
                metopenAssessmentCriterias: {
                    include: {
                        metopenAssessmentRubrics: {
                            orderBy: { displayOrder: "asc" },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
            orderBy: { code: "asc" },
        });

        const targetMetopenCpmkCount = await tx.metopenCpmk.count({
            where: { academicYearId: targetAcademicYearId },
        });

        if (targetMetopenCpmkCount > 0) {
            const err = new Error(
                "Tahun ajaran tujuan sudah memiliki data CPMK Metopen. Hapus data existing terlebih dahulu."
            );
            err.statusCode = 400;
            throw err;
        }

        const created = {
            cpmk: 0,
            criteria: 0,
            rubrics: 0,
            metopenCpmk: 0,
            metopenCriteria: 0,
            metopenRubrics: 0,
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

        for (const sourceCpmk of sourceMetopenCpmks) {
            const newMetopenCpmk = await tx.metopenCpmk.create({
                data: {
                    academicYearId: targetAcademicYearId,
                    code: sourceCpmk.code,
                    description: sourceCpmk.description,
                },
            });
            created.metopenCpmk += 1;

            for (const sourceCriteria of sourceCpmk.metopenAssessmentCriterias) {
                const newCriteria = await tx.metopenAssessmentCriteria.create({
                    data: {
                        metopenCpmkId: newMetopenCpmk.id,
                        name: sourceCriteria.name,
                        role: sourceCriteria.role,
                        maxScore: sourceCriteria.maxScore,
                        displayOrder: sourceCriteria.displayOrder,
                    },
                });
                created.metopenCriteria += 1;

                if (sourceCriteria.metopenAssessmentRubrics.length > 0) {
                    await tx.metopenAssessmentRubric.createMany({
                        data: sourceCriteria.metopenAssessmentRubrics.map((rubric) => ({
                            metopenAssessmentCriteriaId: newCriteria.id,
                            minScore: rubric.minScore,
                            maxScore: rubric.maxScore,
                            description: rubric.description,
                            displayOrder: rubric.displayOrder,
                        })),
                    });
                    created.metopenRubrics += sourceCriteria.metopenAssessmentRubrics.length;
                }
            }
        }

        return created;
    });
};
