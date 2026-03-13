import * as guidanceService from "../../services/insternship/guidance.service.js";

// ==================== Student Questions ====================

/**
 * Get all guidance questions.
 */
export async function getQuestions(req, res, next) {
    try {
        const { academicYearId } = req.query;
        const data = await guidanceService.getAllQuestions(academicYearId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a guidance question.
 */
export async function createQuestion(req, res, next) {
    try {
        const data = await guidanceService.createQuestion(req.body);
        res.status(201).json({ success: true, data, message: "Pertanyaan berhasil ditambahkan." });
    } catch (error) {
        next(error);
    }
}

/**
 * Update a guidance question.
 */
export async function updateQuestion(req, res, next) {
    try {
        const { id } = req.params;
        const data = await guidanceService.updateQuestion(id, req.body);
        res.status(200).json({ success: true, data, message: "Pertanyaan berhasil diperbarui." });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a guidance question.
 */
export async function deleteQuestion(req, res, next) {
    try {
        const { id } = req.params;
        await guidanceService.deleteQuestion(id);
        res.status(200).json({ success: true, message: "Pertanyaan berhasil dihapus." });
    } catch (error) {
        next(error);
    }
}

// ==================== Lecturer Criteria ====================

/**
 * Get all lecturer criteria.
 */
export async function getCriteria(req, res, next) {
    try {
        const { academicYearId } = req.query;
        const data = await guidanceService.getAllCriteria(academicYearId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Create a lecturer criteria.
 */
export async function createCriteria(req, res, next) {
    try {
        const data = await guidanceService.createCriteria(req.body);
        res.status(201).json({ success: true, data, message: "Kriteria berhasil ditambahkan." });
    } catch (error) {
        next(error);
    }
}

/**
 * Update a lecturer criteria.
 */
export async function updateCriteria(req, res, next) {
    try {
        const { id } = req.params;
        const data = await guidanceService.updateCriteria(id, req.body);
        res.status(200).json({ success: true, data, message: "Kriteria berhasil diperbarui." });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a lecturer criteria.
 */
export async function deleteCriteria(req, res, next) {
    try {
        const { id } = req.params;
        await guidanceService.deleteCriteria(id);
        res.status(200).json({ success: true, message: "Kriteria berhasil dihapus." });
    } catch (error) {
        next(error);
    }
}

// ==================== Student Guidance ====================

/**
 * Get student's guidance timeline.
 */
export async function getStudentGuidance(req, res, next) {
    try {
        const studentId = req.user.sub;
        const data = await guidanceService.getStudentGuidance(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Submit student guidance answers.
 */
export async function submitStudentGuidance(req, res, next) {
    try {
        const studentId = req.user.sub;
        const { weekNumber, answers } = req.body;
        await guidanceService.submitGuidance(studentId, weekNumber, answers);
        res.status(200).json({ success: true, message: "Bimbingan berhasil dikirim." });
    } catch (error) {
        next(error);
    }
}

// ==================== Lecturer Guidance ====================

/**
 * Get supervised students and their guidance progress.
 */
export async function getSupervisedStudents(req, res, next) {
    try {
        const lecturerId = req.user.sub;
        const data = await guidanceService.getSupervisedStudents(lecturerId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Get guidance timeline of a specific student supervised.
 */
export async function getSupervisedStudentTimeline(req, res, next) {
    try {
        const { internshipId } = req.params;
        const lecturerId = req.user.sub;
        const data = await guidanceService.getLecturerGuidanceTimeline(lecturerId, internshipId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Get detailed guidance for a specific week of a supervised student.
 */
export async function getSupervisedStudentWeekDetail(req, res, next) {
    try {
        const { internshipId, weekNumber } = req.params;
        const lecturerId = req.user.sub;
        const data = await guidanceService.getGuidanceWeekDetail(lecturerId, internshipId, weekNumber);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Submit evaluation for a supervised student's guidance week.
 */
export async function submitLecturerEvaluation(req, res, next) {
    try {
        const { internshipId, weekNumber } = req.params;
        const lecturerId = req.user.sub;
        const data = await guidanceService.submitLecturerEvaluation(lecturerId, internshipId, weekNumber, req.body);
        res.status(200).json({ success: true, message: "Evaluasi berhasil dikirim.", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Duplicate guidance data from one year to another.
 */
export async function duplicateGuidance(req, res, next) {
    try {
        const { fromYearId, toYearId } = req.body;
        const data = await guidanceService.copyGuidance(fromYearId, toYearId);
        res.status(200).json({
            success: true,
            message: "Berhasil menduplikasi data bimbingan",
            data
        });
    } catch (error) {
        next(error);
    }
}
