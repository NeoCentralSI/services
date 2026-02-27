import * as masterDataTaService from "../services/masterDataTa.service.js";

export const getAllTheses = async (req, res, next) => {
    try {
        const data = await masterDataTaService.getAllThesesMasterData();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil master data tugas akhir",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const getAllThesisStatuses = async (req, res, next) => {
    try {
        const statuses = await masterDataTaService.getAllThesisStatuses();
        res.status(200).json({
            success: true,
            data: statuses
        });
    } catch (error) {
        next(error);
    }
};

export const createThesis = async (req, res, next) => {
    try {
        const data = await masterDataTaService.createThesisMasterData(req.body);
        res.status(201).json({
            success: true,
            message: "Berhasil membuat data tugas akhir",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const updateThesis = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await masterDataTaService.updateThesisMasterData(id, req.body);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data tugas akhir",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const syncSia = async (req, res, next) => {
    try {
        const data = await masterDataTaService.syncSia();
        res.status(200).json({
            success: true,
            message: "Berhasil melakukan sinkronisasi dengan SIA",
            data
        });
    } catch (error) {
        next(error);
    }
};
