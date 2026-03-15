import prisma from "../../config/prisma.js";

/**
 * Get active internship for a student.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentInternship(studentId) {
    return prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' },
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
export async function updateInternshipDetails(studentId, { fieldSupervisorName, unitSection }) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik tidak ditemukan.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: { fieldSupervisorName, unitSection }
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
 * Create a new internship seminar request.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function createSeminarRequest(studentId) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik aktif tidak ditemukan.");
    }

    return prisma.internshipSeminar.create({
        data: {
            internshipId: internship.id,
            status: 'REQUESTED'
        }
    });
}
