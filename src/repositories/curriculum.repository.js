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
                cpls: {
                    select: {
                        _count: {
                            select: {
                                studentCplScores: true,
                            },
                        },
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
            cpls: {
                select: {
                    _count: {
                        select: {
                            studentCplScores: true,
                        },
                    },
                },
            },
        },
    });
};

export const findOverlappingYearRange = async (startYear, endYear, excludeId) => {
    return await prisma.curriculum.findFirst({
        where: {
            ...(excludeId ? { id: { not: excludeId } } : {}),
            ...(endYear !== null ? { startYear: { lte: endYear } } : {}),
            OR: [
                { endYear: null },
                { endYear: { gte: startYear } },
            ],
        },
        select: {
            id: true,
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

export const countStudentScores = async (id) => {
    return await prisma.studentCplScore.count({
        where: {
            cpl: {
                curriculumId: id,
            },
        },
    });
};

export const removeWithCpls = async (id) => {
    const [, curriculum] = await prisma.$transaction([
        prisma.cpl.deleteMany({
            where: { curriculumId: id },
        }),
        prisma.curriculum.delete({
            where: { id },
        }),
    ]);

    return curriculum;
};
