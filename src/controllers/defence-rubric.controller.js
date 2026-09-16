import * as service from "../services/defence-rubric.service.js";

const VALID_ROLES = ["examiner", "supervisor"];

const validateRoleQuery = (role) => {
    if (!role || !VALID_ROLES.includes(role)) {
        const err = new Error("Role wajib diisi dan harus 'examiner' atau 'supervisor'");
        err.statusCode = 400;
        throw err;
    }
};

// ────────────────────────────────────────────
// Academic Year Minimum Score
// ────────────────────────────────────────────

export const updateDefenceMinimumScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { minimumScore } = req.validated;
        const data = await service.updateDefenceMinimumScore(id, minimumScore);
        res.status(200).json({
            success: true,
            message: "Berhasil mengubah skor minimum kelulusan sidang",
            data,
        });
    } catch (error) {
        next(error);
    }
};

// ────────────────────────────────────────────
// CPMK Listing (per role)
// ────────────────────────────────────────────

export const getCpmksWithRubrics = async (req, res, next) => {
    try {
        const { role, academicYearId } = req.query;
        validateRoleQuery(role);
        const data = await service.getCpmksWithRubrics(role, { academicYearId });
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
        const { cpmkId, ...rest } = req.validated;
        const data = await service.createCriteria({ thesisCpmkId: cpmkId, ...rest });
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
        const { role } = req.query;
        validateRoleQuery(role);

        const { criteriaId } = req.params;
        const data = await service.updateCriteria(role, criteriaId, req.validated);
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
        const { role } = req.query;
        validateRoleQuery(role);

        const { criteriaId } = req.params;
        await service.deleteCriteria(role, criteriaId);
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
        const { role } = req.query;
        validateRoleQuery(role);

        const { cpmkId } = req.params;
        const data = await service.removeDefenceCpmkConfig(role, cpmkId);
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
        const { role } = req.query;
        validateRoleQuery(role);

        const { criteriaId } = req.params;
        const data = await service.createRubric(role, criteriaId, req.validated);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah level rubrik",
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateRubric = async (req, res, next) => {
    try {
        const { role } = req.query;
        validateRoleQuery(role);

        const { rubricId } = req.params;
        const data = await service.updateRubric(role, rubricId, req.validated);
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
        const { role } = req.query;
        validateRoleQuery(role);

        const { rubricId } = req.params;
        await service.deleteRubric(role, rubricId);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus komponen rubrik",
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
        const { role } = req.query;
        validateRoleQuery(role);
        
        const { cpmkId, ...rest } = req.validated;
        await service.reorderCriteria(role, { thesisCpmkId: cpmkId, ...rest });
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
        const { role } = req.query;
        validateRoleQuery(role);

        await service.reorderRubrics(role, req.validated);
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
        const { role, academicYearId } = req.query;
        validateRoleQuery(role);
        const data = await service.getWeightSummary(role, { academicYearId });
        res.status(200).json({
            success: true,
            message: "Berhasil mengambil ringkasan bobot penilaian sidang",
            data,
        });
    } catch (error) {
        next(error);
    }
};
