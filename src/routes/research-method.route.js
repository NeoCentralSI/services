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

export default router;
