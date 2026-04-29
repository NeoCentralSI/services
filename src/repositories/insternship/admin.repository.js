import prisma from "../../config/prisma.js";

/**
 * Find internship proposals that have been approved by the Sekdep.
 * After consolidation, application letter data is on the proposal itself.
 * @returns {Promise<Array>}
 */
export async function findApprovedProposals(academicYearId) {
    const where = {
        OR: [
            { status: 'APPROVED_PROPOSAL' },
            { appLetterDocNumber: { not: null } }
        ]
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
        include: {
            coordinator: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            internships: {
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
                }
            },
            targetCompany: true,
            appLetterDoc: true,
            academicYear: true
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Find all users who have the role 'Admin'.
 * @returns {Promise<Array>}
 */
export async function findAdmins() {
    return prisma.user.findMany({
        where: {
            userHasRoles: {
                some: {
                    role: {
                        name: 'Admin'
                    }
                }
            }
        },
        select: {
            id: true
        }
    });
}

/**
 * Find a single proposal with detailed info for SP management.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findProposalForLetter(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            internships: {
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
                }
            },
            targetCompany: true,
            appLetterDoc: true
        }
    });
}

/**
 * Update application letter details directly on InternshipProposal.
 * @param {string} proposalId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateApplicationLetter(proposalId, data) {
    const { documentNumber, startDatePlanned, endDatePlanned } = data;

    // Strict validation: Check if appLetterDocNumber is same as assignLetterDocNumber
    const proposal = await prisma.internshipProposal.findUnique({
        where: { id: proposalId },
        select: { assignLetterDocNumber: true }
    });

    if (proposal && proposal.assignLetterDocNumber === documentNumber) {
        const error = new Error("Nomor surat permohonan tidak boleh sama dengan nomor surat tugas.");
        error.statusCode = 400;
        throw error;
    }

    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            appLetterDocNumber: documentNumber,
            appLetterDateIssued: new Date(),
            startDatePlanned: startDatePlanned ? new Date(startDatePlanned) : null,
            endDatePlanned: endDatePlanned ? new Date(endDatePlanned) : null
        }
    });
}

/**
 * Update the document ID of the application letter on the proposal.
 * @param {string} proposalId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateLetterDocumentId(proposalId, documentId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            appLetterDocId: documentId
        }
    });
}

/**
 * Find internship proposals that have an approved company response.
 * After consolidation, company response status is tracked via proposal status.
 * @returns {Promise<Array>}
 */
export async function findProposalsForAssignment(academicYearId) {
    const where = {
        OR: [
            { status: 'WAITING_FOR_VERIFICATION' },
            { status: 'ACCEPTED_BY_COMPANY' },
            { status: 'PARTIALLY_ACCEPTED' },
            { assignLetterDocNumber: { not: null } },
            {
                appLetterSignedById: { not: null },
                companyResponseDocId: null,
                status: 'APPROVED_PROPOSAL'
            }
        ]
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
        include: {
            coordinator: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            internships: {
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
                }
            },
            targetCompany: true,
            assignLetterDoc: true,
            companyResponseDoc: true,
            appLetterDoc: true,
            academicYear: true
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Update the company response document on a proposal (admin upload).
 * Sets status to WAITING_FOR_VERIFICATION.
 * @param {string} proposalId
 * @param {string} documentId
 * @returns {Promise<Object>}
 */
export async function updateCompanyResponseDoc(proposalId, documentId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            companyResponseDocId: documentId,
            status: 'WAITING_FOR_VERIFICATION'
        },
        include: {
            targetCompany: true,
            coordinator: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            internships: {
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
                }
            }
        }
    });
}

/**
 * Find single proposal for assignment letter management.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findProposalForAssignment(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: {
                    user: {
                        select: {
                            fullName: true,
                            identityNumber: true
                        }
                    }
                }
            },
            internships: {
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
                }
            },
            targetCompany: true,
            companyResponseDoc: true,
            assignLetterDoc: true
        }
    });
}

/**
 * Update assignment letter details directly on InternshipProposal.
 * @param {string} proposalId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateAssignmentLetter(proposalId, data) {
    const { documentNumber, startDateActual, endDateActual } = data;

    // Strict validation: Check if assignLetterDocNumber is same as appLetterDocNumber
    const proposal = await prisma.internshipProposal.findUnique({
        where: { id: proposalId },
        select: { appLetterDocNumber: true }
    });

    if (proposal && proposal.appLetterDocNumber === documentNumber) {
        const error = new Error("Nomor surat tugas tidak boleh sama dengan nomor surat permohonan.");
        error.statusCode = 400;
        throw error;
    }

    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            assignLetterDocNumber: documentNumber,
            assignLetterDateIssued: new Date(),
            startDateActual: startDateActual ? new Date(startDateActual) : null,
            endDateActual: endDateActual ? new Date(endDateActual) : null
        }
    });
}

/**
 * Update the document ID of the assignment letter on the proposal.
 * @param {string} proposalId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateAssignmentLetterDocumentId(proposalId, documentId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            assignLetterDocId: documentId
        }
    });
}

/**
 * Find a lecturer by their ID.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findLecturerById(id) {
    return prisma.lecturer.findUnique({
        where: { id },
        include: {
            user: true
        }
    });
}
