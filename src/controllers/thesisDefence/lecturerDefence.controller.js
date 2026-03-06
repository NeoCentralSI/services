import {
  getAssignmentList,
  getEligibleExaminers,
  assignExaminers,
  getExaminerRequests,
  getSupervisedStudentDefences,
  getLecturerDefenceDetail,
  respondToAssignment,
} from "../../services/thesisDefence/lecturerDefence.service.js";

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

export async function listAssignmentDefences(req, res, next) {
  try {
    const { search } = req.query;
    const data = await getAssignmentList({ search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listEligibleExaminers(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getEligibleExaminers(defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function assignDefenceExaminers(req, res, next) {
  try {
    const { defenceId } = req.params;
    const { examinerIds } = req.body;
    const userId = req.user.sub;
    const data = await assignExaminers(defenceId, examinerIds, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// LECTURER — Examiner Requests
// ============================================================

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
// LECTURER — Supervised Student Defences
// ============================================================

export async function listSupervisedStudentDefences(req, res, next) {
  try {
    const userId = req.user.sub;
    const { search } = req.query;
    const data = await getSupervisedStudentDefences(userId, { search });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// LECTURER — Defence Detail
// ============================================================

export async function getDefenceDetail(req, res, next) {
  try {
    const { defenceId } = req.params;
    const userId = req.user.sub;
    const data = await getLecturerDefenceDetail(defenceId, userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ============================================================
// LECTURER — Respond to Examiner Assignment
// ============================================================

export async function respondExaminerAssignment(req, res, next) {
  try {
    const { examinerId } = req.params;
    const userId = req.user.sub;
    const data = await respondToAssignment(examinerId, userId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
