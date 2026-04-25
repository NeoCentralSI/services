import prisma from "../../config/prisma.js";

/**
 * Find all internship proposals for Sekdep.
 * Optionally filter by academic year.
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function findAllProposals(academicYearId) {
    const whereClause = {
        internships: {
            none: {
                status: 'PENDING'
            }
        }
    };

    if (academicYearId && academicYearId !== 'all') {
        whereClause.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where: whereClause,
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            internships: {
                include: {
                    student: {
                        include: {
                            user: true
                        }
                    }
                }
            },
            targetCompany: true,
            proposalDocument: true,
            appLetterDoc: true,
            companyResponseDoc: true,
            assignLetterDoc: true,
            academicYear: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Find pending internship proposals for Sekdep.
 * @param {Object} params
 */
export async function findPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const whereClause = {
        status: {
            in: ['PENDING', 'APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', 'WAITING_FOR_VERIFICATION', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'REJECTED_BY_COMPANY']
        },
        internships: {
            none: {
                status: 'PENDING'
            }
        }
    };

    if (academicYearId && academicYearId !== 'all') {
        whereClause.academicYearId = academicYearId;
    }

    if (q) {
        whereClause.OR = [
            { coordinator: { user: { fullName: { contains: q } } } },
            { coordinator: { user: { identityNumber: { contains: q } } } },
            { targetCompany: { companyName: { contains: q } } }
        ];
    }

    let orderBy = { createdAt: 'desc' };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'namaCompany': orderBy = { targetCompany: { companyName: order } }; break;
            case 'tahunAjaran': orderBy = { academicYear: { year: order } }; break;
            case 'status': orderBy = { status: order }; break;
            default: orderBy = { createdAt: 'desc' };
        }
    }

    return prisma.internshipProposal.findMany({
        where: whereClause,
        skip,
        take,
        include: {
            coordinator: { include: { user: true } },
            internships: { include: { student: { include: { user: true } } } },
            targetCompany: true,
            proposalDocument: true,
            appLetterDoc: true,
            companyResponseDoc: true,
            assignLetterDoc: true,
            academicYear: true
        },
        orderBy
    });
}

/**
 * Count pending proposals for Sekdep.
 * @param {Object} params
 */
export async function countPendingProposals({ academicYearId, q }) {
    const whereClause = {
        status: {
            in: ['PENDING', 'APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', 'WAITING_FOR_VERIFICATION', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'REJECTED_BY_COMPANY']
        },
        internships: {
            none: {
                status: 'PENDING'
            }
        }
    };

    if (academicYearId && academicYearId !== 'all') {
        whereClause.academicYearId = academicYearId;
    }

    if (q) {
        whereClause.OR = [
            { coordinator: { user: { fullName: { contains: q } } } },
            { coordinator: { user: { identityNumber: { contains: q } } } },
            { targetCompany: { companyName: { contains: q } } }
        ];
    }

    return prisma.internshipProposal.count({ where: whereClause });
}

/**
 * Find proposals waiting for response verification for Sekdep.
 * @param {Object} params
 */
export async function findPendingResponses({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const whereClause = {
        status: {
            in: ['ACCEPTED_BY_COMPANY', 'WAITING_FOR_VERIFICATION', 'REJECTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'APPROVED_PROPOSAL']
        }
    };

    if (academicYearId && academicYearId !== 'all') {
        whereClause.academicYearId = academicYearId;
    }

    if (q) {
        whereClause.OR = [
            { coordinator: { user: { fullName: { contains: q } } } },
            { coordinator: { user: { identityNumber: { contains: q } } } },
            { targetCompany: { companyName: { contains: q } } }
        ];
    }

    let orderBy = { createdAt: 'desc' };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'namaCompany': orderBy = { targetCompany: { companyName: order } }; break;
            case 'tahunAjaran': orderBy = { academicYear: { year: order } }; break;
            case 'status': orderBy = { status: order }; break;
            default: orderBy = { createdAt: 'desc' };
        }
    }

    return prisma.internshipProposal.findMany({
        where: whereClause,
        skip,
        take,
        include: {
            coordinator: { include: { user: true } },
            internships: { include: { student: { include: { user: true } } } },
            targetCompany: true,
            companyResponseDoc: true,
            appLetterDoc: true,
            assignLetterDoc: true,
            academicYear: true
        },
        orderBy
    });
}

/**
 * Count pending responses for Sekdep.
 * @param {Object} params
 */
