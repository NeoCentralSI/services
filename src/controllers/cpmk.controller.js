import * as service from "../services/cpmk.service.js";

export const getAll = async (req, res, next) => {
    try {
        const data = await service.getAllCpmks();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPMK",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCpmkById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail CPMK",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.createCpmk(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah data CPMK",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateCpmk(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data CPMK",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const toggle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.toggleCpmk(id);
        res.status(200).json({
            success: true,
            message: data.isActive ? "CPMK berhasil diaktifkan" : "CPMK berhasil dinonaktifkan",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteCpmk(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus data CPMK",
        });
    } catch (error) {
        next(error);
    }
};
