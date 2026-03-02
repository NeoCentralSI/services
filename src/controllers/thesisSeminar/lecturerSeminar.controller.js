import {
  getAssignmentList,
  getEligibleExaminers,
  assignExaminers,
  getExaminerRequests,
  getSupervisedStudentSeminars,
  getLecturerSeminarDetail,
  respondToAssignment,
} from "../../services/thesisSeminar/lecturerSeminar.service.js";

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

/**
 * GET /thesisSeminar/lecturer/assignment
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
 * GET /thesisSeminar/lecturer/assignment/:seminarId/eligible-examiners
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
 * POST /thesisSeminar/lecturer/assignment/:seminarId
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
 * GET /thesisSeminar/lecturer/examiner-requests
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
 * GET /thesisSeminar/lecturer/supervised-students
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
 * GET /thesisSeminar/lecturer/seminars/:seminarId
 * Get seminar detail for lecturer
 */
export async function getSeminarDetail(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getLecturerSeminarDetail(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesisSeminar/lecturer/seminars/:examinerId/respond
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
