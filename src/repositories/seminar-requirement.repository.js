import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId } = {}) => {
    const where = {};
    if (academicYearId) where.academicYearId = academicYearId;
    
    return await prisma.thesisSeminarRequirement.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
    });
};

export const findById = async (id) => {
    return await prisma.thesisSeminarRequirement.findUnique({ where: { id } });
};

export const create = async (data) => {
    return await prisma.thesisSeminarRequirement.create({ data });
};

export const update = async (id, data) => {
    return await prisma.thesisSeminarRequirement.update({ where: { id }, data });
};

export const remove = async (id) => {
    return await prisma.thesisSeminarRequirement.delete({ where: { id } });
};
