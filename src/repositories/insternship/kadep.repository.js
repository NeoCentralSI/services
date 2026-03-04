import prisma from "../../config/prisma.js";

/**
 * Find all pending internship application letters (signedById is null).
 * @returns {Promise<Array>}
 */
export async function findPendingApplicationLetters() {
    return prisma.internshipApplicationLetter.findMany({
        where: {}, // Fetch all for list
        include: {
            proposal: {
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
                            },
                        }
                    },
                    targetCompany: true
                }
            },
            document: true
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Find all pending internship assignment letters (signedById is null).
 * @returns {Promise<Array>}
 */
export async function findPendingAssignmentLetters() {
    return prisma.internshipAssignmentLetter.findMany({
        where: {}, // Fetch all for list
        include: {
            proposal: {
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
                            },
                        }
                    },
                    targetCompany: true
                }
            },
            document: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Update signature for an application letter.
 * @param {string} id 
 * @param {string} signedById 
 * @param {string} signedAsRoleId 
 * @returns {Promise<Object>}
 */
export async function signApplicationLetter(id, signedById, signedAsRoleId) {
    return prisma.internshipApplicationLetter.update({
        where: { id },
        data: {
            signedById,
            signedAsRoleId,
            dateIssued: new Date() // Finalize issue date upon signature
        },
        include: {
            proposal: {
                include: {
                    coordinator: {
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
 * Update signature for an assignment letter.
 * @param {string} id 
 * @param {string} signedById 
 * @param {string} signedAsRoleId 
 * @returns {Promise<Object>}
 */
export async function signAssignmentLetter(id, signedById, signedAsRoleId) {
    return prisma.internshipAssignmentLetter.update({
        where: { id },
        data: {
            signedById,
            signedAsRoleId,
            dateIssued: new Date()
        },
        include: {
            proposal: {
                include: {
                    coordinator: {
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
 * Transactionally initialize internships and logbooks for all proposal members.
 * @param {string} proposalId 
 * @param {string} assignmentLetterId 
 * @param {Date[]} workingDays 
 * @returns {Promise<void>}
 */
export async function initializeInternshipsAndLogbooks(proposalId, assignmentLetterId, workingDays) {
    const [proposal, letter] = await Promise.all([
        prisma.internshipProposal.findUnique({
            where: { id: proposalId },
            include: {
                members: true
            }
        }),
        prisma.internshipAssignmentLetter.findUnique({
            where: { id: assignmentLetterId }
        })
    ]);

    if (!proposal) throw new Error("Proposal tidak ditemukan.");
    if (!letter) throw new Error("Surat Tugas tidak ditemukan.");

    // Filter members: Coordinator + those accepted by company
    const studentIds = [proposal.coordinatorId];
    proposal.members.forEach(member => {
        if (member.status === 'ACCEPTED_BY_COMPANY') {
            studentIds.push(member.studentId);
        }
    });

    // Ensure uniqueness
    const uniqueStudentIds = [...new Set(studentIds)];

    await prisma.$transaction(async (tx) => {
        for (const studentId of uniqueStudentIds) {
            // 1. Create Internship if not exists
            let internship = await tx.internship.findFirst({
                where: { studentId, proposalId }
            });

            if (!internship) {
                internship = await tx.internship.create({
                    data: {
                        studentId,
                        proposalId,
                        assignmentLetterId,
                        actualStartDate: letter.startDateActual,
                        actualEndDate: letter.endDateActual,
                        status: 'ONGOING'
                    }
                });
            } else {
                // Update assignment letter ID if it was changed
                await tx.internship.update({
                    where: { id: internship.id },
                    data: {
                        assignmentLetterId,
                        actualStartDate: letter.startDateActual,
                        actualEndDate: letter.endDateActual
                    }
                });
            }

            // 2. Prepare Logbooks
            const logbookData = workingDays.map(date => ({
                internshipId: internship.id,
                activityDate: date,
                activityDescription: "" // Empty placeholder
            }));

            // 3. Bulk Create Logbooks
            if (logbookData.length > 0) {
                await tx.internshipLogbook.createMany({
                    data: logbookData,
                    skipDuplicates: true
                });
            }
        }
    });
}
