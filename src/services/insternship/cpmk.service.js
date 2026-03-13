import prisma from "../../config/prisma.js";
import * as repository from "../../repositories/insternship/cpmk.repository.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConflictError";
        this.statusCode = 409;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

/**
 * Get active academic year helper.
 */
async function getActiveYear() {
    const activeYear = await prisma.academicYear.findFirst({
        where: { isActive: true }
    });
    if (!activeYear) throw new ValidationError("Tidak ada tahun ajaran aktif di sistem.");
    return activeYear;
}

/**
 * Get all internship CPMKs.
 */
export async function getAllCpmks(academicYearId) {
    let ayId = academicYearId;
    if (!ayId) {
        const active = await prisma.academicYear.findFirst({ where: { isActive: true } });
        ayId = active?.id;
    }
    return await repository.findAllCpmks(ayId);
}

/**
 * Get internship CPMK by ID.
 */
export async function getCpmkById(id) {
    const data = await repository.findCpmkById(id);
    if (!data) throw new NotFoundError("Data CPMK tidak ditemukan");
    return data;
}

/**
 * Create internship CPMK.
 */
export async function createCpmk(data) {
    let ayId = data.academicYearId;
    if (!ayId) {
        const active = await getActiveYear();
        ayId = active.id;
    }

    // Check code uniqueness within academic year
    const existing = await repository.findCpmkByCode(data.code, ayId);
    if (existing) throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran ini`);

    // Weight validation
    const weight = parseFloat(data.weight);
    if (isNaN(weight) || weight <= 0) throw new ValidationError("Bobot harus berupa angka positif");
    if (weight > 100) throw new ValidationError("Bobot tidak boleh melebihi 100%");

    const currentTotal = await repository.calculateTotalWeight(ayId);
    if (currentTotal + weight > 100) {
        throw new ValidationError(`Total bobot melebihi 100% (Saat ini: ${currentTotal}%, Ditambah: ${weight}%, Sisa: ${100 - currentTotal}%)`);
    }

    return await repository.createCpmk({
        code: data.code,
        name: data.name,
        weight: weight,
        assessorType: data.assessorType,
        academicYearId: ayId
    });
}

/**
 * Update internship CPMK.
 */
export async function updateCpmk(id, data) {
    const existingCpmk = await repository.findCpmkById(id);
    if (!existingCpmk) throw new NotFoundError("Data CPMK tidak ditemukan");

    if (data.code && data.code !== existingCpmk.code) {
        const duplicate = await repository.findCpmkByCode(data.code, existingCpmk.academicYearId, id);
        if (duplicate) throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran ini`);
    }

    const updateData = {};
    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    
    if (data.weight !== undefined) {
        const weight = parseFloat(data.weight);
        if (isNaN(weight) || weight <= 0) throw new ValidationError("Bobot harus berupa angka positif");
        if (weight > 100) throw new ValidationError("Bobot tidak boleh melebihi 100%");

        const currentTotalExcludeSelf = await repository.calculateTotalWeight(existingCpmk.academicYearId, id);
        if (currentTotalExcludeSelf + weight > 100) {
            throw new ValidationError(`Total bobot melebihi 100% (CPMK lain: ${currentTotalExcludeSelf}%, Bobot baru: ${weight}%, Maksimal sisa: ${100 - currentTotalExcludeSelf}%)`);
        }
        updateData.weight = weight;
    }

    if (data.assessorType !== undefined) updateData.assessorType = data.assessorType;

    return await repository.updateCpmk(id, updateData);
}

/**
 * Delete internship CPMK.
 */
export async function deleteCpmk(id) {
    const existing = await repository.findCpmkById(id);
    if (!existing) throw new NotFoundError("Data CPMK tidak ditemukan");

    const hasRelated = await repository.hasRelatedScores(id);
    if (hasRelated) {
        throw new ConflictError("Tidak dapat menghapus CPMK karena sudah memiliki data penilaian terkait");
    }

    return await repository.deleteCpmk(id);
}

// ================= Rubric Operations =================

/**
 * Create rubric.
 */
