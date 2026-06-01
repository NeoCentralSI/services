import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId } = {}) => {
    const where = {};
    if (academicYearId) where.academicYearId = academicYearId;
    
    return await prisma.thesisDefenceRequirement.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
    });
};

export const findById = async (id) => {
    return await prisma.thesisDefenceRequirement.findUnique({ where: { id } });
};

export const create = async (data) => {
    return await prisma.thesisDefenceRequirement.create({ data });
};

export const update = async (id, data) => {
    return await prisma.thesisDefenceRequirement.update({ where: { id }, data });
};

export const remove = async (id) => {
    return await prisma.thesisDefenceRequirement.delete({ where: { id } });
};
