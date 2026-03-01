import express from "express";
import * as formController from "../controllers/exitSurveyForm.controller.js";
import * as questionController from "../controllers/exitSurveyQuestion.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
  createExitSurveyFormSchema,
  updateExitSurveyFormSchema,
} from "../validators/exitSurveyForm.validator.js";
import {
  createExitSurveyQuestionSchema,
  updateExitSurveyQuestionSchema,
} from "../validators/exitSurveyQuestion.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

// Form list & create
router.get("/", formController.getAll);
router.post("/", validate(createExitSurveyFormSchema), formController.create);

// Form by id: duplicate, toggle, questions sub-resource, then get/update/delete form
router.post("/:id/duplicate", formController.duplicate);
router.patch("/:id/toggle", formController.toggle);
router.get("/:id", formController.getById);
router.patch("/:id", validate(updateExitSurveyFormSchema), formController.update);
router.delete("/:id", formController.remove);

// Questions under a form (param formId)
router.get("/:formId/questions", questionController.getByFormId);
router.post(
  "/:formId/questions",
  validate(createExitSurveyQuestionSchema),
  questionController.create
);
router.get("/:formId/questions/:questionId", questionController.getById);
router.patch(
  "/:formId/questions/:questionId",
  validate(updateExitSurveyQuestionSchema),
  questionController.update
);
router.delete("/:formId/questions/:questionId", questionController.remove);

export default router;
