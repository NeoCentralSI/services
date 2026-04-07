import prisma from "../../config/prisma.js";

/**
 * Find assessment data for an internship (CPMKs, Rubrics, and existing Scores).
 */
export async function findInternshipAssessmentData(internshipId) {
    const internship = await prisma.internship.findUnique({
        where: { id: internshipId },
        select: {
            id: true,
            status: true,
            lecturerAssessmentStatus: true,
            proposal: {
                select: {
                    academicYearId: true
                }
            }
        }
    });

    if (!internship) return null;

    const academicYearId = internship.proposal.academicYearId;

    // Fetch CPMKs with rubrics for this academic year
    const cpmks = await prisma.internshipCpmk.findMany({
        where: { academicYearId },
        include: {
            rubrics: {
                orderBy: { minScore: 'asc' }
            }
        },
        orderBy: { code: 'asc' }
    });

    // Fetch existing lecturer scores
    const lecturerScores = await prisma.internshipLecturerScore.findMany({
        where: { internshipId }
    });

    // Fetch existing field scores (optional, but good for context)
    const fieldScores = await prisma.internshipFieldScore.findMany({
        where: { internshipId }
    });

    return {
        internship,
        cpmks,
        lecturerScores,
        fieldScores
    };
}

/**
 * Bulk upsert lecturer scores for an internship.
 * @param {string} internshipId 
 * @param {Array} scores - [{ chosenRubricId: string, score: number }]
 */
export async function upsertLecturerScores(internshipId, scores) {
    return prisma.$transaction(async (tx) => {
        // We delete existing scores for the same CPMKs being submitted
        // Or simply delete all lecturer scores for this internship and re-insert
        // Re-inserting is cleaner for bulk updates
        
        // Find which rubrics belong to which CPMKs to avoid deleting other CPMK scores
        // But usually, the UI submits all scores at once
        
        await tx.internshipLecturerScore.deleteMany({
            where: { internshipId }
        });

        if (scores.length > 0) {
            await tx.internshipLecturerScore.createMany({
                data: scores.map(s => ({
                    internshipId,
                    chosenRubricId: s.chosenRubricId,
                    score: s.score
                }))
            });
        }

        return true;
    });
}

/**
 * Update internship results (final score and grade).
 */
export async function updateInternshipResults(internshipId, data) {
    return prisma.internship.update({
        where: { id: internshipId },
        data: {
            finalNumericScore: data.finalNumericScore,
            finalGrade: data.finalGrade,
            lecturerAssessmentStatus: data.lecturerAssessmentStatus
        }
    });
}

/**
 * Get all scores for an internship to calculate the final total.
 */
export async function getInternshipAllScores(internshipId) {
    return prisma.internship.findUnique({
        where: { id: internshipId },
        include: {
            lecturerScores: {
                include: {
                    chosenRubric: {
                        include: { cpmk: true }
                    }
                }
            },
            fieldScores: {
                include: {
                    chosenRubric: {
                        include: { cpmk: true }
                    }
                }
            }
        }
    });
}
