import prisma from "../config/prisma.js";

export const findAll = async () => {
    return await prisma.cpmk.findMany({
        orderBy: { code: "asc" },
    });
};

export const findById = async (id) => {
    return await prisma.cpmk.findUnique({
        where: { id },
    });
};

export const findByCode = async (code, excludeId = null) => {
    const where = { code };
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
