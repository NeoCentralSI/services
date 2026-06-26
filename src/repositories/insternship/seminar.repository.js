import prisma from "../../config/prisma.js";

function normalizeTimeString(timeValue) {
    if (!timeValue) return timeValue;

    const timeParts = String(timeValue).split(":");
    if (timeParts.length === 2) {
        return `${timeParts[0]}:${timeParts[1]}:00`;
    }

    if (timeParts.length >= 3) {
        return `${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`;
    }

    return String(timeValue);
}

/**
 * Find a room by name using a case-insensitive partial match.
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function findRoomByNameLike(name) {
    if (!name) return null;

    return prisma.room.findFirst({
        where: {
            name: {
                contains: name
            }
        },
        orderBy: { name: "asc" }
    });
}

/**
 * Find or create a room by name.
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function findOrCreateRoomByName(name) {
    if (!name) return null;

    const existing = await findRoomByNameLike(name);
    if (existing) return existing;

    return prisma.room.create({
        data: {
            name,
            location: null,
            capacity: null
        }
    });
}

/**
 * Create a new internship seminar request for multiple internships.
 * @param {Array<string>} internshipIds 
 * @param {Object} scheduleData - { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId }
 * @returns {Promise<Array>}
 */
export async function createSeminarRequests(internshipIds, scheduleData) {
    const { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId } = scheduleData;
    const normalizedStartTime = normalizeTimeString(startTime);
    const normalizedEndTime = normalizeTimeString(endTime);

    return prisma.$transaction(
        internshipIds.map(internshipId => 
            prisma.internshipSeminar.create({
                data: {
                    internshipId,
                    seminarDate: new Date(seminarDate),
                    startTime: new Date(`1970-01-01T${normalizedStartTime}Z`),
                    endTime: new Date(`1970-01-01T${normalizedEndTime}Z`),
                    roomId,
                    linkMeeting: linkMeeting || null,
                    moderatorStudentId,
                    status: 'REQUESTED'
                }
            })
        )
    );
}

/**
 * Check for duplicate or conflicting seminar schedules.
 * Checks for:
 * 1. Same Room + Same Date + Overlapping Time
 * 2. Same Moderator + Same Date + Overlapping Time
 * @returns {Promise<Object|null>} returns the conflicting seminar or null
 */
export async function checkSeminarConflict({ roomId, moderatorStudentId, seminarDate, startTime, endTime, excludeSeminarId = null }) {
    const normalizedStartTime = normalizeTimeString(startTime);
    const normalizedEndTime = normalizeTimeString(endTime);
    const start = new Date(`1970-01-01T${normalizedStartTime}Z`);
    const end = new Date(`1970-01-01T${normalizedEndTime}Z`);

    return prisma.internshipSeminar.findFirst({
        where: {
            id: excludeSeminarId ? { not: excludeSeminarId } : undefined,
            seminarDate: new Date(seminarDate),
            status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] },
            OR: [
                { roomId },
                { moderatorStudentId }
            ],
            // Time overlap logic: (A.start < B.end) AND (A.end > B.start)
            AND: [
                { startTime: { lt: end } },
                { endTime: { gt: start } }
            ]
        },
        include: {
            room: true,
            moderatorStudent: { include: { user: true } },
            internship: { include: { student: { include: { user: true } } } }
        }
    });
}

/**
 * Get internship by ID with supervisor and group info.
 */
export async function getInternshipWithGroup(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            student: { include: { user: true } },
            proposal: {
                include: {
                    internships: {
                        where: { status: 'ONGOING' },
                        include: {
                            student: { include: { user: true } },
                            supervisor: { include: { user: true } }
                        }
                    }
                }
            }
        }
    });
    return internship;
}

/**
 * Get upcoming seminars (public list for all students).
 * @returns {Promise<Array>}
 */
export async function getUpcomingSeminars() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.internshipSeminar.findMany({
        where: {
            status: { in: ['REQUESTED', 'APPROVED'] },
            seminarDate: { gte: today },
            internship: { status: 'ONGOING' }
        },
        include: {
            room: true,
            moderatorStudent: {
                include: { user: { select: { fullName: true } } }
            },
            internship: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true } } }
                    },
                    supervisor: {
                        include: { user: { select: { fullName: true } } }
                    },
                    proposal: {
                        include: { targetCompany: { select: { companyName: true } } }
                    }
                }
            }
        },
        orderBy: { seminarDate: 'asc' }
    });
}

/**
 * Update seminar proposal (only if status is REQUESTED or REJECTED).
 * @param {string} seminarId
 * @param {string} studentId
 * @param {Object} scheduleData
 * @returns {Promise<Object>}
 */
export async function updateSeminarProposal(seminarId, studentId, scheduleData) {
    const seminar = await prisma.internshipSeminar.findFirst({
        where: { id: seminarId },
        include: { internship: true }
    });

    if (!seminar) {
        throw new Error("Seminar tidak ditemukan.");
    }

    if (seminar.internship.studentId !== studentId) {
        throw new Error("Anda tidak memiliki akses ke seminar ini.");
    }

    if (!['REQUESTED', 'REJECTED'].includes(seminar.status)) {
        throw new Error("Jadwal seminar hanya dapat diubah jika status masih Menunggu atau Ditolak.");
    }

    const { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId } = scheduleData;
    const normalizedStartTime = normalizeTimeString(startTime);
    const normalizedEndTime = normalizeTimeString(endTime);

    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            seminarDate: new Date(seminarDate),
            startTime: new Date(`1970-01-01T${normalizedStartTime}Z`),
            endTime: new Date(`1970-01-01T${normalizedEndTime}Z`),
            roomId,
            linkMeeting: linkMeeting || null,
            moderatorStudentId,
            status: 'REQUESTED',
            supervisorNotes: null
        },
        include: {
            room: true,
            moderatorStudent: {
                include: { user: { select: { fullName: true, identityNumber: true } } }
            }
        }
    });
}

