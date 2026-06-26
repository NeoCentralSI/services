import * as service from "../services/curriculum.service.js";

export const getAll = async (req, res, next) => {
    try {
        const { data, total } = await service.getAll(req.query);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data kurikulum",
            data,
            total,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail kurikulum",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.create(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah data kurikulum",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.update(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah data kurikulum",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.remove(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus data kurikulum",
        });
    } catch (error) {
        next(error);
    }
};
