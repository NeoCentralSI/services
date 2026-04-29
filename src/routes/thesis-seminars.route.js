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

import { populateProfile } from "../middlewares/thesis-seminar.middleware.js";

router.use(authGuard);
router.use(populateProfile);

// ============================================================
// ADMIN ONLY: Global Options, Templates, & Imports
// ============================================================
router.use("/options", requireAnyRole([ROLES.ADMIN]));
router.get("/options/theses", ctrl.getThesisOptions);
router.get("/options/lecturers", ctrl.getLecturerOptions);
router.get("/options/students", ctrl.getStudentOptions);
router.get("/options/rooms", ctrl.getRoomOptions);

router.get("/template", requireAnyRole([ROLES.ADMIN]), ctrl.getArchiveTemplate); // TODO: Handle Template Download in Frontend
router.get("/export", requireAnyRole([ROLES.ADMIN]), ctrl.exportArchive);
router.post("/import", requireAnyRole([ROLES.ADMIN]), upload.single("file"), ctrl.importArchive);

// ============================================================
// STUDENT ONLY: Self Overview & Submissions
// ============================================================
router.get("/me/overview", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentOverview);
router.get("/me/attendance", requireAnyRole([ROLES.MAHASISWA]), ctrl.getAttendanceHistory);
router.get("/me/history", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentHistory);
router.get("/announcements", requireAnyRole([ROLES.MAHASISWA]), ctrl.getAnnouncements);
router.get("/documents/types", requireAnyRole([ROLES.MAHASISWA]), ctrl.getDocumentTypes);

// ============================================================
// SHARED: General Seminar Access
// ============================================================
router.get("/", requireAnyRole(ALL_ROLES), ctrl.getSeminars);
router.get("/:id", requireAnyRole(ALL_ROLES), ctrl.getSeminarDetail);
router.get("/:id/invitation", requireAnyRole(ALL_ROLES), ctrl.downloadInvitationLetter);
router.get("/:id/documents", requireAnyRole(ALL_ROLES), ctrl.getDocuments);
router.get("/:id/documents/:documentTypeId", requireAnyRole(ALL_ROLES), ctrl.viewDocument);

// ============================================================
// ADMIN: Management & Scheduling
// ============================================================
router.post("/", requireAnyRole([ROLES.ADMIN]), validate(createSeminarSchema), ctrl.createArchive);
router.patch("/:id", requireAnyRole([ROLES.ADMIN]), validate(updateSeminarSchema), ctrl.updateArchive);
router.delete("/:id", requireAnyRole([ROLES.ADMIN]), ctrl.deleteArchive);
router.get("/:id/scheduling-data", requireAnyRole([ROLES.ADMIN]), ctrl.getSchedulingData);
router.post("/:id/schedule", requireAnyRole([ROLES.ADMIN]), validate(scheduleSchema), ctrl.setSchedule);
router.post("/:id/schedule/finalize", requireAnyRole([ROLES.ADMIN]), ctrl.finalizeSchedule);
router.post("/:id/documents/:documentTypeId/validate", requireAnyRole([ROLES.ADMIN]), ctrl.validateDocument);

// ============================================================
// STUDENT ACTIONS
// ============================================================
router.post("/:id/documents", requireAnyRole([ROLES.MAHASISWA]), uploadSeminarDocFile, ctrl.uploadDocument);
router.post("/:id/revisions", requireAnyRole([ROLES.MAHASISWA]), validate(createRevisionSchema), ctrl.createRevision);
router.patch("/:id/revisions/:revisionId", requireAnyRole([ROLES.MAHASISWA]), validate(revisionActionSchema), ctrl.updateRevision);
router.delete("/:id/revisions/:revisionId", requireAnyRole([ROLES.MAHASISWA]), ctrl.deleteRevision);

// ============================================================
// LECTURER (EXAMINER/SUPERVISOR) ACTIONS
// ============================================================
router.post("/:id/examiners/:examinerId/respond", requireAnyRole(LECTURER_ROLES), validate(respondAssignmentSchema), ctrl.respondAssignment);
router.get("/:id/assessment", requireAnyRole(ALL_ROLES), ctrl.getAssessment);
router.post("/:id/assessment", requireAnyRole(LECTURER_ROLES), validate(submitAssessmentSchema), ctrl.submitAssessment);
router.get("/:id/finalization", requireAnyRole(ALL_ROLES), ctrl.getFinalizationData);
router.post("/:id/finalize", requireAnyRole(LECTURER_ROLES), validate(finalizeSeminarSchema), ctrl.finalizeSeminar);
router.post("/:id/revisions/finalize", requireAnyRole(LECTURER_ROLES), ctrl.finalizeRevisions);
router.get("/:id/revisions", requireAnyRole([ROLES.MAHASISWA, ...LECTURER_ROLES]), ctrl.getRevisions);

// ============================================================
// KETUA DEPARTEMEN ONLY
// ============================================================
router.get("/:id/eligible-examiners", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), ctrl.getEligibleExaminers);
router.post("/:id/examiners", requireAnyRole([ROLES.KETUA_DEPARTEMEN]), validate(assignExaminersSchema), ctrl.assignExaminers);

// ============================================================
// AUDIENCES
// ============================================================
router.get("/:id/audiences", requireAnyRole(ALL_ROLES), ctrl.getAudiences);
router.get("/:id/audiences/options/students", requireAnyRole([ROLES.ADMIN]), ctrl.getStudentOptionsForAudience);
router.get("/:id/audiences/template", requireAnyRole([ROLES.ADMIN]), ctrl.getAudienceTemplate); // TODO: Handle Template Download in Frontend
router.get("/:id/audiences/export", requireAnyRole([ROLES.ADMIN]), ctrl.exportAudiences);
router.post("/:id/audiences/import", requireAnyRole([ROLES.ADMIN]), upload.single("file"), ctrl.importAudiences);
router.post("/:id/audiences", requireAnyRole([ROLES.MAHASISWA, ROLES.ADMIN]), validate(addAudienceSchema), ctrl.addAudience); // TODO: Decide whether Student (Audience) should use it's own route to register as an audience or just use this same endpoint.
router.delete("/:id/audiences/:studentId", requireAnyRole([ROLES.ADMIN]), ctrl.removeAudience);
router.post("/:id/audience-register", requireAnyRole([ROLES.MAHASISWA]), ctrl.registerAudience);
router.delete("/:id/audience-register", requireAnyRole([ROLES.MAHASISWA]), ctrl.unregisterAudience);
router.patch("/:id/audiences/:studentId", requireAnyRole(LECTURER_ROLES), ctrl.updateAudience); // This is for approving?

export default router;
