import prisma from "../../config/prisma.js";

/**
 * Find proposals that are ready for Sekdep review.
 * A proposal is ready if no members have a PENDING status.
 * @returns {Promise<Array>}
 */
export async function findProposalsReadyForSekdep() {
    return prisma.internshipProposal.findMany({
        where: {
            members: {
                none: {
                    status: 'PENDING'
                }
            }
        },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            members: {
                where: {
                    status: 'ACCEPTED'
                },
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
            applicationLetters: {
                include: {
                    document: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Find full detail of a proposal for Sekdep.
 * Only includes members who have ACCEPTED.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findProposalDetail(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            members: {
                where: {
                    status: 'ACCEPTED'
                },
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
            applicationLetters: {
                include: {
                    document: true
                }
            }
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
            sekdepNotes: notes
        }
    });
}

/**
 * Get all companies with the count of proposals and total interns.
 * @returns {Promise<Array>}
 */
export async function findCompaniesWithStats() {
    return prisma.company.findMany({
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
                            id: true
                        }
                    }
                }
            }
        },
        orderBy: {
            companyName: 'asc'
        }
    });
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
