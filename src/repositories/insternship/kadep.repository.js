import prisma from "../../config/prisma.js";

/**
 * Find all proposals that have application letter data (for Kadep to sign).
 * Now queries InternshipProposal directly since letters are consolidated.
 * @returns {Promise<Array>}
 */
export async function findPendingApplicationLetters(academicYearId) {
    const where = {
        appLetterDocNumber: { not: null },
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
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
            appLetterDoc: true
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Find all proposals that have assignment letter data (for Kadep to sign).
 * @returns {Promise<Array>}
 */
export async function findPendingAssignmentLetters(academicYearId) {
    const where = {
        assignLetterDocNumber: { not: null },
    };

    if (academicYearId && academicYearId !== 'all') {
        where.academicYearId = academicYearId;
    }

    return prisma.internshipProposal.findMany({
        where,
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
            assignLetterDoc: true
        },
        orderBy: {
            updatedAt: 'desc'
        }
    });
}

/**
 * Update signature for an application letter (now on InternshipProposal).
 * @param {string} id - Proposal ID
 * @param {string} signedById 
 * @param {string} signedAsRoleId 
 * @returns {Promise<Object>}
 */
export async function signApplicationLetter(id, signedById, signedAsRoleId) {
    return prisma.internshipProposal.update({
        where: { id },
        data: {
            appLetterSignedById: signedById,
            appLetterSignedAsRoleId: signedAsRoleId,
            appLetterDateIssued: new Date()
        },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            targetCompany: true
        }
    });
}

/**
 * Update signature for an assignment letter (now on InternshipProposal).
 * @param {string} id - Proposal ID
 * @param {string} signedById 
 * @param {string} signedAsRoleId 
 * @returns {Promise<Object>}
 */
export async function signAssignmentLetter(id, signedById, signedAsRoleId) {
    return prisma.internshipProposal.update({
        where: { id },
        data: {
            assignLetterSignedById: signedById,
            assignLetterSignedAsRoleId: signedAsRoleId,
            assignLetterDateIssued: new Date()
        },
        include: {
            coordinator: {
                include: {
                    user: true
                }
            },
            targetCompany: true
        }
    });
}

/**
 * Transactionally initialize internships and logbooks for a proposal.
 * After schema consolidation, internships track individual students. 
 * The coordinator always gets an internship. Other students come from 
 * existing Internship records with ACCEPTED_BY_COMPANY status.
 * @param {string} proposalId 
 * @param {Date[]} workingDays 
 * @returns {Promise<void>}
 */
export async function initializeInternshipsAndLogbooks(proposalId, workingDays) {
    const proposal = await prisma.internshipProposal.findUnique({
        where: { id: proposalId },
        include: {
            internships: true
        }
    });

    if (!proposal) throw new Error("Proposal tidak ditemukan.");

    // Get students: coordinator + any internship records with ACCEPTED_BY_COMPANY
    const studentIds = [proposal.coordinatorId];
    proposal.internships.forEach(internship => {
        if (internship.status === 'ACCEPTED_BY_COMPANY') {
            studentIds.push(internship.studentId);
        }
    });

    // Ensure uniqueness
    const uniqueStudentIds = [...new Set(studentIds)];

    await prisma.$transaction(async (tx) => {
        for (const studentId of uniqueStudentIds) {
            // 1. Create or update Internship
            let internship = await tx.internship.findFirst({
                where: { studentId, proposalId }
            });

            if (!internship) {
                internship = await tx.internship.create({
                    data: {
                        studentId,
                        proposalId,
                        actualStartDate: proposal.startDateActual,
                        actualEndDate: proposal.endDateActual,
                        status: 'ONGOING'
                    }
                });
            } else {
                await tx.internship.update({
                    where: { id: internship.id },
                    data: {
                        actualStartDate: proposal.startDateActual,
                        actualEndDate: proposal.endDateActual,
                        status: 'ONGOING'
                    }
                });
            }

            // 2. Prepare Logbooks
            const logbookData = workingDays.map(date => ({
                internshipId: internship.id,
                activityDate: date,
                activityDescription: ""
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

/**
 * Find all lecturer assignment letters that need signing.
 * @param {string} academicYearId 
 * @returns {Promise<Array>}
 */
export async function findPendingSupervisorLetters(academicYearId) {
    // Supervisor letters don't have a direct academicYearId in the model, 
    // but we can join through internships if needed.
    // However, for now, let's just find those not yet signed.
    
    return prisma.internshipSupervisorLetter.findMany({
        where: {
            // Remove signedById: null to show both pending and signed letters
        },
        include: {
            supervisor: {
                include: {
                    user: true
                }
            },
            document: true,
            internships: {
                include: {
                    student: {
                        include: {
                            user: true
                        }
                    },
                    proposal: {
                        include: {
                            targetCompany: true
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Update signature for a lecturer supervisor letter.
 * @param {string} id 
 * @param {string} signedById 
 * @param {string} signedAsRoleId 
 * @returns {Promise<Object>}
 */
export async function signSupervisorLetter(id, signedById, signedAsRoleId) {
    return prisma.internshipSupervisorLetter.update({
        where: { id },
        data: {
            signedById,
            signedAsRoleId,
            dateIssued: new Date() // Final date when signed
        },
        include: {
            supervisor: {
                include: {
                    user: true
                }
            }
        }
    });
}
