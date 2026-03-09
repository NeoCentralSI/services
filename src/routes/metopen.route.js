import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/metopen.controller.js";
import * as classController from "../controllers/metopenClass.controller.js";
import * as validator from "../validators/metopen.validator.js";
import * as classValidator from "../validators/metopenClass.validator.js";
import { ROLES } from "../constants/roles.js";
import { uploadMetopenSubmit } from "../middlewares/file.middleware.js";
import multer from "multer";

const router = express.Router();
import metopenGradingRoute from "./metopen-grading.subrouter.js";

// Dedicated upload for template attachments — 100 MB limit
const templateAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// All routes require authentication
router.use(authGuard);

router.use("/grading", metopenGradingRoute);

// ============================================
// Eligibility
// ============================================

/** GET /metopen/eligibility */
router.get("/eligibility", controller.checkEligibility);

/** GET /metopen/eligible-students */
router.get(
  "/eligible-students",
  requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN, ROLES.ADMIN]),
  controller.getEligibleStudents
);

// ============================================
// Template Management (Admin / Sekdep / Dosen Metopen)
// ============================================

/** GET /metopen/templates */
router.get("/templates", controller.getTemplates);

/** GET /metopen/templates/:id */
router.get("/templates/:id", controller.getTemplateById);

/** POST /metopen/templates */
router.post(
  "/templates",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  validate(validator.createTemplateSchema),
  controller.createTemplate
);

/** PATCH /metopen/templates/reorder — must be before :id route */
router.patch(
  "/templates/reorder",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  validate(validator.reorderTemplatesSchema),
  controller.reorderTemplates
);

/** PATCH /metopen/templates/:id */
router.patch(
  "/templates/:id",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  validate(validator.updateTemplateSchema),
  controller.updateTemplate
);

/** DELETE /metopen/templates/:id */
router.delete(
  "/templates/:id",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.deleteTemplate
);

// ============================================
// Template Attachments
// ============================================

/** POST /metopen/templates/:id/attachments — upload single file attachment */
router.post(
  "/templates/:id/attachments",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  templateAttachmentUpload.single("file"),
  controller.addTemplateAttachment
);

/** POST /metopen/templates/:id/attachments/batch — upload multiple files (max 10) */
router.post(
  "/templates/:id/attachments/batch",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  templateAttachmentUpload.array("files", 10),
  controller.addTemplateAttachmentsBatch
);

/** GET /metopen/templates/:id/attachments — list attachments */
router.get(
  "/templates/:id/attachments",
  controller.getTemplateAttachments
);

/** DELETE /metopen/templates/:id/attachments/:attachmentId — remove attachment */
router.delete(
  "/templates/:id/attachments/:attachmentId",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.removeTemplateAttachment
);

// ============================================
// Class Management (Dosen Pengampu Metopel only)
// Sekdep/Admin access class management only if they also hold the Dosen Pengampu role.
// ============================================

const classRoles = [ROLES.DOSEN_METOPEN];
const rosterRoles = [ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN];

/** GET /metopen/academic-years */
router.get(
  "/academic-years",
  requireAnyRole(rosterRoles),
  classController.getAcademicYears
);

/** GET /metopen/roster */
router.get(
  "/roster",
  requireAnyRole(rosterRoles),
  classController.getRoster
);

/** GET /metopen/classes */
router.get(
  "/classes",
  requireAnyRole(classRoles),
  classController.getClasses
);

/** POST /metopen/classes/auto-sync — must be before /:classId route */
router.post(
  "/classes/auto-sync",
  requireAnyRole(classRoles),
  classController.autoSyncClass
);

/** POST /metopen/classes */
router.post(
  "/classes",
  requireAnyRole(classRoles),
  validate(classValidator.createClassSchema),
  classController.createClass
);

/** GET /metopen/classes/:classId */
router.get(
  "/classes/:classId",
  requireAnyRole(classRoles),
  classController.getClassById
);

/** PATCH /metopen/classes/:classId */
router.patch(
  "/classes/:classId",
  requireAnyRole(classRoles),
  validate(classValidator.updateClassSchema),
  classController.updateClass
);

/** DELETE /metopen/classes/:classId */
router.delete(
  "/classes/:classId",
  requireAnyRole(classRoles),
  classController.deleteClass
);

/** POST /metopen/classes/:classId/enroll */
router.post(
  "/classes/:classId/enroll",
  requireAnyRole(classRoles),
  validate(classValidator.enrollStudentsSchema),
  classController.enrollStudents
);

