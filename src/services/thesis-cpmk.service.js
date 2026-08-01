import * as thesisCpmkRepository from "../repositories/thesis-cpmk.repository.js";

const createValidationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const normalizeCode = (code) => code.trim().toUpperCase();
const normalizeDescription = (description) => description.trim();

export const getAllThesisCpmks = async (filters) => {
    return await thesisCpmkRepository.findAll(filters);
};

export const getThesisCpmkById = async (id) => {
    const cpmk = await thesisCpmkRepository.findById(id);
    if (!cpmk) {
        const error = new Error("CPMK Tugas Akhir tidak ditemukan");
        error.statusCode = 404;
        throw error;
    }
    return cpmk;
};

export const createThesisCpmk = async (data) => {
    const createData = {
        ...data,
        code: normalizeCode(data.code),
        description: normalizeDescription(data.description),
    };
    const existingCpmk = await thesisCpmkRepository.findByCode(createData.code, createData.academicYearId);
    if (existingCpmk) {
        throw createValidationError(`CPMK dengan kode ${createData.code} sudah ada pada tahun ajaran ini`);
    }

    try {
        return await thesisCpmkRepository.create(createData);
    } catch (error) {
        if (error.code === "P2002") {
            throw createValidationError(`CPMK dengan kode ${createData.code} sudah ada pada tahun ajaran ini`);
        }
        throw error;
    }
};

export const updateThesisCpmk = async (id, data) => {
    const cpmk = await getThesisCpmkById(id);
    const updateData = {};

    if (data.description !== undefined) {
        updateData.description = normalizeDescription(data.description);
    }

    if (data.code !== undefined) {
        const normalizedCode = normalizeCode(data.code);
        if (normalizedCode !== cpmk.code) {
            const hasRelations = await thesisCpmkRepository.hasRelatedData(id);
            if (hasRelations) {
                throw createValidationError("Kode CPMK tidak dapat diubah karena sudah digunakan dalam penilaian");
            }

            const existingCpmk = await thesisCpmkRepository.findByCode(normalizedCode, cpmk.academicYearId, id);
            if (existingCpmk) {
                throw createValidationError(`CPMK dengan kode ${normalizedCode} sudah ada pada tahun ajaran ini`);
            }
        }
        updateData.code = normalizedCode;
    }

    try {
        return await thesisCpmkRepository.update(id, updateData);
    } catch (error) {
        if (error.code === "P2002") {
            const code = updateData.code ?? cpmk.code;
            throw createValidationError(`CPMK dengan kode ${code} sudah ada pada tahun ajaran ini`);
        }
        throw error;
    }
};

export const deleteThesisCpmk = async (id) => {
    await getThesisCpmkById(id);

    const hasRelations = await thesisCpmkRepository.hasRelatedData(id);
    if (hasRelations) {
        const error = new Error("CPMK tidak dapat dihapus karena sudah digunakan dalam penilaian (sudah ada nilai yang masuk)");
        error.statusCode = 400;
        throw error;
    }

    return await thesisCpmkRepository.remove(id);
};

export const copyTemplate = async (sourceAcademicYearId, targetAcademicYearId) => {
    if (!sourceAcademicYearId || !targetAcademicYearId) {
        const error = new Error("Tahun ajaran sumber dan tujuan harus diisi");
        error.statusCode = 400;
        throw error;
    }

    if (sourceAcademicYearId === targetAcademicYearId) {
        const error = new Error("Tahun ajaran sumber dan tujuan tidak boleh sama");
        error.statusCode = 400;
        throw error;
    }

    return await thesisCpmkRepository.copyTemplate(sourceAcademicYearId, targetAcademicYearId);
};
