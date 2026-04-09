import * as fieldAssessmentService from "../../services/insternship/field-assessment.service.js";

/**
 * Validate a field assessment token and return internship info + rubrics.
 * GET /api/insternship/field-assessment/validate/:token
 */
export async function validateToken(req, res, next) {
    try {
        const { token } = req.params;
        const data = await fieldAssessmentService.validateToken(token);
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
export async function submitAssessment(req, res, next) {
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

        const data = await fieldAssessmentService.submitFieldAssessment(token, scores, signature);
        res.status(200).json({
            success: true,
            message: "Penilaian berhasil dikirim. Terima kasih!",
            data,
        });
    } catch (error) {
        next(error);
    }
}
