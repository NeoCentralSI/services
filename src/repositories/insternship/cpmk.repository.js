import prisma from "../../config/prisma.js";

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
