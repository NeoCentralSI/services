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
    updateSeminarMinimumScore,
} from "../controllers/seminar-rubric.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCriteriaSchema,
    updateCriteriaSchema,
    createRubricSchema,
    updateRubricSchema,
    reorderCriteriaSchema,
    reorderRubricsSchema,
    updateMinimumScoreSchema,
} from "../validators/master-data/seminar-rubric.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import { logMasterDataChange } from "../middlewares/activity-log.middleware.js";
import { ENTITY_TYPES } from "../services/auditLog.service.js";

const router = express.Router();
// Activity log of the Seminar Hasil assessment master data.
const logChange = (options) => logMasterDataChange({ scope: "seminar", ...options });

// Middleware
router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

// Update minimum score
router.patch("/academic-years/:id/minimum-score", logChange({ entity: ENTITY_TYPES.ACADEMIC_YEAR, idParam: "id" }), validate(updateMinimumScoreSchema), updateSeminarMinimumScore);

// CPMK listing with rubrics
router.get("/cpmks", getCpmksWithRubrics);

// Criteria endpoints
router.post("/criteria", logChange({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA }), validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", logChange({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA, idParam: "criteriaId" }), validate(updateCriteriaSchema), updateCriteria);
router.delete("/criteria/:criteriaId", logChange({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA, idParam: "criteriaId" }), deleteCriteria);

// Rubric reordering
router.patch("/rubrics/reorder", validate(reorderRubricsSchema), reorderRubrics);

// CPMK Configuration cleanup
router.delete("/cpmk/:cpmkId", logChange({ entity: ENTITY_TYPES.CPMK, idParam: "cpmkId" }), removeCpmkConfig);

// Rubric Level endpoints
router.post("/criteria/:criteriaId/rubrics", logChange({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC }), validate(createRubricSchema), createRubric);
router.patch("/rubrics/:rubricId", logChange({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC, idParam: "rubricId" }), validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", logChange({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC, idParam: "rubricId" }), deleteRubric);

// Summary
router.get("/weight-summary", getWeightSummary);

export default router;
