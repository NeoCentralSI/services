import * as service from "../services/yudisiumRequirement.service.js";

export const getAll = async (req, res, next) => {
    try {
        const data = await service.getAllYudisiumRequirements();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data persyaratan yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getYudisiumRequirementById(id);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail persyaratan yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const create = async (req, res, next) => {
    try {
        const data = await service.createYudisiumRequirement(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah persyaratan yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateYudisiumRequirement(id, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah persyaratan yudisium",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const toggle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.toggleYudisiumRequirement(id);
        res.status(200).json({
            success: true,
            message: data.isActive
                ? "Persyaratan yudisium berhasil diaktifkan"
                : "Persyaratan yudisium berhasil dinonaktifkan",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const moveTop = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.moveYudisiumRequirementToTop(id);
        res.status(200).json({
            success: true,
            message: "Persyaratan yudisium berhasil dipindahkan ke urutan teratas",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const moveBottom = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.moveYudisiumRequirementToBottom(id);
        res.status(200).json({
            success: true,
            message: "Persyaratan yudisium berhasil dipindahkan ke urutan terbawah",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteYudisiumRequirement(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus persyaratan yudisium",
        });
    } catch (error) {
        next(error);
    }
};
