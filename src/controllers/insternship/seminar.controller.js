


// Legacy imports mapping to avoid breaking controller logic during refactor
import * as activityService from "../../services/insternship/seminar.service.js";


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
 * Register student for internship seminar with schedule.
 */
export async function registerSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const {
            seminarDate,
            startTime,
            seminarTimeStart,
            endTime,
            seminarTimeEnd,
            roomId,
            room,
            linkMeeting,
            moderatorStudentId,
            memberInternshipIds
        } = req.body;
        const seminar = await activityService.registerSeminar(userId, {
            seminarDate,
            startTime: startTime || seminarTimeStart,
            endTime: endTime || seminarTimeEnd,
            roomId,
            room,
            linkMeeting,
            moderatorStudentId,
            memberInternshipIds
        });
        res.status(201).json({
            success: true,
            message: "Pengajuan seminar berhasil.",
            data: seminar
        });
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
        const {
            seminarDate,
            startTime,
            seminarTimeStart,
            endTime,
            seminarTimeEnd,
            roomId,
            room,
            linkMeeting,
            moderatorStudentId,
            memberInternshipIds
        } = req.body;
        const data = await activityService.updateSeminarProposal(id, userId, {
            seminarDate,
            startTime: startTime || seminarTimeStart,
            endTime: endTime || seminarTimeEnd,
            roomId,
            room,
            linkMeeting,
            moderatorStudentId,
            memberInternshipIds
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

/**
 * Fail a seminar - Lecturer.
 */
export async function failSeminar(req, res, next) {
    try {
        const userId = req.user.sub;
        const { id } = req.params;
        const { notes } = req.body;
        const data = await activityService.failSeminar(id, userId, notes);
        res.json({ success: true, message: "Seminar telah dinyatakan gagal.", data });
    } catch (error) {
        next(error);
    }
}

