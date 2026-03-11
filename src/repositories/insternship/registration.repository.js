import prisma from "../../config/prisma.js";

/**
 * Get all internship proposals where the student is either a coordinator or has an internship.
 * After consolidation, uses `internships` relation instead of `members`.
 * @param {string} studentId 
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function getProposalsByStudentId(studentId, academicYearId) {
    const whereClause = {
        OR: [
            { coordinatorId: studentId },
            {
                internships: {
                    some: {
                        studentId: studentId
                    }
                }
            }
        ]
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
 * After consolidation, checks internship records instead of proposal memberships.
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
                    status: { in: ['PENDING', 'APPROVED_PROPOSAL'] }
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
 * After consolidation, members are created as Internship records with PENDING status.
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
            internships: {
                create: [
                    { studentId: coordinatorId, status: 'ACCEPTED' },
                    ...memberIds.map(id => ({
                        studentId: id,
                        status: 'PENDING'
                    }))
                ]
            }
        },
        include: {
            internships: true,
            targetCompany: true
        }
    });
}

/**
 * Update an existing internship proposal.
 * Resets status to PENDING and handles member update by replacement.
 * @param {string} proposalId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateProposal(proposalId, data) {
    const { proposalDocumentId, targetCompanyId, memberIds = [] } = data;

    return prisma.$transaction(async (tx) => {
        // 1. Get old document info for deletion
        const oldProposal = await tx.internshipProposal.findUnique({
            where: { id: proposalId },
            select: { proposalDocumentId: true }
        });

        // 2. Update proposal basic info and reset status
        await tx.internshipProposal.update({
            where: { id: proposalId },
            data: {
                proposalDocumentId,
                targetCompanyId,
                status: 'PENDING',
                updatedAt: new Date(),
                proposalSekdepNotes: null
            }
        });

        // 3. Delete old document record if it changed
        if (oldProposal?.proposalDocumentId && oldProposal.proposalDocumentId !== proposalDocumentId) {
            await tx.document.delete({
                where: { id: oldProposal.proposalDocumentId }
            }).catch(err => {
                console.error("Failed to delete old proposal document:", err);
                // Non-critical, so we continue
            });
        }

        // 4. Handle members: Preserve statuses for existing members, add new ones, remove old ones
        const currentInternships = await tx.internship.findMany({
            where: { proposalId }
        });
        const currentStudentIds = currentInternships.map(i => i.studentId);

        // Required IDs now include the coordinator
        const requiredStudentIds = [coordinatorId, ...memberIds];

        // Members to keep (exists in current and required)
        const membersToKeep = requiredStudentIds.filter(id => currentStudentIds.includes(id));
        // Members to add (required but doesn't exist)
        const membersToAdd = requiredStudentIds.filter(id => !currentStudentIds.includes(id));
        // Members to remove (exists but not required)
        const membersToRemove = currentStudentIds.filter(id => !requiredStudentIds.includes(id));

        // Delete removed members
        if (membersToRemove.length > 0) {
            await tx.internship.deleteMany({
                where: {
                    proposalId,
                    studentId: { in: membersToRemove }
                }
            });
        }

        // Add new members
        if (membersToAdd.length > 0) {
            await tx.internship.createMany({
                data: membersToAdd.map(id => ({
                    proposalId,
                    studentId: id,
                    status: id === coordinatorId ? 'ACCEPTED' : 'PENDING'
                }))
            });
        }

        return tx.internshipProposal.findUnique({
            where: { id: proposalId },
            include: {
                internships: true,
                targetCompany: true
            }
        });
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

    // Check for active proposal (coordinator or member via internship)
    const activeProposal = await prisma.internshipProposal.findFirst({
        where: {
            OR: [
                {
                    coordinatorId: studentId,
                    status: { in: ['PENDING', 'APPROVED_PROPOSAL', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED'] }
                },
                {
                    internships: {
                        some: {
                            studentId,
                            status: { in: ['PENDING', 'ACCEPTED', 'ACCEPTED_BY_COMPANY'] }
                        }
                    },
                    status: { in: ['PENDING', 'APPROVED_PROPOSAL', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED'] }
                }
            ]
        },
        include: {
            targetCompany: true,
            internships: {
                where: { studentId }
            }
        }
    });

    if (activeProposal) return { type: 'PROPOSAL', data: activeProposal };

    return null;
}

/**
 * Delete a proposal and its associated documents.
 * @param {string} proposalId 
 * @returns {Promise<Object>}
 */
