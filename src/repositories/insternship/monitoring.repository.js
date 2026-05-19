import prisma from "../../config/prisma.js";

/**
 * Find all internships with standard mapping for Sekdep.
 * @param {Object} params
 */
export async function findInternships({ academicYearId, status, supervisorId, q, skip, take, sortBy, sortOrder }) {
    const whereClause = {};

    if (academicYearId && academicYearId !== 'all') {
        whereClause.proposal = {
            academicYearId: academicYearId
        };
    }

    if (status && status !== 'all') {
        whereClause.status = status;
    } else {
        whereClause.status = {
            in: ['ONGOING', 'COMPLETED', 'ACCEPTED_BY_COMPANY']
        };
    }

    if (supervisorId) {
        whereClause.supervisorId = supervisorId;
    }

    if (q) {
        whereClause.OR = [
            { student: { user: { fullName: { contains: q } } } },
            { student: { user: { identityNumber: { contains: q } } } },
            { proposal: { targetCompany: { companyName: { contains: q } } } },
            { supervisor: { user: { fullName: { contains: q } } } }
        ];
    }

    // Mapping sortBy field to Prisma relations
    let orderBy = { createdAt: 'desc' };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'name':
                orderBy = { student: { user: { fullName: order } } };
                break;
            case 'nim':
                orderBy = { student: { user: { identityNumber: order } } };
                break;
            case 'companyName':
                orderBy = { proposal: { targetCompany: { companyName: order } } };
                break;
            case 'academicYear':
                orderBy = { proposal: { academicYear: { year: order } } };
                break;
            case 'status':
                orderBy = { status: order };
                break;
            case 'supervisor':
                orderBy = { supervisor: { user: { fullName: order } } };
                break;
            case 'createdAt':
                orderBy = { createdAt: order };
                break;
            default:
                orderBy = { createdAt: 'desc' };
        }
    }

    return prisma.internship.findMany({
        where: whereClause,
        skip,
        take,
        orderBy,
        include: {
            student: {
                include: {
                    user: true
                }
            },
            proposal: {
                include: {
                    targetCompany: true,
                    academicYear: true
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            supLetter: {
                include: {
                    document: true
                }
            },
            _count: {
                select: {
                    logbooks: {
                        where: {
                            activityDescription: { not: "" }
                        }
                    }
                }
            },
            logbooks: {
                select: {
                    id: true
                }
            }
        }
    });
}

/**
 * Count internships for Sekdep.
 * @param {Object} params
 */
export async function countInternships({ academicYearId, status, supervisorId, q }) {
    const whereClause = {};

    if (academicYearId && academicYearId !== 'all') {
        whereClause.proposal = { academicYearId };
    }

    if (status && status !== 'all') {
        whereClause.status = status;
    } else {
        whereClause.status = { in: ['ONGOING', 'COMPLETED', 'ACCEPTED_BY_COMPANY'] };
    }

    if (supervisorId) {
        whereClause.supervisorId = supervisorId;
    }

    if (q) {
        whereClause.OR = [
            { student: { user: { fullName: { contains: q } } } },
            { student: { user: { identityNumber: { contains: q } } } },
            { proposal: { targetCompany: { companyName: { contains: q } } } },
            { supervisor: { user: { fullName: { contains: q } } } }
        ];
    }

    return prisma.internship.count({ where: whereClause });
}

/**
 * Find full detail of an internship for Sekdep dashboard.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function findInternshipById(id) {
    return prisma.internship.findUnique({
        where: { id },
        include: {
            student: {
                include: {
                    user: true
                }
            },
            proposal: {
                include: {
                    targetCompany: true,
                    academicYear: {
                        include: {
                            internshipGuidanceQuestions: {
                                select: {
                                    weekNumber: true
                                }
                            }
                        }
                    }
                }
            },
            supervisor: {
                include: {
                    user: true
                }
            },
            _count: {
                select: {
                    logbooks: {
                        where: {
                            activityDescription: { not: "" }
                        }
                    }
                }
            },
            logbooks: {
                select: {
                    id: true,
                    activityDate: true,
                    activityDescription: true,
                    createdAt: true
                },
                orderBy: {
                    activityDate: 'asc'
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
                            criteria: {
                                include: {
                                    options: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    weekNumber: 'asc'
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
            reportDocument: true,
            logbookDocument: true,
            completionCertificateDoc: true,
            companyReceiptDoc: true,
            fieldAssessmentDoc: true
        }
    });
}

/**
 * Update verification status and notes for an internship document.
 * @param {string} internshipId 
 * @param {Object} data - { documentType, status, notes }
 * @returns {Promise<Object>}
 */
export async function updateDocumentVerification(internshipId, { documentType, status, notes }) {
    const data = {};
    const statusField = `${documentType}Status`;
    const notesField = `${documentType}Notes`;

    data[statusField] = status;
    data[notesField] = notes;

    return prisma.internship.update({
        where: { id: internshipId },
        data
    });
}

/**
 * Bulk update verification status and notes for multiple internship documents in a single transaction.
 * @param {string} internshipId 
 * @param {Array<Object>} documents - [{ documentType, status, notes }]
 * @returns {Promise<Object>}
 */
export async function bulkUpdateDocumentVerification(internshipId, documents) {
    return prisma.$transaction(async (tx) => {
        const data = {};

        // Build data object with all document updates
        for (const doc of documents) {
            const statusField = `${doc.documentType}Status`;
            const notesField = `${doc.documentType}Notes`;

            data[statusField] = doc.status;
            if (doc.notes !== undefined) {
                data[notesField] = doc.notes;
            }
        }

        // Single update query for all documents
        return tx.internship.update({
            where: { id: internshipId },
            data
        });
    });
}
