import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadSeminarDocFile } from "../middlewares/file.middleware.js";
import upload from "../middlewares/file.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import { populateProfile } from "../middlewares/thesis-seminar.middleware.js";
import * as ctrl from "../controllers/thesis-defence.controller.js";

import {
  scheduleSchema,
  createDefenceSchema,
  updateDefenceSchema,
  assignExaminersSchema,
  respondAssignmentSchema,
  submitAssessmentSchema,
  finalizeDefenceSchema,
  cancelDefenceSchema,
  createRevisionSchema,
  revisionActionSchema,
} from "../validators/thesis-defence.validator.js";

const router = express.Router();
const ALL_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];

router.get("/debug", (req, res) => res.json({ message: "Defence debug route ok (public)" }));

router.use(authGuard);
router.use(populateProfile);

// ============================================================
// ADMIN ONLY: Global Options, Templates, & Imports
// ============================================================
// Using a sub-router for options to ensure clean separation
const optionsRouter = express.Router();
optionsRouter.use(requireAnyRole([ROLES.ADMIN]));
optionsRouter.get("/theses", ctrl.getThesisOptions);
optionsRouter.get("/lecturers", ctrl.getLecturerOptions);
optionsRouter.get("/students", ctrl.getStudentOptions);
optionsRouter.get("/rooms", ctrl.getRoomOptions);

router.use("/options", optionsRouter);

// Archive exports & imports
router.get("/export", requireAnyRole([ROLES.ADMIN]), ctrl.exportArchive);
router.post("/import", requireAnyRole([ROLES.ADMIN]), upload.single("file"), ctrl.importArchive);

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
router.get("/:id/invitation-letter", requireAnyRole(ALL_ROLES), ctrl.downloadInvitationLetter);
router.get("/:id/assessment-result", requireAnyRole(ALL_ROLES), ctrl.downloadAssessmentResult);
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
  "/:id/documents/:documentTypeId/verify",
  requireAnyRole([ROLES.ADMIN]),
  ctrl.verifyDocument
);

// ============================================================
// ADMIN: Archive Management
// ============================================================
router.post("/", requireAnyRole([ROLES.ADMIN]), validate(createDefenceSchema), ctrl.createArchive);
router.patch("/:id", requireAnyRole([ROLES.ADMIN]), validate(updateDefenceSchema), ctrl.updateArchive);
router.delete("/:id", requireAnyRole([ROLES.ADMIN]), ctrl.deleteArchive);
router.post("/:id/cancel", requireAnyRole([ROLES.ADMIN]), validate(cancelDefenceSchema), ctrl.cancelDefence);
router.post("/:id/schedule/finalize", requireAnyRole([ROLES.ADMIN]), ctrl.finalizeSchedule);

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
router.get("/:id/assessment", requireAnyRole(ALL_ROLES), ctrl.getAssessment);
router.post(
  "/:id/assessment",
  requireAnyRole(LECTURER_ROLES),
  validate(submitAssessmentSchema),
  ctrl.submitAssessment
);
router.get("/:id/finalization", requireAnyRole(ALL_ROLES), ctrl.getFinalizationData);
router.post(
  "/:id/finalize",
  requireAnyRole(LECTURER_ROLES),
  validate(finalizeDefenceSchema),
  ctrl.finalizeDefence
);
router.post("/:id/revisions/finalize", requireAnyRole(LECTURER_ROLES), ctrl.finalizeRevisions);
router.post("/:id/revisions/unfinalize", requireAnyRole(LECTURER_ROLES), ctrl.unfinalizeRevisions);

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
