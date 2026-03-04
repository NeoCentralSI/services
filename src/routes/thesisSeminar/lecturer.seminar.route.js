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
  submitExaminerAssessmentSchema,
  finalizeSeminarSchema,
} from "../../validators/lecturerSeminar.validator.js";
import {
  listAssignmentSeminars,
  listEligibleExaminers,
  assignSeminarExaminers,
  listExaminerRequests,
  listSupervisedStudentSeminars,
  getSeminarDetail,
  respondExaminerAssignment,
  getExaminerAssessment,
  submitExaminerAssessmentCtrl,
  getSupervisorFinalization,
  finalizeSeminarCtrl,
  getSeminarRevisionsCtrl,
  approveRevisionCtrl,
  unapproveRevisionCtrl,
  getSeminarAudiencesCtrl,
  approveAudienceCtrl,
  unapproveAudienceCtrl,
  toggleAudiencePresenceCtrl,
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

// GET /thesisSeminar/lecturer/seminars/:seminarId/assessment
router.get("/seminars/:seminarId/assessment", getExaminerAssessment);

// POST /thesisSeminar/lecturer/seminars/:seminarId/assessment
router.post(
  "/seminars/:seminarId/assessment",
  validate(submitExaminerAssessmentSchema),
  submitExaminerAssessmentCtrl
);

// GET /thesisSeminar/lecturer/seminars/:seminarId/finalization
router.get("/seminars/:seminarId/finalization", getSupervisorFinalization);

// POST /thesisSeminar/lecturer/seminars/:seminarId/finalize
router.post(
  "/seminars/:seminarId/finalize",
  validate(finalizeSeminarSchema),
  finalizeSeminarCtrl
);

// GET /thesisSeminar/lecturer/seminars/:seminarId/revisions
router.get("/seminars/:seminarId/revisions", getSeminarRevisionsCtrl);

// PUT /thesisSeminar/lecturer/seminars/:seminarId/revisions/:revisionId/approve
router.put("/seminars/:seminarId/revisions/:revisionId/approve", approveRevisionCtrl);

// PUT /thesisSeminar/lecturer/seminars/:seminarId/revisions/:revisionId/unapprove
router.put("/seminars/:seminarId/revisions/:revisionId/unapprove", unapproveRevisionCtrl);

// ============================================================
// LECTURER — Audience / Attendance Management
// ============================================================

// GET /thesisSeminar/lecturer/seminars/:seminarId/audiences
router.get("/seminars/:seminarId/audiences", getSeminarAudiencesCtrl);

// PUT /thesisSeminar/lecturer/seminars/:seminarId/audiences/:studentId/approve
router.put("/seminars/:seminarId/audiences/:studentId/approve", approveAudienceCtrl);

// PUT /thesisSeminar/lecturer/seminars/:seminarId/audiences/:studentId/unapprove
router.put("/seminars/:seminarId/audiences/:studentId/unapprove", unapproveAudienceCtrl);

// PUT /thesisSeminar/lecturer/seminars/:seminarId/audiences/:studentId/presence
router.put("/seminars/:seminarId/audiences/:studentId/presence", toggleAudiencePresenceCtrl);

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
