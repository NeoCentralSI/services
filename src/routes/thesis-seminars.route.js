import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";
import upload from "../middlewares/file.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import * as ctrl from "../controllers/thesis-seminar.controller.js";

// Import validators
import {
  scheduleSchema,
  createSeminarSchema,
  updateSeminarSchema,
  addAudienceSchema,
  createRevisionSchema,
  revisionActionSchema,
  assignExaminersSchema,
  respondAssignmentSchema,
  submitAssessmentSchema,
  finalizeSeminarSchema,
} from "../validators/thesis-seminar.validator.js";

const router = express.Router();
const ALL_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];

router.use(authGuard);
router.use(requireAnyRole(ALL_ROLES));

// ============================================================
// GLOBAL OPTIONS & TEMPLATES
// ============================================================
router.get("/options/theses", ctrl.getThesisOptions);
router.get("/options/lecturers", ctrl.getLecturerOptions);
router.get("/options/students", ctrl.getStudentOptions);
router.get("/options/rooms", ctrl.getRoomOptions);
router.get("/template", ctrl.getArchiveTemplate);
router.get("/export", ctrl.exportArchive);
router.post("/import", upload.single("file"), ctrl.importArchive);

// ============================================================
// USER SPECIFIC (Self)
// ============================================================
router.get("/me/overview", ctrl.getStudentOverview);
router.get("/me/attendance", ctrl.getAttendanceHistory);
router.get("/me/history", ctrl.getStudentHistory);
router.get("/announcements", ctrl.getAnnouncements);

// ============================================================
// DOCUMENTS (Global Types)
// ============================================================
router.get("/documents/types", ctrl.getDocumentTypes);

// ============================================================
// SEMINAR CORE
// ============================================================
router.get("/", ctrl.getSeminars);
router.post("/", validate(createSeminarSchema), ctrl.createArchive);

router.get("/:id", ctrl.getSeminarDetail);
router.patch("/:id", validate(updateSeminarSchema), ctrl.updateArchive);
router.delete("/:id", ctrl.deleteArchive);

// ============================================================
// SCHEDULING
// ============================================================
router.get("/:id/scheduling-data", ctrl.getSchedulingData);
router.post("/:id/schedule", validate(scheduleSchema), ctrl.setSchedule);

// ============================================================
// DOCUMENTS (Per Seminar)
// ============================================================
router.get("/:id/documents", ctrl.getDocuments);
router.post("/:id/documents", uploadSeminarDocFile, ctrl.uploadDocument);
router.get("/:id/documents/:documentTypeId", ctrl.viewDocument);
router.post("/:id/documents/:documentTypeId/validate", ctrl.validateDocument);

// ============================================================
// EXAMINERS & ASSIGNMENT
// ============================================================
router.get("/:id/eligible-examiners", ctrl.getEligibleExaminers);
router.post("/:id/examiners", validate(assignExaminersSchema), ctrl.assignExaminers);
router.post("/:id/examiners/:examinerId/respond", validate(respondAssignmentSchema), ctrl.respondAssignment);

// ============================================================
// ASSESSMENT & FINALIZATION
// ============================================================
router.get("/:id/assessment", ctrl.getAssessment);
router.post("/:id/assessment", validate(submitAssessmentSchema), ctrl.submitAssessment);

router.get("/:id/finalization", ctrl.getFinalizationData);
router.post("/:id/finalize", validate(finalizeSeminarSchema), ctrl.finalizeSeminar);

// ============================================================
// REVISIONS
// ============================================================
router.get("/:id/revisions", ctrl.getRevisions);
router.post("/:id/revisions", validate(createRevisionSchema), (req, res, next) => {
  // Map body.seminarId to req.params.id for consistency if needed, or just let service handle it.
  // We'll keep ID in params to match RESTful standard.
  ctrl.createRevision(req, res, next);
});
router.patch("/:id/revisions/:revisionId", validate(revisionActionSchema), ctrl.updateRevision);
router.delete("/:id/revisions/:revisionId", ctrl.deleteRevision);
router.post("/:id/revisions/finalize", ctrl.finalizeRevisions);

// ============================================================
// AUDIENCES
// ============================================================
router.get("/:id/audiences", ctrl.getAudiences);
router.get("/:id/audiences/options/students", ctrl.getStudentOptionsForAudience);
router.get("/:id/audiences/template", ctrl.getAudienceTemplate);
router.get("/:id/audiences/export", ctrl.exportAudiences);
router.post("/:id/audiences/import", upload.single("file"), ctrl.importAudiences);
router.post("/:id/audiences", validate(addAudienceSchema), ctrl.addAudience);
router.delete("/:id/audiences/:studentId", ctrl.removeAudience);
router.patch("/:id/audiences/:studentId", ctrl.updateAudience);

export default router;
