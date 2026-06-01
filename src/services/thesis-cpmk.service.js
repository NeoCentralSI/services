import * as thesisCpmkRepository from "../repositories/thesis-cpmk.repository.js";

export const getAllThesisCpmks = async (filters) => {
    return await thesisCpmkRepository.findAll(filters);
};

export const getThesisCpmkById = async (id) => {
    const cpmk = await thesisCpmkRepository.findById(id);
    if (!cpmk) {
        const error = new Error("Thesis CPMK tidak ditemukan");
        error.statusCode = 404;
        throw error;
    }
    return cpmk;
};

export const createThesisCpmk = async (data) => {
    const existingCpmk = await thesisCpmkRepository.findByCode(data.code, data.academicYearId);
    if (existingCpmk) {
        const error = new Error(`CPMK dengan kode ${data.code} sudah ada pada tahun ajaran ini`);
        error.statusCode = 400;
        throw error;
    }

    return await thesisCpmkRepository.create(data);
};

export const updateThesisCpmk = async (id, data) => {
    const cpmk = await getThesisCpmkById(id);

    if (data.code && data.code !== cpmk.code) {
        const existingCpmk = await thesisCpmkRepository.findByCode(data.code, cpmk.academicYearId, id);
        if (existingCpmk) {
            const error = new Error(`CPMK dengan kode ${data.code} sudah ada pada tahun ajaran ini`);
            error.statusCode = 400;
            throw error;
        }
    }

    return await thesisCpmkRepository.update(id, data);
};

export const deleteThesisCpmk = async (id) => {
    await getThesisCpmkById(id);

    const hasRelations = await thesisCpmkRepository.hasRelatedData(id);
    if (hasRelations) {
        const error = new Error("CPMK tidak dapat dihapus karena sudah memiliki kriteria penilaian");
        error.statusCode = 400;
        throw error;
    }

    return await thesisCpmkRepository.remove(id);
};
