import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { populateProfile } from "../middlewares/yudisium.middleware.js";
import { ROLES } from "../constants/roles.js";
import * as ctrl from "../controllers/yudisium.controller.js";

import {
  createExitSurveyFormSchema,
  updateExitSurveyFormSchema,
  createExitSurveyQuestionSchema,
  updateExitSurveyQuestionSchema,
} from "../validators/yudisium.validator.js";

const router = express.Router();

const EXIT_SURVEY_MANAGER_ROLES = [
  ROLES.ADMIN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KETUA_DEPARTEMEN,
];

router.use(authGuard);
router.use(populateProfile);
router.use(requireAnyRole(EXIT_SURVEY_MANAGER_ROLES));

// ============================================================
// FORMS
// ============================================================
router.get("/", ctrl.getAllExitSurveyForms);
router.post("/", validate(createExitSurveyFormSchema), ctrl.createExitSurveyForm);
router.get("/:id", ctrl.getExitSurveyFormById);
router.patch("/:id", validate(updateExitSurveyFormSchema), ctrl.updateExitSurveyForm);
router.delete("/:id", ctrl.removeExitSurveyForm);
router.post("/:id/duplicate", ctrl.duplicateExitSurveyForm);
router.patch("/:id/toggle", ctrl.toggleExitSurveyForm);

// ============================================================
// SESSIONS (nested under form)
// ============================================================
router.post("/:formId/sessions", ctrl.createExitSurveySession);
router.patch("/:formId/sessions/:sessionId", ctrl.updateExitSurveySession);
router.delete("/:formId/sessions/:sessionId", ctrl.removeExitSurveySession);

// ============================================================
// QUESTIONS (nested under form)
// ============================================================
router.get("/:formId/questions", ctrl.getQuestionsByForm);
router.post(
  "/:formId/questions",
  validate(createExitSurveyQuestionSchema),
  ctrl.createQuestion
);
router.get("/:formId/questions/:questionId", ctrl.getQuestionById);
router.patch(
  "/:formId/questions/:questionId",
  validate(updateExitSurveyQuestionSchema),
  ctrl.updateQuestion
);
router.delete("/:formId/questions/:questionId", ctrl.removeQuestion);

export default router;
