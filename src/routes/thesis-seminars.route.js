import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";
import upload from "../middlewares/file.middleware.js";
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
  getSeminarResultDetailController,
  createSeminarResultController,
  updateSeminarResultController,
  deleteSeminarResultController,
  exportSeminarArchiveController,
  exportSeminarArchiveTemplateController,
  importSeminarArchiveController,
  getSeminarAudienceListController,
  getStudentOptionsForSeminarAudienceController,
  addSeminarAudienceController,
  removeSeminarAudienceController,
  importSeminarAudiencesController,
  exportSeminarAudiencesController,
  exportSeminarAudienceTemplateController,
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
import {
  scheduleSchema,
  createSeminarResultSchema,
  updateSeminarResultSchema,
  addSeminarAudienceSchema,
} from "../validators/thesis-seminar/admin.validator.js";
import {
  createRevisionSchema,
  submitRevisionActionSchema,
  saveRevisionActionSchema,
} from "../validators/thesis-seminar/student-seminar.validator.js";
import {
  assignExaminersSchema,
  respondAssignmentSchema,
  submitExaminerAssessmentSchema,
  finalizeSeminarSchema,
} from "../validators/thesis-seminar/lecturer-seminar.validator.js";

const router = express.Router();
console.log("✅ Thesis Seminar routes loaded");
const THESIS_SEMINAR_ACCESS_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];

router.get("/", authGuard, requireAnyRole(THESIS_SEMINAR_ACCESS_ROLES), getThesisSeminarsHome);

// Admin routes
// Thesis Seminar Archive
router.use("/archive", authGuard, requireAnyRole([ROLES.ADMIN]));
router.get("/archive/options/theses", getSeminarResultThesisOptionsController);
router.get("/archive/options/examiners", getSeminarResultLecturerOptionsController);
router.get("/archive/options/students", getSeminarResultStudentOptionsController);
router.get("/archive/template", exportSeminarArchiveTemplateController);
router.get("/archive/export", exportSeminarArchiveController);
router.post("/archive/import", upload.single("file"), importSeminarArchiveController);
router.get("/archive", getSeminarResultsController);
router.post("/archive", validate(createSeminarResultSchema), createSeminarResultController);
router.get("/archive/:id", getSeminarResultDetailController);
router.patch("/archive/:id", validate(updateSeminarResultSchema), updateSeminarResultController);
router.delete("/archive/:id", deleteSeminarResultController);
// Audience management
router.get("/archive/:seminarId/audiences", getSeminarAudienceListController);
router.get("/archive/:seminarId/audiences/options/students", getStudentOptionsForSeminarAudienceController);
router.get("/archive/:seminarId/audiences/template", exportSeminarAudienceTemplateController);
router.get("/archive/:seminarId/audiences/export", exportSeminarAudiencesController);
router.post("/archive/:seminarId/audiences", validate(addSeminarAudienceSchema), addSeminarAudienceController);
router.post("/archive/:seminarId/audiences/import", upload.single("file"), importSeminarAudiencesController);
router.delete("/archive/:seminarId/audiences/:studentId", removeSeminarAudienceController);

// Thesis Seminar Validation
router.use("/admin", authGuard, requireAnyRole([ROLES.ADMIN]));
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
router.put("/student/revisions/:revisionId/submit", validate(submitRevisionActionSchema), submitRevisionActionCtrl);
router.patch("/student/revisions/:revisionId/action", validate(saveRevisionActionSchema), saveRevisionActionCtrl);
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
router.post("/lecturer/seminars/:seminarId/assessment", validate(submitExaminerAssessmentSchema), submitExaminerAssessmentCtrl);
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
router.post("/lecturer/seminars/:examinerId/respond", validate(respondAssignmentSchema), respondExaminerAssignment);
router.get("/lecturer/assignment", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), listAssignmentSeminars);
router.get("/lecturer/assignment/:seminarId/eligible-examiners", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), listEligibleExaminers);
router.post("/lecturer/assignment/:seminarId", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), validate(assignExaminersSchema), assignSeminarExaminers);

export default router;
