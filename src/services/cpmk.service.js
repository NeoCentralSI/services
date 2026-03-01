import * as repository from "../repositories/cpmk.repository.js";

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

export const getAllCpmks = async () => {
    const data = await repository.findAll();
    return data.map((item) => ({
        id: item.id,
        code: item.code,
        description: item.description,
        type: item.type,
        maxScore: item.maxScore,
        isActive: item.isActive,
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
    // Check code uniqueness
    if (data.code) {
        const existing = await repository.findByCode(data.code);
        if (existing) {
            throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan`);
        }
    }

    return await repository.create({
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

    const updateData = {};

    if (data.code !== undefined) {
        // Check code uniqueness (exclude self)
        const duplicate = await repository.findByCode(data.code, id);
        if (duplicate) {
            throw new ConflictError(`Kode CPMK "${data.code}" sudah digunakan`);
        }
        updateData.code = data.code;
    }

    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;

    return await repository.update(id, updateData);
};

export const toggleCpmk = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPMK tidak ditemukan");
    }

    return await repository.update(id, { isActive: !existing.isActive });
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
