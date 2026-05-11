import express from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import * as controller from "../../controllers/thesisGuidance/milestone.controller.js";
import * as validator from "../../validators/milestone.validator.js";
import { ROLES, SUPERVISOR_ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes require auth + roles loaded for access checks
router.use(authGuard, loadUserRoles);

// ============================================
// Template Routes (No thesis context needed)
// ============================================

/**
 * GET /api/milestone-templates
 * Get all milestone templates
 */
router.get("/templates", controller.getTemplates);

/**
 * GET /api/milestones/templates/topics
 * Get thesis topics for template filtering
 */
router.get("/templates/topics", controller.getTopics);

/**
 * GET /api/milestone-templates/categories
 * Get template topics with count (legacy endpoint name)
 */
router.get("/templates/categories", controller.getTemplateCategories);

/**
 * GET /api/milestones/templates/:templateId
 * Get template by ID
 */
router.get("/templates/:templateId", controller.getTemplateById);

/**
 * POST /api/milestones/templates
 * Create new template (Sekretaris Departemen only)
 */
router.post(
  "/templates",
  requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.createTemplateSchema),
  controller.createTemplate
);

/**
 * PATCH /api/milestones/templates/:templateId
 * Update template (Sekretaris Departemen only)
 */
router.patch(
  "/templates/:templateId",
  requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.updateTemplateSchema),
  controller.updateTemplate
);

/**
 * DELETE /api/milestones/templates/bulk
 * Bulk delete templates (Sekretaris Departemen only)
 */
router.delete(
  "/templates/bulk",
  requireRoles(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.bulkDeleteTemplatesSchema),
  controller.bulkDeleteTemplates
);

/**
 * DELETE /api/milestones/templates/:templateId
 * Delete template (Sekretaris Departemen only)
 */
router.delete("/templates/:templateId", requireRoles(ROLES.SEKRETARIS_DEPARTEMEN), controller.deleteTemplate);

// ============================================
// Thesis Milestone Routes
// Access checked in service via getThesisWithAccess()
// ============================================

/**
 * GET /api/milestones/thesis/:thesisId
 * Get all milestones for a thesis
 */
router.get("/thesis/:thesisId", controller.getMilestones);

/**
 * GET /api/milestones/thesis/:thesisId/progress
 * Get overall thesis milestone progress
 */
router.get("/thesis/:thesisId/progress", controller.getProgress);

/**
 * POST /api/milestones/thesis/:thesisId
 * Create new milestone (student only — checked in service)
 */
router.post(
  "/thesis/:thesisId",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.createMilestoneSchema),
  controller.createMilestone
);

/**
 * POST /api/milestones/thesis/:thesisId/by-supervisor
 * Create milestone for student (supervisor only)
 */
router.post(
  "/thesis/:thesisId/by-supervisor",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.createMilestoneBySupervisorSchema),
  controller.createMilestoneBySupervisor
);

/**
 * POST /api/milestones/thesis/:thesisId/from-templates
 * Create milestones from templates (student only)
 */
router.post(
  "/thesis/:thesisId/from-templates",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.createFromTemplatesSchema),
  controller.createFromTemplates
);

/**
 * PATCH /api/milestones/thesis/:thesisId/reorder
 * Reorder milestones (student only)
 */
router.patch(
  "/thesis/:thesisId/reorder",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.reorderMilestonesSchema),
  controller.reorderMilestones
);

// ============================================
// Single Milestone Routes
// ============================================

/**
 * GET /api/milestones/:milestoneId
 * Get milestone detail
 */
router.get("/:milestoneId", controller.getMilestoneDetail);

/**
 * PATCH /api/milestones/:milestoneId
 * Update milestone (student only)
 */
router.patch(
  "/:milestoneId",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.updateMilestoneSchema),
  controller.updateMilestone
);

/**
 * DELETE /api/milestones/:milestoneId
 * Delete milestone (student only)
 */
