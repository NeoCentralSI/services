import prisma from "../../config/prisma.js";

/**
 * Get active internship for a student.
 * @param {string} studentId 
 * @returns {Promise<Object>}
 */
export async function getStudentInternship(studentId) {
    return prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' },
        include: {
            proposal: {
                include: {
                    targetCompany: true
                }
            }
        }
    });
}

/**
 * Get logbook entries for an internship.
 * @param {string} internshipId 
 * @returns {Promise<Array>}
 */
export async function getLogbooks(internshipId) {
    return prisma.internshipLogbook.findMany({
        where: { internshipId },
        orderBy: { activityDate: 'asc' }
    });
}

/**
 * Update logbook entry description.
 * @param {string} logbookId 
 * @param {string} studentId 
 * @param {string} activityDescription 
 * @returns {Promise<Object>}
 */
export async function updateLogbook(logbookId, studentId, activityDescription) {
    // Verify ownership
    const logbook = await prisma.internshipLogbook.findUnique({
        where: { id: logbookId },
        include: { internship: true }
    });

    if (!logbook || logbook.internship.studentId !== studentId) {
        throw new Error("Logbook tidak ditemukan atau akses ditolak.");
    }

    return prisma.internshipLogbook.update({
        where: { id: logbookId },
        data: { activityDescription }
    });
}

/**
 * Update internship details (field supervisor and unit section).
 * @param {string} studentId 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function updateInternshipDetails(studentId, { fieldSupervisorName, unitSection }) {
    const internship = await prisma.internship.findFirst({
        where: { studentId, status: 'ONGOING' }
    });

    if (!internship) {
        throw new Error("Kegiatan Kerja Praktik tidak ditemukan.");
    }

    return prisma.internship.update({
        where: { id: internship.id },
        data: { fieldSupervisorName, unitSection }
    });
}
