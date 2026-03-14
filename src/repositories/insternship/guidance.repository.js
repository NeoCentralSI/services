import prisma from "../../config/prisma.js";

// ==================== Student Questions ====================

/**
 * Find all guidance questions, ordered by weekNumber then orderIndex.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function findAllQuestions(academicYearId) {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }
    return prisma.internshipGuidanceQuestion.findMany({
        where,
        orderBy: [{ weekNumber: "asc" }, { orderIndex: "asc" }],
    });
}

/**
 * Create a new guidance question.
 * @param {Object} data - { weekNumber, questionText, orderIndex, academicYearId }
 * @returns {Promise<Object>}
 */
export async function createQuestion(data) {
    return prisma.internshipGuidanceQuestion.create({ data });
}

/**
 * Update an existing guidance question.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateQuestion(id, data) {
    return prisma.internshipGuidanceQuestion.update({
        where: { id },
        data,
    });
}

/**
 * Delete a guidance question.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteQuestion(id) {
    return prisma.internshipGuidanceQuestion.delete({ where: { id } });
}

// ==================== Lecturer Criteria ====================

/**
 * Find all lecturer criteria, ordered by weekNumber then orderIndex.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function findAllCriteria(academicYearId) {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }
    return prisma.internshipGuidanceLecturerCriteria.findMany({
        where,
        include: { options: { orderBy: { orderIndex: "asc" } } },
        orderBy: [{ weekNumber: "asc" }, { orderIndex: "asc" }],
    });
}

/**
 * Create a new lecturer criteria.
 * @param {Object} data - { criteriaName, weekNumber, inputType, orderIndex, academicYearId, options }
 * @returns {Promise<Object>}
 */
export async function createCriteria(data) {
    const { options, ...rest } = data;
    return prisma.internshipGuidanceLecturerCriteria.create({
        data: {
            ...rest,
            options: options
                ? {
                    create: options.map((opt, idx) => ({
                        optionText: opt,
                        orderIndex: idx,
                    })),
                }
                : undefined,
        },
        include: { options: true },
    });
}

/**
 * Update an existing lecturer criteria.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateCriteria(id, data) {
    const { options, ...rest } = data;

    // For simplicity, if options are provided, we delete existing ones and create new ones
    const updatePayload = { ...rest };
    if (options) {
        updatePayload.options = {
            deleteMany: {},
            create: options.map((opt, idx) => ({
                optionText: opt,
                orderIndex: idx,
            })),
        };
    }

    return prisma.internshipGuidanceLecturerCriteria.update({
        where: { id },
        data: updatePayload,
        include: { options: true },
    });
}

/**
 * Delete a lecturer criteria.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteCriteria(id) {
    return prisma.internshipGuidanceLecturerCriteria.delete({ where: { id } });
}

// ==================== Student Guidance Submission ====================

/**
 * Find active internship for a student with basic details.
 */
export async function findStudentInternshipWithGuidance(studentId) {
    return prisma.internship.findFirst({
        where: { studentId, status: "ONGOING" },
        select: {
            id: true,
            actualStartDate: true,
            actualEndDate: true,
            supervisorId: true,
            reportStatus: true,
            reportTitle: true,
            reportNotes: true,
            reportUploadedAt: true,
            finalNumericScore: true,
            finalGrade: true,
            proposal: {
                select: {
                    academicYearId: true
                }
            },
            supervisor: {
                select: {
                    user: {
                        select: {
                            fullName: true
                        }
                    }
                }
            },
            student: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            reportDocument: {
                select: {
                    id: true,
                    fileName: true,
                    filePath: true
                }
            },
            reportFeedbackDocument: {
                select: {
                    id: true,
                    fileName: true,
                    filePath: true
                }
            }
        },
    });
}

/**
 * Find all internships supervised by a specific lecturer
 */
