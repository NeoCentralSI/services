import express from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../../middlewares/rbac.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../../constants/roles.js";
import { validate } from "../../middlewares/validation.middleware.js";
import * as controller from "../../controllers/thesisGuidance/milestone.controller.js";
import * as validator from "../../validators/milestone.validator.js";

const router = express.Router();

// Guidance revival: the baseline relied on service-level checks only. Route-level role
// guards from the active app are kept so the restore does not widen access (e.g. the
// ready-for-seminar/defence lists were open to any authenticated user in the baseline).
router.use(authGuard, loadUserRoles);

// ============================================
// Template Routes (No thesis context needed)
// ============================================

/**
 * GET /api/milestone-templates
 * Get all milestone templates
 */
router.get("/templates", authGuard, controller.getTemplates);

/**
 * GET /api/milestones/templates/topics
 * Get thesis topics for template filtering
 */
router.get("/templates/topics", authGuard, controller.getTopics);

/**
 * GET /api/milestone-templates/categories
 * Get template topics with count (legacy endpoint name)
 */
router.get("/templates/categories", authGuard, controller.getTemplateCategories);

/**
 * GET /api/milestones/templates/:templateId
 * Get template by ID
 */
router.get("/templates/:templateId", authGuard, controller.getTemplateById);

/**
 * POST /api/milestones/templates
 * Create new template (Sekretaris Departemen only)
 */
router.post(
  "/templates",
  authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.createTemplateSchema),
  controller.createTemplate
);

/**
 * PATCH /api/milestones/templates/:templateId
 * Update template (Sekretaris Departemen only)
 */
router.patch(
  "/templates/:templateId",
  authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.updateTemplateSchema),
  controller.updateTemplate
);

/**
 * DELETE /api/milestones/templates/bulk
 * Bulk delete templates (Sekretaris Departemen only)
 */
router.delete(
  "/templates/bulk",
  authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.bulkDeleteTemplatesSchema),
  controller.bulkDeleteTemplates
);

/**
 * DELETE /api/milestones/templates/:templateId
 * Delete template (Sekretaris Departemen only)
 */
router.delete("/templates/:templateId", authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN), controller.deleteTemplate);

// ============================================
// Supervisor Aggregate Routes
// ============================================

/**
 * GET /api/milestones/supervisor/pending-review
 * Get all pending_review milestones across supervised theses (single query)
 */
router.get("/supervisor/pending-review", authGuard, requireRoles(...SUPERVISOR_ROLES), controller.getSupervisorPendingReview);

// ============================================
// Thesis Milestone Routes
// All routes require authentication
// ============================================

/**
 * GET /api/milestones/thesis/:thesisId
 * Get all milestones for a thesis
 */
router.get("/thesis/:thesisId", authGuard, controller.getMilestones);

/**
 * GET /api/milestones/thesis/:thesisId/progress
 * Get overall thesis milestone progress
 */
router.get("/thesis/:thesisId/progress", authGuard, controller.getProgress);

/**
 * POST /api/milestones/thesis/:thesisId
 * Create new milestone (student only)
 */
router.post(
  "/thesis/:thesisId",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.createMilestoneSchema),
  controller.createMilestone
);

/**
 * POST /api/milestones/thesis/:thesisId/by-supervisor
 * Create milestone for student (supervisor only)
 */
router.post(
  "/thesis/:thesisId/by-supervisor",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.createMilestoneBySupervisorSchema),
  controller.createMilestoneBySupervisor
);

/**
 * POST /api/milestones/thesis/:thesisId/from-templates
 * Create milestones from templates (student only)
 */
router.post(
  "/thesis/:thesisId/from-templates",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.createFromTemplatesSchema),
  controller.createFromTemplates
);

/**
 * PATCH /api/milestones/thesis/:thesisId/reorder
 * Reorder milestones (student only)
 */
router.patch(
  "/thesis/:thesisId/reorder",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.reorderMilestonesSchema),
  controller.reorderMilestones
);

// ============================================
// Single Milestone Routes
// ============================================

/**
 * PATCH /api/milestones/:milestoneId
 * Update milestone (student only)
 */
router.patch(
  "/:milestoneId",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.updateMilestoneSchema),
  controller.updateMilestone
);

/**
 * DELETE /api/milestones/:milestoneId
 * Delete milestone (student only)
 */
router.delete("/:milestoneId", authGuard, requireRoles(ROLES.MAHASISWA), controller.deleteMilestone);

