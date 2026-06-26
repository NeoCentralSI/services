import prisma from "../../config/prisma.js";

/**
 * Get current internship for a student.
 * Terminal internships are historical and should not drive the active student UI.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentInternship(studentId) {
    return prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' },
        include: {
            student: {
                include: { user: true }
            },
            proposal: {
                include: {
                    targetCompany: true,
                    academicYear: true,
                    internships: {
                        where: { status: 'ONGOING' },
                        include: {
                            student: {
                                include: {
                                    user: true
                                }
                            },
                            supervisor: {
                                include: {
                                    user: true
                                }
                            },
                            seminars: {
                                where: { status: { in: ['REQUESTED', 'APPROVED'] } },
                                select: {
                                    id: true,
                                    status: true
                                }
                            }
                        }
                    }
                }
            },
            seminars: {
                where: {
                    status: 'COMPLETED'
                },
                include: {
                    room: true,
                    moderatorStudent: {
                        include: {
                            user: true
                        }
                    },
                    beritaAcaraDocument: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            reportDocument: true,
            reportFeedbackDocument: true,
            fieldAssessmentDoc: true,
            completionCertificateDoc: true,
            companyReceiptDoc: true,
            companyReportDoc: true,
            logbookDocument: true,
            supLetter: {
                include: {
                    document: true,
                    supervisor: {
                        include: {
                            user: true
                        }
                    }
                }
            }
        },
        orderBy: [
            { updatedAt: 'desc' },
            { createdAt: 'desc' }
        ]
    });
}

/**
 * Get all logbook entries for a student based on their active internship.
 * @param {string} studentId
 * @returns {Promise<{internship: Object|null, logbooks: Array}>}
 */
export async function getStudentLogbooks(studentId) {
    const internship = await getStudentInternship(studentId);

    if (!internship) {
        return {
            internship: null,
            logbooks: []
        };
    }

    const logbooks = await getLogbooks(internship.id);

    return {
        internship,
        logbooks
    };
}

/**
 * Get terminal internship history for a student.
 * Used by the student overview history tab so old FAILED/COMPLETED internships
 * remain accessible without being treated as the current active internship.
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function getStudentInternshipHistory(studentId) {
    return prisma.internship.findMany({
        where: {
            studentId,
            status: { in: ['COMPLETED', 'FAILED'] }
        },
        include: {
            proposal: {
                include: {
                    targetCompany: true,
                    academicYear: true,
                    proposalDocument: true,
                    appLetterDoc: true,
                    companyResponseDoc: true,
                    assignLetterDoc: true
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            seminars: {
                include: {
                    room: true,
                    moderatorStudent: {
                        include: {
                            user: true
                        }
                    },
                    beritaAcaraDocument: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            },
            guidanceSessions: {
                include: {
                    studentAnswers: {
                        include: {
                            question: true
                        }
                    },
                    lecturerAnswers: {
                        include: {
                            criteria: true
                        }
                    }
                },
                orderBy: {
                    weekNumber: 'asc'
                }
            },
            reportDocument: true,
            reportFeedbackDocument: true,
            fieldAssessmentDoc: true,
            completionCertificateDoc: true,
            companyReceiptDoc: true,
            companyReportDoc: true,
            logbookDocument: true,
            supLetter: {
                include: {
                    document: true,
                    supervisor: {
                        include: {
                            user: true
                        }
                    }
                }
            },
            lecturerScores: {
                include: {
                    chosenRubric: {
                        include: {
                            cpmk: true
                        }
                    }
                }
            },
            fieldScores: {
                include: {
                    chosenRubric: {
                        include: {
                            cpmk: true
                        }
                    }
                }
            },
            logbooks: {
                orderBy: { activityDate: 'asc' }
            }
        },
        orderBy: [
            { updatedAt: 'desc' },
            { createdAt: 'desc' }
        ]
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
export async function updateInternshipDetails(studentId, { fieldSupervisorName, fieldSupervisorEmail, fieldSupervisorPhone, fieldSupervisorNip, unitSection }) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik tidak ditemukan.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: { fieldSupervisorName, fieldSupervisorEmail, fieldSupervisorPhone, fieldSupervisorNip, unitSection }
    });
}

/**
 * Lock logbook for an internship.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function lockLogbook(studentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            isLogbookLocked: true,
            logbookLockedAt: new Date()
        }
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

    if (['APPROVED', 'SUBMITTED'].includes(internship.completionCertificateStatus)) {
        throw new Error("Dokumen sudah diunggah dan sedang diproses atau sudah disetujui.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            completionCertificateDocId: documentId,
            completionCertificateStatus: 'APPROVED' // Auto-approve
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

    if (['APPROVED', 'SUBMITTED'].includes(internship.companyReceiptStatus)) {
        throw new Error("Dokumen sudah diunggah dan sedang diproses atau sudah disetujui.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: {
            companyReceiptDocId: documentId,
            companyReceiptStatus: 'APPROVED' // Auto-approve
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

    if (internship.companyReportStatus === 'APPROVED' || ['COMPLETED', 'APPROVED'].includes(internship.fieldAssessmentStatus)) {
        throw new Error("Laporan instansi sudah terverifikasi dan tidak dapat diubah.");
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