export async function countPendingResponses({ academicYearId, q }) {
    const whereClause = {
        status: {
            in: ['ACCEPTED_BY_COMPANY', 'WAITING_FOR_VERIFICATION', 'REJECTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'APPROVED_PROPOSAL']
        }
    };

    if (academicYearId && academicYearId !== 'all') {
        whereClause.academicYearId = academicYearId;
    }

    if (q) {
        whereClause.OR = [
            { coordinator: { user: { fullName: { contains: q } } } },
            { coordinator: { user: { identityNumber: { contains: q } } } },
            { targetCompany: { companyName: { contains: q } } }
        ];
    }

    return prisma.internshipProposal.count({ where: whereClause });
}


/**
 * Find full detail of a proposal for Sekdep.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findProposalDetail(id) {
    return prisma.internshipProposal.findFirst({
        where: {
            id
        },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            internships: {
                include: {
                    student: {
                        include: {
                            user: true
                        }
                    }
                }
            },
            targetCompany: true,
            proposalDocument: true,
            appLetterDoc: true,
            appLetterSignedBy: {
                include: {
                    user: true
                }
            },
            companyResponseDoc: true,
            assignLetterDoc: true,
            academicYear: true
        }
    });
}

/**
 * Update an internship proposal status.
 * @param {string} id 
 * @param {string} status 
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export async function updateProposalStatus(id, status, notes) {
    return prisma.internshipProposal.update({
        where: { id },
        data: {
            status,
            proposalSekdepNotes: notes
        }
    });
}

/**
 * Find all companies with their proposal counts and intern stats.
 * @param {Object} params
 */
export async function findCompaniesWithStats({ q, skip, take, sortBy, sortOrder, status } = {}) {
    const whereClause = {};

    if (q) {
        whereClause.OR = [
            { companyName: { contains: q } },
            { companyAddress: { contains: q } }
        ];
    }

    if (status && status !== 'all') {
        whereClause.status = status;
    }

    let orderBy = { companyName: 'asc' };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'companyName': orderBy = { companyName: order }; break;
            case 'status': orderBy = { status: order }; break;
            default: orderBy = { companyName: 'asc' };
        }
    }

    return prisma.company.findMany({
        where: whereClause,
        skip,
        take,
        include: {
            _count: {
                select: {
                    internshipProposals: true
                }
            },
            internshipProposals: {
                select: {
                    internships: {
                        select: {
                            studentId: true
                        }
                    }
                }
            }
        },
        orderBy
    });
}

/**
 * Count companies for Sekdep to support pagination.
 * @param {Object} params
 */
export async function countCompanies({ q, status } = {}) {
    const whereClause = {};

    if (q) {
        whereClause.OR = [
            { companyName: { contains: q } },
            { companyAddress: { contains: q } }
        ];
    }

    if (status && status !== 'all') {
        whereClause.status = status;
    }

    return prisma.company.count({ where: whereClause });
}

/**
 * Create a new company.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompany(data) {
    return prisma.company.create({
        data: {
            companyName: data.companyName,
            companyAddress: data.companyAddress,
            alasan: data.alasan,
            status: data.status || 'save'
        }
    });
}

/**
 * Update an existing company.
 * @param {string} id 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateCompany(id, data) {
    return prisma.company.update({
        where: { id },
        data: {
            companyName: data.companyName,
            companyAddress: data.companyAddress,
            alasan: data.alasan,
            status: data.status
        }
    });
}

/**
 * Delete a company.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function deleteCompany(id) {
    return prisma.company.delete({
        where: { id }
    });
}

/**
 * Find a proposal by ID to verify its company response.
 * After consolidation, company response data is on the proposal itself.
 * @param {string} id - Proposal ID
 * @returns {Promise<Object|null>}
 */
export async function findCompanyResponseById(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            internships: true,
            coordinator: true,
            targetCompany: true
        }
    });
}



/**
 * Verify company response and update related statuses.
 * After consolidation, this updates proposal status and internship statuses directly.
 * @param {string} proposalId 
 * @param {string} proposalStatus 
 * @param {Array<{studentId: string, status: string}>} internshipUpdates 
 * @param {string} [notes] 
 * @returns {Promise<Object>}
 */
export async function verifyCompanyResponseTransaction(proposalId, proposalStatus, internshipUpdates, notes) {
    return prisma.$transaction(async (tx) => {
        // 1. Update proposal status and response notes
        const updatedProposal = await tx.internshipProposal.update({
            where: { id: proposalId },
            data: {
                status: proposalStatus,
                companyResponseNotes: notes
            },
            include: {
                coordinator: true,
                internships: {
                    include: {
                        student: true
                    }
                },
                targetCompany: true
            }
        });

        // 2. Update internship statuses
        if (internshipUpdates && internshipUpdates.length > 0) {
            for (const update of internshipUpdates) {
                await tx.internship.updateMany({
                    where: {
                        proposalId,
                        studentId: update.studentId
                    },
                    data: { status: update.status }
                });
            }
        }

        return updatedProposal;
    });
}

/**
 * Find all internships with standard mapping for Sekdep.
 * @param {Object} params
 * @param {string} [params.academicYearId]
 * @param {string} [params.status]
 * @param {string} [params.supervisorId]
 * @param {string} [params.q]
 * @param {number} [params.skip]
 * @param {number} [params.take]
 * @param {string} [params.sortBy]
 * @param {string} [params.sortOrder]
 * @returns {Promise<Array>}
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
 * @param {string} [params.academicYearId]
 * @param {string} [params.status]
 * @param {string} [params.supervisorId]
 * @param {string} [params.q]
 * @returns {Promise<number>}
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
 * Bulk update supervisor for multiple internships.
 * @param {Array<string>} internshipIds 
 * @param {string} supervisorId 
 * @returns {Promise<Object>}
 */
