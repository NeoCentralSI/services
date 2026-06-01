import * as repository from "../repositories/defence-requirement.repository.js";

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

export const getAll = async (params) => {
    return await repository.findAll(params);
};

export const getById = async (id) => {
    const data = await repository.findById(id);
    if (!data) throw new NotFoundError("Data tidak ditemukan");
    return data;
};

export const create = async (data) => {
    if (!data.code) {
        data.code = data.name.toUpperCase().replace(/\s+/g, '_').substring(0, 50) + '_' + Date.now();
    }
    const all = await repository.findAll({ academicYearId: data.academicYearId });
    if (data.displayOrder === undefined || data.displayOrder === 0) {
        data.displayOrder = all.length + 1;
    }
    return await repository.create(data);
};

export const update = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError("Data tidak ditemukan");
    return await repository.update(id, data);
};

export const remove = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) throw new NotFoundError("Data tidak ditemukan");
    return await repository.remove(id);
};

export const reorder = async (orderedIds) => {
    for (let i = 0; i < orderedIds.length; i++) {
        await repository.update(orderedIds[i], { displayOrder: i + 1 });
    }
};
