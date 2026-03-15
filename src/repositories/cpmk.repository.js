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
