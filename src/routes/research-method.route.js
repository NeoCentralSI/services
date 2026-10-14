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
import { loadUserRoles } from "../middlewares/rbac.middleware.js";
import { uploadAttendanceFiles } from "../middlewares/file.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import { MAX_ATTENDANCE_FILES } from "../constants/research-method.js";
import * as milestoneTemplates from "../controllers/research-method-milestone-template.controller.js";
import * as controller from "../controllers/research-method.controller.js";
import {
  createMilestoneTemplateSchema,
  reorderMilestoneTemplatesSchema,
  updateMilestoneTemplateSchema,
} from "../validators/research-method-milestone-template.validator.js";
import { minimumScoreSchema, submitScoreSchema } from "../validators/research-method.validator.js";

/**
 * /research-method: master data (CPMK, criteria, rubrics, proposal milestone templates),
 * Presensi, Penilaian Proposal, kelulusan, ekspor and Monitoring Kelas (Paket P).
 */
const router = express.Router();

const MANAGE = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_METODE_PENELITIAN]);
const SEKDEP_ONLY = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]);
const COORDINATOR = requireAnyRole([ROLES.KOORDINATOR_METODE_PENELITIAN]);
const READERS = requireAnyRole([ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);
const SUPERVISOR = requireAnyRole(SUPERVISOR_ROLES);
const FORM_READERS = requireAnyRole([...SUPERVISOR_ROLES, ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);
const PROMOTERS = requireAnyRole([ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);

/** Multer errors (too many files, wrong type) become a 400 with a readable message. */
const attendanceFiles = (req, res, next) =>
  uploadAttendanceFiles(req, res, (error) => {
    if (!error) return next();
    const err = new Error(
      error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT"
        ? `Maksimal ${MAX_ATTENDANCE_FILES} berkas kelas per unggahan.`
        : /Excel/.test(error.message ?? "") ? "Berkas presensi harus berupa .xlsx atau .xls." : error.message,
    );
    err.statusCode = 400;
    next(err);
  });

router.use(authGuard);

// Master data (Sekdep and the coordinator, as before)
router.get("/cpmks", MANAGE, listCpmks);
router.post("/cpmks", MANAGE, validate(createCpmkSchema), createCpmk);
router.patch("/cpmks/:cpmkId", MANAGE, validate(updateCpmkSchema), updateCpmk);
router.delete("/cpmks/:cpmkId", MANAGE, deleteCpmk);

router.get("/assessment-configuration", MANAGE, getConfiguredCpmks);
router.post("/criteria", MANAGE, validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", MANAGE, validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", MANAGE, validate(updateCriteriaSchema), updateCriteria);
router.delete("/criteria/:criteriaId", MANAGE, deleteCriteria);
router.delete("/cpmks/:cpmkId/configuration", MANAGE, removeCpmkConfig);

router.get("/criteria/:criteriaId/rubrics", MANAGE, listRubrics);
router.post("/criteria/:criteriaId/rubrics", MANAGE, validate(createRubricSchema), createRubric);
router.patch("/rubrics/reorder", MANAGE, validate(reorderRubricsSchema), reorderRubrics);
router.patch("/rubrics/:rubricId", MANAGE, validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", MANAGE, deleteRubric);

router.get("/weight-summary", MANAGE, getWeightSummary);
// Minimum passing score of a period (10.2), next to the seminar and defence minimums
router.patch("/academic-years/:id/minimum-score", SEKDEP_ONLY, validate(minimumScoreSchema), controller.setMinimumScore);

// General proposal milestone templates (K18): Sekdep manages, the coordinator reads.
router.get("/milestone-templates", MANAGE, milestoneTemplates.listTemplates);
router.post("/milestone-templates", SEKDEP_ONLY, validate(createMilestoneTemplateSchema), milestoneTemplates.createTemplate);
router.patch("/milestone-templates/reorder", SEKDEP_ONLY, validate(reorderMilestoneTemplatesSchema), milestoneTemplates.reorderTemplates);
router.patch("/milestone-templates/:id", SEKDEP_ONLY, validate(updateMilestoneTemplateSchema), milestoneTemplates.updateTemplate);
router.delete("/milestone-templates/:id", SEKDEP_ONLY, milestoneTemplates.deleteTemplate);

// Presensi (10.5): the coordinator uploads; the department reads
router.get("/attendance-imports", READERS, controller.getAttendance);
router.post("/attendance-imports/preview", COORDINATOR, attendanceFiles, controller.previewAttendance);
router.post("/attendance-imports", COORDINATOR, attendanceFiles, controller.uploadAttendance);
router.get("/attendance-imports/:id/files/:index", READERS, controller.getAttendanceFile);

// Penilaian Proposal (10.2, K9)
router.get("/assessments/form", FORM_READERS, controller.getForm);
router.get("/assessments/supervisor", SUPERVISOR, controller.getSupervisorQueue);
router.get("/assessments/coordinator", READERS, controller.getCoordinatorQueue);
router.get("/assessments/:id", loadUserRoles, controller.getAssessment);
router.post("/assessments/:id/supervisor-score", SUPERVISOR, validate(submitScoreSchema), controller.submitSupervisorScore);
router.post("/assessments/:id/coordinator-score", COORDINATOR, validate(submitScoreSchema), controller.submitCoordinatorScore);

// Naik ke Penelitian (K13): preview and a manual run; the scheduled job runs it too
router.get("/promotions", PROMOTERS, controller.previewPromotion);
router.post("/promotions/run", PROMOTERS, controller.runPromotion);

// Ekspor (10.6) and Monitoring Kelas
router.get("/exports/scores", READERS, controller.exportScores);
router.get("/exports/passed-titles", READERS, controller.exportPassedTitles);
router.get("/monitoring", READERS, controller.getMonitoring);

export default router;
