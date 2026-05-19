import prisma from "../../config/prisma.js";

const SEKDEP_PROPOSAL_TRACKING_STATUSES = [
    'PENDING',
    'REJECTED_PROPOSAL',
    'APPROVED_PROPOSAL',
    'WAITING_FOR_VERIFICATION',
    'ACCEPTED_BY_COMPANY',
    'PARTIALLY_ACCEPTED',
    'REJECTED_BY_COMPANY'
];

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
    const { companyName, companyAddress, alasan, status } = data;
    return prisma.company.create({
        data: {
            companyName,
            companyAddress,
            alasan,
            status: status || 'save'
        }
    });
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
    const { coordinatorId, proposalDocumentId, academicYearId, targetCompanyId, proposedStartDate, proposedEndDate, memberIds = [] } = data;

    return prisma.internshipProposal.create({
        data: {
            coordinatorId,
            proposalDocumentId,
            academicYearId,
            targetCompanyId,
            proposedStartDate: new Date(proposedStartDate),
            proposedEndDate: new Date(proposedEndDate),
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
    const { coordinatorId, proposalDocumentId, targetCompanyId, memberIds = [] } = data;

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
                proposedStartDate: new Date(data.proposedStartDate),
                proposedEndDate: new Date(data.proposedEndDate),
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

/**
 * Get all holidays, ordered by date ascending.
 * @param {Object} [params]
 * @param {string} [params.year] - Filter by year (optional)
 * @returns {Promise<Array>}
 */
export async function findAll({ year } = {}) {
    const where = {};
    if (year) {
        const startOfYear = new Date(`${year}-01-01`);
        const endOfYear = new Date(`${parseInt(year) + 1}-01-01`);
        where.holidayDate = {
            gte: startOfYear,
            lt: endOfYear,
        };
    }

    return prisma.internshipHoliday.findMany({
        where,
        orderBy: { holidayDate: "asc" },
    });
}

/**
 * Get holidays within a date range.
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {Promise<Array>}
 */
export async function findInRange(startDate, endDate) {
    return prisma.internshipHoliday.findMany({
        where: {
            holidayDate: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        },
        orderBy: { holidayDate: "asc" },
    });
}

/**
 * Create a holiday.
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function create(data) {
    return prisma.internshipHoliday.create({
        data: {
            holidayDate: new Date(data.holidayDate),
            name: data.name || null,
        },
    });
}

/**
 * Create multiple holidays at once.
 * @param {Array<{holidayDate: string, name?: string}>} holidays
 * @returns {Promise<Object>}
 */
export async function createMany(holidays) {
    return prisma.internshipHoliday.createMany({
        data: holidays.map((h) => ({
            holidayDate: new Date(h.holidayDate),
            name: h.name || null,
        })),
        skipDuplicates: true,
    });
}

/**
 * Update a holiday.
 * @param {string} id
 * @param {Object} data - { holidayDate, name }
 * @returns {Promise<Object>}
 */
export async function update(id, data) {
    const updateData = {};
    if (data.holidayDate) updateData.holidayDate = new Date(data.holidayDate);
    if (data.name !== undefined) updateData.name = data.name;

    return prisma.internshipHoliday.update({
        where: { id },
        data: updateData,
    });
}

/**
 * Delete a holiday by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function remove(id) {
    return prisma.internshipHoliday.delete({
        where: { id },
    });
}

/**
 * Upsert holidays from external API data.
 * API shape: [{ holiday_date: "YYYY-MM-DD", holiday_name: "Nama Libur", is_national_holiday: true }]
 * @param {Array} apiData - Raw array from andifahruddinakas API
 * @returns {Promise<{ created: number, updated: number, total: number }>}
 */
export async function syncMany(apiData) {
    let created = 0;
    let updated = 0;

    for (const item of apiData) {
        // libur.deno.dev returns { date: "YYYY-MM-DD", name: "Nama Libur", is_national_holiday: bool }
        const rawDate = item.date;
        const name = item.name || null;

        if (!rawDate) continue;

        const holidayDate = new Date(rawDate);

        // Cek apakah sudah ada di DB
        const existing = await prisma.internshipHoliday.findUnique({
            where: { holidayDate },
        });

        if (existing) {
            // Update name jika berubah
            if (existing.name !== name) {
                await prisma.internshipHoliday.update({
                    where: { holidayDate },
                    data: { name },
                });
            }
            updated++;
        } else {
            await prisma.internshipHoliday.create({
                data: { holidayDate, name },
            });
            created++;
        }
    }

    return { created, updated, total: created + updated };
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
 * Find company response by ID.
 * @param {string} id
 * @returns {Promise<Object>}
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
 * Verify company response transaction.
 * @param {string} proposalId
 * @param {string|null} proposalStatus
 * @param {Array} internshipUpdates
 * @param {string} notes
 * @returns {Promise<Object>}
 */
export async function verifyCompanyResponseTransaction(proposalId, proposalStatus, internshipUpdates, notes) {
    return prisma.$transaction(async (tx) => {
        const updatedProposal = await tx.internshipProposal.update({
            where: { id: proposalId },
            data: {
                ...(proposalStatus ? { status: proposalStatus } : {}),
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
 * Find all proposals by academic year.
 * @param {string} academicYearId
 * @returns {Promise<Array>}
 */
export async function findAllProposals(academicYearId) {
    const whereClause = {};
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
            targetCompany: true,
            academicYear: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Find pending proposals for Sekdep.
 */
export async function findPendingProposals({ academicYearId, q, skip, take, sortBy, sortOrder }) {
    const whereClause = {
        status: {
            in: SEKDEP_PROPOSAL_TRACKING_STATUSES
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
            case 'name':
                orderBy = { coordinator: { user: { fullName: order } } };
                break;
            case 'nim':
                orderBy = { coordinator: { user: { identityNumber: order } } };
                break;
            case 'companyName':
                orderBy = { targetCompany: { companyName: order } };
                break;
            case 'status':
                orderBy = { status: order };
                break;
            default:
                orderBy = { createdAt: 'desc' };
        }
    }

    return prisma.internshipProposal.findMany({
        where: whereClause,
        skip,
        take,
        orderBy,
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            targetCompany: true,
            academicYear: true,
            proposalDocument: true,
            appLetterDoc: true,
            companyResponseDoc: true,
            assignLetterDoc: true,
            internships: {
                include: {
                    student: {
                        include: {
                            user: true
                        }
                    }
                }
            }
        }
    });
}

/**
 * Count pending proposals.
 */
export async function countPendingProposals({ academicYearId, q }) {
    const whereClause = {
        status: {
            in: SEKDEP_PROPOSAL_TRACKING_STATUSES
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
 * Find companies with stats.
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
 * Count companies.
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
 * Find approved proposals for Admin.
 */
export async function findApprovedProposals(academicYearId) {
    const whereClause = {
        status: {
            in: ['APPROVED_PROPOSAL', 'WAITING_FOR_VERIFICATION', 'REJECTED_BY_COMPANY', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED']
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
            targetCompany: true,
            academicYear: true,
            appLetterDoc: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Find proposals for assignment for Admin.
 */
export async function findProposalsForAssignment(academicYearId) {
    const whereClause = {
        status: {
            in: ['ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED']
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
            targetCompany: true,
            academicYear: true,
            assignLetterDoc: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Find proposal details for application letter generation.
 */
export async function findProposalForLetter(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: { user: true }
            },
            targetCompany: true,
            internships: {
                include: {
                    student: {
                        include: { user: true }
                    }
                }
            },
            appLetterDoc: true
        }
    });
}

/**
 * Update application letter details.
 */
export async function updateApplicationLetter(proposalId, data) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            appLetterDocNumber: data.letterNumber,
            proposedStartDate: data.proposedStartDate,
            proposedEndDate: data.proposedEndDate,
            status: 'WAITING_FOR_VERIFICATION'
        }
    });
}

/**
 * Update application letter document ID.
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
 * Find proposal for assignment letter generation.
 */
export async function findProposalForAssignment(id) {
    return prisma.internshipProposal.findUnique({
        where: { id },
        include: {
            coordinator: {
                include: { user: true }
            },
            targetCompany: true,
            internships: {
                include: {
                    student: {
                        include: { user: true }
                    }
                }
            },
            assignLetterDoc: true,
            companyResponseDoc: true
        }
    });
}

/**
 * Update assignment letter document ID.
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
 * Update company response document ID.
 */
export async function updateCompanyResponseDoc(proposalId, documentId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            companyResponseDocId: documentId,
            status: 'WAITING_FOR_VERIFICATION'
        }
    });
}

/**
 * Find pending application letters for Kadep.
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function findPendingApplicationLetters(academicYearId) {
    const where = {
        appLetterDocId: { not: null },
        appLetterSignedById: null
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
        include: {
            coordinator: { include: { user: true } },
            targetCompany: true,
            internships: {
                include: {
                    student: { include: { user: true } }
                }
            },
            appLetterDoc: true
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Find pending assignment letters for Kadep.
 * @param {string} [academicYearId]
 * @returns {Promise<Array>}
 */
export async function findPendingAssignmentLetters(academicYearId) {
    const where = {
        assignLetterDocId: { not: null },
        assignLetterSignedById: null
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
        include: {
            coordinator: { include: { user: true } },
            targetCompany: true,
            internships: {
                include: {
                    student: { include: { user: true } }
                }
            },
            assignLetterDoc: true
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Find pending supervisor letters for Kadep.
 * @returns {Promise<Array>}
 */
export async function findPendingSupervisorLetters() {
    return prisma.internshipSupervisorLetter.findMany({
        where: { signedById: null },
        include: {
            supervisor: { include: { user: true } },
            internships: true,
            document: true
        },
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Sign application letter for a proposal.
 * @param {string} proposalId
 * @param {string} userId
 * @param {string} roleId
 * @returns {Promise<Object>}
 */
export async function signApplicationLetter(proposalId, userId, roleId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            appLetterSignedById: userId,
            appLetterSignedAsRoleId: roleId
        },
        include: {
            coordinator: { include: { user: true } },
            targetCompany: true,
            internships: true,
            appLetterDoc: true
        }
    });
}

/**
 * Sign assignment letter for a proposal.
 * @param {string} proposalId
 * @param {string} userId
 * @param {string} roleId
 * @returns {Promise<Object>}
 */
export async function signAssignmentLetter(proposalId, userId, roleId) {
    return prisma.internshipProposal.update({
        where: { id: proposalId },
        data: {
            assignLetterSignedById: userId,
            assignLetterSignedAsRoleId: roleId
        },
        include: {
            coordinator: { include: { user: true } },
            targetCompany: true,
            internships: true,
            assignLetterDoc: true
        }
    });
}

/**
 * Initialize internship statuses and logbooks after assignment letter is signed.
 * @param {string} proposalId
 * @param {Array<Date|string>} workingDays
 * @returns {Promise<void>}
 */
export async function initializeInternshipsAndLogbooks(proposalId, workingDays = []) {
    await prisma.$transaction(async (tx) => {
        const internships = await tx.internship.findMany({
            where: { proposalId }
        });

        if (internships.length === 0) return;

        const internshipIds = internships.map(i => i.id);

        await tx.internship.updateMany({
            where: { id: { in: internshipIds } },
            data: { status: 'ONGOING' }
        });

        if (!workingDays.length) return;

        const logbookRows = [];
        for (const internshipId of internshipIds) {
            for (const day of workingDays) {
                logbookRows.push({
                    internshipId,
                    activityDate: day instanceof Date ? day : new Date(day),
                    activityDescription: ""
                });
            }
        }

        if (logbookRows.length > 0) {
            await tx.internshipLogbook.createMany({
                data: logbookRows,
                skipDuplicates: true
            });
        }
    });
}

/**
 * Sign supervisor letter.
 * @param {string} letterId
 * @param {string} userId
 * @param {string} roleId
 * @returns {Promise<Object>}
 */
export async function signSupervisorLetter(letterId, userId, roleId) {
    return prisma.internshipSupervisorLetter.update({
        where: { id: letterId },
        data: {
            signedById: userId,
            signedAsRoleId: roleId
        },
        include: {
            supervisor: { include: { user: true } },
            internships: true,
            document: true
        }
    });
}



