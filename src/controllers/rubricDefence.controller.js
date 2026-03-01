import * as service from "../services/rubricDefence.service.js";

const VALID_ROLES = ["examiner", "supervisor"];

const validateRoleQuery = (role) => {
    if (!role || !VALID_ROLES.includes(role)) {
        const err = new Error("Role wajib diisi dan harus 'examiner' atau 'supervisor'");
        err.statusCode = 400;
        throw err;
    }
};

// ────────────────────────────────────────────
// CPMK Listing (per role)
// ────────────────────────────────────────────

export const getCpmksWithRubrics = async (req, res, next) => {
    try {
        const { role } = req.query;
        validateRoleQuery(role);
        const data = await service.getCpmksWithRubrics(role);
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil data CPMK dan rubrik sidang",
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
            message: "Berhasil menambah kriteria sidang",
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
            message: "Berhasil mengubah kriteria sidang",
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
            message: "Berhasil menghapus kriteria sidang",
        });
    } catch (error) {
        next(error);
    }
};

export const removeCpmkConfig = async (req, res, next) => {
    try {
        const { cpmkId } = req.params;
        const { role } = req.query;
        validateRoleQuery(role);
        const data = await service.removeDefenceCpmkConfig(cpmkId, role);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus konfigurasi CPMK sidang",
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
            message: "Berhasil menambah level rubrik sidang",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateRubric = async (req, res, next) => {
    try {
        const { rubricId } = req.params;
        const data = await service.updateRubric(rubricId, req.validated);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah komponen rubrik sidang",
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
            message: "Berhasil menghapus komponen rubrik sidang",
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
            message: "Berhasil mengubah status kriteria sidang",
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
            message: "Berhasil mengubah urutan kriteria sidang",
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
            message: "Berhasil mengubah urutan rubrik sidang",
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// Weight Summary (per role)
// ────────────────────────────────────────────

export const getWeightSummary = async (req, res, next) => {
    try {
        const { role } = req.query;
        validateRoleQuery(role);
        const data = await service.getWeightSummary(role);

        // Also return the global total across both roles for cap display
        const globalTotal = await service.getTotalActiveScore();

        res.status(200).json({
            success: true,
            message: "Berhasil mengambil ringkasan bobot penilaian sidang",
            data: {
                ...data,
                globalTotalScore: globalTotal,
            },
        });
    } catch (error) {
        next(error);
    }
};
