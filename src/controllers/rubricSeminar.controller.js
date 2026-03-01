import * as service from "../services/rubricSeminar.service.js";

// ────────────────────────────────────────────
// CPMK Listing
// ────────────────────────────────────────────

export const getCpmksWithRubrics = async (req, res, next) => {
    try {
        const data = await service.getCpmksWithRubrics();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPMK dan rubrik seminar",
            data,
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Criteria CRUD
// ────────────────────────────────────────────

export const createCriteria = async (req, res, next) => {
    try {
        const data = await service.createCriteria(req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah kriteria seminar",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateCriteria = async (req, res, next) => {
    try {
        const { criteriaId } = req.params;
        const data = await service.updateCriteria(criteriaId, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah kriteria seminar",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteCriteria = async (req, res, next) => {
    try {
        const { criteriaId } = req.params;
        await service.deleteCriteria(criteriaId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus kriteria seminar",
        });
    } catch (error) {
        next(error);
    }
};

export const removeCpmkConfig = async (req, res, next) => {
    try {
        const { cpmkId } = req.params;
        const data = await service.removeSeminarCpmkConfig(cpmkId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus konfigurasi CPMK seminar",
            data,
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Rubric CRUD
// ────────────────────────────────────────────

export const createRubric = async (req, res, next) => {
    try {
        const { criteriaId } = req.params;
        const data = await service.createRubric(criteriaId, req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah level rubrik",
            data,
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Update / Delete Rubric
// ────────────────────────────────────────────

export const updateRubric = async (req, res, next) => {
    try {
        const { rubricId } = req.params;
        const data = await service.updateRubric(rubricId, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah komponen rubrik",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteRubric = async (req, res, next) => {
    try {
        const { rubricId } = req.params;
        await service.deleteRubric(rubricId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus komponen rubrik",
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Toggle Criteria Active
// ────────────────────────────────────────────

export const toggleCriteriaActive = async (req, res, next) => {
    try {
        const { criteriaId } = req.params;
        const data = await service.toggleCriteriaActive(criteriaId, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah status kriteria",
            data,
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Reorder
// ────────────────────────────────────────────

export const reorderCriteria = async (req, res, next) => {
    try {
        await service.reorderCriteria(req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah urutan kriteria",
        });
    } catch (error) {
        next(error);
    }
};

export const reorderRubrics = async (req, res, next) => {
    try {
        await service.reorderRubrics(req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah urutan rubrik",
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Weight Summary
// ────────────────────────────────────────────

export const getWeightSummary = async (req, res, next) => {
    try {
        const data = await service.getWeightSummary();
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil ringkasan bobot penilaian seminar",
            data,
        });
    } catch (error) {
        next(error);
    }
};
