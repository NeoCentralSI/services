import express from "express";
import {
  authGuard,
  requireAnyRole,
} from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";
import {
  assignExaminersSchema,
  respondAssignmentSchema,
  submitDefenceAssessmentSchema,
  finalizeDefenceSchema,
} from "../../validators/lecturerDefence.validator.js";
import {
  listAssignmentDefences,
  listEligibleExaminers,
  assignDefenceExaminers,
  listExaminerRequests,
  listSupervisedStudentDefences,
  getDefenceDetail,
  respondExaminerAssignment,
  getDefenceAssessment,
  submitDefenceAssessmentCtrl,
  getDefenceFinalization,
  finalizeDefenceCtrl,
  getDefenceRevisionsCtrl,
  approveDefenceRevisionCtrl,
  unapproveDefenceRevisionCtrl,
  finalizeDefenceRevisionsCtrl,
} from "../../controllers/thesisDefence/lecturerDefence.controller.js";

const router = express.Router();

// All routes require authentication and lecturer role
router.use(authGuard, requireAnyRole(LECTURER_ROLES));

// ============================================================
// LECTURER — Examiner Requests
// ============================================================

// GET /thesisDefence/lecturer/examiner-requests
router.get("/examiner-requests", listExaminerRequests);

// ============================================================
// LECTURER — Supervised Student Defences
// ============================================================

// GET /thesisDefence/lecturer/supervised-students
router.get("/supervised-students", listSupervisedStudentDefences);

// ============================================================
// LECTURER — Defence Detail & Response
// ============================================================

// GET /thesisDefence/lecturer/defences/:defenceId
router.get("/defences/:defenceId", getDefenceDetail);

// GET /thesisDefence/lecturer/defences/:defenceId/assessment
router.get("/defences/:defenceId/assessment", getDefenceAssessment);

// POST /thesisDefence/lecturer/defences/:defenceId/assessment
router.post(
  "/defences/:defenceId/assessment",
  validate(submitDefenceAssessmentSchema),
  submitDefenceAssessmentCtrl
);

// GET /thesisDefence/lecturer/defences/:defenceId/finalization
router.get("/defences/:defenceId/finalization", getDefenceFinalization);

// POST /thesisDefence/lecturer/defences/:defenceId/finalize
router.post(
  "/defences/:defenceId/finalize",
  validate(finalizeDefenceSchema),
  finalizeDefenceCtrl
);

// GET /thesisDefence/lecturer/defences/:defenceId/revisions
router.get("/defences/:defenceId/revisions", getDefenceRevisionsCtrl);

// PUT /thesisDefence/lecturer/defences/:defenceId/revisions/:revisionId/approve
router.put(
  "/defences/:defenceId/revisions/:revisionId/approve",
  approveDefenceRevisionCtrl
);

// PUT /thesisDefence/lecturer/defences/:defenceId/revisions/:revisionId/unapprove
router.put(
  "/defences/:defenceId/revisions/:revisionId/unapprove",
  unapproveDefenceRevisionCtrl
);

// POST /thesisDefence/lecturer/defences/:defenceId/revisions/finalize
router.post(
  "/defences/:defenceId/revisions/finalize",
  finalizeDefenceRevisionsCtrl
);

// POST /thesisDefence/lecturer/defences/:examinerId/respond
router.post(
  "/defences/:examinerId/respond",
  validate(respondAssignmentSchema),
  respondExaminerAssignment
);

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

// GET /thesisDefence/lecturer/assignment
router.get(
  "/assignment",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  listAssignmentDefences
);

// GET /thesisDefence/lecturer/assignment/:defenceId/eligible-examiners
router.get(
  "/assignment/:defenceId/eligible-examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  listEligibleExaminers
);

// POST /thesisDefence/lecturer/assignment/:defenceId
router.post(
  "/assignment/:defenceId",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(assignExaminersSchema),
  assignDefenceExaminers
);

export default router;
