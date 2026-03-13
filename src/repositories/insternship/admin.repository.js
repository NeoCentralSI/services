import prisma from "../../config/prisma.js";

/**
 * Find internship proposals that have been approved by the Sekdep.
 * After consolidation, application letter data is on the proposal itself.
 * @returns {Promise<Array>}
 */
export async function findApprovedProposals() {
    return prisma.internshipProposal.findMany({
        where: {
            OR: [
                { status: 'APPROVED_PROPOSAL' },
                { appLetterDocNumber: { not: null } }
            ]
        },
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
                where: {
                    status: { in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY'] }
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
                }
            },
            targetCompany: true,
            appLetterDoc: true
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
                where: {
                    status: { in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY'] }
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
export async function findProposalsForAssignment() {
    return prisma.internshipProposal.findMany({
        where: {
            OR: [
                { status: 'ACCEPTED_BY_COMPANY' },
                { status: 'PARTIALLY_ACCEPTED' },
                { assignLetterDocNumber: { not: null } }
            ]
        },
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
                where: {
                    status: { in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY'] }
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
                }
            },
            targetCompany: true,
            assignLetterDoc: true,
            companyResponseDoc: true
        },
        orderBy: {
            updatedAt: 'desc'
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
                where: {
                    status: { in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY'] }
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
