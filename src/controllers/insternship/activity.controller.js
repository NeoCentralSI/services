import * as activityService from "../../services/insternship/activity.service.js";

/**
 * Get logbooks for student.
 */
export async function getLogbooks(req, res, next) {
    try {
        const userId = req.user.sub;
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
        res.setHeader("Content-Disposition", 'attachment; filename="Logbook_Kerja_Praktik.pdf"');
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

/**
 * Update completion certificate.
 */
export async function updateCompletionCertificate(req, res, next) {
    try {
        const userId = req.user.sub;
        const { documentId } = req.body;

        if (!documentId) {
            const error = new Error("File sertifikat wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.updateCompletionCertificate(userId, documentId);
        res.json({ success: true, message: "Sertifikat berhasil diunggah", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Update company receipt.
 */
export async function updateCompanyReceipt(req, res, next) {
    try {
        const userId = req.user.sub;
        const { documentId } = req.body;

        if (!documentId) {
            const error = new Error("File tanda terima wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.updateCompanyReceipt(userId, documentId);
        res.json({ success: true, message: "Tanda terima berhasil diunggah", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Submit logbook document.
 */
export async function submitLogbook(req, res, next) {
    try {
        const userId = req.user.sub;
        const { documentId } = req.body;

        if (!documentId) {
            const error = new Error("File logbook wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.submitLogbookDocument(userId, documentId);
        res.json({ success: true, message: "Dokumen logbook berhasil diunggah", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Register student for internship seminar.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function registerSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const seminar = await activityService.registerSeminar(userId);
        res.status(200).json({
            success: true,
            message: "Pendaftaran seminar berhasil.",
            data: seminar
        });
    } catch (error) {
        next(error);
    }
}
