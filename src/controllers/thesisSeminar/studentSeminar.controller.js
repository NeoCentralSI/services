import {
  getStudentSeminarOverview,
  getStudentAttendanceHistory,
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
