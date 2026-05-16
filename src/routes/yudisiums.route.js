import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadYudisiumDocFile, uploadCplRepairFiles } from "../middlewares/file.middleware.js";
import { populateProfile } from "../middlewares/yudisium.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import * as ctrl from "../controllers/yudisium.controller.js";

import {
  createYudisiumSchema,
  updateYudisiumSchema,
  submitStudentExitSurveySchema,
} from "../validators/yudisium.validator.js";

const router = express.Router();

// Role bundles
const ALL_ROLES = [ROLES.ADMIN, ROLES.MAHASISWA, ...LECTURER_ROLES];
const VIEWER_ROLES = [ROLES.ADMIN, ...LECTURER_ROLES];
const EVENT_MANAGER_ROLES = [
  ROLES.ADMIN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.KOORDINATOR_YUDISIUM,
];
const CPL_VALIDATOR_ROLES = [ROLES.ADMIN, ROLES.GKM];

router.use(authGuard);
router.use(populateProfile);

// ============================================================
// STUDENT ONLY: Self overview & submissions (/me/*)
// ============================================================
router.get("/me/overview", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentOverview);
router.get("/me/exit-survey", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentExitSurvey);
router.post(
  "/me/exit-survey",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(submitStudentExitSurveySchema),
  ctrl.submitStudentExitSurvey
);
router.get("/me/requirements", requireAnyRole([ROLES.MAHASISWA]), ctrl.getStudentRequirements);
router.post(
  "/me/requirements/upload",
  requireAnyRole([ROLES.MAHASISWA]),
  uploadYudisiumDocFile,
  ctrl.uploadStudentDocument
);

// ============================================================
// SHARED: Event list & detail
// ============================================================
router.get("/announcements", requireAnyRole(ALL_ROLES), ctrl.getAnnouncements);
router.get("/repository", requireAnyRole(ALL_ROLES), ctrl.getRepository);
router.get("/options/rooms", requireAnyRole(EVENT_MANAGER_ROLES), ctrl.getRoomOptions);
router.get("/", requireAnyRole(ALL_ROLES), ctrl.getEvents);
router.get("/:id", requireAnyRole(ALL_ROLES), ctrl.getEventById);

// ============================================================
// MANAGEMENT: Event create / update / delete
// ============================================================
router.post(
  "/",
  requireAnyRole(EVENT_MANAGER_ROLES),
  uploadYudisiumDocFile,
  validate(createYudisiumSchema),
  ctrl.createEvent
);
router.patch(
  "/:id",
  requireAnyRole(EVENT_MANAGER_ROLES),
  uploadYudisiumDocFile,
  validate(updateYudisiumSchema),
  ctrl.updateEvent
);
router.post("/:id/finalize-registration", requireAnyRole(EVENT_MANAGER_ROLES), ctrl.finalizeRegistration);
router.delete("/:id", requireAnyRole(EVENT_MANAGER_ROLES), ctrl.removeEvent);

// ============================================================
// PARTICIPANTS
// ============================================================
router.get("/:id/participants", requireAnyRole(VIEWER_ROLES), ctrl.getParticipants);
router.get(
  "/:id/participants/:participantId",
  requireAnyRole(VIEWER_ROLES),
  ctrl.getParticipantDetail
);
router.get(
  "/:id/participants/:participantId/requirements",
  requireAnyRole(VIEWER_ROLES),
  ctrl.getParticipantRequirements
);
router.post(
  "/:id/participants/:participantId/requirements/:requirementId/verify",
  requireAnyRole([ROLES.ADMIN]),
  ctrl.verifyParticipantDocument
);

// ============================================================
// CPL VALIDATION (GKM / Admin)
// ============================================================
router.get(
  "/:id/participants/:participantId/cpl-scores",
  requireAnyRole(VIEWER_ROLES),
  ctrl.getParticipantCplScores
);
router.post(
  "/:id/participants/:participantId/cpl/:cplId/validate",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  ctrl.validateParticipantCpl
);
router.post(
  "/:id/participants/:participantId/cpl/:cplId/repair",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  uploadCplRepairFiles,
  ctrl.saveCplRepairment
);

router.post(
  "/:id/finalize",
  requireAnyRole([ROLES.KOORDINATOR_YUDISIUM]),
  ctrl.finalizeParticipants
);

// ============================================================
// Export
// ============================================================
router.get("/:id/export-participants", requireAnyRole(VIEWER_ROLES), ctrl.exportParticipants);

export default router;
