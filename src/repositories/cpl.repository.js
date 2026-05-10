import prisma from "../config/prisma.js";

export const findAll = async ({ status = "all", search = "", page = 1, limit = 10 } = {}) => {
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

const studentScoreInclude = {
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
    validator: {
        select: {
            id: true,
            fullName: true,
            identityNumber: true,
        },
    },
};

export const findStudentScoresByCplId = async (cplId, { search = "", source, status } = {}) => {
    const where = {
        cplId,
        ...(source ? { source } : {}),
        ...(status ? { status } : {}),
        ...(search
            ? {
                  student: {
                      user: {
                          OR: [
                              { fullName: { contains: search } },
                              { identityNumber: { contains: search } },
                          ],
                      },
                  },
              }
            : {}),
    };

    return await prisma.studentCplScore.findMany({
        where,
        include: studentScoreInclude,
        orderBy: [{ student: { user: { fullName: "asc" } } }],
    });
};

export const findStudentScoreByCplAndStudent = async (cplId, studentId) => {
    return await prisma.studentCplScore.findUnique({
        where: {
            studentId_cplId: { studentId, cplId },
        },
        include: studentScoreInclude,
    });
};

export const createStudentScore = async (data) => {
    return await prisma.studentCplScore.create({ data });
};

export const updateStudentScore = async (cplId, studentId, data) => {
    return await prisma.studentCplScore.update({
        where: {
            studentId_cplId: { studentId, cplId },
        },
        data,
    });
};

export const removeStudentScore = async (cplId, studentId) => {
    return await prisma.studentCplScore.delete({
        where: {
            studentId_cplId: { studentId, cplId },
        },
    });
};

export const findStudentsNotInCpl = async (cplId, search = "") => {
    const linkedRows = await prisma.studentCplScore.findMany({
        where: { cplId },
        select: { studentId: true },
    });
    const linkedStudentIds = linkedRows.map((row) => row.studentId);

    const where = {
        ...(linkedStudentIds.length ? { id: { notIn: linkedStudentIds } } : {}),
        ...(search
            ? {
                  user: {
                      OR: [
                          { fullName: { contains: search } },
                          { identityNumber: { contains: search } },
                      ],
                  },
              }
            : {}),
    };

    return await prisma.student.findMany({
        where,
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
        orderBy: {
            user: {
                fullName: "asc",
            },
        },
    });
};

export const findStudentByIdentityNumber = async (identityNumber) => {
    return await prisma.student.findFirst({
        where: {
            user: {
                identityNumber,
            },
        },
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
                    email: true,
                },
            },
        },
    });
};

export const findCplScoresForExport = async (cplId) => {
    return await prisma.studentCplScore.findMany({
        where: { cplId },
        include: studentScoreInclude,
        orderBy: [{ student: { user: { fullName: "asc" } } }],
    });
};

export const findAllCplScoresForExport = async () => {
    return await prisma.studentCplScore.findMany({
        include: studentScoreInclude,
        orderBy: [{ cpl: { code: "asc" } }, { student: { user: { fullName: "asc" } } }],
    });
};
