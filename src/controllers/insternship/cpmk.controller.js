import * as service from "../../services/insternship/cpmk.service.js";

/**
 * Get all internship CPMKs.
 */
export const getAllCpmks = async (req, res, next) => {
    try {
        const { academicYearId } = req.query;
        const data = await service.getAllCpmks(academicYearId);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get internship CPMK by ID.
 */
export const getCpmkById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.getCpmkById(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create internship CPMK.
 */
export const createCpmk = async (req, res, next) => {
    try {
        const data = await service.createCpmk(req.body);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah CPMK Internship",
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update internship CPMK.
 */
export const updateCpmk = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateCpmk(id, req.body);
        res.status(200).json({
            success: true,
            message: "Berhasil memperbarui CPMK Internship",
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete internship CPMK.
 */
export const deleteCpmk = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteCpmk(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus CPMK Internship"
        });
    } catch (error) {
        next(error);
    }
};

// ================= Rubric Handlers =================

/**
 * Create rubric.
 */
export const createRubric = async (req, res, next) => {
    try {
        const data = await service.createRubric(req.body);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah rubrik penilaian",
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update rubric.
 */
export const updateRubric = async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = await service.updateRubric(id, req.body);
        res.status(200).json({
            success: true,
            message: "Berhasil memperbarui rubrik penilaian",
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete rubric.
 */
export const deleteRubric = async (req, res, next) => {
    try {
        const { id } = req.params;
        await service.deleteRubric(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus rubrik penilaian"
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bulk update rubrics for a CPMK.
 */
export const bulkUpdateRubrics = async (req, res, next) => {
    try {
        const { cpmkId } = req.params;
        const { rubrics } = req.body;
        
        await service.bulkUpdateRubrics(cpmkId, rubrics);
        
        res.status(200).json({
            success: true,
            message: "Berhasil menyimpan rubrik penilaian secara massal"
        });
    } catch (error) {
        next(error);
    }
};