export async function createRubric(data) {
    const cpmk = await repository.findCpmkById(data.cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    return await repository.createRubric({
        cpmkId: data.cpmkId,
        levelName: data.levelName,
        rubricLevelDescription: data.rubricLevelDescription,
        minScore: parseFloat(data.minScore),
        maxScore: parseFloat(data.maxScore)
    });
}

/**
 * Update rubric.
 */
export async function updateRubric(id, data) {
    const existing = await repository.findRubricById(id);
    if (!existing) throw new NotFoundError("Rubrik tidak ditemukan");

    const updateData = {};
    if (data.levelName !== undefined) updateData.levelName = data.levelName;
    if (data.rubricLevelDescription !== undefined) updateData.rubricLevelDescription = data.rubricLevelDescription;
    if (data.minScore !== undefined) updateData.minScore = parseFloat(data.minScore);
    if (data.maxScore !== undefined) updateData.maxScore = parseFloat(data.maxScore);

    return await repository.updateRubric(id, updateData);
}

/**
 * Delete rubric.
 */
export async function deleteRubric(id) {
    const existing = await repository.findRubricById(id);
    if (!existing) throw new NotFoundError("Rubrik tidak ditemukan");
    
    // Optional: check if rubrics has score
    // For now we don't have direct score-rubric link in InternshipLecturerScore except as foreign key
    // repository.hasRelatedScores(existing.cpmkId) could be used as a proxy

    return await repository.deleteRubric(id);
}

/**
 * Bulk update rubrics for a CPMK.
 */
export async function bulkUpdateRubrics(cpmkId, rubrics) {
    const cpmk = await repository.findCpmkById(cpmkId);
    if (!cpmk) throw new NotFoundError("CPMK tidak ditemukan");

    // Validation of scores ranges: No overlaps, min < max, non-negative
    if (rubrics.length > 0) {
        // Sort by minScore to ease overlap checking
        const sorted = [...rubrics].sort((a, b) => parseFloat(a.minScore) - parseFloat(b.minScore));

        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            const min = parseFloat(current.minScore);
            const max = parseFloat(current.maxScore);

            if (isNaN(min) || isNaN(max)) {
                throw new ValidationError(`Skor pada level "${current.levelName}" harus berupa angka`);
            }
            if (min < 0 || max < 0) {
                throw new ValidationError(`Skor pada level "${current.levelName}" tidak boleh negatif`);
            }
            if (min >= max) {
                throw new ValidationError(`Skor minimum (${min}) harus lebih kecil dari skor maksimum (${max}) pada level "${current.levelName}"`);
            }

            // Check overlap with next rubric
            if (i < sorted.length - 1) {
                const next = sorted[i + 1];
                const nextMin = parseFloat(next.minScore);
                if (max > nextMin) {
                    throw new ValidationError(`Range skor tumpang tindih antara level "${current.levelName}" (${min}-${max}) dan "${next.levelName}" (mulai dari ${nextMin})`);
                }
            }
        }
    }

    const formattedRubrics = rubrics.map(r => ({
        levelName: r.levelName,
        rubricLevelDescription: r.rubricLevelDescription,
        minScore: parseFloat(r.minScore),
        maxScore: parseFloat(r.maxScore)
    }));

    return await repository.replaceRubrics(cpmkId, formattedRubrics);
}

/**
 * Duplicates all CPMKs and their rubrics from one academic year to another.
 */
export async function copyCpmks(fromYearId, toYearId) {
    if (!fromYearId || !toYearId) throw new ValidationError("Tahun ajaran asal dan tujuan wajib diisi");
    if (fromYearId === toYearId) throw new ValidationError("Tahun ajaran asal dan tujuan tidak boleh sama");

    // Check if target year exists
    const targetYear = await prisma.academicYear.findUnique({ where: { id: toYearId } });
    if (!targetYear) throw new NotFoundError("Tahun ajaran tujuan tidak ditemukan");

    // Get source CPMKs with rubrics
    const sourceCpmks = await prisma.internshipCpmk.findMany({
        where: { academicYearId: fromYearId },
        include: { rubrics: true }
    });

    if (sourceCpmks.length === 0) throw new ValidationError("Tidak ada data CPMK untuk diduplikasi dari tahun ajaran asal");

    // Transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
        const results = [];

        for (const sourceCpmk of sourceCpmks) {
            // Create new CPMK
            const newCpmk = await tx.internshipCpmk.create({
                data: {
                    code: sourceCpmk.code,
                    name: sourceCpmk.name,
                    weight: sourceCpmk.weight,
                    assessorType: sourceCpmk.assessorType,
                    academicYearId: toYearId
                }
            });

            // Create rubrics for the new CPMK
            if (sourceCpmk.rubrics && sourceCpmk.rubrics.length > 0) {
                await tx.internshipAssessmentRubric.createMany({
                    data: sourceCpmk.rubrics.map(r => ({
                        cpmkId: newCpmk.id,
                        levelName: r.levelName,
                        rubricLevelDescription: r.rubricLevelDescription,
                        minScore: r.minScore,
                        maxScore: r.maxScore
                    }))
                });
            }

            results.push(newCpmk);
        }

        return results;
    });
}
