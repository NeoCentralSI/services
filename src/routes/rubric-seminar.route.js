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
    toggleCriteriaActive,
    reorderCriteria,
    reorderRubrics,
} from "../controllers/rubricSeminar.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCriteriaSchema,
    updateCriteriaSchema,
    createRubricSchema,
    updateRubricSchema,
    toggleCriteriaSchema,
    reorderCriteriaSchema,
    reorderRubricsSchema,
} from "../validators/rubricSeminar.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

// ── CPMK listing with rubrics ────────────────
router.get("/cpmks", getCpmksWithRubrics);

// ── Criteria endpoints ───────────────────────
router.post("/criteria", validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", validate(updateCriteriaSchema), updateCriteria);
router.patch("/criteria/:criteriaId/toggle", validate(toggleCriteriaSchema), toggleCriteriaActive);
router.delete("/criteria/:criteriaId", deleteCriteria);

// ── Reorder rubrics ──────────────────────────
router.patch("/rubrics/reorder", validate(reorderRubricsSchema), reorderRubrics);

// ── Remove seminar config for CPMK ───────────
router.delete("/cpmk/:cpmkId", removeCpmkConfig);

// ── Rubric create under criteria ─────────────
router.post("/criteria/:criteriaId/rubrics", validate(createRubricSchema), createRubric);

// ── Rubric item endpoints ────────────────────
router.patch("/rubrics/:rubricId", validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", deleteRubric);

// ── Weight summary ───────────────────────────
router.get("/weight-summary", getWeightSummary);

export default router;
