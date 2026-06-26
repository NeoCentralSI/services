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

const toResponse = (item) => ({
    id: item.id,
    name: item.name,
    startYear: item.startYear,
    endYear: item.endYear,
    cplCount: item._count?.cpls ?? 0,
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
    const created = await repository.create(data);
    const createdWithRelations = await repository.findById(created.id);
    return toResponse(createdWithRelations);
};

export const update = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data kurikulum tidak ditemukan");
    }

    const updated = await repository.update(id, data);
    const updatedWithRelations = await repository.findById(updated.id);
    return toResponse(updatedWithRelations);
};

export const remove = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data kurikulum tidak ditemukan");
    }

    if (existing._count?.cpls > 0) {
        throw new ValidationError("Tidak dapat menghapus kurikulum karena sudah memiliki CPL yang terkait");
    }

    return await repository.remove(id);
};
