import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import { getThesisSeminarsHome } from "../controllers/thesis-seminar/dispatcher.controller.js";
import {
  listSeminars,
  getSeminarDetail,
  validateDocument,
  getSchedulingDataController,
  setSchedule,
  getSeminarResultThesisOptionsController,
  getSeminarResultLecturerOptionsController,
  getSeminarResultStudentOptionsController,
  getSeminarResultsController,
  getSeminarResultAudienceLinksController,
  assignSeminarResultAudiencesController,
  removeSeminarResultAudienceLinkController,
  getSeminarResultDetailController,
  createSeminarResultController,
  updateSeminarResultController,
  deleteSeminarResultController,
} from "../controllers/thesis-seminar/admin.controller.js";
import {
  getSeminarOverview,
  getAttendanceHistory,
  getSeminarAnnouncementsCtrl,
  registerToSeminarCtrl,
  cancelSeminarRegistrationCtrl,
  getStudentRevisionsCtrl,
  createStudentRevisionCtrl,
  submitRevisionActionCtrl,
  getStudentSeminarHistoryCtrl,
  getStudentSeminarDetailCtrl,
  getStudentSeminarAssessmentCtrl,
  saveRevisionActionCtrl,
  submitRevisionCtrl,
  cancelRevisionSubmitCtrl,
  deleteRevisionCtrl,
} from "../controllers/thesis-seminar/student.controller.js";
import {
  getDocumentTypes,
  getDocuments,
  uploadDocument,
  viewDocument,
} from "../controllers/thesis-seminar/document.controller.js";
import {
  listAssignmentSeminars,
  listEligibleExaminers,
  assignSeminarExaminers,
  listExaminerRequests,
  listSupervisedStudentSeminars,
  getSeminarDetail as getLecturerSeminarDetail,
  respondExaminerAssignment,
  getExaminerAssessment,
  submitExaminerAssessmentCtrl,
  getSupervisorFinalization,
  finalizeSeminarCtrl,
  getSeminarRevisionsCtrl,
  approveRevisionCtrl,
  unapproveRevisionCtrl,
  finalizeSeminarRevisionsCtrl,
  getSeminarAudiencesCtrl,
  approveAudienceCtrl,
  unapproveAudienceCtrl,
  toggleAudiencePresenceCtrl,
} from "../controllers/thesis-seminar/lecturer.controller.js";
import { scheduleSchema } from "../validators/admin-seminar.validator.js";
import {
  createSeminarResultSchema,
  updateSeminarResultSchema,
  assignSeminarAudienceSchema,
} from "../validators/seminar-result-master.validator.js";
import {
  createRevisionSchema,
  submitRevisionActionSchema,
  saveRevisionActionSchema,
} from "../validators/student-seminar.validator.js";
import {
  assignExaminersSchema,
  respondAssignmentSchema,
  submitExaminerAssessmentSchema,
  finalizeSeminarSchema,
} from "../validators/lecturer-seminar.validator.js";

const router = express.Router();
const THESIS_SEMINAR_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];

router.get("/", authGuard, requireAnyRole(THESIS_SEMINAR_ACCESS_ROLES), getThesisSeminarsHome);

// Admin routes
router.use("/admin", authGuard, requireAnyRole([ROLES.ADMIN]));
router.get("/admin/seminar-results/options/theses", getSeminarResultThesisOptionsController);
router.get("/admin/seminar-results/options/lecturers", getSeminarResultLecturerOptionsController);
router.get("/admin/seminar-results/options/students", getSeminarResultStudentOptionsController);
router.get("/admin/seminar-results/audiences", getSeminarResultAudienceLinksController);
router.post(
  "/admin/seminar-results/audiences/assign",
  validate(assignSeminarAudienceSchema),
  assignSeminarResultAudiencesController
);
router.delete(
  "/admin/seminar-results/audiences/:seminarId/:studentId",
  removeSeminarResultAudienceLinkController
);
router.get("/admin/seminar-results", getSeminarResultsController);
router.get("/admin/seminar-results/:id", getSeminarResultDetailController);
router.post("/admin/seminar-results", validate(createSeminarResultSchema), createSeminarResultController);
router.patch("/admin/seminar-results/:id", validate(updateSeminarResultSchema), updateSeminarResultController);
router.delete("/admin/seminar-results/:id", deleteSeminarResultController);
router.get("/admin", listSeminars);
router.get("/admin/:seminarId", getSeminarDetail);
router.post("/admin/:seminarId/documents/:documentTypeId/validate", validateDocument);
router.get("/admin/:seminarId/scheduling-data", getSchedulingDataController);
router.post("/admin/:seminarId/schedule", validate(scheduleSchema), setSchedule);

