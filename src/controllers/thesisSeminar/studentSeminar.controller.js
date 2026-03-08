import {
  getStudentSeminarOverview,
  getStudentAttendanceHistory,
  getSeminarAnnouncements,
  registerToSeminar,
  cancelSeminarRegistration,
  getStudentRevisions,
  createStudentRevisionItem,
  submitStudentRevisionAction,
  getStudentSeminarHistory,
  getStudentSeminarDetail,
  getStudentSeminarAssessment,
  saveStudentRevisionAction,
  submitStudentRevision,
  cancelStudentRevisionSubmission,
  deleteStudentRevision,
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

/**
 * GET /thesisSeminar/student/revisions
 * Get student's revision items for their current seminar
 */
export async function getStudentRevisionsCtrl(req, res, next) {
  try {
    const data = await getStudentRevisions(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesisSeminar/student/revisions
 * Create a new revision item
 */
export async function createStudentRevisionCtrl(req, res, next) {
  try {
    const data = await createStudentRevisionItem(req.user.sub, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /thesisSeminar/student/revisions/:revisionId/submit
 * Submit revision action for a revision item
 */
export async function submitRevisionActionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await submitStudentRevisionAction(req.user.sub, revisionId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/history
 * Get student's seminar history
 */
export async function getStudentSeminarHistoryCtrl(req, res, next) {
  try {
    const data = await getStudentSeminarHistory(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/seminars/:seminarId
 * Get student's specific seminar detail
 */
export async function getStudentSeminarDetailCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getStudentSeminarDetail(req.user.sub, seminarId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/seminars/:seminarId/assessment
 * Get student's assessment/rubric data (read-only)
 */
export async function getStudentSeminarAssessmentCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getStudentSeminarAssessment(req.user.sub, seminarId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /thesisSeminar/student/revisions/:revisionId/action
 * Save perbaikan text without submitting
 */
export async function saveRevisionActionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await saveStudentRevisionAction(req.user.sub, revisionId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesisSeminar/student/revisions/:revisionId/submit
 * Submit revision (set studentSubmittedAt)
 */
export async function submitRevisionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await submitStudentRevision(req.user.sub, revisionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesisSeminar/student/revisions/:revisionId/cancel-submit
 * Cancel revision submission (clear studentSubmittedAt)
 */
export async function cancelRevisionSubmitCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await cancelStudentRevisionSubmission(req.user.sub, revisionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /thesisSeminar/student/revisions/:revisionId
 * Delete revision before submission
 */
export async function deleteRevisionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await deleteStudentRevision(req.user.sub, revisionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