router.delete("/:milestoneId", requireRoles(ROLES.MAHASISWA), controller.deleteMilestone);

// ============================================
// Status Management Routes
// ============================================

/**
 * PATCH /api/milestones/:milestoneId/status
 * Update milestone status (student only)
 */
router.patch(
  "/:milestoneId/status",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.updateStatusSchema),
  controller.updateStatus
);

/**
 * PATCH /api/milestones/:milestoneId/progress
 * Update milestone progress percentage (student only)
 */
router.patch(
  "/:milestoneId/progress",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.updateProgressSchema),
  controller.updateProgress
);

/**
 * POST /api/milestones/:milestoneId/submit-review
 * Submit milestone for review (student only)
 */
router.post(
  "/:milestoneId/submit-review",
  requireRoles(ROLES.MAHASISWA),
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
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.validateMilestoneSchema),
  controller.validateMilestone
);

/**
 * POST /api/milestones/:milestoneId/request-revision
 * Request revision on milestone (supervisor only)
 */
router.post(
  "/:milestoneId/request-revision",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.requestRevisionSchema),
  controller.requestRevision
);

/**
 * POST /api/milestones/:milestoneId/feedback
 * Add supervisor feedback (supervisor only)
 */
router.post(
  "/:milestoneId/feedback",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.addFeedbackSchema),
  controller.addFeedback
);

// ============================================
// Seminar Readiness Approval Routes
// ============================================

/**
 * GET /api/milestones/ready-for-seminar
 * Get list of students ready for seminar registration (sekdep/kadep/admin)
 */
router.get(
  "/ready-for-seminar",
  requireRoles(ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN),
  controller.getStudentsReadyForSeminar
);

/**
 * GET /api/milestones/thesis/:thesisId/seminar-readiness
 * Get thesis seminar readiness status
 */
router.get("/thesis/:thesisId/seminar-readiness", controller.getThesisSeminarReadiness);

/**
 * POST /api/milestones/thesis/:thesisId/seminar-readiness/approve
 * Approve seminar readiness by supervisor
 */
router.post(
  "/thesis/:thesisId/seminar-readiness/approve",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.seminarReadinessNotesSchema),
  controller.approveSeminarReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/seminar-readiness/revoke
 * Revoke seminar readiness approval by supervisor
 */
router.post(
  "/thesis/:thesisId/seminar-readiness/revoke",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.seminarReadinessNotesSchema),
  controller.revokeSeminarReadiness
);

// ============================================
// Defence Readiness Routes
// ============================================

/**
 * GET /api/milestones/ready-for-defence
 * Get list of students ready for defence registration (sekdep/kadep/admin)
 */
router.get(
  "/ready-for-defence",
  requireRoles(ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN),
  controller.getStudentsReadyForDefence
);

/**
 * GET /api/milestones/thesis/:thesisId/defence-readiness
 * Get thesis defence readiness status
 */
router.get("/thesis/:thesisId/defence-readiness", controller.getThesisDefenceReadiness);

/**
 * POST /api/milestones/thesis/:thesisId/defence-readiness/approve
 * Approve defence readiness by supervisor
 */
router.post(
  "/thesis/:thesisId/defence-readiness/approve",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.defenceReadinessNotesSchema),
  controller.approveDefenceReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/defence-readiness/revoke
 * Revoke defence readiness approval by supervisor
 */
router.post(
  "/thesis/:thesisId/defence-readiness/revoke",
  requireRoles(...SUPERVISOR_ROLES),
  validate(validator.defenceReadinessNotesSchema),
  controller.revokeDefenceReadiness
);

/**
 * POST /api/milestones/thesis/:thesisId/request-defence
 * Student requests defence by uploading final thesis document
 */
router.post(
  "/thesis/:thesisId/request-defence",
  requireRoles(ROLES.MAHASISWA),
  validate(validator.requestDefenceSchema),
  controller.requestDefence
);

export default router;
