import {
  getAdminSeminarList,
  getAdminSeminarDetail,
  validateSeminarDocument,
  getSchedulingData,
  scheduleSeminar,
  getSeminarResults,
  getSeminarResultDetail,
  createSeminarResult,
  updateSeminarResult,
  deleteSeminarResult,
  getSeminarResultThesisOptions,
  getSeminarResultLecturerOptions,
  getSeminarResultStudentOptions,
  getSeminarResultAudienceLinks,
  assignSeminarResultAudiences,
  removeSeminarResultAudienceLink,
} from "../../services/thesis-seminar/admin.service.js";

/**
 * GET /thesis-seminar/admin
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
 * GET /thesis-seminar/admin/:seminarId
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
 * POST /thesis-seminar/admin/:seminarId/documents/:documentTypeId/validate
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
 * GET /thesis-seminar/admin/:seminarId/scheduling-data
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
 * POST /thesis-seminar/admin/:seminarId/schedule
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

export async function getSeminarResultThesisOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultThesisOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultLecturerOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultLecturerOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultStudentOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultStudentOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultsController(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || "";
    const result = await getSeminarResults({ page, pageSize, search });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function createSeminarResultController(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const userId = req.user?.sub || req.user?.id;
    const result = await createSeminarResult({
      ...body,
      assignedByUserId: userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateSeminarResultController(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.validated ?? req.body ?? {};
    const userId = req.user?.sub || req.user?.id;
    const result = await updateSeminarResult(id, {
      ...body,
      assignedByUserId: userId,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteSeminarResultController(req, res, next) {
  try {
    const { id } = req.params;
    await deleteSeminarResult(id);
    res.status(200).json({ success: true, message: "Data seminar hasil berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultDetailController(req, res, next) {
  try {
    const { id } = req.params;
    const data = await getSeminarResultDetail(id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultAudienceLinksController(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || "";
    const result = await getSeminarResultAudienceLinks({ page, pageSize, search });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function assignSeminarResultAudiencesController(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const result = await assignSeminarResultAudiences(body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function removeSeminarResultAudienceLinkController(req, res, next) {
  try {
    const { seminarId, studentId } = req.params;
    await removeSeminarResultAudienceLink({ seminarId, studentId });
    res.status(200).json({ success: true, message: "Relasi audience berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
