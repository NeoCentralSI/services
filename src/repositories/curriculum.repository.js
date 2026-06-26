import prisma from "../config/prisma.js";

export const findAll = async ({ search = "", page = 1, limit = 10 } = {}) => {
    const where = {};
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 10;

    if (search) {
        where.name = { contains: search };
    }

    const skip = (parsedPage - 1) * parsedLimit;

    const [data, total] = await prisma.$transaction([
        prisma.curriculum.findMany({
            where,
            orderBy: { startYear: "desc" },
            include: {
                _count: {
                    select: {
                        cpls: true,
                    },
                },
            },
            skip,
            take: parsedLimit,
        }),
        prisma.curriculum.count({ where }),
    ]);

    return { data, total };
};

export const findById = async (id) => {
    return await prisma.curriculum.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    cpls: true,
                },
            },
        },
    });
};

export const create = async (data) => {
    return await prisma.curriculum.create({ data });
};

export const update = async (id, data) => {
    return await prisma.curriculum.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.curriculum.delete({
        where: { id },
    });
};
