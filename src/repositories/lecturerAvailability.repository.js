import prisma from "../config/prisma.js";

export const findAllByLecturerId = async (lecturerId) => {
    return await prisma.lecturerAvailability.findMany({
        where: { lecturerId },
        orderBy: [
            { day: "asc" },
            { startTime: "asc" }
        ]
    });
};

export const findById = async (id) => {
    return await prisma.lecturerAvailability.findUnique({
        where: { id }
    });
};

export const create = async (data) => {
    return await prisma.lecturerAvailability.create({ data });
};

export const update = async (id, data) => {
    return await prisma.lecturerAvailability.update({
        where: { id },
        data
    });
};

export const remove = async (id) => {
    return await prisma.lecturerAvailability.delete({
        where: { id }
    });
};

export const findOverlapping = async (
    lecturerId,
    day,
    startTime,
    endTime,
    validFrom,
    validUntil,
    excludeId = null
) => {
    const where = {
        lecturerId,
        day,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        validFrom: { lt: validUntil },
        validUntil: { gt: validFrom }
    };
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return await prisma.lecturerAvailability.findFirst({ where });
};
