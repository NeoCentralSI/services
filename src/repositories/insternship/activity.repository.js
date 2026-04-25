import prisma from "../../config/prisma.js";

/**
 * Get active internship for a student.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentInternship(studentId) {
    return prisma.internship.findFirst({
        where: { studentId, status: { in: ['ONGOING', 'COMPLETED', 'FAILED'] } },
        include: {
            proposal: {
                include: {
                    targetCompany: true
                }
            },
            seminars: {
                include: {
                    room: true,
                    moderatorStudent: {
                        include: {
                            user: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            }
        }
    });
}

/**
 * Get logbook entries for an internship.
 * @param {string} internshipId 
 * @returns {Promise<Array>}
 */
export async function getLogbooks(internshipId) {
    return prisma.internshipLogbook.findMany({
        where: { internshipId },
        orderBy: { activityDate: 'asc' }
    });
}

/**
 * Update logbook entry description.
 * @param {string} logbookId 
 * @param {string} studentId 
 * @param {string} activityDescription 
 * @returns {Promise<Object>}
 */
export async function updateLogbook(logbookId, studentId, activityDescription) {
    // Verify ownership
    const logbook = await prisma.internshipLogbook.findUnique({
        where: { id: logbookId },
        include: { internship: true }
    });

    if (!logbook || logbook.internship.studentId !== studentId) {
        throw new Error("Logbook tidak ditemukan atau akses ditolak.");
    }

    return prisma.internshipLogbook.update({
        where: { id: logbookId },
        data: { activityDescription }
    });
}

/**
 * Update internship details (field supervisor and unit section).
 * @param {string} studentId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateInternshipDetails(studentId, { fieldSupervisorName, fieldSupervisorEmail, unitSection }) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik tidak ditemukan.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: { fieldSupervisorName, fieldSupervisorEmail, unitSection }
    });
}

/**
 * Create a new internship report record.
 * After consolidation, this updates report fields directly in the Internship model.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createReport(data) {
    const { internshipId, title, documentId } = data;
    return prisma.internship.update({
        where: { id: internshipId },
        data: {
            reportTitle: title,
            reportDocumentId: documentId,
            reportStatus: 'SUBMITTED',
            reportUploadedAt: new Date()
        },
        include: {
            reportDocument: true
        }
    });
}

/**
 * Update internship completion certificate.
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateCompletionCertificate(studentId, documentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    if (internship.completionCertificateStatus === 'APPROVED') {
        throw new Error("Dokumen sudah disetujui dan tidak dapat diubah.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            completionCertificateDocId: documentId,
            completionCertificateStatus: 'SUBMITTED'
        },
        include: {
            completionCertificateDoc: true
        }
    });
}

/**
 * Update internship company receipt (KP-004).
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateCompanyReceipt(studentId, documentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    if (internship.companyReceiptStatus === 'APPROVED') {
        throw new Error("Dokumen sudah disetujui dan tidak dapat diubah.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            companyReceiptDocId: documentId,
            companyReceiptStatus: 'SUBMITTED'
        },
        include: {
            companyReceiptDoc: true
        }
    });
}

/**
 * Update internship company report document (laporan akhir instansi).
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateCompanyReport(studentId, documentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    if (internship.companyReportStatus === 'APPROVED') {
        throw new Error("Dokumen sudah disetujui dan tidak dapat diubah.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            companyReportDocId: documentId,
            companyReportStatus: 'SUBMITTED'
        },
        include: {
            companyReportDoc: true
        }
    });
}

/**
 * Update internship logbook document (the administrative file).
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateLogbookDocument(studentId, documentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    if (internship.logbookDocumentStatus === 'APPROVED') {
        throw new Error("Dokumen sudah disetujui dan tidak dapat diubah.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            logbookDocumentId: documentId,
            logbookDocumentStatus: 'SUBMITTED'
        },
        include: {
            logbookDocument: true
        }
    });
}

/**
 * Update internship final fixed report document (post-seminar).
 * Status defaults to APPROVED on upload.
 * @param {string} studentId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateFinalReport(studentId, documentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: { in: ['ONGOING', 'COMPLETED', 'FAILED'] } },
        include: { seminars: true }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    // Check if seminar is completed
    const latestSeminar = internship.seminars && internship.seminars.length > 0 ? internship.seminars[0] : null;
    if (!latestSeminar || latestSeminar.status !== 'COMPLETED') {
        throw new Error("Seminar belum berstatus selesai.");
    }

    if (internship.reportFinalStatus === 'APPROVED') {
        throw new Error("Laporan final sudah disetujui dan tidak dapat diubah.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            reportFinalDocId: documentId,
            reportFinalStatus: 'APPROVED', // Auto-approve
            reportFinalUploadedAt: new Date()
        },
        include: {
            reportFinalDoc: true
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

    return prisma.$transaction(
        internshipIds.map(internshipId => 
            prisma.internshipSeminar.create({
                data: {
                    internshipId,
                    seminarDate: new Date(seminarDate),
                    startTime: new Date(`1970-01-01T${startTime}:00Z`),
                    endTime: new Date(`1970-01-01T${endTime}:00Z`),
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
    const start = new Date(`1970-01-01T${startTime}:00Z`);
    const end = new Date(`1970-01-01T${endTime}:00Z`);

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
    return prisma.internshipSeminar.findMany({
        where: {
            status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] }
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

    return prisma.internshipSeminar.update({
        where: { id: seminarId },
        data: {
            seminarDate: new Date(seminarDate),
            startTime: new Date(`1970-01-01T${startTime}:00Z`),
            endTime: new Date(`1970-01-01T${endTime}:00Z`),
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
                    }
                }
            }
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
