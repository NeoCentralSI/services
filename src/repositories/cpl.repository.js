import prisma from "../config/prisma.js";

export const findAll = async ({ status = "active", search = "", page = 1, limit = 10 } = {}) => {
    const where = {};
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;

    if (status === "active") {
        where.isActive = true;
    } else if (status === "inactive") {
        where.isActive = false;
    }

    if (search) {
        where.OR = [
            { code: { contains: search } },
            { description: { contains: search } },
        ];
    }

    const skip = (parsedPage - 1) * parsedLimit;

    const [data, total] = await prisma.$transaction([
        prisma.cpl.findMany({
            where,
            orderBy: { code: "asc" },
            include: {
                _count: {
                    select: {
                        studentCplScores: true,
                    },
                },
            },
            skip,
            take: parsedLimit,
        }),
        prisma.cpl.count({ where }),
    ]);

    return { data, total };
};

export const findById = async (id) => {
    return await prisma.cpl.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    studentCplScores: true,
                },
            },
        },
    });
};

export const findByCode = async (code, excludeId = null) => {
    const where = { code };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.cpl.findFirst({ where });
};

export const findActiveByCode = async (code, excludeId = null) => {
    const where = {
        code,
        isActive: true,
    };

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

export const hasRelatedScores = async (id) => {
    const scoresCount = await prisma.studentCplScore.count({ where: { cplId: id } });
    return scoresCount > 0;
};
