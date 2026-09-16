import prisma from "../../config/prisma.js";

/**
 * Create a new supervisor replacement request.
 * @param {Object} data
 * @param {string} data.letterId
 * @param {string} data.internshipId
 * @param {string} data.oldSupervisorId
 * @param {string} data.newSupervisorId
 * @param {string} data.reason
 * @param {string} data.requestedById
 * @returns {Promise<Object>}
 */
export async function createReplacementRequest(data) {
    return prisma.supervisorReplacementRequest.create({
        data: {
            letterId: data.letterId,
            internshipId: data.internshipId,
            oldSupervisorId: data.oldSupervisorId,
            newSupervisorId: data.newSupervisorId,
            reason: data.reason,
            requestedById: data.requestedById,
            status: 'PENDING'
        }
    });
}

/**
 * Find pending requests.
 * @returns {Promise<Array>}
 */
export async function findPendingRequests() {
    return prisma.supervisorReplacementRequest.findMany({
        where: { status: 'PENDING' },
        include: {
            letter: true,
            internship: {
                include: {
                    student: { include: { user: true } },
                    proposal: { include: { academicYear: true } }
                }
            },
            oldSupervisor: { include: { user: true } },
            newSupervisor: { include: { user: true } },
            requestedBy: true
        },
        orderBy: { requestedAt: 'desc' }
    });
}

/**
 * Find a request by ID.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function findRequestById(id) {
    return prisma.supervisorReplacementRequest.findUnique({
        where: { id },
        include: {
            letter: true,
            internship: {
                include: {
                    student: { include: { user: true } }
                }
            },
            oldSupervisor: { include: { user: true } },
            newSupervisor: { include: { user: true } },
            requestedBy: true
        }
    });
}

/**
 * Update request status.
 * @param {string} id 
 * @param {string} status 'APPROVED' | 'REJECTED'
 * @param {string} approvedById 
 * @param {string} [rejectionNotes] 
 * @returns {Promise<Object>}
 */
export async function updateRequestStatus(id, status, approvedById, rejectionNotes = null) {
    return prisma.supervisorReplacementRequest.update({
        where: { id },
        data: {
            status,
            approvedById,
            resolvedAt: new Date(),
            ...(rejectionNotes ? { rejectionNotes } : {})
        }
    });
}

/**
 * Find pending requests for a specific internship.
 * @param {string} internshipId 
 * @returns {Promise<Array>}
 */
export async function findPendingRequestsByInternship(internshipId) {
    return prisma.supervisorReplacementRequest.findMany({
        where: {
            internshipId,
            status: 'PENDING'
        }
    });
}
