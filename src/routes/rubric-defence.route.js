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
} from "../controllers/rubricDefence.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCriteriaSchema,
    updateCriteriaSchema,
    createRubricSchema,
    updateRubricSchema,
    toggleCriteriaSchema,
    reorderCriteriaSchema,
    reorderRubricsSchema,
} from "../validators/rubricDefence.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

// ── CPMK listing with rubrics (per role) ─────
router.get("/cpmks", getCpmksWithRubrics);

// ── Criteria endpoints ───────────────────────
router.post("/criteria", validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", validate(updateCriteriaSchema), updateCriteria);
router.patch("/criteria/:criteriaId/toggle", validate(toggleCriteriaSchema), toggleCriteriaActive);
router.delete("/criteria/:criteriaId", deleteCriteria);

// ── Reorder rubrics ──────────────────────────
router.patch("/rubrics/reorder", validate(reorderRubricsSchema), reorderRubrics);

// ── Remove defence config for CPMK (per role) ─
router.delete("/cpmk/:cpmkId", removeCpmkConfig);

// ── Rubric create under criteria ─────────────
router.post("/criteria/:criteriaId/rubrics", validate(createRubricSchema), createRubric);

// ── Rubric item endpoints ────────────────────
router.patch("/rubrics/:rubricId", validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", deleteRubric);

// ── Weight summary (per role) ────────────────
router.get("/weight-summary", getWeightSummary);

export default router;
