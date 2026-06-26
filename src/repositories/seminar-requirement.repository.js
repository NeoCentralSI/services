import prisma from "../config/prisma.js";

export const findAll = async ({ academicYearId } = {}) => {
    const where = {};
    if (academicYearId) where.academicYearId = academicYearId;
    
    const records = await prisma.thesisSeminarRequirement.findMany({
        where,
        orderBy: { displayOrder: "asc" },
        include: {
            _count: {
                select: { requirementDocuments: true }
            }
        }
    });

    return records.map(record => {
        const { _count, ...rest } = record;
        return {
            ...rest,
            hasRelatedData: _count.requirementDocuments > 0
        };
    });
};

export const findById = async (id) => {
    const record = await prisma.thesisSeminarRequirement.findUnique({ 
        where: { id },
        include: {
            _count: {
                select: { requirementDocuments: true }
            }
        }
    });

    if (!record) return null;
    const { _count, ...rest } = record;
    return {
        ...rest,
        hasRelatedData: _count.requirementDocuments > 0
    };
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

export const copyTemplate = async (sourceAcademicYearId, targetAcademicYearId) => {
    return await prisma.$transaction(async (tx) => {
        const sourceRequirements = await tx.thesisSeminarRequirement.findMany({
            where: { academicYearId: sourceAcademicYearId },
            orderBy: { displayOrder: "asc" },
        });

        if (sourceRequirements.length === 0) {
            const error = new Error("Tidak ada persyaratan di tahun ajaran sumber");
            error.statusCode = 404;
            throw error;
        }

        const targetCount = await tx.thesisSeminarRequirement.count({
            where: { academicYearId: targetAcademicYearId },
        });

        if (targetCount > 0) {
            const error = new Error("Tahun ajaran tujuan sudah memiliki data persyaratan");
            error.statusCode = 400;
            throw error;
        }

        const newRequirements = sourceRequirements.map((req) => ({
            academicYearId: targetAcademicYearId,
            code: req.code,
            name: req.name,
            description: req.description,
            isRequired: req.isRequired,
            isActive: req.isActive,
            displayOrder: req.displayOrder,
        }));

        await tx.thesisSeminarRequirement.createMany({
            data: newRequirements,
        });

        return newRequirements;
    });
};
