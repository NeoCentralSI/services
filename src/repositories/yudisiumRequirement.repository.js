import prisma from "../config/prisma.js";

export const findAll = async () => {
    return await prisma.yudisiumRequirement.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
};

export const findById = async (id) => {
    return await prisma.yudisiumRequirement.findUnique({
        where: { id },
        include: {
            _count: { select: { yudisiumParticipantRequirements: true } },
        },
    });
};

export const findByName = async (name, excludeId = null) => {
    const where = {
        name,
    };

    if (excludeId) {
        where.id = { not: excludeId };
    }

    return await prisma.yudisiumRequirement.findFirst({ where });
};

export const getNextOrder = async () => {
    const last = await prisma.yudisiumRequirement.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
    });

    return (last?.order ?? 0) + 1;
};

export const create = async (data) => {
    return await prisma.yudisiumRequirement.create({ data });
};

export const update = async (id, data) => {
    return await prisma.yudisiumRequirement.update({
        where: { id },
        data,
    });
};

export const remove = async (id) => {
    return await prisma.yudisiumRequirement.delete({
        where: { id },
    });
};

export const hasRelatedData = async (id) => {
    const usageCount = await prisma.yudisiumParticipantRequirement.count({
        where: { yudisiumRequirementId: id },
    });

    return usageCount > 0;
};

export const moveToEdge = async (id, direction) => {
    return await prisma.$transaction(async (tx) => {
        const items = await tx.yudisiumRequirement.findMany({
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: { id: true },
        });

        const existingIds = items.map((item) => item.id);
        const withoutCurrent = existingIds.filter((itemId) => itemId !== id);
        const reorderedIds = direction === "top"
            ? [id, ...withoutCurrent]
            : [...withoutCurrent, id];

        await Promise.all(
            reorderedIds.map((itemId, index) =>
                tx.yudisiumRequirement.update({
                    where: { id: itemId },
                    data: { order: index },
                })
            )
        );

        return await tx.yudisiumRequirement.findUnique({
            where: { id },
        });
    });
};
