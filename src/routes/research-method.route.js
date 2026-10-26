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
  copyCpmkTemplate,
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
  copyCpmkTemplateSchema,
} from "../validators/researchMethodAssessmentAdmin.validator.js";
import {
  authGuard,
  requireAnyRole,
} from "../middlewares/auth.middleware.js";
import { loadUserRoles } from "../middlewares/rbac.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
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
 * Penilaian Proposal, exports and Monitoring Kelas. Class presence is the course's business in
 * SIA, and a pass starts the research phase when the second final score is sent.
 */
import { logMasterDataChange } from "../middlewares/activity-log.middleware.js";
import { ENTITY_TYPES } from "../services/auditLog.service.js";

const router = express.Router();
// Activity log of the proposal assessment master data.
const logPm = (options) => logMasterDataChange({ scope: "proposal", ...options });

const MANAGE = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_METODE_PENELITIAN]);
const SEKDEP_ONLY = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]);
const COORDINATOR = requireAnyRole([ROLES.KOORDINATOR_METODE_PENELITIAN]);
const READERS = requireAnyRole([ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);
const SUPERVISOR = requireAnyRole(SUPERVISOR_ROLES);
const FORM_READERS = requireAnyRole([...SUPERVISOR_ROLES, ROLES.KOORDINATOR_METODE_PENELITIAN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]);

router.use(authGuard);

// Master data: CPMK, criteria, rubrics and the minimum score are written by the
// Sekretaris Departemen only; the coordinator still reads them. Copy from another period as in
// the thesis CPMK master data.
router.get("/cpmks", MANAGE, listCpmks);
router.post("/cpmks/copy-template", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.CPMK, operation: "copy" }), validate(copyCpmkTemplateSchema), copyCpmkTemplate);
router.post("/cpmks", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.CPMK }), validate(createCpmkSchema), createCpmk);
router.patch("/cpmks/:cpmkId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.CPMK, idParam: "cpmkId" }), validate(updateCpmkSchema), updateCpmk);
router.delete("/cpmks/:cpmkId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.CPMK, idParam: "cpmkId" }), deleteCpmk);

router.get("/assessment-configuration", MANAGE, getConfiguredCpmks);
router.post("/criteria", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA }), validate(createCriteriaSchema), createCriteria);
router.patch("/criteria/reorder", SEKDEP_ONLY, validate(reorderCriteriaSchema), reorderCriteria);
router.patch("/criteria/:criteriaId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA, idParam: "criteriaId" }), validate(updateCriteriaSchema), updateCriteria);
router.delete("/criteria/:criteriaId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA, idParam: "criteriaId" }), deleteCriteria);
router.delete("/cpmks/:cpmkId/configuration", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_CRITERIA, idParam: "cpmkId" }), removeCpmkConfig);

router.get("/criteria/:criteriaId/rubrics", MANAGE, listRubrics);
router.post("/criteria/:criteriaId/rubrics", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC }), validate(createRubricSchema), createRubric);
router.patch("/rubrics/reorder", SEKDEP_ONLY, validate(reorderRubricsSchema), reorderRubrics);
router.patch("/rubrics/:rubricId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC, idParam: "rubricId" }), validate(updateRubricSchema), updateRubric);
router.delete("/rubrics/:rubricId", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ASSESSMENT_RUBRIC, idParam: "rubricId" }), deleteRubric);

router.get("/weight-summary", MANAGE, getWeightSummary);
// Minimum passing score of a period (10.2), next to the seminar and defence minimums
router.patch("/academic-years/:id/minimum-score", SEKDEP_ONLY, logPm({ entity: ENTITY_TYPES.ACADEMIC_YEAR, idParam: "id" }), validate(minimumScoreSchema), controller.setMinimumScore);

// General proposal milestone templates: only the Sekretaris
// Departemen creates, changes, reorders and deletes them (academic master data is the Sekdep's);
// the list keeps its readers. Students and supervisors read templates through /milestones/templates.
router.get("/milestone-templates", MANAGE, milestoneTemplates.listTemplates);
router.post("/milestone-templates", SEKDEP_ONLY, validate(createMilestoneTemplateSchema), milestoneTemplates.createTemplate);
router.patch("/milestone-templates/reorder", SEKDEP_ONLY, validate(reorderMilestoneTemplatesSchema), milestoneTemplates.reorderTemplates);
router.patch("/milestone-templates/:id", SEKDEP_ONLY, validate(updateMilestoneTemplateSchema), milestoneTemplates.updateTemplate);
router.delete("/milestone-templates/:id", SEKDEP_ONLY, milestoneTemplates.deleteTemplate);

// Penilaian Proposal: the supervisor scores in Tugas Akhir > Proposal; the coordinator page is the
// coordinator's only (Kadep and Sekdep follow the class in Monitoring Kelas). Each party may save a
// draft as often as needed and sends once; the parties score in any order.
router.get("/assessments/form", FORM_READERS, controller.getForm);
router.get("/assessments/supervisor", SUPERVISOR, controller.getSupervisorQueue);
router.get("/assessments/coordinator", COORDINATOR, controller.getCoordinatorQueue);
router.get("/assessments/:id", loadUserRoles, controller.getAssessment);
router.get("/assessments/:id/supervisor-form", SUPERVISOR, controller.getSupervisorScoreForm);
router.get("/assessments/:id/coordinator-form", COORDINATOR, controller.getCoordinatorScoreForm);
router.post("/assessments/:id/supervisor-score", SUPERVISOR, validate(submitScoreSchema), controller.submitSupervisorScore);
router.post("/assessments/:id/coordinator-score", COORDINATOR, validate(submitScoreSchema), controller.submitCoordinatorScore);

// Exports and Monitoring Kelas
router.get("/exports/scores", READERS, controller.exportScores);
router.get("/exports/passed-titles", READERS, controller.exportPassedTitles);
router.get("/monitoring", READERS, controller.getMonitoring);

export default router;
