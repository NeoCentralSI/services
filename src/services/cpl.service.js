import * as repository from "../repositories/cpl.repository.js";

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

const toCplResponse = (item) => ({
    id: item.id,
    code: item.code,
    description: item.description,
    minimalScore: item.minimalScore,
    isActive: item.isActive,
    hasRelatedScores:
        item.hasRelatedScores !== undefined
            ? item.hasRelatedScores
            : item._count?.studentCplScores > 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
});

export const getAllCpls = async (params) => {
    const { data, total } = await repository.findAll(params);
    return {
        data: data.map(toCplResponse),
        total,
    };
};

export const getCplById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }
    return toCplResponse(data);
};

export const createCpl = async (data) => {
    if (data.code) {
        const existing = await repository.findActiveByCode(data.code);
        if (existing) {
            throw new ValidationError(
                `Tidak dapat membuat CPL. Versi aktif dengan kode "${data.code}" sudah ada`
            );
        }
    }

    const created = await repository.create({
        code: data.code,
        description: data.description,
        minimalScore: data.minimalScore,
    });

    const createdWithRelations = await repository.findById(created.id);
    return toCplResponse(createdWithRelations);
};

export const updateCpl = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    if (!existing.isActive) {
        throw new ValidationError("CPL non-aktif tidak dapat diubah");
    }

    const hasRelatedScores = existing._count.studentCplScores > 0;
    if (hasRelatedScores && (data.code !== undefined || data.minimalScore !== undefined)) {
        throw new ValidationError(
            "CPL yang sudah memiliki nilai mahasiswa hanya dapat diubah pada field deskripsi"
        );
    }

    const updateData = {};

    if (data.code !== undefined) {
        if (existing.isActive) {
            const activeDuplicate = await repository.findActiveByCode(data.code, id);
            if (activeDuplicate) {
                throw new ValidationError(
                    `Tidak dapat mengubah kode. Versi aktif dengan kode "${data.code}" sudah ada`
                );
            }
        }
        updateData.code = data.code;
    }

    if (data.description !== undefined) updateData.description = data.description;
    if (data.minimalScore !== undefined) updateData.minimalScore = data.minimalScore;

    if (Object.keys(updateData).length === 0) {
        return toCplResponse({
            ...existing,
            hasRelatedScores,
        });
    }

    const updated = await repository.update(id, updateData);
    const updatedWithRelations = await repository.findById(updated.id);
    return toCplResponse(updatedWithRelations);
};

export const toggleCpl = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const nextIsActive = !existing.isActive;

    if (nextIsActive && existing.code) {
        const activeDuplicate = await repository.findActiveByCode(existing.code, id);
        if (activeDuplicate) {
            throw new ValidationError(
                `Tidak dapat mengaktifkan ulang CPL. Versi aktif dengan kode "${existing.code}" sudah ada`
            );
        }
    }

    const updated = await repository.update(id, { isActive: nextIsActive });
    const updatedWithRelations = await repository.findById(updated.id);
    return toCplResponse(updatedWithRelations);
};

export const deleteCpl = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Data CPL tidak ditemukan");
    }

    const hasRelated = await repository.hasRelatedScores(id);
    if (hasRelated) {
        throw new ValidationError(
            "Tidak dapat menghapus CPL karena sudah memiliki nilai CPL mahasiswa"
        );
    }

    return await repository.remove(id);
};
