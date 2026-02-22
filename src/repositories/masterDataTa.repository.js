import prisma from "../config/prisma.js";

export const findAllTheses = async () => {
    return await prisma.thesis.findMany({
        include: {
            student: {
                include: {
                    user: {
                        select: { fullName: true, identityNumber: true }
                    }
                }
            },
            thesisTopic: true,
            thesisSupervisors: {
                include: {
                    lecturer: {
                        include: {
                            user: {
                                select: { fullName: true }
                            }
                        }
                    },
                    role: true
                }
            },
            thesisStatus: true,
            academicYear: true
        },
        orderBy: { createdAt: "desc" }
    });
};

export const findThesisById = async (id) => {
    return await prisma.thesis.findUnique({
        where: { id },
        include: {
            student: {
                include: {
                    user: {
                        select: { fullName: true, identityNumber: true }
                    }
                }
            },
            thesisTopic: true,
            thesisSupervisors: {
                include: {
                    lecturer: {
                        include: {
                            user: {
                                select: { fullName: true }
                            }
                        }
                    },
                    role: true
                }
            },
            thesisStatus: true
        }
    });
};

export const createThesis = async (data) => {
    return await prisma.$transaction(async (tx) => {
        const thesis = await tx.thesis.create({
            data: {
                studentId: data.studentId,
                title: data.title,
                thesisTopicId: data.thesisTopicId,
                thesisStatusId: data.thesisStatusId,
                academicYearId: data.academicYearId,
                startDate: data.startDate,
                deadlineDate: data.deadlineDate,
                rating: "ONGOING"
            }
        });

        if (data.supervisors && data.supervisors.length > 0) {
            await tx.thesisSupervisors.createMany({
                data: data.supervisors.map(s => ({
                    thesisId: thesis.id,
                    lecturerId: s.lecturerId,
                    roleId: s.roleId
                }))
            });
        }

        return thesis;
    });
};

export const updateThesis = async (id, data) => {
    return await prisma.$transaction(async (tx) => {
        const thesis = await tx.thesis.update({
            where: { id },
            data: {
                title: data.title,
                thesisTopicId: data.thesisTopicId,
                academicYearId: data.academicYearId,
                startDate: data.startDate,
                rating: data.rating
            }
        });

        if (data.supervisors) {
            // Delete existing supervisors
            await tx.thesisSupervisors.deleteMany({
                where: { thesisId: id }
            });

            // Insert new supervisors
            if (data.supervisors.length > 0) {
                await tx.thesisSupervisors.createMany({
                    data: data.supervisors.map(s => ({
                        thesisId: id,
                        lecturerId: s.lecturerId,
                        roleId: s.roleId
                    }))
                });
            }
        }

        return thesis;
    });
};
