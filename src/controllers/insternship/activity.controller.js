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
 * Lock logbook for student.
 */
export async function lockLogbook(req, res, next) {
    try {
        const userId = req.user.sub;
        const data = await activityService.lockLogbook(userId);
        res.json({ success: true, message: "Logbook berhasil dikunci. Anda tidak dapat melakukan perubahan lagi.", data });
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
        const { fieldSupervisorName, fieldSupervisorEmail, unitSection } = req.body;

        const data = await activityService.updateInternshipDetails(userId, { fieldSupervisorName, fieldSupervisorEmail, unitSection });
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
 * Submit final fixed internship report.
 */
export async function submitFinalReport(req, res, next) {
    try {
        const userId = req.user.sub;
        const { documentId } = req.body;

        if (!documentId) {
            const error = new Error("File laporan final wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.submitFinalReport(userId, documentId);
        res.json({ success: true, message: "Laporan final berhasil diunggah", data });
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
 * Submit company report document (laporan akhir untuk instansi).
 */
export async function submitCompanyReport(req, res, next) {
    try {
        const userId = req.user.sub;
        const { documentId } = req.body;

        if (!documentId) {
            const error = new Error("File laporan akhir instansi wajib diisi.");
            error.statusCode = 400;
            throw error;
        }

        const data = await activityService.submitCompanyReport(userId, documentId);
        res.json({ success: true, message: "Laporan akhir instansi berhasil diunggah. Email ke pembimbing lapangan telah dikirim.", data });
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
 * Register student for internship seminar with schedule.
 */
export async function registerSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds } = req.body;
        const seminar = await activityService.registerSeminar(userId, {
            seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds
        });
        res.status(200).json({
            success: true,
            message: "Pengajuan seminar berhasil.",
            data: seminar
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get upcoming seminars (public list).
 */
export async function getUpcomingSeminars(req, res, next) {
    try {
        const data = await activityService.getUpcomingSeminars();
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Update seminar proposal.
 */
export async function updateSeminarProposal(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds } = req.body;
        const data = await activityService.updateSeminarProposal(id, userId, {
            seminarDate, startTime, endTime, roomId, linkMeeting, moderatorStudentId, memberInternshipIds
        });
        res.json({ success: true, message: "Jadwal seminar berhasil diperbarui.", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Approve a seminar request (lecturer).
 */
export async function approveSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const data = await activityService.approveSeminar(id, userId);
        res.json({ success: true, message: "Seminar berhasil disetujui.", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Reject a seminar request (lecturer).
 */
export async function rejectSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { notes } = req.body;
        const data = await activityService.rejectSeminar(id, userId, notes);
        res.json({ success: true, message: "Seminar berhasil ditolak.", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Bulk approve seminar requests (lecturer).
 */
export async function bulkApproveSeminars(req, res, next) {
    try {
        const userId = req.user.sub;
        const { ids } = req.body;
        const data = await activityService.bulkApproveSeminars(ids, userId);
        res.json({ success: true, message: `${ids.length} seminar berhasil disetujui.`, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Get seminar detail for student.
 */
export async function getSeminarDetail(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const data = await activityService.getSeminarDetail(id, userId);
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * Register student as audience for seminar.
 */
export async function registerSeminarAudience(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        await activityService.registerAsAudience(id, userId);
        res.json({ success: true, message: "Pendaftaran sebagai penonton berhasil." });
    } catch (error) {
        next(error);
    }
}

/**
 * Unregister student as audience for seminar.
 */
export async function unregisterSeminarAudience(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        await activityService.unregisterFromAudience(id, userId);
        res.json({ success: true, message: "Pendaftaran sebagai penonton berhasil dibatalkan." });
    } catch (error) {
        next(error);
    }
}

/**
 * Validate audience attendance (Lecturer).
 */
export async function validateSeminarAudience(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id, studentId } = req.params;
        await activityService.validateAudience(id, studentId, userId);
        res.json({ success: true, message: "Kehadiran penonton berhasil divalidasi." });
    } catch (error) {
        next(error);
    }
}

/**
 * Unvalidate audience attendance (Lecturer).
 */
export async function unvalidateSeminarAudience(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id, studentId } = req.params;
        await activityService.unvalidateAudience(id, studentId, userId);
        res.json({ success: true, message: "Validasi kehadiran penonton berhasil dibatalkan." });
    } catch (error) {
        next(error);
    }
}

/**
 * Bulk validate audience attendance (Lecturer).
 */
export async function bulkValidateSeminarAudience(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { studentIds } = req.body;
        await activityService.bulkValidateAudience(id, studentIds, userId);
        res.json({ success: true, message: `${studentIds.length} kehadiran penonton berhasil divalidasi.` });
    } catch (error) {
        next(error);
    }
}

/**
 * Update seminar notes (berita acara) - Lecturer.
 */
export async function updateSeminarNotes(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { notes } = req.body;
        const data = await activityService.updateSeminarNotes(id, notes, userId);
        res.json({ success: true, message: "Catatan seminar berhasil disimpan.", data });
    } catch (error) {
        next(error);
    }
}

/**
 * Complete a seminar - Lecturer.
 */
export async function completeSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const data = await activityService.completeSeminar(id, userId);
        res.json({ success: true, message: "Seminar telah diselesaikan dan dikunci.", data });
    } catch (error) {
        next(error);
    }
}
