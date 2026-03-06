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
} from "../../validators/lecturerDefence.validator.js";
import {
  listAssignmentDefences,
  listEligibleExaminers,
  assignDefenceExaminers,
  listExaminerRequests,
  listSupervisedStudentDefences,
  getDefenceDetail,
  respondExaminerAssignment,
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
