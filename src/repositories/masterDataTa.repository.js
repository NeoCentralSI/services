import prisma from "../config/prisma.js";
import {
    createSupervisorAssignments,
    replaceSupervisorAssignments,
} from "../utils/supervisorIntegrity.js";
import { THESIS_PROGRESS_SELECT } from "../helpers/thesis-progress.helper.js";

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
                where: { status: "active" },
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
            academicYear: true,
            // Read by the derived activity level (helpers/thesis-progress.helper.js).
            thesisGuidances: THESIS_PROGRESS_SELECT.thesisGuidances,
            thesisMilestones: THESIS_PROGRESS_SELECT.thesisMilestones,
            thesisSeminars: THESIS_PROGRESS_SELECT.thesisSeminars,
            thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
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
                where: { status: "active" },
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
                // K15: status is always written explicitly by the caller.
                status: data.status,
                statusChangedAt: new Date(),
                academicYearId: data.academicYearId,
                startDate: data.startDate,
            }
        });

        if (data.supervisors && data.supervisors.length > 0) {
            await createSupervisorAssignments(tx, thesis.id, data.supervisors, {
                requireP1: true,
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
                status: data.status,
                ...(data.status ? { statusChangedAt: new Date() } : {}),
                academicYearId: data.academicYearId,
                startDate: data.startDate,
            }
        });

        if (data.supervisors) {
            await replaceSupervisorAssignments(tx, id, data.supervisors, {
                requireP1: data.supervisors.length > 0,
            });
        }

        return thesis;
    });
};

export const findStudentByNim = async (nim) => {
    return await prisma.student.findFirst({
        where: { user: { identityNumber: nim } },
        include: { user: true }
    });
};

export const findLecturerByIdentity = async (identity) => {
    return await prisma.lecturer.findFirst({
        where: { user: { identityNumber: identity } },
        include: { user: true }
    });
};

export const findTopicByName = async (name) => {
    return await prisma.thesisTopic.findFirst({
        where: { name: { contains: name } }
    });
};

export const findAcademicYearByYearAndSemester = async (year, semester) => {
    return await prisma.academicYear.findFirst({
        where: {
            year: year,
            semester: semester
        }
    });
};

export const findThesisByStudentId = async (studentId) => {
    return await prisma.thesis.findFirst({
        where: { studentId }
    });
};
