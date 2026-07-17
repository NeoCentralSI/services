import express from "express";
import {
    getCpmksWithRubrics,
    listAllMetopenCpmks,
    createMetopenCpmk,
    updateMetopenCpmk,
    deleteMetopenCpmk,
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
} from "../controllers/metopenAssessmentAdmin.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCriteriaSchema,
    updateCriteriaSchema,
    createRubricSchema,
    updateRubricSchema,
    reorderCriteriaSchema,
    reorderRubricsSchema,
    createMetopenCpmkSchema,
    updateMetopenCpmkSchema,
} from "../validators/metopenAssessmentAdmin.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

router.get("/cpmks", getCpmksWithRubrics);
router.get("/cpmks/all", listAllMetopenCpmks);
router.post("/cpmks", validate(createMetopenCpmkSchema), createMetopenCpmk);
router.patch("/cpmks/:cpmkId", validate(updateMetopenCpmkSchema), updateMetopenCpmk);
router.delete("/cpmks/:cpmkId", deleteMetopenCpmk);

router.post("/criteria", validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", validate(updateCriteriaSchema), updateCriteria);
router.delete("/criteria/:criteriaId", deleteCriteria);

router.patch("/rubrics/reorder", validate(reorderRubricsSchema), reorderRubrics);

/** Hapus kriteria+rubrik untuk role tertentu (bukan hapus master CPMK). */
router.delete("/cpmk/:cpmkId", removeCpmkConfig);

router.get("/criteria/:criteriaId/rubrics", listRubrics);
router.post("/criteria/:criteriaId/rubrics", validate(createRubricSchema), createRubric);

router.patch("/rubrics/:rubricId", validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", deleteRubric);

router.get("/weight-summary", getWeightSummary);

export default router;
