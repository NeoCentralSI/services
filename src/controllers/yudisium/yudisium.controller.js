import * as service from "../../services/yudisium/yudisium.service.js";

export const getAll = async (req, res, next) => {
    try {
        const data = await service.getAllYudisium();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getYudisiumById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.createYudisium(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah data yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateYudisium(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteYudisium(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus data yudisium",
        });
    } catch (error) {
        next(error);
    }
};
