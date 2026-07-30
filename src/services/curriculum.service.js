import * as repository from "../repositories/curriculum.repository.js";

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

const normalizeName = (name) => String(name ?? "").trim();

const validateYearRange = (startYear, endYear) => {
    if (!Number.isInteger(startYear) || startYear < 2000) {
        throw new ValidationError("Tahun mulai tidak valid");
    }

    if (endYear !== null && endYear !== undefined) {
        if (!Number.isInteger(endYear) || endYear < 2000) {
            throw new ValidationError("Tahun akhir tidak valid");
        }
        if (endYear < startYear) {
            throw new ValidationError("Tahun akhir tidak boleh kurang dari tahun mulai");
        }
    }
};

const validateNoOverlappingYearRange = async (startYear, endYear, excludeId) => {
    const overlapping = await repository.findOverlappingYearRange(
        startYear,
        endYear ?? null,
        excludeId
    );
    if (overlapping) {
        throw new ValidationError(
            "Rentang tahun kurikulum bertumpang tindih dengan kurikulum lain"
        );
    }
};

const toResponse = (item) => ({
    id: item.id,
    name: item.name,
    startYear: item.startYear,
    endYear: item.endYear,
    cplCount: item._count?.cpls ?? 0,
    hasRelatedScores: item.cpls?.some((cpl) => cpl._count?.studentCplScores > 0) ?? false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
});

export const getAll = async (params) => {
    const { data, total } = await repository.findAll(params);
    return {
        data: data.map(toResponse),
        total,
    };
};

export const getById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Data kurikulum tidak ditemukan");
    }
    return toResponse(data);
};

export const create = async (data) => {
    const name = normalizeName(data.name);
    if (!name) {
        throw new ValidationError("Nama kurikulum tidak boleh kosong");
    }
    validateYearRange(data.startYear, data.endYear);
    await validateNoOverlappingYearRange(data.startYear, data.endYear);

    const created = await repository.create({
        ...data,
        name,
    });
    const createdWithRelations = await repository.findById(created.id);
    return toResponse(createdWithRelations);
};

export const update = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data kurikulum tidak ditemukan");
    }

    const updateData = { ...data };
    if (data.name !== undefined) {
        updateData.name = normalizeName(data.name);
        if (!updateData.name) {
            throw new ValidationError("Nama kurikulum tidak boleh kosong");
        }
    }

    const nextStartYear = data.startYear ?? existing.startYear;
    const nextEndYear = data.endYear !== undefined ? data.endYear : existing.endYear;
    validateYearRange(nextStartYear, nextEndYear);
    await validateNoOverlappingYearRange(nextStartYear, nextEndYear, id);

    const updated = await repository.update(id, updateData);
    const updatedWithRelations = await repository.findById(updated.id);
    return toResponse(updatedWithRelations);
};

export const remove = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data kurikulum tidak ditemukan");
    }

    const studentScoreCount = await repository.countStudentScores(id);
    if (studentScoreCount > 0) {
        throw new ValidationError(
            "Tidak dapat menghapus kurikulum karena CPL terkait sudah memiliki nilai mahasiswa"
        );
    }

    return await repository.removeWithCpls(id);
};
