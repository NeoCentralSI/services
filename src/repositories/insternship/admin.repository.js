import prisma from "../../config/prisma.js";

/**
 * Find internship proposals that have been approved by the Sekdep.
 * @returns {Promise<Array>}
 */
export async function findApprovedProposals() {
    return prisma.internshipProposal.findMany({
        where: {
            status: 'APPROVED_BY_SEKDEP'
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
            members: {
                where: {
                    status: 'ACCEPTED'
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
            applicationLetters: {
                include: {
                    document: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 1
            }
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
            members: {
                where: {
                    status: 'ACCEPTED'
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
            applicationLetters: {
                include: {
                    document: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 1
            }
        }
    });
}

/**
 * Upsert application letter details for a proposal.
 * @param {string} proposalId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateApplicationLetter(proposalId, data) {
    const { documentNumber, startDatePlanned, endDatePlanned } = data;

    // Find existing latest letter to update or create new one
    const latestLetter = await prisma.internshipApplicationLetter.findFirst({
        where: { proposalId },
        orderBy: { createdAt: 'desc' }
    });

    if (latestLetter) {
        return prisma.internshipApplicationLetter.update({
            where: { id: latestLetter.id },
            data: {
                documentNumber,
                dateIssued: new Date(),
                startDatePlanned: startDatePlanned ? new Date(startDatePlanned) : null,
                endDatePlanned: endDatePlanned ? new Date(endDatePlanned) : null
            }
        });
    }

    return prisma.internshipApplicationLetter.create({
        data: {
            proposal: { connect: { id: proposalId } },
            documentNumber,
            dateIssued: new Date(),
            startDatePlanned: startDatePlanned ? new Date(startDatePlanned) : null,
            endDatePlanned: endDatePlanned ? new Date(endDatePlanned) : null
        }
    });
}

/**
 * Update the document ID of an application letter.
 * @param {string} letterId 
 * @param {string} documentId 
 * @returns {Promise<Object>}
 */
export async function updateLetterDocumentId(letterId, documentId) {
    return prisma.internshipApplicationLetter.update({
        where: { id: letterId },
        data: {
            documentId: documentId
        }
    });
}