// Student routes
router.use("/student", authGuard, requireAnyRole([ROLES.MAHASISWA]));
router.get("/student/overview", getSeminarOverview);
router.get("/student/attendance", getAttendanceHistory);
router.get("/student/announcements", getSeminarAnnouncementsCtrl);
router.post("/student/announcements/:seminarId/register", registerToSeminarCtrl);
router.delete("/student/announcements/:seminarId/register", cancelSeminarRegistrationCtrl);
router.get("/student/documents/types", getDocumentTypes);
router.get("/student/documents", getDocuments);
router.post("/student/documents/upload", uploadSeminarDocFile, uploadDocument);
router.get("/student/documents/:documentTypeId", viewDocument);
router.get("/student/revisions", getStudentRevisionsCtrl);
router.post("/student/revisions", validate(createRevisionSchema), createStudentRevisionCtrl);
router.put(
  "/student/revisions/:revisionId/submit",
  validate(submitRevisionActionSchema),
  submitRevisionActionCtrl
);
router.patch(
  "/student/revisions/:revisionId/action",
  validate(saveRevisionActionSchema),
  saveRevisionActionCtrl
);
router.post("/student/revisions/:revisionId/submit", submitRevisionCtrl);
router.post("/student/revisions/:revisionId/cancel-submit", cancelRevisionSubmitCtrl);
router.delete("/student/revisions/:revisionId", deleteRevisionCtrl);
router.get("/student/history", getStudentSeminarHistoryCtrl);
router.get("/student/seminars/:seminarId", getStudentSeminarDetailCtrl);
router.get("/student/seminars/:seminarId/assessment", getStudentSeminarAssessmentCtrl);

// Lecturer routes
router.use("/lecturer", authGuard, requireAnyRole(LECTURER_ROLES));
router.get("/lecturer/examiner-requests", listExaminerRequests);
router.get("/lecturer/supervised-students", listSupervisedStudentSeminars);
router.get("/lecturer/seminars/:seminarId", getLecturerSeminarDetail);
router.get("/lecturer/seminars/:seminarId/assessment", getExaminerAssessment);
router.post(
  "/lecturer/seminars/:seminarId/assessment",
  validate(submitExaminerAssessmentSchema),
  submitExaminerAssessmentCtrl
);
router.get("/lecturer/seminars/:seminarId/finalization", getSupervisorFinalization);
router.post("/lecturer/seminars/:seminarId/finalize", validate(finalizeSeminarSchema), finalizeSeminarCtrl);
router.get("/lecturer/seminars/:seminarId/revisions", getSeminarRevisionsCtrl);
router.put("/lecturer/seminars/:seminarId/revisions/:revisionId/approve", approveRevisionCtrl);
router.put("/lecturer/seminars/:seminarId/revisions/:revisionId/unapprove", unapproveRevisionCtrl);
router.post("/lecturer/seminars/:seminarId/revisions/finalize", finalizeSeminarRevisionsCtrl);
router.get("/lecturer/seminars/:seminarId/audiences", getSeminarAudiencesCtrl);
router.put("/lecturer/seminars/:seminarId/audiences/:studentId/approve", approveAudienceCtrl);
router.put("/lecturer/seminars/:seminarId/audiences/:studentId/unapprove", unapproveAudienceCtrl);
router.put("/lecturer/seminars/:seminarId/audiences/:studentId/presence", toggleAudiencePresenceCtrl);
router.post(
  "/lecturer/seminars/:examinerId/respond",
  validate(respondAssignmentSchema),
  respondExaminerAssignment
);
router.get("/lecturer/assignment", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), listAssignmentSeminars);
router.get(
  "/lecturer/assignment/:seminarId/eligible-examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  listEligibleExaminers
);
router.post(
  "/lecturer/assignment/:seminarId",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(assignExaminersSchema),
  assignSeminarExaminers
);

export default router;
