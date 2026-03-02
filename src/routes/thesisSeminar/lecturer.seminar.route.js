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
} from "../../validators/lecturerSeminar.validator.js";
import {
  listAssignmentSeminars,
  listEligibleExaminers,
  assignSeminarExaminers,
  listExaminerRequests,
  listSupervisedStudentSeminars,
  getSeminarDetail,
  respondExaminerAssignment,
} from "../../controllers/thesisSeminar/lecturerSeminar.controller.js";

const router = express.Router();

// All routes require authentication and lecturer role
router.use(authGuard, requireAnyRole(LECTURER_ROLES));

// ============================================================
// LECTURER — Examiner Requests (Permintaan Menguji)
// ============================================================

// GET /thesisSeminar/lecturer/examiner-requests
router.get("/examiner-requests", listExaminerRequests);

// ============================================================
// LECTURER — Supervised Student Seminars (Mahasiswa Bimbingan)
// ============================================================

// GET /thesisSeminar/lecturer/supervised-students
router.get("/supervised-students", listSupervisedStudentSeminars);

// ============================================================
// LECTURER — Seminar Detail & Response
// ============================================================

// GET /thesisSeminar/lecturer/seminars/:seminarId
router.get("/seminars/:seminarId", getSeminarDetail);

// POST /thesisSeminar/lecturer/seminars/:examinerId/respond
router.post(
  "/seminars/:examinerId/respond",
  validate(respondAssignmentSchema),
  respondExaminerAssignment
);

// ============================================================
// KETUA DEPARTEMEN — Examiner Assignment
// ============================================================

// GET /thesisSeminar/lecturer/assignment
router.get(
  "/assignment",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  listAssignmentSeminars
);

// GET /thesisSeminar/lecturer/assignment/:seminarId/eligible-examiners
router.get(
  "/assignment/:seminarId/eligible-examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  listEligibleExaminers
);

// POST /thesisSeminar/lecturer/assignment/:seminarId
router.post(
  "/assignment/:seminarId",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(assignExaminersSchema),
  assignSeminarExaminers
);

export default router;
