import prisma from "../config/prisma.js";

export const findAll = async () => {
    return await prisma.cpl.findMany({
        orderBy: { code: "asc" },
    });
};

export const findById = async (id) => {
    return await prisma.cpl.findUnique({
        where: { id },
    });
};

export const findByCode = async (code, excludeId = null) => {
    const where = { code };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.cpl.findFirst({ where });
};

export const create = async (data) => {
    return await prisma.cpl.create({ data });
};

export const update = async (id, data) => {
    return await prisma.cpl.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.cpl.delete({
        where: { id },
    });
};

export const hasRelatedData = async (id) => {
    const [scoresCount, recommendationsCount] = await Promise.all([
        prisma.studentCplScore.count({ where: { cplId: id } }),
        prisma.yudisiumCplRecommendation.count({ where: { cplId: id } }),
    ]);
    return scoresCount > 0 || recommendationsCount > 0;
};
