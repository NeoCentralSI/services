import * as service from "../services/lecturerAvailability.service.js";

export const getMyAvailabilities = async (req, res, next) => {
    try {
        const lecturerId = req.user.sub;
        const data = await service.getMyAvailabilities(lecturerId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil jadwal ketersediaan",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const createAvailability = async (req, res, next) => {
    try {
        const lecturerId = req.user.sub;
        const data = await service.createAvailability(lecturerId, req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah jadwal ketersediaan",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const updateAvailability = async (req, res, next) => {
    try {
        const { id } = req.params;
        const lecturerId = req.user.sub;
        const data = await service.updateAvailability(id, lecturerId, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah jadwal ketersediaan",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const toggleAvailability = async (req, res, next) => {
    try {
        const { id } = req.params;
        const lecturerId = req.user.sub;
        const data = await service.toggleAvailability(id, lecturerId);
        res.status(200).json({
            success: true,
            message: data.isActive ? "Jadwal berhasil diaktifkan" : "Jadwal berhasil dinonaktifkan",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const deleteAvailability = async (req, res, next) => {
    try {
        const { id } = req.params;
        const lecturerId = req.user.sub;
        await service.deleteAvailability(id, lecturerId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus jadwal ketersediaan"
        });
    } catch (error) {
        next(error);
    }
};