export async function deleteProposal(proposalId) {
    return prisma.$transaction(async (tx) => {
        // 1. Get proposal to find document IDs
        const proposal = await tx.internshipProposal.findUnique({
            where: { id: proposalId },
            select: {
                proposalDocumentId: true,
                appLetterDocId: true,
                companyResponseDocId: true,
                assignLetterDocId: true
            }
        });

        if (!proposal) {
            throw new Error("Proposal tidak ditemukan.");
        }

        const docIds = [
            proposal.proposalDocumentId,
            proposal.appLetterDocId,
            proposal.companyResponseDocId,
            proposal.assignLetterDocId
        ].filter(Boolean);

        // 2. Delete the proposal (cascades to internships)
        await tx.internshipProposal.delete({
            where: { id: proposalId }
        });

        // 3. Delete Document records
        if (docIds.length > 0) {
            await tx.document.deleteMany({
                where: { id: { in: docIds } }
            }).catch(err => {
                console.error("Failed to cleanup document records for deleted proposal:", err);
            });
        }

        return { success: true };
    });
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
 * After consolidation, includes flat letter fields and internships instead of members.
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
            internships: {
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
 * Update the status of an internship record (replaces updateMemberStatus).
 * After consolidation, member status is tracked via Internship.status.
 * @param {string} proposalId 
 * @param {string} studentId 
 * @param {string} status 
 * @returns {Promise<Object>}
 */
export async function updateMemberStatus(proposalId, studentId, status) {
    // Find the internship for this student+proposal
    const internship = await prisma.internship.findFirst({
        where: { proposalId, studentId }
    });

    if (!internship) {
        throw new Error("Internship record tidak ditemukan untuk mahasiswa ini.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: { status },
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
 * Upload company response document for a proposal.
 * After consolidation, updates the companyResponseDocId field on the proposal.
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function createCompanyResponse(data) {
    const { proposalId, documentId } = data;
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            companyResponseDocId: documentId
        },
        include: {
            targetCompany: true,
            companyResponseDoc: true
        }
    });
}

/**
 * Upload company response and update internship statuses transactionally.
 * After consolidation, updates proposal fields and internship statuses.
 * @param {Object} responseData 
 * @param {Array<{studentId: string, status: string}>} internshipUpdates 
 * @returns {Promise<Object>}
 */
export async function createCompanyResponseTransaction(responseData, internshipUpdates) {
    return prisma.$transaction(async (tx) => {
        // 1. Update company response doc and set status to WAITING_FOR_VERIFICATION
        const updatedProposal = await tx.internshipProposal.update({
            where: { id: responseData.proposalId },
            data: {
                companyResponseDocId: responseData.documentId,
                status: 'WAITING_FOR_VERIFICATION'
            },
            include: {
                targetCompany: true,
                companyResponseDoc: true
            }
        });

        // 2. Update internship statuses
        if (internshipUpdates && internshipUpdates.length > 0) {
            for (const update of internshipUpdates) {
                const internship = await tx.internship.findFirst({
                    where: {
                        proposalId: responseData.proposalId,
                        studentId: update.studentId
                    }
                });
                if (internship) {
                    await tx.internship.update({
                        where: { id: internship.id },
                        data: { status: update.status }
                    });
                }
            }
        }

        return updatedProposal;
    });
}
