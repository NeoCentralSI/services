import * as penilaianService from "../../services/insternship/penilaian.service.js";

/**
 * Get assessment criteria and existing scores for a lecturer.
 */
export async function getAssessment(req, res, next) {
    try {
        const { internshipId } = req.params;
        const lecturerId = req.user.sub;
        const data = await penilaianService.getAssessmentForLecturer(lecturerId, internshipId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Submit lecturer assessment core.
 */
export async function submitAssessment(req, res, next) {
    try {
        const { internshipId } = req.params;
        const lecturerId = req.user.sub;
        const { scores } = req.body; // Array of { chosenRubricId, score }
        
        if (!scores || !Array.isArray(scores)) {
            const error = new Error("Daftar nilai wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await penilaianService.submitLecturerAssessment(lecturerId, internshipId, scores);
        res.status(200).json({ 
            success: true, 
            message: "Penilaian berhasil disimpan.",
            data 
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Validate a field assessment token and return internship info + rubrics.
 * GET /api/insternship/field-assessment/validate/:token
 */
export async function validateToken(req, res, next) {
    try {
        const { token } = req.params;
        const { pin } = req.query;
        const data = await penilaianService.validateToken(token, pin);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Submit field assessment scores + signature.
 * POST /api/insternship/field-assessment/submit/:token
 * Body: { scores: [{ chosenRubricId, score }], signature: "<base64 png string>" }
 */
export async function submitFieldAssessment(req, res, next) {
    try {
        const { token } = req.params;
        const { scores, signature } = req.body;

        if (!scores || !Array.isArray(scores) || scores.length === 0) {
            const error = new Error("Daftar nilai wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        if (!signature) {
            const error = new Error("Tanda tangan wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await penilaianService.submitFieldAssessment(token, scores, signature);
        res.status(200).json({
            success: true,
            message: "Penilaian berhasil dikirim. Terima kasih!",
            data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Verify PIN for field assessment.
 * POST /api/insternship/field-assessment/verify-pin/:token
 */
export async function verifyPin(req, res, next) {
    try {
        const { token } = req.params;
        const { pin } = req.body;

        if (!pin) {
            const error = new Error("PIN wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        await penilaianService.verifyPin(token, pin);
        res.status(200).json({ success: true, message: "PIN berhasil diverifikasi." });
    } catch (error) {
        next(error);
    }
}

/**
 * Get all internship CPMKs.
 */
export async function getAllCpmks(req, res, next) {
    try {
        const { academicYearId } = req.query;
        const data = await penilaianService.getAllCpmks(academicYearId);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get internship CPMK by ID.
 */
export async function getCpmkById(req, res, next) {
    try {
        const { id } = req.params;
        const data = await penilaianService.getCpmkById(id);
        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create internship CPMK.
 */
export async function createCpmk(req, res, next) {
    try {
        const data = await penilaianService.createCpmk(req.body);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah CPMK Internship",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Update internship CPMK.
 */
export async function updateCpmk(req, res, next) {
    try {
        const { id } = req.params;
        const data = await penilaianService.updateCpmk(id, req.body);
        res.status(200).json({
            success: true,
            message: "Berhasil memperbarui CPMK Internship",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete internship CPMK.
 */
export async function deleteCpmk(req, res, next) {
    try {
        const { id } = req.params;
        await penilaianService.deleteCpmk(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus CPMK Internship"
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Create rubric.
 */
export async function createRubric(req, res, next) {
    try {
        const data = await penilaianService.createRubric(req.body);
        res.status(201).json({
            success: true,
            message: "Berhasil menambah rubrik penilaian",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Update rubric.
 */
export async function updateRubric(req, res, next) {
    try {
        const { id } = req.params;
        const data = await penilaianService.updateRubric(id, req.body);
        res.status(200).json({
            success: true,
            message: "Berhasil memperbarui rubrik penilaian",
            data
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete rubric.
 */
export async function deleteRubric(req, res, next) {
    try {
        const { id } = req.params;
        await penilaianService.deleteRubric(id);
        res.status(200).json({
            success: true,
            message: "Berhasil menghapus rubrik penilaian"
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Bulk update rubrics for a CPMK.
 */
export async function bulkUpdateRubrics(req, res, next) {
    try {
        const { cpmkId } = req.params;
        const { rubrics } = req.body;
        
        await penilaianService.bulkUpdateRubrics(cpmkId, rubrics);
        
        res.status(200).json({
            success: true,
            message: "Berhasil menyimpan rubrik penilaian secara massal"
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Duplicate CPMKs from one year to another.
 */
export async function duplicateCpmks(req, res, next) {
    try {
        const { fromYearId, toYearId } = req.body;
        const data = await penilaianService.copyCpmks(fromYearId, toYearId);
        res.status(200).json({
            success: true,
            message: "Berhasil menduplikasi data CPMK",
            data
        });
    } catch (error) {
        next(error);
    }
}
