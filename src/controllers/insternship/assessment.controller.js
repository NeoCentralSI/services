import * as assessmentService from "../../services/insternship/assessment.service.js";

/**
 * Get assessment criteria and existing scores for a lecturer.
 */
export async function getAssessment(req, res, next) {
    try {
        const { internshipId } = req.params;
        const lecturerId = req.user.sub;
        const data = await assessmentService.getAssessmentForLecturer(lecturerId, internshipId);
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

        const data = await assessmentService.submitLecturerAssessment(lecturerId, internshipId, scores);
        res.status(200).json({ 
            success: true, 
            message: "Penilaian berhasil disimpan.",
            data 
        });
    } catch (error) {
        next(error);
    }
}
