import * as repository from "../repositories/seminar-requirement.repository.js";

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
        this.statusCode = 400;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

export const getAll = async (params) => {
    if (!params?.academicYearId) throw new ValidationError("Tahun ajaran harus dipilih");
    return await repository.findAll(params);
};

export const getById = async (id) => {
    const data = await repository.findById(id);
    if (!data) throw new NotFoundError("Data tidak ditemukan");
    return data;
};

export const create = async (data) => {
    const all = await repository.findAll({ academicYearId: data.academicYearId });
    const displayOrder = all.reduce((max, item) => Math.max(max, item.displayOrder), 0) + 1;
    return await repository.create({
        academicYearId: data.academicYearId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        displayOrder,
    });
};

export const update = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError("Data tidak ditemukan");

    const nextName = data.name?.trim();
    if (existing.hasRelatedData && nextName !== undefined && nextName !== existing.name) {
        throw new ValidationError("Nama persyaratan tidak dapat diubah karena sudah memiliki dokumen yang diunggah");
    }

    return await repository.update(id, {
        ...(nextName !== undefined && { name: nextName }),
        ...(data.description !== undefined && { description: data.description.trim() || null }),
    });
};

export const remove = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError("Data tidak ditemukan");
    if (existing.hasRelatedData) throw new ValidationError("Persyaratan tidak dapat dihapus karena sudah memiliki dokumen yang diunggah");
    return await repository.remove(id);
};

export const reorder = async (academicYearId, orderedIds) => {
    const requirements = await repository.findAll({ academicYearId });
    const expectedIds = new Set(requirements.map((item) => item.id));
    const submittedIds = new Set(orderedIds);

    if (submittedIds.size !== orderedIds.length ||
        expectedIds.size !== submittedIds.size ||
        orderedIds.some((id) => !expectedIds.has(id))) {
        throw new ValidationError("Urutan persyaratan tidak valid untuk tahun ajaran yang dipilih");
    }

    return await repository.reorder(orderedIds);
};

export const copyTemplate = async (sourceAcademicYearId, targetAcademicYearId) => {
    if (!sourceAcademicYearId || !targetAcademicYearId) {
        throw new ValidationError("Tahun ajaran sumber dan tujuan harus diisi");
    }

    if (sourceAcademicYearId === targetAcademicYearId) {
        throw new ValidationError("Tahun ajaran sumber dan tujuan tidak boleh sama");
    }

    return await repository.copyTemplate(sourceAcademicYearId, targetAcademicYearId);
};
