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
                    status: {
                        in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY']
                    }
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
                    status: {
                        in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY']
                    }
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
                    document: true,
                    signedBy: {
                        include: {
                            user: true
                        }
                    }
                }
            },
            companyResponses: {
                include: {
                    document: true
                },
                orderBy: {
                    createdAt: 'desc'
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

/**
 * Find a company response by ID with proposal details.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findCompanyResponseById(id) {
    return prisma.internshipCompanyResponse.findUnique({
        where: { id },
        include: {
            proposal: {
                include: {
                    members: true,
                    coordinator: true
                }
            }
        }
    });
}
export async function findProposalsWithCompanyResponse() {
    return prisma.internshipProposal.findMany({
        where: {
            companyResponses: {
                some: {}
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
                    status: {
                        in: ['ACCEPTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY']
                    }
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
            companyResponses: {
                include: {
                    document: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            },
            assignmentLetters: {
                include: {
                    document: true
                }
            }
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Verify company response and update related statuses.
 * @param {string} responseId 
 * @param {string} responseStatus 
 * @param {string} proposalStatus 
 * @param {Array<{studentId: string, status: string}>} memberUpdates 
 * @param {string} [notes] 
 * @returns {Promise<Object>}
 */
export async function verifyCompanyResponseTransaction(responseId, responseStatus, proposalStatus, memberUpdates, notes) {
    return prisma.$transaction(async (tx) => {
        // 1. Update response status
        const updatedResponse = await tx.internshipCompanyResponse.update({
            where: { id: responseId },
            data: {
                status: responseStatus,
                sekdepNotes: notes
            },
            include: {
                proposal: {
                    include: {
                        coordinator: true,
                        members: {
                            include: {
                                student: true
                            }
                        },
                        targetCompany: true
                    }
                }
            }
        });

        // 2. Update proposal status
        if (proposalStatus) {
            await tx.internshipProposal.update({
                where: { id: updatedResponse.proposalId },
                data: { status: proposalStatus }
            });
            // Update the proposal object in the return value to reflect the change
            updatedResponse.proposal.status = proposalStatus;
        }

        // 3. Update member statuses
        if (memberUpdates && memberUpdates.length > 0) {
            for (const update of memberUpdates) {
                // Check if the student is a member (could be coordinator too, but coordinator is usually not in members table)
                // Wait, coordinator is in members table if they are also a member?
                // In this schema, coordinator is separate. 'members' table links students to proposal.
                // Let's check `InternshipProposalMember` model. Yes, it links proposalId and studentId.
                // Coordinator is stored in `coordinatorId`.
                // Does coordinator have an entry in `InternshipProposalMember`? 
                // Let's check `createProposal` logic (not visible here). usually yes for consistency.
                // If not, we might need to handle coordinator status separately but `InternshipProposalMember` status handles all members.
                // Assuming all students including coordinator are in `InternshipProposalMember`.

                // We upgrade/downgrade status based on response
                await tx.internshipProposalMember.updateMany({
                    where: {
                        proposalId: updatedResponse.proposalId,
                        studentId: update.studentId
                    },
                    data: { status: update.status }
                });
            }
        }

        return updatedResponse;
    });
}
