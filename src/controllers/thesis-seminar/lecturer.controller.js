import {
  getAssignmentList,
  getEligibleExaminers,
  assignExaminers,
  getExaminerRequests,
  getSupervisedStudentSeminars,
  getLecturerSeminarDetail,
  respondToAssignment,
  getExaminerAssessmentForm,
  submitExaminerAssessment,
  getSupervisorFinalizationData,
  finalizeSeminarBySupervisor,
  getSupervisorRevisionBoard,
  approveRevisionBySupervisor,
  unapproveRevisionBySupervisor,
  finalizeSeminarRevisionsBySupervisor,
  getSeminarAudienceList,
  approveAudienceBySupervisor,
  unapproveAudienceBySupervisor,
  toggleAudiencePresenceBySupervisor,
} from "../../services/thesis-seminar/lecturer.service.js";

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

/**
 * GET /thesis-seminar/lecturer/assignment
 * List seminars needing examiner assignment
 */
export async function listAssignmentSeminars(req, res, next) {
  try {
    const { search } = req.query;
    const data = await getAssignmentList({ search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/lecturer/assignment/:seminarId/eligible-examiners
 * Get list of eligible lecturers for examiner assignment
 */
export async function listEligibleExaminers(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getEligibleExaminers(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/lecturer/assignment/:seminarId
 * Assign examiners to a seminar
 */
export async function assignSeminarExaminers(req, res, next) {
  try {
    const { seminarId } = req.params;
    const { examinerIds } = req.body;
    const userId = req.user.sub;

    const data = await assignExaminers(seminarId, examinerIds, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// LECTURER — Examiner Requests (Permintaan Menguji)
// ============================================================

/**
 * GET /thesis-seminar/lecturer/examiner-requests
 * List seminars where this lecturer has been assigned as examiner
 */
export async function listExaminerRequests(req, res, next) {
  try {
    const userId = req.user.sub;
    const { search } = req.query;
    const data = await getExaminerRequests(userId, { search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// LECTURER — Supervised Student Seminars (Mahasiswa Bimbingan)
// ============================================================

/**
 * GET /thesis-seminar/lecturer/supervised-students
 * List seminars of students this lecturer supervises
 */
export async function listSupervisedStudentSeminars(req, res, next) {
  try {
    const userId = req.user.sub;
    const { search } = req.query;
    const data = await getSupervisedStudentSeminars(userId, { search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/lecturer/seminars/:seminarId
 * Get seminar detail for lecturer
 */
export async function getSeminarDetail(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await getLecturerSeminarDetail(seminarId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/lecturer/seminars/:seminarId/assessment
 * Get examiner assessment form payload for ongoing seminar
 */
export async function getExaminerAssessment(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await getExaminerAssessmentForm(seminarId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/lecturer/seminars/:seminarId/assessment
 * Submit examiner assessment
 */
export async function submitExaminerAssessmentCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await submitExaminerAssessment(seminarId, userId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/lecturer/seminars/:seminarId/finalization
 * Get supervisor finalization dashboard payload
 */
export async function getSupervisorFinalization(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await getSupervisorFinalizationData(seminarId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/lecturer/seminars/:seminarId/finalize
 * Finalize seminar result by supervisor
 */
export async function finalizeSeminarCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await finalizeSeminarBySupervisor(seminarId, userId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/lecturer/seminars/:seminarId/revisions
 * Get revision board payload for supervisor
 */
export async function getSeminarRevisionsCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await getSupervisorRevisionBoard(seminarId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/lecturer/seminars/:examinerId/respond
 * Examiner responds to assignment (available / unavailable)
 */
export async function respondExaminerAssignment(req, res, next) {
  try {
    const { examinerId } = req.params;
    const userId = req.user.sub;
    const { status } = req.body;

    const data = await respondToAssignment(examinerId, userId, status);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /thesis-seminar/lecturer/seminars/:seminarId/revisions/:revisionId/approve
 * Supervisor approves a revision item
 */
export async function approveRevisionCtrl(req, res, next) {
  try {
    const { seminarId, revisionId } = req.params;
    const userId = req.user.sub;
    const data = await approveRevisionBySupervisor(seminarId, revisionId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /thesis-seminar/lecturer/seminars/:seminarId/revisions/:revisionId/unapprove
 * Supervisor unapproves a revision item
 */
export async function unapproveRevisionCtrl(req, res, next) {
  try {
    const { seminarId, revisionId } = req.params;
    const userId = req.user.sub;
    const data = await unapproveRevisionBySupervisor(seminarId, revisionId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/lecturer/seminars/:seminarId/revisions/finalize
 * Supervisor finalizes all student revisions for this seminar
 */
export async function finalizeSeminarRevisionsCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const userId = req.user.sub;
    const data = await finalizeSeminarRevisionsBySupervisor(seminarId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// Audience / Attendance
// ============================================================

/**
 * GET /thesis-seminar/lecturer/seminars/:seminarId/audiences
 * Get audience list for a seminar
 */
export async function getSeminarAudiencesCtrl(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getSeminarAudienceList(seminarId, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /thesis-seminar/lecturer/seminars/:seminarId/audiences/:studentId/approve
 * Supervisor approves an audience registration
 */
export async function approveAudienceCtrl(req, res, next) {
  try {
    const { seminarId, studentId } = req.params;
    const data = await approveAudienceBySupervisor(seminarId, studentId, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /thesis-seminar/lecturer/seminars/:seminarId/audiences/:studentId/unapprove
 * Supervisor cancels audience approval.
 */
export async function unapproveAudienceCtrl(req, res, next) {
  try {
    const { seminarId, studentId } = req.params;
    const data = await unapproveAudienceBySupervisor(seminarId, studentId, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /thesis-seminar/lecturer/seminars/:seminarId/audiences/:studentId/presence
 * Supervisor toggles audience presence
 */
export async function toggleAudiencePresenceCtrl(req, res, next) {
  try {
    const { seminarId, studentId } = req.params;
    const { isPresent } = req.body;
    const data = await toggleAudiencePresenceBySupervisor(seminarId, studentId, req.user.sub, isPresent);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