/**
 * Find seminar by ID with full details.
 * @param {string} seminarId
 * @returns {Promise<Object>}
 */
export async function findSeminarById(seminarId) {
    return prisma.internshipSeminar.findUnique({
        where: { id: seminarId },
        include: {
            room: true,
            moderatorStudent: {
                include: { user: { select: { fullName: true, identityNumber: true } } }
            },
            internship: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true } } }
                    },
                    supervisor: {
                        include: { user: { select: { fullName: true, id: true } } }
                    },
                    proposal: {
                        include: {
                            targetCompany: { select: { companyName: true } },
                            academicYear: { select: { year: true, semester: true } }
                        }
                    }
                }
            },
            audiences: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true } } }
                    }
                },
                orderBy: { createdAt: 'asc' }
            },
            beritaAcaraDocument: true
        }
    });
}

/**
 * Approve multiple seminar requests in a transaction.
 * @param {string[]} seminarIds 
 * @param {string} approvedBy - User ID of the approver
 * @returns {Promise<Object>}
 */
export async function bulkApproveSeminars(seminarIds, approvedBy) {
    return prisma.$transaction(
        seminarIds.map(id => 
            prisma.internshipSeminar.update({
                where: { id },
                data: { 
                    status: 'APPROVED',
                    approvedBy
                }
            })
        )
    );
}

/**
 * Approve a seminar request.
 * @param {string} seminarId
 * @param {string} approvedBy - User ID of the approver
 * @returns {Promise<Object>}
 */
export async function approveSeminar(seminarId, approvedBy) {
    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            status: 'APPROVED',
            approvedBy
        }
    });
}

/**
 * Reject a seminar request.
 * @param {string} seminarId
 * @param {string} notes - Rejection reason
 * @returns {Promise<Object>}
 */
export async function rejectSeminar(seminarId, notes) {
    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            status: 'REJECTED',
            supervisorNotes: notes || null
        }
    });
}

/**
 * Get seminar detail with audience.
 * @param {string} seminarId
 * @returns {Promise<Object>}
 */
export async function getSeminarDetail(seminarId) {
    return prisma.internshipSeminar.findUnique({
        where: { id: seminarId },
        include: {
            room: true,
            moderatorStudent: {
                include: { user: { select: { fullName: true, identityNumber: true } } }
            },
            internship: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true } } }
                    },
                    supervisor: {
                        include: { user: { select: { fullName: true, id: true } } }
                    },
                    proposal: {
                        include: {
                            targetCompany: { select: { companyName: true } }
                        }
                    }
                }
            },
            audiences: {
                include: {
                    student: {
                        include: { user: { select: { fullName: true, identityNumber: true } } }
                    }
                },
                orderBy: {
                    createdAt: 'asc'
                }
            }
        }
    });
}

/**
 * Register student as seminar audience.
 * @param {string} seminarId
 * @param {string} studentId
 */
export async function registerSeminarAudience(seminarId, studentId) {
    return prisma.internshipSeminarAudience.create({
        data: {
            seminarId,
            studentId,
            status: 'PENDING'
        }
    });
}

/**
 * Unregister student as seminar audience.
 * @param {string} seminarId
 * @param {string} studentId
 */
export async function unregisterSeminarAudience(seminarId, studentId) {
    return prisma.internshipSeminarAudience.delete({
        where: {
            seminarId_studentId: {
                seminarId,
                studentId
            }
        }
    });
}

/**
 * Validate (approve) seminar audience.
 * @param {string} seminarId
 * @param {string} studentId
 */
export async function validateSeminarAudience(seminarId, studentId) {
    return prisma.internshipSeminarAudience.update({
        where: {
            seminarId_studentId: {
                seminarId,
                studentId
            }
        },
        data: {
            status: 'VALIDATED',
            validatedAt: new Date()
        }
    });
}

/**
 * Bulk validate (approve) seminar audience.
 * @param {string} seminarId
 * @param {string[]} studentIds
 */
export async function bulkValidateSeminarAudience(seminarId, studentIds) {
    return prisma.internshipSeminarAudience.updateMany({
        where: {
            seminarId,
            studentId: { in: studentIds }
        },
        data: {
            status: 'VALIDATED',
            validatedAt: new Date()
        }
    });
}

/**
 * Unvalidate seminar audience.
 * @param {string} seminarId
 * @param {string} studentId
 */
export async function unvalidateSeminarAudience(seminarId, studentId) {
    return prisma.internshipSeminarAudience.update({
        where: {
            seminarId_studentId: {
                seminarId,
                studentId
            }
        },
        data: {
            status: 'PENDING',
            validatedAt: null
        }
    });
}

/**
 * Update seminar supervisor notes.
 * @param {string} seminarId 
 * @param {string} notes 
 */
export async function updateSeminarNotes(seminarId, notes) {
    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: { supervisorNotes: notes }
    });
}

/**
 * Mark a seminar as COMPLETED.
 * @param {string} seminarId
 * @param {string|null} documentId
 */
export async function completeSeminar(seminarId, documentId = null) {
    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            status: 'COMPLETED',
            ...(documentId ? { beritaAcaraDocumentId: documentId } : {})
        },
        include: {
            beritaAcaraDocument: true
        }
    });
}

/**
 * Mark a seminar as FAILED.
 * @param {string} seminarId
 * @param {string|null} notes
 */
export async function failSeminar(seminarId, notes = null) {
    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            status: 'FAILED',
            supervisorNotes: notes || null
        }
    });
}
