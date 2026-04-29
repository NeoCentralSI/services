import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import { populateProfile } from "../middlewares/thesis-seminar.middleware.js";
import * as ctrl from "../controllers/thesis-defence.controller.js";

import {
  scheduleSchema,
  assignExaminersSchema,
  respondAssignmentSchema,
  submitAssessmentSchema,
  finalizeDefenceSchema,
  createRevisionSchema,
  revisionActionSchema,
} from "../validators/thesis-defence.validator.js";

const router = express.Router();
const ALL_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];

router.use(authGuard);
router.use(populateProfile);

// ============================================================
// STUDENT ONLY: Self overview, history, document types
// ============================================================
router.get("/me/overview", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentOverview);
router.get("/me/history", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentHistory);
router.get("/documents/types", requireAnyRole([ROLES.MAHASISWA]), ctrl.getDocumentTypes);

// ============================================================
// SHARED: list & detail
// ============================================================
router.get("/", requireAnyRole(ALL_ROLES), ctrl.getDefences);
router.get("/:id", requireAnyRole(ALL_ROLES), ctrl.getDefenceDetail);
router.get("/:id/documents", requireAnyRole(ALL_ROLES), ctrl.getDocuments);
router.get("/:id/documents/:documentTypeId", requireAnyRole(ALL_ROLES), ctrl.viewDocument);

// ============================================================
// ADMIN: Scheduling & document validation
// ============================================================
router.get("/:id/scheduling-data", requireAnyRole([ROLES.ADMIN]), ctrl.getSchedulingData);
router.post(
  "/:id/schedule",
  requireAnyRole([ROLES.ADMIN]),
  validate(scheduleSchema),
  ctrl.setSchedule
);
router.post(
  "/:id/documents/:documentTypeId/validate",
  requireAnyRole([ROLES.ADMIN]),
  ctrl.validateDocument
);

// ============================================================
// STUDENT: Document upload & revisions
// ============================================================
router.post(
  "/:id/documents",
  requireAnyRole([ROLES.MAHASISWA]),
  uploadSeminarDocFile,
  ctrl.uploadDocument
);
router.post(
  "/:id/revisions",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(createRevisionSchema),
  ctrl.createRevision
);
router.delete(
  "/:id/revisions/:revisionId",
  requireAnyRole([ROLES.MAHASISWA]),
  ctrl.deleteRevision
);

// ============================================================
// SHARED (STUDENT + LECTURER): revision multi-action + listing
// ============================================================
router.get(
  "/:id/revisions",
  requireAnyRole([ROLES.MAHASISWA, ...LECTURER_ROLES]),
  ctrl.getRevisions
);
router.patch(
  "/:id/revisions/:revisionId",
  requireAnyRole([ROLES.MAHASISWA, ...LECTURER_ROLES]),
  validate(revisionActionSchema),
  ctrl.updateRevision
);

// ============================================================
// LECTURER (Examiner / Supervisor): respond, assess, finalize
// ============================================================
router.post(
  "/:id/examiners/:examinerId/respond",
  requireAnyRole(LECTURER_ROLES),
  validate(respondAssignmentSchema),
  ctrl.respondAssignment
);
router.get("/:id/assessment", requireAnyRole(LECTURER_ROLES), ctrl.getAssessment);
router.post(
  "/:id/assessment",
  requireAnyRole(LECTURER_ROLES),
  validate(submitAssessmentSchema),
  ctrl.submitAssessment
);
router.get("/:id/finalization", requireAnyRole(LECTURER_ROLES), ctrl.getFinalizationData);
router.post(
  "/:id/finalize",
  requireAnyRole(LECTURER_ROLES),
  validate(finalizeDefenceSchema),
  ctrl.finalizeDefence
);
router.post("/:id/revisions/finalize", requireAnyRole(LECTURER_ROLES), ctrl.finalizeRevisions);

// ============================================================
// KETUA DEPARTEMEN: examiner assignment
// ============================================================
router.get(
  "/:id/eligible-examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  ctrl.getEligibleExaminers
);
router.post(
  "/:id/examiners",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(assignExaminersSchema),
  ctrl.assignExaminers
);

// ============================================================
// STUDENT: assessment view (final transcript)
// ============================================================
router.get(
  "/:id/assessment-view",
  requireAnyRole([ROLES.MAHASISWA]),
  ctrl.getStudentAssessmentView
);

export default router;
