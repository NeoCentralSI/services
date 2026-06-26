import prisma from "../../config/prisma.js";

/**
 * Find lecturers with their active internship workload counts for Sekdep.
 * @param {Object} params
 */
export async function findLecturersWithWorkload({ q, skip, take, sortBy, sortOrder, academicYearId }) {
    const whereClause = {};

    if (q) {
        whereClause.user = {
            OR: [
                { fullName: { contains: q } },
                { identityNumber: { contains: q } }
            ]
        };
    }

    let orderBy = { user: { fullName: 'asc' } };
    if (sortBy) {
        const order = sortOrder === 'desc' ? 'desc' : 'asc';
        switch (sortBy) {
            case 'name': orderBy = { user: { fullName: order } }; break;
            case 'nip': orderBy = { user: { identityNumber: order } }; break;
            default: orderBy = { user: { fullName: 'asc' } };
        }
    }

    return prisma.lecturer.findMany({
        where: whereClause,
        skip,
        take,
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: {
                    status: 'ONGOING',
                    ...(academicYearId ? { proposal: { academicYearId } } : {})
                },
                select: {
                    supLetterId: true
                }
            },
            _count: {
                select: {
                    internshipsSupervisored: {
                        where: {
                            status: 'ONGOING',
                            ...(academicYearId ? { proposal: { academicYearId } } : {})
                        }
                    }
                }
            }
        },
        orderBy
    });
}

/**
 * Bulk update supervisor for multiple internships.
 * @param {Array<string>} internshipIds 
 * @param {string} supervisorId 
 * @returns {Promise<Object>}
 */
export async function bulkUpdateInternshipSupervisor(internshipIds, supervisorId) {
    return prisma.$transaction(async (tx) => {
        // Update all selected internships
        const result = await tx.internship.updateMany({
            where: {
                id: { in: internshipIds },
                supLetterId: null
            },
            data: {
                supervisorId,
                status: 'ONGOING' // Automatically set to ONGOING when assigned
            }
        });

        return result;
    });
}

/**
 * Count lecturers for Sekdep workload panel.
 * @param {Object} params
 */
export async function countLecturersWithWorkload({ q, academicYearId }) {
    const whereClause = {};

    if (q) {
        whereClause.user = {
            OR: [
                { fullName: { contains: q } },
                { identityNumber: { contains: q } }
            ]
        };
    }

    return prisma.lecturer.count({ where: whereClause });
}

/**
 * Find internships with student user data.
 * @param {Array<string>} internshipIds 
 * @returns {Promise<Array<Object>>}
 */
export async function findInternshipsWithStudents(internshipIds) {
    return prisma.internship.findMany({
        where: { id: { in: internshipIds } },
        include: {
            student: {
                include: { user: true }
            }
        }
    });
}

/**
 * Find all lecturers and their assigned students for PDF export.
 * @returns {Promise<Array<Object>>}
 */
export async function findAllLecturerWorkload() {
    return prisma.lecturer.findMany({
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: {
                    status: 'ONGOING'
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
                },
                orderBy: {
                    student: {
                        user: {
                            fullName: 'asc'
                        }
                    }
                }
            }
        },
        orderBy: {
            user: {
                fullName: 'asc'
            }
        }
    });
}

/**
 * Find a lecturer with their ongoing internships assigned for supervisor letter generation.
 * @param {string} lecturerId 
 * @returns {Promise<Object|null>}
 */
export async function findLecturerForLetter(lecturerId) {
    return prisma.lecturer.findUnique({
        where: { id: lecturerId },
        include: {
            user: {
                select: {
                    fullName: true,
                    identityNumber: true
                }
            },
            internshipsSupervisored: {
                where: { status: 'ONGOING' },
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
                    },
                    proposal: {
                        include: {
                            targetCompany: true
                        }
                    },
                    supLetter: {
                        include: {
                            document: true
                        }
                    }
                }
            }
        }
    });
}

/**
 * Find a supervisor letter by its document number.
 * @param {string} documentNumber 
 */
export async function findSupervisorLetterByNumber(documentNumber) {
    return prisma.internshipSupervisorLetter.findUnique({
        where: { documentNumber },
        include: {
            supervisor: {
                include: { user: true }
            }
        }
    });
}

/**
 * Upsert a supervisor letter.
 * @param {Object} data 
 */
export async function upsertSupervisorLetter(data) {
    const { documentNumber, dateIssued, startDate, endDate, supervisorId, documentId } = data;

    return prisma.internshipSupervisorLetter.upsert({
        where: { documentNumber },
        update: {
            dateIssued,
            startDate,
            endDate,
            supervisorId,
            documentId
        },
        create: {
            documentNumber,
            dateIssued,
            startDate,
            endDate,
            supervisorId,
            documentId
        }
    });
}

/**
 * Link internships to a supervisor letter.
 * @param {Array<string>} internshipIds 
 * @param {string} supLetterId 
 */
export async function linkInternshipsToLetter(internshipIds, supLetterId) {
    return prisma.internship.updateMany({
        where: { id: { in: internshipIds } },
        data: {
            supLetterId
        }
    });
}

/**
 * Update supervisor letter details for multiple internships in bulk.
 * @deprecated Use upsertSupervisorLetter and linkInternshipsToLetter instead.
 */
export async function updateSupervisorLetterBulk(internshipIds, data) {
    // This is now handled by the service using newer methods
    throw new Error("Deprecated: Use upsertSupervisorLetter and linkInternshipsToLetter in the service layer.");
}