export async function findSupervisedInternships(supervisorId) {
    return prisma.internship.findMany({
        where: { supervisorId, status: { in: ["ONGOING", "COMPLETED"] } },
        include: {
            student: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true,
                        }
                    }
                }
            },
            proposal: {
                include: {
                    targetCompany: {
                        select: {
                            companyName: true
                        }
                    },
                    academicYear: {
                        select: {
                            year: true,
                            semester: true
                        }
                    }
                }
            },
            guidanceSessions: {
                select: {
                    id: true,
                    weekNumber: true,
                    status: true,
                    submissionDate: true,
                    approvedAt: true
                }
            },
            reportDocument: {
                select: {
                    id: true,
                    fileName: true,
                    filePath: true
                }
            }
        },
        orderBy: {
            actualStartDate: "desc"
        }
    });
}

/**
 * Find guidance sessions for an internship.
 */
export async function findGuidanceSessions(internshipId) {
    return prisma.internshipGuidanceSession.findMany({
        where: { internshipId },
        include: {
            studentAnswers: true,
            lecturerAnswers: {
                include: {
                    criteria: {
                        include: {
                            options: true
                        }
                    }
                }
            }
        },
        orderBy: { weekNumber: "asc" },
    });
}

/**
 * Upsert a student guidance answer.
 */
export async function upsertStudentAnswer(data) {
    const { guidanceSessionId, questionId, weekNumber, answerText } = data;
    return prisma.internshipGuidanceStudentAnswer.upsert({
        where: {
            guidanceSessionId_questionId_weekNumber: {
                guidanceSessionId,
                questionId,
                weekNumber,
            },
        },
        update: { answerText },
        create: {
            guidanceSessionId,
            questionId,
            weekNumber,
            answerText,
        },
    });
}

/**
 * Create or get a guidance session for a specific week.
 */
export async function ensureGuidanceSession(internshipId, weekNumber) {
    const existing = await prisma.internshipGuidanceSession.findFirst({
        where: { internshipId, weekNumber },
    });

    if (existing) return existing;

    return prisma.internshipGuidanceSession.create({
        data: {
            internshipId,
            weekNumber,
            status: "SUBMITTED",
        },
    });
}

/**
 * Update guidance session status and submission date.
 */
export async function updateSessionStatus(sessionId, status) {
    return prisma.internshipGuidanceSession.update({
        where: { id: sessionId },
        data: {
            status,
            submissionDate: status === "SUBMITTED" ? new Date() : undefined,
        },
    });
}

/**
 * Find a specific supervised internship by ID and lecturer ID.
 */
export async function findSupervisedInternshipById(internshipId, supervisorId) {
    const result = await prisma.internship.findFirst({
        where: { id: internshipId, supervisorId },
        include: {
            proposal: {
                select: {
                    academicYearId: true
                }
            },
            student: {
                include: { user: { select: { fullName: true, identityNumber: true } } }
            },
            reportDocument: {
                select: {
                    id: true,
                    fileName: true,
                    filePath: true
                }
            },
            reportFeedbackDocument: {
                select: {
                    id: true,
                    fileName: true,
                    filePath: true
                }
            }
        }
    });

    return result;
}

/**
 * Find guidance session for a specific week with all student and lecturer answers.
 */
export async function findGuidanceSessionWithDetails(internshipId, weekNumber) {
    return prisma.internshipGuidanceSession.findFirst({
        where: { internshipId, weekNumber },
        include: {
            studentAnswers: {
                include: { question: true }
            },
            lecturerAnswers: {
                include: {
                    criteria: {
                        include: { options: { orderBy: { orderIndex: "asc" } } }
                    }
                }
            }
        }
    });
}

/**
 * Upsert a lecturer guidance answer.
 */
export async function upsertLecturerAnswer(data) {
    const { guidanceSessionId, criteriaId, weekNumber, evaluationValue, answerText } = data;
    return prisma.internshipGuidanceLecturerAnswer.upsert({
        where: {
            guidanceSessionId_criteriaId_weekNumber: {
                guidanceSessionId,
                criteriaId,
                weekNumber,
            },
        },
        update: { evaluationValue, answerText },
        create: {
            guidanceSessionId,
            criteriaId,
            weekNumber,
            evaluationValue,
            answerText,
        },
    });
}
