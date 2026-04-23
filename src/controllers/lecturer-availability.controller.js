import * as service from "../services/lecturer-availability.service.js";

export const getMyAvailabilities = async (req, res, next) => {
    try {
        const lecturerId = req.user.sub;
        const data = await service.getAvailabilities(lecturerId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil jadwal ketersediaan",
            data
        });
    } catch (error) {
        next(error);
    }
};

export const getAvailabilityById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const lecturerId = req.user.sub;
        const data = await service.getAvailabilityById(id, lecturerId);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil detail jadwal ketersediaan",
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