/** DELETE /metopen/classes/:classId/students/:studentId */
router.delete(
  "/classes/:classId/students/:studentId",
  requireAnyRole(classRoles),
  classController.unenrollStudent
);

/** POST /metopen/classes/:classId/publish */
router.post(
  "/classes/:classId/publish",
  requireAnyRole(classRoles),
  validate(classValidator.publishToClassSchema),
  classController.publishToClass
);

/** GET /metopen/classes/:classId/tasks */
router.get(
  "/classes/:classId/tasks",
  requireAnyRole(classRoles),
  classController.getClassTasks
);

/** GET /metopen/classes/:classId/tasks/:templateId */
router.get(
  "/classes/:classId/tasks/:templateId",
  requireAnyRole(classRoles),
  classController.getClassTaskDetail
);

/** GET /metopen/classes/:classId/published-templates */
router.get(
  "/classes/:classId/published-templates",
  requireAnyRole(classRoles),
  classController.getPublishedTemplateIds
);

// ============================================
// Legacy Bulk Publish (kept for backward compat)
// ============================================

/** GET /metopen/publish-stats — get per-template per-class publish overview */
router.get(
  "/publish-stats",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.getPublishStats
);

/** POST /metopen/publish-tasks */
router.post(
  "/publish-tasks",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.publishTasks
);

/** PATCH /metopen/publish-tasks/deadline */
router.patch(
  "/publish-tasks/deadline",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.updatePublishDeadline
);

/** DELETE /metopen/publish-tasks — delete all tasks for a template+class */
router.delete(
  "/publish-tasks",
  requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.DOSEN_METOPEN]),
  controller.deletePublishedTasks
);

// ============================================
// Student Tasks
// ============================================

/** GET /metopen/my-tasks */
router.get("/my-tasks", controller.getMyTasks);

/** GET /metopen/my-tasks/:milestoneId */
router.get("/my-tasks/:milestoneId", controller.getTaskDetail);

/** POST /metopen/submit/:milestoneId — max 10 files */
router.post(
  "/submit/:milestoneId",
  uploadMetopenSubmit,
  controller.submitTask
);

/** GET /metopen/my-completed-guidances — completed guidance sessions available for linking */
router.get("/my-completed-guidances", controller.getMyCompletedGuidances);

/** GET /metopen/linked-guidances/:milestoneId — guidance sessions linked to a milestone */
router.get("/linked-guidances/:milestoneId", controller.getLinkedGuidances);

// ============================================
// Gate Status
// ============================================

/** GET /metopen/my-gate-status */
router.get("/my-gate-status", controller.getMyGateStatus);

// ============================================
// Grading (Dosen Metopen)
// ============================================

/** GET /metopen/grading-queue */
router.get(
  "/grading-queue",
  requireAnyRole([ROLES.DOSEN_METOPEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.ADMIN]),
  controller.getGradingQueue
);

/** GET /metopen/my-supervised-progress — Pembimbing views metopen progress of their supervised students */
router.get(
  "/my-supervised-progress",
  requireAnyRole([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.DOSEN_METOPEN]),
  controller.getMySupervisedProgress
);

/** POST /metopen/grade/:milestoneId */
router.post(
  "/grade/:milestoneId",
  requireAnyRole([ROLES.DOSEN_METOPEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.ADMIN]),
  validate(validator.gradeSchema),
  controller.gradeMilestone
);

// ============================================
// Progress & Gate Status (per thesis)
// ============================================

/** GET /metopen/progress/:thesisId */
router.get("/progress/:thesisId", controller.getProgress);

/** GET /metopen/gate-status/:thesisId */
router.get("/gate-status/:thesisId", controller.getGateStatus);

// ============================================
// Monitoring (Dosen / Sekdep / Admin)
// ============================================

/** GET /metopen/monitoring */
router.get(
  "/monitoring",
  requireAnyRole([ROLES.DOSEN_METOPEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]),
  controller.getMonitoringSummary
);

// ============================================
// Seminar Eligibility (FR-SYS-01)
// ============================================

router.get("/seminar-eligibility", controller.checkSeminarEligibility);

// ============================================
// Lapor Judul TA (FR-MHS-06, FR-KDP-05)
// ============================================

router.post("/title-report", controller.submitTitleReport);

router.get(
  "/title-reports/pending",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]),
  controller.getPendingTitleReports
);

router.post(
  "/title-reports/:thesisId/review",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]),
  controller.reviewTitleReport
);

export default router;
