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
