import prisma from "../config/prisma.js";

export const findAll = async ({ studentId, cplId, source, status }) => {
    const where = {
        ...(studentId ? { studentId } : {}),
        ...(cplId ? { cplId } : {}),
        ...(source ? { source } : {}),
        ...(status ? { status } : {}),
    };

    return await prisma.studentCplScore.findMany({
        where,
        include: {
            student: {
                select: {
                    id: true,
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true,
                        },
                    },
                },
            },
            cpl: {
                select: {
                    id: true,
                    code: true,
                    description: true,
                    minimalScore: true,
                    isActive: true,
                },
            },
            inputUser: {
                select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                },
            },
            verifier: {
                select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                },
            },
        },
        orderBy: [
            { studentId: "asc" },
            { cplId: "asc" },
        ],
    });
};

export const findById = async (studentId, cplId) => {
    return await prisma.studentCplScore.findUnique({
        where: {
            studentId_cplId: { studentId, cplId },
        },
        include: {
            student: {
                select: {
                    id: true,
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true,
                            email: true,
                        },
                    },
                },
            },
            cpl: {
                select: {
                    id: true,
                    code: true,
                    description: true,
                    minimalScore: true,
                    isActive: true,
                },
            },
            inputUser: {
                select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                },
            },
            verifier: {
                select: {
                    id: true,
                    fullName: true,
                    identityNumber: true,
                },
            },
        },
    });
};

export const findStudentById = async (studentId) => {
    return await prisma.student.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            user: {
                select: {
                    fullName: true,
                    identityNumber: true,
                },
            },
        },
    });
};

export const findCplById = async (cplId) => {
    return await prisma.cpl.findUnique({
        where: { id: cplId },
        select: {
            id: true,
            code: true,
            description: true,
            minimalScore: true,
            isActive: true,
        },
    });
};

export const findCplByCode = async (cplCode) => {
    return await prisma.cpl.findFirst({
        where: {
            code: cplCode,
        },
        select: {
            id: true,
            code: true,
            description: true,
            minimalScore: true,
            isActive: true,
        },
    });
};

export const findAllStudents = async () => {
    return await prisma.student.findMany({
        select: {
            id: true,
            user: {
                select: {
                    fullName: true,
                    identityNumber: true,
                },
            },
        },
        orderBy: {
            user: {
                fullName: "asc",
            },
        },
    });
};

export const findAllCpls = async () => {
    return await prisma.cpl.findMany({
        select: {
            id: true,
            code: true,
            description: true,
            minimalScore: true,
            isActive: true,
        },
        orderBy: {
            code: "asc",
        },
    });
};

export const create = async (data) => {
    return await prisma.studentCplScore.create({ data });
};

export const update = async (studentId, cplId, data) => {
    return await prisma.studentCplScore.update({
        where: {
            studentId_cplId: { studentId, cplId },
        },
        data,
    });
};

export const remove = async (studentId, cplId) => {
    return await prisma.studentCplScore.delete({
        where: {
            studentId_cplId: { studentId, cplId },
        },
    });
};