// ============================================
// Status Management Routes
// ============================================

/**
 * PATCH /api/milestones/:milestoneId/status
 * Update milestone status (student only)
 */
router.patch(
  "/:milestoneId/status",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.updateStatusSchema),
  controller.updateStatus
);

/**
 * PATCH /api/milestones/:milestoneId/progress
 * Update milestone progress percentage (student only)
 */
router.patch(
  "/:milestoneId/progress",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.updateProgressSchema),
  controller.updateProgress
);

/**
 * POST /api/milestones/:milestoneId/submit-review
 * Submit milestone for review (student only)
 */
router.post(
  "/:milestoneId/submit-review",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.submitForReviewSchema),
  controller.submitForReview
);

// ============================================
// Supervisor Action Routes
// ============================================

/**
 * POST /api/milestones/:milestoneId/validate
 * Validate/approve milestone (supervisor only)
 */
router.post(
  "/:milestoneId/validate",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.validateMilestoneSchema),
  controller.validateMilestone
);

/**
 * POST /api/milestones/:milestoneId/request-revision
 * Request revision on milestone (supervisor only)
 */
router.post(
  "/:milestoneId/request-revision",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.requestRevisionSchema),
  controller.requestRevision
);

/**
 * POST /api/milestones/:milestoneId/feedback
 * Add supervisor feedback (supervisor only)
 */
router.post(
  "/:milestoneId/feedback",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.addFeedbackSchema),
  controller.addFeedback
);

// ============================================
// Seminar Readiness Approval Routes
// ============================================

/**
 * GET /api/milestones/ready-for-seminar
 * Get list of students ready for seminar registration (sekdep/admin)
 */
router.get("/ready-for-seminar", authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN), controller.getStudentsReadyForSeminar);

/**
 * GET /api/milestones/thesis/:thesisId/seminar-readiness
 * Get thesis seminar readiness status
 */
router.get("/thesis/:thesisId/seminar-readiness", authGuard, controller.getThesisSeminarReadiness);

/**
 * POST /api/milestones/thesis/:thesisId/seminar-readiness/approve
 * Approve seminar readiness by supervisor
 */
router.post(
  "/thesis/:thesisId/seminar-readiness/approve",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.seminarReadinessNotesSchema),
  controller.approveSeminarReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/seminar-readiness/revoke
 * Revoke seminar readiness approval by supervisor
 */
router.post(
  "/thesis/:thesisId/seminar-readiness/revoke",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.seminarReadinessNotesSchema),
  controller.revokeSeminarReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/seminar-readiness/remind
 * Request to remind supervisors to approve seminar readiness
 */
router.post(
  "/thesis/:thesisId/seminar-readiness/remind",
  authGuard, requireRoles(ROLES.MAHASISWA),
  controller.remindSeminarReadiness
);

// ============================================
// Defence Readiness Routes
// ============================================

/**
 * GET /api/milestones/ready-for-defence
 * Get list of students ready for defence registration (sekdep/admin)
 */
router.get("/ready-for-defence", authGuard, requireRoles(ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN), controller.getStudentsReadyForDefence);

/**
 * GET /api/milestones/thesis/:thesisId/defence-readiness
 * Get thesis defence readiness status
 */
router.get("/thesis/:thesisId/defence-readiness", authGuard, controller.getThesisDefenceReadiness);

/**
 * POST /api/milestones/thesis/:thesisId/defence-readiness/approve
 * Approve defence readiness by supervisor
 */
router.post(
  "/thesis/:thesisId/defence-readiness/approve",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.defenceReadinessNotesSchema),
  controller.approveDefenceReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/defence-readiness/revoke
 * Revoke defence readiness approval by supervisor
 */
router.post(
  "/thesis/:thesisId/defence-readiness/revoke",
  authGuard, requireRoles(...SUPERVISOR_ROLES),
  validate(validator.defenceReadinessNotesSchema),
  controller.revokeDefenceReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/request-defence
 * Student requests defence by uploading final thesis document
 */
router.post(
  "/thesis/:thesisId/request-defence",
  authGuard, requireRoles(ROLES.MAHASISWA),
  validate(validator.requestDefenceSchema),
  controller.requestDefence
);

/**
 * GET /api/milestones/:milestoneId
 * Get milestone detail
 * Registered last so fixed paths such as /ready-for-seminar and /ready-for-defence
 * are not captured as a milestone id.
 */
router.get("/:milestoneId", authGuard, controller.getMilestoneDetail);

export default router;
