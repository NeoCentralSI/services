import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { uploadSeminarDocFile } from "../../middlewares/file.middleware.js";
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
} from "../../controllers/thesisSeminar/studentSeminar.controller.js";
import {
  getDocumentTypes,
  getDocuments,
  uploadDocument,
  viewDocument,
} from "../../controllers/thesisSeminar/seminarDocument.controller.js";
import {
  createRevisionSchema,
  submitRevisionActionSchema,
  saveRevisionActionSchema,
} from "../../validators/studentSeminar.validator.js";

const router = express.Router();

// Only Mahasiswa can access
router.use(authGuard, requireAnyRole([ROLES.MAHASISWA]));

// GET /thesisSeminar/student/overview
router.get("/overview", getSeminarOverview);

// GET /thesisSeminar/student/attendance
router.get("/attendance", getAttendanceHistory);

// GET /thesisSeminar/student/announcements
router.get("/announcements", getSeminarAnnouncementsCtrl);

// POST /thesisSeminar/student/announcements/:seminarId/register
router.post("/announcements/:seminarId/register", registerToSeminarCtrl);

// DELETE /thesisSeminar/student/announcements/:seminarId/register
router.delete("/announcements/:seminarId/register", cancelSeminarRegistrationCtrl);

// --- Seminar Document routes ---
// GET /thesisSeminar/student/documents/types
router.get("/documents/types", getDocumentTypes);

// GET /thesisSeminar/student/documents
router.get("/documents", getDocuments);

// POST /thesisSeminar/student/documents/upload
router.post("/documents/upload", uploadSeminarDocFile, uploadDocument);

// GET /thesisSeminar/student/documents/:documentTypeId
router.get("/documents/:documentTypeId", viewDocument);

// --- Student Revision routes ---
// GET /thesisSeminar/student/revisions
router.get("/revisions", getStudentRevisionsCtrl);

// POST /thesisSeminar/student/revisions
router.post("/revisions", validate(createRevisionSchema), createStudentRevisionCtrl);

// PUT /thesisSeminar/student/revisions/:revisionId/submit (legacy - saves action + submits)
router.put("/revisions/:revisionId/submit", validate(submitRevisionActionSchema), submitRevisionActionCtrl);

// PATCH /thesisSeminar/student/revisions/:revisionId/action (save perbaikan text only)
router.patch("/revisions/:revisionId/action", validate(saveRevisionActionSchema), saveRevisionActionCtrl);

// POST /thesisSeminar/student/revisions/:revisionId/submit (submit revision - set studentSubmittedAt)
router.post("/revisions/:revisionId/submit", submitRevisionCtrl);

// POST /thesisSeminar/student/revisions/:revisionId/cancel-submit (cancel submission)
router.post("/revisions/:revisionId/cancel-submit", cancelRevisionSubmitCtrl);

// --- Student Seminar History ---
// GET /thesisSeminar/student/history
router.get("/history", getStudentSeminarHistoryCtrl);

// GET /thesisSeminar/student/seminars/:seminarId
router.get("/seminars/:seminarId", getStudentSeminarDetailCtrl);

// GET /thesisSeminar/student/seminars/:seminarId/assessment
router.get("/seminars/:seminarId/assessment", getStudentSeminarAssessmentCtrl);

export default router;
