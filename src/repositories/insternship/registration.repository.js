import prisma from "../../config/prisma.js";

/**
 * Get all internship proposals where the student is either a coordinator or a member.
 * @param {string} studentId 
 * @returns {Promise<Array>}
 */
export async function getProposalsByStudentId(studentId) {
    return prisma.internshipProposal.findMany({
        where: {
            OR: [
                { coordinatorId: studentId },
                {
                    members: {
                        some: {
                            studentId: studentId
                        }
                    }
                }
            ]
        },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            members: {
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
            },
            companyResponses: {
                include: {
                    document: true
                }
            },
            assignmentLetters: {
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
 * Get all companies.
 * @returns {Promise<Array>}
 */
export async function getAllCompanies() {
    return prisma.company.findMany({
        orderBy: { companyName: 'asc' }
    });
}

/**
 * Get all eligible students for internship (skscompleted >= 90).
 * @returns {Promise<Array>}
 */
export async function getEligibleStudents() {
    return prisma.student.findMany({
        where: {
            skscompleted: { gte: 90 },
            // Filter out students who already have ongoing internships
            internships: {
                none: {
                    status: 'ONGOING'
                }
            },
            // Filter out coordinators of active proposals
            internshipProposalsCoordinated: {
                none: {
                    status: { in: ['PENDING', 'APPROVED_BY_SEKDEP'] }
                }
            },
            // Filter out members of active proposals
            internshipProposalMemberships: {
                none: {
                    proposal: {
                        status: { in: ['PENDING', 'APPROVED_BY_SEKDEP'] }
                    },
                    status: { in: ['PENDING', 'ACCEPTED_BY_COMPANY'] }
                }
            }
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    identityNumber: true
                }
            }
        },
        orderBy: {
            user: { fullName: 'asc' }
        }
    });
}

/**
 * Create a new company.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompany(data) {
    return prisma.company.create({ data });
}

/**
 * Get the active academic year.
 * @returns {Promise<Object>}
 */
export async function getActiveAcademicYear() {
    return prisma.academicYear.findFirst({
        where: { isActive: true }
    });
}

/**
 * Create a new internship proposal.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createProposal(data) {
    const { coordinatorId, proposalDocumentId, academicYearId, targetCompanyId, memberIds = [] } = data;

    return prisma.internshipProposal.create({
        data: {
            coordinatorId,
            proposalDocumentId,
            academicYearId,
            targetCompanyId,
            status: 'PENDING',
            members: {
                create: memberIds.map(id => ({
                    studentId: id,
                    status: 'PENDING'
                }))
            }
        },
        include: {
            members: true,
            targetCompany: true
        }
    });
}

/**
 * Find if a student has an active proposal or internship.
 * @param {string} studentId 
 * @returns {Promise<Object|null>}
 */
export async function findActiveProposalOrInternship(studentId) {
    // Check for ongoing internship
    const activeInternship = await prisma.internship.findFirst({
        where: {
            studentId,
            status: 'ONGOING'
        }
    });

    if (activeInternship) return { type: 'INTERNSHIP', data: activeInternship };

    // Check for active proposal (coordinator or member)
    const activeProposal = await prisma.internshipProposal.findFirst({
        where: {
            OR: [
                {
                    coordinatorId: studentId,
                    status: { in: ['PENDING', 'APPROVED_BY_SEKDEP'] }
                },
                {
                    members: {
                        some: {
                            studentId,
                            status: { in: ['PENDING', 'ACCEPTED_BY_COMPANY'] }
                        }
                    },
                    status: { in: ['PENDING', 'APPROVED_BY_SEKDEP'] }
                }
            ]
        },
        include: {
            targetCompany: true,
            members: {
                where: { studentId }
            }
        }
    });

    if (activeProposal) return { type: 'PROPOSAL', data: activeProposal };

    return null;
}

/**
 * Handle document record creation.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createDocument(data) {
    const { userId, documentType, fileName, filePath } = data;

    // Get or create document type
    let documentTypeRecord = null;
    if (documentType) {
        documentTypeRecord = await prisma.documentType.findFirst({
            where: { name: documentType }
        });

        if (!documentTypeRecord) {
            documentTypeRecord = await prisma.documentType.create({
                data: { name: documentType }
            });
        }
    }

    return prisma.document.create({
        data: {
            userId,
            documentTypeId: documentTypeRecord?.id || null,
            fileName,
            filePath
        }
    });
}
/**
 * Find users by their role name.
 * @param {string} roleName 
 * @returns {Promise<Array>}
 */
export async function findUsersByRole(roleName) {
    return prisma.user.findMany({
        where: {
            userHasRoles: {
                some: {
                    role: {
                        name: roleName
                    }
                }
            }
        }
    });
}

/**
 * Find an internship proposal by ID.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function findProposalById(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            identityNumber: true,
                            email: true,
                            phoneNumber: true,
                            avatarUrl: true
                        }
                    }
                }
            },
            members: {
                include: {
                    student: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    identityNumber: true,
                                    email: true
                                }
                            }
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
                }
            },
            assignmentLetters: {
                include: {
                    document: true
                }
            }
        }
    });
}
/**
 * Update the status of an internship proposal member.
 * @param {string} proposalId 
 * @param {string} studentId 
 * @param {string} status 
 * @returns {Promise<Object>}
 */
export async function updateMemberStatus(proposalId, studentId, status) {
    return prisma.internshipProposalMember.update({
        where: {
            proposalId_studentId: {
                proposalId,
                studentId
            }
        },
        data: {
            status
        },
        include: {
            proposal: {
                include: {
                    coordinator: {
                        include: {
                            user: true
                        }
                    },
                    targetCompany: true
                }
            },
            student: {
                include: {
                    user: true
                }
            }
        }
    });
}

/**
 * Create a new company response record.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompanyResponse(data) {
    return prisma.internshipCompanyResponse.create({
        data,
        include: {
            proposal: {
                include: {
                    targetCompany: true
                }
            },
            document: true
        }
    });
}

/**
 * Create company response and update member statuses transactionally.
 * @param {Object} responseData 
 * @param {Array<{studentId: string, status: string}>} memberUpdates 
 * @returns {Promise<Object>}
 */
export async function createCompanyResponseTransaction(responseData, memberUpdates) {
    return prisma.$transaction(async (tx) => {
        // 1. Create company response
        const response = await tx.internshipCompanyResponse.create({
            data: responseData,
            include: {
                proposal: {
                    include: {
                        targetCompany: true
                    }
                },
                document: true
            }
        });

        // 2. Update member statuses
        if (memberUpdates && memberUpdates.length > 0) {
            for (const update of memberUpdates) {
                await tx.internshipProposalMember.update({
                    where: {
                        proposalId_studentId: {
                            proposalId: responseData.proposalId,
                            studentId: update.studentId
                        }
                    },
                    data: {
                        status: update.status
                    }
                });
            }
        }

        return response;
    });
}
