import express from "express";
import {
  listCpmks,
  createCpmk,
  updateCpmk,
  deleteCpmk,
  getConfiguredCpmks,
  createCriteria,
  updateCriteria,
  deleteCriteria,
  removeCpmkConfig,
  listRubrics,
  createRubric,
  updateRubric,
  deleteRubric,
  getWeightSummary,
  reorderCriteria,
  reorderRubrics,
} from "../controllers/researchMethodAssessmentAdmin.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
  createCpmkSchema,
  updateCpmkSchema,
  createCriteriaSchema,
  updateCriteriaSchema,
  createRubricSchema,
  updateRubricSchema,
  reorderCriteriaSchema,
  reorderRubricsSchema,
} from "../validators/researchMethodAssessmentAdmin.validator.js";
import {
  authGuard,
  requireAnyRole,
} from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import * as milestoneTemplates from "../controllers/research-method-milestone-template.controller.js";
import {
  createMilestoneTemplateSchema,
  reorderMilestoneTemplatesSchema,
  updateMilestoneTemplateSchema,
} from "../validators/research-method-milestone-template.validator.js";

const router = express.Router();
const MANAGER_ROLES = [
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KOORDINATOR_METOPEN,
];

router.use(authGuard);
router.use(requireAnyRole(MANAGER_ROLES));

router.get("/cpmks", listCpmks);
router.post("/cpmks", validate(createCpmkSchema), createCpmk);
router.patch("/cpmks/:cpmkId", validate(updateCpmkSchema), updateCpmk);
router.delete("/cpmks/:cpmkId", deleteCpmk);

router.get("/assessment-configuration", getConfiguredCpmks);
router.post("/criteria", validate(createCriteriaSchema), createCriteria);
router.patch(
  "/criteria/reorder",
  validate(reorderCriteriaSchema),
  reorderCriteria,
);
router.patch(
  "/criteria/:criteriaId",
  validate(updateCriteriaSchema),
  updateCriteria,
);
router.delete("/criteria/:criteriaId", deleteCriteria);
router.delete("/cpmks/:cpmkId/configuration", removeCpmkConfig);

router.get("/criteria/:criteriaId/rubrics", listRubrics);
router.post(
  "/criteria/:criteriaId/rubrics",
  validate(createRubricSchema),
  createRubric,
);
router.patch(
  "/rubrics/reorder",
  validate(reorderRubricsSchema),
  reorderRubrics,
);
router.patch(
  "/rubrics/:rubricId",
  validate(updateRubricSchema),
  updateRubric,
);
router.delete("/rubrics/:rubricId", deleteRubric);

router.get("/weight-summary", getWeightSummary);

// General proposal milestone templates (K18): Sekdep manages, the coordinator reads.
const SEKDEP_ONLY = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]);
router.get("/milestone-templates", milestoneTemplates.listTemplates);
router.post("/milestone-templates", SEKDEP_ONLY, validate(createMilestoneTemplateSchema), milestoneTemplates.createTemplate);
router.patch("/milestone-templates/reorder", SEKDEP_ONLY, validate(reorderMilestoneTemplatesSchema), milestoneTemplates.reorderTemplates);
router.patch("/milestone-templates/:id", SEKDEP_ONLY, validate(updateMilestoneTemplateSchema), milestoneTemplates.updateTemplate);
router.delete("/milestone-templates/:id", SEKDEP_ONLY, milestoneTemplates.deleteTemplate);

export default router;
