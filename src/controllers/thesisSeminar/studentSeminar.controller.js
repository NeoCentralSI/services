import {
  getStudentSeminarOverview,
  getStudentAttendanceHistory,
  getSeminarAnnouncements,
  registerToSeminar,
  cancelSeminarRegistration,
} from "../../services/thesisSeminar/studentSeminar.service.js";

/**
 * GET /thesisSeminar/student/overview
 * Get seminar checklist, status, and document info
 */
export async function getSeminarOverview(req, res, next) {
  try {
    const data = await getStudentSeminarOverview(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/attendance
 * Get seminar attendance history
 */
export async function getAttendanceHistory(req, res, next) {
  try {
    const data = await getStudentAttendanceHistory(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/announcements
 * Get all upcoming and past seminar announcements
 */
export async function getSeminarAnnouncementsCtrl(req, res, next) {
  try {
    const data = await getSeminarAnnouncements(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesisSeminar/student/announcements/:seminarId/register
 * Register the current student as audience
 */
export async function registerToSeminarCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await registerToSeminar(req.user.sub, seminarId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /thesisSeminar/student/announcements/:seminarId/register
 * Cancel the current student's audience registration
 */
export async function cancelSeminarRegistrationCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await cancelSeminarRegistration(req.user.sub, seminarId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
