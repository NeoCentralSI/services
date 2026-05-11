import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadYudisiumDocFile } from "../middlewares/file.middleware.js";
import { ROLES } from "../constants/roles.js";
import { getYudisiumsHome } from "../controllers/yudisium/dispatcher.controller.js";
import {
  getAll as getYudisiumEvents,
  getById as getYudisiumEventById,
  create as createYudisiumEvent,
  update as updateYudisiumEvent,
  remove as removeYudisiumEvent,
} from "../controllers/yudisium/yudisium.controller.js";
import {
  getAll as getYudisiumRequirements,
  getById as getYudisiumRequirementById,
  create as createYudisiumRequirement,
  update as updateYudisiumRequirement,
  toggle,
  moveTop,
  moveBottom,
  remove as removeYudisiumRequirement,
} from "../controllers/yudisium/yudisium-requirement.controller.js";
import {
  getOverview,
  getExitSurvey,
  submitExitSurvey,
  getRequirements,
  uploadDocument,
} from "../controllers/yudisium/student-yudisium.controller.js";
import {
  getEvents as getAdminEvents,
  getParticipants as getAdminParticipants,
  getParticipantDetail as getAdminParticipantDetail,
  validateDocument as validateParticipantDocument,
} from "../controllers/yudisium/admin-yudisium.controller.js";
import {
  getCplScores,
  verifyCpl,
  createRecommendation,
  updateRecommendationStatus,
  generateDraft,
  uploadSk,
} from "../controllers/yudisium/lecturer-yudisium.controller.js";
import * as exitSurveyFormController from "../controllers/yudisium/exit-survey-form.controller.js";
import * as exitSurveyQuestionController from "../controllers/yudisium/exit-survey-question.controller.js";
import { createYudisiumSchema, updateYudisiumSchema } from "../validators/yudisium/yudisium.validator.js";
import {
  createYudisiumRequirementSchema,
  updateYudisiumRequirementSchema,
} from "../validators/yudisium/yudisium-requirement.validator.js";
import { submitStudentExitSurveySchema } from "../validators/student-exit-survey.validator.js";
import {
  createExitSurveyFormSchema,
  updateExitSurveyFormSchema,
} from "../validators/yudisium/exit-survey-form.validator.js";
import {
  createExitSurveyQuestionSchema,
  updateExitSurveyQuestionSchema,
} from "../validators/yudisium/exit-survey-question.validator.js";

const router = express.Router();

const ALL_LECTURER_ROLES = [
  ROLES.ADMIN,
  ROLES.PEMBIMBING_1,
  ROLES.PEMBIMBING_2,
  ROLES.PENGUJI,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.GKM,
  ROLES.KOORDINATOR_YUDISIUM,
  ROLES.GKM,
];
const CPL_VALIDATOR_ROLES = [ROLES.ADMIN, ROLES.GKM, ROLES.GKM];
const SK_MANAGER_ROLES = [
  ROLES.ADMIN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KOORDINATOR_YUDISIUM,
];

router.use(authGuard);
router.get("/", getYudisiumsHome);

// Yudisium event routes
router.get("/event", getYudisiumEvents);
router.get("/event/:id", getYudisiumEventById);
router.post(
  "/event",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
  validate(createYudisiumSchema),
  createYudisiumEvent
);
router.patch(
  "/event/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
  validate(updateYudisiumSchema),
  updateYudisiumEvent
);
router.delete(
  "/event/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
  removeYudisiumEvent
);

