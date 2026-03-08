import prisma from "../../config/prisma.js";

export const findAll = async () => {
    return await prisma.yudisium.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            exitSurveyForm: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
            _count: { select: { participants: true, studentExitSurveyResponses: true } },
        },
    });
};

export const findById = async (id) => {
    return await prisma.yudisium.findUnique({
        where: { id },
        include: {
            exitSurveyForm: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
            _count: { select: { participants: true, studentExitSurveyResponses: true } },
        },
    });
};

export const create = async (data) => {
    return await prisma.yudisium.create({
        data,
        include: {
            exitSurveyForm: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
            _count: { select: { participants: true, studentExitSurveyResponses: true } },
        },
    });
};

export const update = async (id, data) => {
    return await prisma.yudisium.update({
        where: { id },
        data,
        include: {
            exitSurveyForm: { select: { id: true, name: true } },
            room: { select: { id: true, name: true } },
            _count: { select: { participants: true, studentExitSurveyResponses: true } },
        },
    });
};

export const remove = async (id) => {
    return await prisma.yudisium.delete({
        where: { id },
    });
};

export const hasParticipants = async (id) => {
    const count = await prisma.yudisiumParticipant.count({
        where: { yudisiumId: id },
    });
    return count > 0;
};

export const hasStudentExitSurveyResponses = async (id) => {
    const count = await prisma.studentExitSurveyResponse.count({
        where: { yudisiumId: id },
    });
    return count > 0;
};
