import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId = null } = {}) => {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }

    return await prisma.thesisCpmk.findMany({
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
                    thesisSeminarAssessmentCriterias: true,
                    thesisDefenceExaminerAssessmentCriterias: true,
                },
            },
        },
        orderBy: { code: "asc" },
    });
};

export const findById = async (id) => {
    return await prisma.thesisCpmk.findUnique({
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
        },
    });
};

export const findByCode = async (code, academicYearId, excludeId = null) => {
    const where = {
        code,
        academicYearId,
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.thesisCpmk.findFirst({ where });
};

export const create = async (data) => {
    return await prisma.thesisCpmk.create({ data });
};

export const update = async (id, data) => {
    return await prisma.thesisCpmk.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.thesisCpmk.delete({
        where: { id },
    });
};

export const hasRelatedData = async (id) => {
    const seminarCriteriaCount = await prisma.thesisSeminarAssessmentCriteria.count({ where: { thesisCpmkId: id } });
    const defenceCriteriaCount = await prisma.thesisDefenceExaminerAssessmentCriteria.count({ where: { thesisCpmkId: id } });
    return seminarCriteriaCount > 0 || defenceCriteriaCount > 0;
};