// Exit survey routes
router.get("/exit-survey", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]), exitSurveyFormController.getAll);
router.post(
  "/exit-survey",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(createExitSurveyFormSchema),
  exitSurveyFormController.create
);
router.post(
  "/exit-survey/:id/duplicate",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyFormController.duplicate
);
router.patch(
  "/exit-survey/:id/toggle",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyFormController.toggle
);
router.get(
  "/exit-survey/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyFormController.getById
);
router.patch(
  "/exit-survey/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(updateExitSurveyFormSchema),
  exitSurveyFormController.update
);
router.delete(
  "/exit-survey/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyFormController.remove
);
router.get(
  "/exit-survey/:formId/questions",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyQuestionController.getByFormId
);
router.post(
  "/exit-survey/:formId/questions",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(createExitSurveyQuestionSchema),
  exitSurveyQuestionController.create
);
router.get(
  "/exit-survey/:formId/questions/:questionId",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyQuestionController.getById
);
router.patch(
  "/exit-survey/:formId/questions/:questionId",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(updateExitSurveyQuestionSchema),
  exitSurveyQuestionController.update
);
router.delete(
  "/exit-survey/:formId/questions/:questionId",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  exitSurveyQuestionController.remove
);

// Yudisium requirement routes
router.get(
  "/yudisium-requirements",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  getYudisiumRequirements
);
router.get(
  "/yudisium-requirements/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  getYudisiumRequirementById
);
router.post(
  "/yudisium-requirements",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(createYudisiumRequirementSchema),
  createYudisiumRequirement
);
router.patch(
  "/yudisium-requirements/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  validate(updateYudisiumRequirementSchema),
  updateYudisiumRequirement
);
router.patch(
  "/yudisium-requirements/:id/toggle",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  toggle
);
router.patch(
  "/yudisium-requirements/:id/move-top",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  moveTop
);
router.patch(
  "/yudisium-requirements/:id/move-bottom",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  moveBottom
);
router.delete(
  "/yudisium-requirements/:id",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]),
  removeYudisiumRequirement
);

// Student routes
router.get("/student/overview", requireAnyRole([ROLES.MAHASISWA]), getOverview);
router.get("/student/exit-survey", requireAnyRole([ROLES.MAHASISWA]), getExitSurvey);
router.post(
  "/student/exit-survey/submit",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(submitStudentExitSurveySchema),
  submitExitSurvey
);
router.get("/student/requirements", requireAnyRole([ROLES.MAHASISWA]), getRequirements);
router.post(
  "/student/requirements/upload",
  requireAnyRole([ROLES.MAHASISWA]),
  uploadYudisiumDocFile,
  uploadDocument
);

// Admin routes
router.get("/admin/events", requireAnyRole([ROLES.ADMIN]), getAdminEvents);
router.get("/admin/:yudisiumId/participants", requireAnyRole([ROLES.ADMIN]), getAdminParticipants);
router.get(
  "/admin/participants/:participantId",
  requireAnyRole([ROLES.ADMIN]),
  getAdminParticipantDetail
);
router.post(
  "/admin/participants/:participantId/requirements/:requirementId/validate",
  requireAnyRole([ROLES.ADMIN]),
  validateParticipantDocument
);

// Lecturer routes
router.get("/lecturer/events", requireAnyRole(ALL_LECTURER_ROLES), getAdminEvents);
router.get(
  "/lecturer/:yudisiumId/participants",
  requireAnyRole(ALL_LECTURER_ROLES),
  getAdminParticipants
);
router.get(
  "/lecturer/participants/:participantId",
  requireAnyRole(ALL_LECTURER_ROLES),
  getAdminParticipantDetail
);
router.get(
  "/lecturer/participants/:participantId/cpl-scores",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  getCplScores
);
router.post(
  "/lecturer/participants/:participantId/cpl/:cplId/verify",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  verifyCpl
);
router.post(
  "/lecturer/participants/:participantId/cpl-recommendation",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  createRecommendation
);
router.patch(
  "/lecturer/cpl-recommendation/:recommendationId/status",
  requireAnyRole(CPL_VALIDATOR_ROLES),
  updateRecommendationStatus
);
router.get("/lecturer/:yudisiumId/draft-sk", requireAnyRole(SK_MANAGER_ROLES), generateDraft);
router.post(
  "/lecturer/:yudisiumId/upload-sk",
  requireAnyRole(SK_MANAGER_ROLES),
  uploadYudisiumDocFile,
  uploadSk
);

export default router;
