import * as thesisCpmkRepository from "../repositories/thesis-cpmk.repository.js";

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
