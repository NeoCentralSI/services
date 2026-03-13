import * as repository from "../repositories/cpmk.repository.js";
import { getActiveAcademicYearId } from "../helpers/academicYear.helper.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConflictError";
        this.statusCode = 409;
    }
}

async function resolveAcademicYearId(inputAcademicYearId) {
    if (inputAcademicYearId) return inputAcademicYearId;
    return await getActiveAcademicYearId();
}

export const getAllCpmks = async ({ academicYearId } = {}) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(academicYearId);
    if (!resolvedAcademicYearId) {
        return [];
    }

    const data = await repository.findAll({ academicYearId: resolvedAcademicYearId });

    return data.map((item) => ({
        id: item.id,
        academicYearId: item.academicYearId,
        academicYear: item.academicYear
            ? {
                id: item.academicYear.id,
                semester: item.academicYear.semester,
                year: item.academicYear.year,
                isActive: item.academicYear.isActive,
            }
            : null,
        code: item.code,
        description: item.description,
        type: item.type,
        maxScore: null,
        displayOrder: item.displayOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));
};

export const getCpmkById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }
    return data;
};

export const createCpmk = async (data) => {
    const resolvedAcademicYearId = await resolveAcademicYearId(data.academicYearId);
    if (!resolvedAcademicYearId) {
        throw new ValidationError("Tahun ajaran aktif tidak ditemukan. Silakan pilih tahun ajaran terlebih dahulu.");
    }

    // Check code uniqueness
    if (data.code) {
        const existing = await repository.findByCode(data.code, data.type, resolvedAcademicYearId);
        if (existing) {
            throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan pada tahun ajaran yang dipilih`);
        }
    }

    return await repository.create({
        academicYearId: resolvedAcademicYearId,
        code: data.code,
        description: data.description,
        type: data.type,
    });
};

export const updateCpmk = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }

    const targetAcademicYearId = await resolveAcademicYearId(data.academicYearId || existing.academicYearId);
    if (!targetAcademicYearId) {
        throw new ValidationError("Tahun ajaran aktif tidak ditemukan. Silakan pilih tahun ajaran terlebih dahulu.");
    }

    const updateData = {};
    const nextCode = data.code ?? existing.code;
    const nextType = data.type ?? existing.type;

    if (
        nextCode !== existing.code
        || nextType !== existing.type
        || targetAcademicYearId !== existing.academicYearId
    ) {
        const duplicate = await repository.findByCode(nextCode, nextType, targetAcademicYearId, id);
        if (duplicate) {
            throw new ConflictError(`Kode CPMK "${nextCode}" sudah digunakan pada tahun ajaran yang dipilih`);
        }
    }

    if (data.code !== undefined) {
        updateData.code = data.code;
    }

    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.academicYearId !== undefined) updateData.academicYearId = targetAcademicYearId;

    return await repository.update(id, updateData);
};

export const deleteCpmk = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }

    const hasRelated = await repository.hasRelatedData(id);
    if (hasRelated) {
        throw new ConflictError(
            "Tidak dapat menghapus CPMK karena sudah memiliki data terkait (kriteria penilaian)"
        );
    }

    return await repository.remove(id);
};
