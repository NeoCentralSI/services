import * as repository from "../repositories/yudisiumRequirement.repository.js";

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

const normalizeText = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const getAllYudisiumRequirements = async () => {
    const data = await repository.findAll();

    return data.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        notes: item.notes,
        order: item.order,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));
};

export const getYudisiumRequirementById = async (id) => {
    const data = await repository.findById(id);
    if (!data) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        notes: data.notes,
        order: data.order,
        isActive: data.isActive,
        usageCount: data._count?.yudisiumParticipantRequirements ?? 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
};

export const createYudisiumRequirement = async (data) => {
    const existing = await repository.findByName(data.name.trim());
    if (existing) {
        throw new ConflictError(`Nama persyaratan "${data.name}" sudah digunakan`);
    }

    const finalOrder = data.order ?? (await repository.getNextOrder());

    return await repository.create({
        name: data.name.trim(),
        description: normalizeText(data.description),
        notes: normalizeText(data.notes),
        order: finalOrder,
        isActive: data.isActive ?? true,
    });
};

export const updateYudisiumRequirement = async (id, data) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    const updateData = {};

    if (data.name !== undefined) {
        const normalizedName = data.name.trim();
        const duplicate = await repository.findByName(normalizedName, id);
        if (duplicate) {
            throw new ConflictError(`Nama persyaratan "${data.name}" sudah digunakan`);
        }
        updateData.name = normalizedName;
    }

    if (data.description !== undefined) {
        updateData.description = normalizeText(data.description);
    }

    if (data.notes !== undefined) {
        updateData.notes = normalizeText(data.notes);
    }

    if (data.order !== undefined) {
        updateData.order = data.order;
    }

    if (data.isActive !== undefined) {
        updateData.isActive = data.isActive;
    }

    return await repository.update(id, updateData);
};

export const toggleYudisiumRequirement = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    return await repository.update(id, { isActive: !existing.isActive });
};

export const moveYudisiumRequirementToTop = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    return await repository.moveToEdge(id, "top");
};

export const moveYudisiumRequirementToBottom = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    return await repository.moveToEdge(id, "bottom");
};

export const deleteYudisiumRequirement = async (id) => {
    const existing = await repository.findById(id);
    if (!existing) {
        throw new NotFoundError("Persyaratan yudisium tidak ditemukan");
    }

    const hasRelated = await repository.hasRelatedData(id);
    if (hasRelated) {
        throw new ConflictError(
            "Tidak dapat menghapus persyaratan yudisium karena sudah memiliki data dokumen peserta"
        );
    }

    await repository.remove(id);
};