export async function bulkUpdateInternshipSupervisor(internshipIds, supervisorId) {
    return prisma.$transaction(async (tx) => {
        // Update all selected internships
        const result = await tx.internship.updateMany({
            where: {
                id: { in: internshipIds }
            },
            data: {
                supervisorId,
                status: 'ONGOING' // Automatically set to ONGOING when assigned
            }
        });

        return result;
    });
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
                    activityDate: 'desc'
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
            companyReceiptDoc: true
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
/**
 * Find lecturers with their active internship workload counts for Sekdep.
 * @param {Object} params
 */
export async function findLecturersWithWorkload({ q, skip, take, sortBy, sortOrder, academicYearId }) {
    const whereClause = {};

    if (q) {
        whereClause.user = {
            OR: [
                { fullName: { contains: q } },
                { identityNumber: { contains: q } }
            ]
        };
    }

    let orderBy = { user: { fullName: 'asc' } };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'name': orderBy = { user: { fullName: order } }; break;
            case 'nip': orderBy = { user: { identityNumber: order } }; break;
            default: orderBy = { user: { fullName: 'asc' } };
        }
    }

    return prisma.lecturer.findMany({
        where: whereClause,
        skip,
        take,
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: {
                    status: 'ONGOING',
                    ...(academicYearId ? { proposal: { academicYearId } } : {})
                },
                select: {
                    supLetterId: true
                }
            },
            _count: {
                select: {
                    internshipsSupervisored: {
                        where: {
                            status: 'ONGOING',
                            ...(academicYearId ? { proposal: { academicYearId } } : {})
                        }
                    }
                }
            }
        },
        orderBy
    });
}

/**
 * Count lecturers for Sekdep workload panel.
 * @param {Object} params
 */
export async function countLecturersWithWorkload({ q, academicYearId }) {
    const whereClause = {};

    if (q) {
        whereClause.user = {
            OR: [
                { fullName: { contains: q } },
                { identityNumber: { contains: q } }
            ]
        };
    }

    return prisma.lecturer.count({ where: whereClause });
}

/**
 * Find internships with student user data.
 * @param {Array<string>} internshipIds 
 * @returns {Promise<Array<Object>>}
 */
export async function findInternshipsWithStudents(internshipIds) {
    return prisma.internship.findMany({
        where: { id: { in: internshipIds } },
        include: {
            student: {
                include: { user: true }
            }
        }
    });
}

/**
 * Find all lecturers and their assigned students for PDF export.
 * @returns {Promise<Array<Object>>}
 */
export async function findAllLecturerWorkload() {
    return prisma.lecturer.findMany({
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: {
                    status: 'ONGOING'
                },
                include: {
                    student: {
                        include: {
                            user: {
                                select: {
                                    fullName: true,
                                    identityNumber: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    student: {
                        user: {
                            fullName: 'asc'
                        }
                    }
                }
            }
        },
        orderBy: {
            user: {
                fullName: 'asc'
            }
        }
    });
}

/**
 * Find a lecturer with their ongoing internships assigned for supervisor letter generation.
 * @param {string} lecturerId 
 * @returns {Promise<Object|null>}
 */
export async function findLecturerForLetter(lecturerId) {
    return prisma.lecturer.findUnique({
        where: { id: lecturerId },
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: { status: 'ONGOING' },
                include: {
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
                    proposal: {
                        include: {
                            targetCompany: true
                        }
                    },
                    supLetter: {
                        include: {
                            document: true
                        }
                    }
                }
            }
        }
    });
}

/**
 * Find a supervisor letter by its document number.
 * @param {string} documentNumber 
 */
export async function findSupervisorLetterByNumber(documentNumber) {
    return prisma.internshipSupervisorLetter.findUnique({
        where: { documentNumber },
        include: {
            supervisor: {
                include: { user: true }
            }
        }
    });
}

/**
 * Upsert a supervisor letter.
 * @param {Object} data 
 */
export async function upsertSupervisorLetter(data) {
    const { documentNumber, dateIssued, startDate, endDate, supervisorId, documentId } = data;

    return prisma.internshipSupervisorLetter.upsert({
        where: { documentNumber },
        update: {
            dateIssued,
            startDate,
            endDate,
            supervisorId,
            documentId
        },
        create: {
            documentNumber,
            dateIssued,
            startDate,
            endDate,
            supervisorId,
            documentId
        }
    });
}

/**
 * Link internships to a supervisor letter.
 * @param {Array<string>} internshipIds 
 * @param {string} supLetterId 
 */
export async function linkInternshipsToLetter(internshipIds, supLetterId) {
    return prisma.internship.updateMany({
        where: { id: { in: internshipIds } },
        data: {
            supLetterId
        }
    });
}

/**
 * Update supervisor letter details for multiple internships in bulk.
 * @deprecated Use upsertSupervisorLetter and linkInternshipsToLetter instead.
 */
export async function updateSupervisorLetterBulk(internshipIds, data) {
    // This is now handled by the service using newer methods
    throw new Error("Deprecated: Use upsertSupervisorLetter and linkInternshipsToLetter in the service layer.");
}
