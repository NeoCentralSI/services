import express from "express";
import {
    getCpmksWithRubrics,
    createCriteria,
    updateCriteria,
    deleteCriteria,
    removeCpmkConfig,
    createRubric,
    updateRubric,
    deleteRubric,
    getWeightSummary,
    reorderCriteria,
    reorderRubrics,
} from "../controllers/defence-rubric.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCriteriaSchema,
    updateCriteriaSchema,
    createRubricSchema,
    updateRubricSchema,
    reorderCriteriaSchema,
    reorderRubricsSchema,
} from "../validators/master-data/defence-rubric.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Middleware
router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

// CPMK listing with rubrics (per role)
router.get("/cpmks", getCpmksWithRubrics);

// Criteria endpoints
router.post("/criteria", validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", validate(updateCriteriaSchema), updateCriteria);
router.delete("/criteria/:criteriaId", deleteCriteria);

// Rubric reordering
router.patch("/rubrics/reorder", validate(reorderRubricsSchema), reorderRubrics);

// CPMK Configuration cleanup (per role)
router.delete("/cpmk/:cpmkId", removeCpmkConfig);

// Rubric Level endpoints
router.post("/criteria/:criteriaId/rubrics", validate(createRubricSchema), createRubric);
router.patch("/rubrics/:rubricId", validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", deleteRubric);

// Summary (per role)
router.get("/weight-summary", getWeightSummary);

export default router;
