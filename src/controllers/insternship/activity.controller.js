import * as activityService from "../../services/insternship/activity.service.js";

/**
 * Get logbooks for student.
 */
export async function getLogbooks(req, res, next) {
    try {
        const userId = req.user.sub; // sub contains the user ID from auth middleware
        // Assuming user.id is the student.id or we need to find student from user.id
        // Let's check how studentId is handled in other controllers.

        const data = await activityService.getStudentLogbooks(userId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Update logbook entry.
 */
export async function updateLogbook(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { activityDescription } = req.body;

        const data = await activityService.updateLogbook(id, userId, activityDescription);
        res.json({ success: true, message: "Logbook berhasil diperbarui", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Update internship details.
 */
export async function updateInternshipDetails(req, res, next) {
    try {
        const userId = req.user.sub;
        const { fieldSupervisorName, unitSection } = req.body;

        const data = await activityService.updateInternshipDetails(userId, { fieldSupervisorName, unitSection });
        res.json({ success: true, message: "Informasi KP berhasil diperbarui", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Download Logbook as PDF.
 */
export async function downloadLogbookPdf(req, res, next) {
    try {
        const userId = req.user.sub;
        const pdfBuffer = await activityService.generateLogbookPdf(userId);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="Logbook_Kerja_Praik.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
}

/**
 * Download Logbook as DOCX.
 */
export async function downloadLogbookDocx(req, res, next) {
    try {
        const userId = req.user.sub;
        const { buffer, filename } = await activityService.generateLogbookDocx(userId);

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
}

/**
 * Submit internship report.
 */
export async function submitReport(req, res, next) {
    try {
        const userId = req.user.sub;
        const { title, documentId } = req.body;

        if (!title || !documentId) {
            const error = new Error("Judul dan file laporan wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.submitInternshipReport(userId, title, documentId);
        res.json({ success: true, message: "Laporan berhasil diunggah", data });
    } catch (error) {
        next(error);
    }
}
