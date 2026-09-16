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

    // Fetch CPMKs with rubrics for this academic year - Only for LECTURER
    const cpmks = await prisma.internshipCpmk.findMany({
        where: { 
            academicYearId,
            assessorType: 'LECTURER'
        },
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

    return {
        internship,
        cpmks,
        lecturerScores
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

/**
 * Find all internship CPMKs.
 */
export async function findAllCpmks(academicYearId) {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }
    return prisma.internshipCpmk.findMany({
        where,
        include: {
            rubrics: {
                select: {
                    id: true,
                    cpmkId: true,
                    levelName: true,
                    minScore: true,
                    maxScore: true,
                    createdAt: true,
                    updatedAt: true
                    // rubricLevelDescription is intentionally excluded for list view performance
                },
                orderBy: {
                    minScore: 'asc'
                }
            }
        },
        orderBy: {
            code: 'asc'
        }
    });
}

/**
 * Find internship CPMK by ID.
 */
export async function findCpmkById(id) {
    return prisma.internshipCpmk.findUnique({
        where: { id },
        include: {
            rubrics: {
                orderBy: {
                    minScore: 'asc'
                }
            }
        }
    });
}

/**
 * Find internship CPMK by code and academic year.
 */
export async function findCpmkByCode(code, academicYearId, excludeId) {
    const where = { code };
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }
    if (excludeId) {
        where.id = { not: excludeId };
    }
    return prisma.internshipCpmk.findFirst({
        where
    });
}

/**
 * Create internship CPMK.
 */
export async function createCpmk(data) {
    return prisma.internshipCpmk.create({
        data: {
            code: data.code,
            name: data.name,
            weight: data.weight,
            assessorType: data.assessorType,
            academicYearId: data.academicYearId
        }
    });
}

/**
 * Update internship CPMK.
 */
export async function updateCpmk(id, data) {
    return prisma.internshipCpmk.update({
        where: { id },
        data
    });
}

/**
 * Delete internship CPMK.
 */
export async function deleteCpmk(id) {
    return prisma.internshipCpmk.delete({
        where: { id }
    });
}

/**
 * Find rubric by ID.
 */
export async function findRubricById(id) {
    return prisma.internshipAssessmentRubric.findUnique({
        where: { id }
    });
}

/**
 * Create rubric for a CPMK.
 */
export async function createRubric(data) {
    return prisma.internshipAssessmentRubric.create({
        data: {
            cpmkId: data.cpmkId,
            levelName: data.levelName,
            rubricLevelDescription: data.rubricLevelDescription,
            minScore: data.minScore,
            maxScore: data.maxScore
        }
    });
}

/**
 * Update rubric.
 */
export async function updateRubric(id, data) {
    return prisma.internshipAssessmentRubric.update({
        where: { id },
        data
    });
}

/**
 * Delete rubric.
 */
export async function deleteRubric(id) {
    return prisma.internshipAssessmentRubric.delete({
        where: { id }
    });
}

/**
 * Replace all rubrics for a specific CPMK.
 * This is used for bulk management.
 */
export async function replaceRubrics(cpmkId, rubrics) {
    return prisma.$transaction(async (tx) => {
        // 1. Delete all existing rubrics for this CPMK
        await tx.internshipAssessmentRubric.deleteMany({
            where: { cpmkId }
        });

        // 2. Create new rubrics
        return await tx.internshipAssessmentRubric.createMany({
            data: rubrics.map(r => ({
                cpmkId: cpmkId,
                levelName: r.levelName,
                rubricLevelDescription: r.rubricLevelDescription,
                minScore: r.minScore,
                maxScore: r.maxScore
            }))
        });
    });
}

/**
 * Check if CPMK has related assessment scores.
 */
export async function hasRelatedScores(cpmkId) {
    const rubrics = await prisma.internshipAssessmentRubric.findMany({
        where: { cpmkId },
        select: { id: true }
    });

    const rubricIds = rubrics.map(r => r.id);

    if (rubricIds.length === 0) return false;

    const [lecturerScore, fieldScore] = await Promise.all([
        prisma.internshipLecturerScore.findFirst({
            where: { chosenRubricId: { in: rubricIds } }
        }),
        prisma.internshipFieldScore.findFirst({
            where: { chosenRubricId: { in: rubricIds } }
        })
    ]);

    return !!(lecturerScore || fieldScore);
}

/**
 * Calculate the total weight of all internship CPMKs for a specific academic year.
 */
export async function calculateTotalWeight(academicYearId, excludeId) {
    const where = {};
    if (academicYearId) {
        where.academicYearId = academicYearId;
    }
    if (excludeId) {
        where.id = { not: excludeId };
    }
    
    const result = await prisma.internshipCpmk.aggregate({
        where,
        _sum: {
            weight: true
        }
    });

    return result._sum.weight || 0;
}

