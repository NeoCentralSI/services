import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";

// Controllers
import * as adminController from "../controllers/thesis-defence/admin.controller.js";
import * as lecturerController from "../controllers/thesis-defence/lecturer.controller.js";
import * as studentController from "../controllers/thesis-defence/student.controller.js";

// Validators
import { scheduleSchema } from "../validators/thesis-defence/admin-defence.validator.js";
import {
  assignExaminersSchema,
  respondAssignmentSchema,
  submitDefenceAssessmentSchema,
  finalizeDefenceSchema,
} from "../validators/thesis-defence/lecturer-defence.validator.js";
import {
  createDefenceRevisionSchema,
  submitDefenceRevisionActionSchema,
  saveDefenceRevisionActionSchema,
} from "../validators/thesis-defence/student-defence.validator.js";

const router = express.Router();

router.use(authGuard);

// ============================================================
// ADMIN ROUTES
// ============================================================
router.get("/admin", requireAnyRole([ROLES.ADMIN]), adminController.listDefences);
router.get("/admin/:defenceId", requireAnyRole([ROLES.ADMIN]), adminController.getDefenceDetail);
router.post(
  "/admin/:defenceId/documents/:documentTypeId/validate",
  requireAnyRole([ROLES.ADMIN]),
  adminController.validateDocument
);
router.get(
  "/admin/:defenceId/scheduling-data",
  requireAnyRole([ROLES.ADMIN]),
  adminController.getSchedulingDataController
);
router.post(
  "/admin/:defenceId/schedule",
  requireAnyRole([ROLES.ADMIN]),
  validate(scheduleSchema),
  adminController.setSchedule
);

// ============================================================
// LECTURER ROUTES
// ============================================================
// Note: Sub-prefix usage like router.use("/lecturer", ...) is tricky in a single file if we want /thesis-defences/lecturer/...
// But here the router is mounted at /thesis-defences, so router.get("/lecturer/...") will result in /thesis-defences/lecturer/...
// We use requireAnyRole for the whole group.

// Examiner Requests
router.get(
  "/lecturer/examiner-requests",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.listExaminerRequests
);

// Supervised Student Defences
router.get(
  "/lecturer/supervised-students",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.listSupervisedStudentDefences
);

// Defence Detail & Assessment
router.get(
  "/lecturer/defences/:defenceId",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.getDefenceDetail
);
router.get(
  "/lecturer/defences/:defenceId/assessment",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.getDefenceAssessment
);
router.post(
  "/lecturer/defences/:defenceId/assessment",
  requireAnyRole(LECTURER_ROLES),
  validate(submitDefenceAssessmentSchema),
  lecturerController.submitDefenceAssessmentCtrl
);

// Finalization
router.get(
  "/lecturer/defences/:defenceId/finalization",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.getDefenceFinalization
);
router.post(
  "/lecturer/defences/:defenceId/finalize",
  requireAnyRole(LECTURER_ROLES),
  validate(finalizeDefenceSchema),
  lecturerController.finalizeDefenceCtrl
);

// Revisions
router.get(
  "/lecturer/defences/:defenceId/revisions",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.getDefenceRevisionsCtrl
);
router.put(
  "/lecturer/defences/:defenceId/revisions/:revisionId/approve",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.approveDefenceRevisionCtrl
);
router.put(
  "/lecturer/defences/:defenceId/revisions/:revisionId/unapprove",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.unapproveDefenceRevisionCtrl
);
router.post(
  "/lecturer/defences/:defenceId/revisions/finalize",
  requireAnyRole(LECTURER_ROLES),
  lecturerController.finalizeDefenceRevisionsCtrl
);

// Respond to Assignment
router.post(
  "/lecturer/defences/:examinerId/respond",
  requireAnyRole(LECTURER_ROLES),
  validate(respondAssignmentSchema),
  lecturerController.respondExaminerAssignment
);

// Ketua Departemen — Examiner Assignment
router.get(
  "/lecturer/assignment",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  lecturerController.listAssignmentDefences
);
router.get(
  "/lecturer/assignment/:defenceId/eligible-examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  lecturerController.listEligibleExaminers
);
router.post(
  "/lecturer/assignment/:defenceId",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(assignExaminersSchema),
  lecturerController.assignDefenceExaminers
);

// ============================================================
// STUDENT ROUTES
// ============================================================
router.get(
  "/student/overview",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getDefenceOverviewCtrl
);
router.get(
  "/student/documents/types",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getDefenceDocumentTypesCtrl
);
router.get(
  "/student/documents",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getDefenceDocumentsCtrl
);
router.post(
  "/student/documents/upload",
  requireAnyRole([ROLES.MAHASISWA]),
  uploadSeminarDocFile,
  studentController.uploadDefenceDocumentCtrl
);

// Revisions
router.get(
  "/student/revisions",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getCurrentStudentDefenceRevisionCtrl
);
router.post(
  "/student/revisions",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(createDefenceRevisionSchema),
  studentController.createCurrentStudentDefenceRevisionCtrl
);
router.get(
  "/student/defences/:defenceId/revisions",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getStudentDefenceRevisionCtrl
);
router.post(
  "/student/defences/:defenceId/revisions",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(createDefenceRevisionSchema),
  studentController.createStudentDefenceRevisionCtrl
);
router.patch(
  "/student/revisions/:revisionId/action",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(saveDefenceRevisionActionSchema),
  studentController.saveStudentDefenceRevisionActionCtrl
);
router.post(
  "/student/revisions/:revisionId/submit",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(submitDefenceRevisionActionSchema),
  studentController.submitStudentDefenceRevisionActionCtrl
);
router.post(
  "/student/revisions/:revisionId/cancel-submit",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.cancelStudentDefenceRevisionActionCtrl
);
router.delete(
  "/student/revisions/:revisionId",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.deleteStudentDefenceRevisionCtrl
);

// History
router.get(
  "/student/history",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getStudentDefenceHistoryCtrl
);
router.get(
  "/student/defences/:defenceId",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getStudentDefenceDetailCtrl
);
router.get(
  "/student/defences/:defenceId/assessment",
  requireAnyRole([ROLES.MAHASISWA]),
  studentController.getStudentDefenceAssessmentCtrl
);

export default router;
