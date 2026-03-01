import * as service from "../services/cpl.service.js";

export const getAll = async (req, res, next) => {
    try {
        const data = await service.getAllCpls();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCplById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.createCpl(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah data CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateCpl(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data CPL",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const toggle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.toggleCpl(id);
        res.status(200).json({
            success: true,
            message: data.isActive ? "CPL berhasil diaktifkan" : "CPL berhasil dinonaktifkan",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteCpl(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus data CPL",
        });
    } catch (error) {
        next(error);
    }
};
