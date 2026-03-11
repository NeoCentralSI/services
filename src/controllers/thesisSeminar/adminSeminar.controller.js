import {
  getAdminSeminarList,
  getAdminSeminarDetail,
  validateSeminarDocument,
  getSchedulingData,
  scheduleSeminar,
} from "../../services/thesisSeminar/adminSeminar.service.js";

/**
 * GET /thesisSeminar/admin
 * List all seminars for admin management
 */
export async function listSeminars(req, res, next) {
  try {
    const { search, status } = req.query;
    const data = await getAdminSeminarList({ search, status });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesisSeminar/admin/:seminarId
 * Get seminar detail for admin
 */
export async function getSeminarDetail(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getAdminSeminarDetail(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesisSeminar/admin/:seminarId/documents/:documentTypeId/validate
 * Validate (approve/decline) a seminar document
 */
export async function validateDocument(req, res, next) {
  try {
    const { seminarId, documentTypeId } = req.params;
    const { action, notes } = req.body;
    const userId = req.user.id;

    const data = await validateSeminarDocument(seminarId, documentTypeId, {
      action,
      notes,
      userId,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesisSeminar/admin/:seminarId/scheduling-data
 * Get lecturer availabilities and rooms for scheduling UI
 */
export async function getSchedulingDataController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getSchedulingData(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesisSeminar/admin/:seminarId/schedule
 * Set or update the seminar schedule
 */
export async function setSchedule(req, res, next) {
  try {
    const { seminarId } = req.params;
    const { roomId, date, startTime, endTime, isOnline, meetingLink } = req.validated;

    const data = await scheduleSeminar(seminarId, {
      roomId,
      date,
      startTime,
      endTime,
      isOnline,
      meetingLink,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
