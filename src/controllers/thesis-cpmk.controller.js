import * as thesisCpmkService from "../services/thesis-cpmk.service.js";

export const getAll = async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        const cpmks = await thesisCpmkService.getAllThesisCpmks({ academicYearId });
        res.status(200).json({ success: true, data: cpmks });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const cpmk = await thesisCpmkService.getThesisCpmkById(req.params.id);
        res.status(200).json({ success: true, data: cpmk });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const cpmk = await thesisCpmkService.createThesisCpmk(req.validated);
        res.status(201).json({ success: true, data: cpmk });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const cpmk = await thesisCpmkService.updateThesisCpmk(req.params.id, req.validated);
        res.status(200).json({ success: true, data: cpmk });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        await thesisCpmkService.deleteThesisCpmk(req.params.id);
        res.status(200).json({ success: true, message: "CPMK Tugas Akhir berhasil dihapus" });
    } catch (error) {
        next(error);
    }
};

export const copyTemplate = async (req, res, next) => {
    try {
        const { sourceAcademicYearId, targetAcademicYearId } = req.body;
        const result = await thesisCpmkService.copyTemplate(sourceAcademicYearId, targetAcademicYearId);
        res.status(200).json({
            success: true,
            message: "Berhasil menyalin template CPMK Tugas Akhir",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};
