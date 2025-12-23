import express from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import * as controller from "../../controllers/thesisGuidance/milestone.controller.js";
import * as validator from "../../validators/milestone.validator.js";

const router = express.Router();

// ============================================
// Template Routes (No thesis context needed)
// ============================================

/**
 * GET /api/milestone-templates
 * Get all milestone templates
 */
router.get("/templates", authGuard, controller.getTemplates);

/**
 * GET /api/milestone-templates/categories
 * Get template categories
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
  authGuard,
  validate(validator.createTemplateSchema),
  controller.createTemplate
);

/**
 * PUT /api/milestones/templates/:templateId
 * Update template (Sekretaris Departemen only)
 */
router.put(
  "/templates/:templateId",
  authGuard,
  validate(validator.updateTemplateSchema),
  controller.updateTemplate
);

/**
 * DELETE /api/milestones/templates/:templateId
 * Delete template (Sekretaris Departemen only)
 */
router.delete("/templates/:templateId", authGuard, controller.deleteTemplate);

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
 * GET /api/milestones/thesis/:thesisId/logs
 * Get all milestone logs for thesis
 */
router.get("/thesis/:thesisId/logs", authGuard, controller.getThesisMilestoneLogs);

/**
 * POST /api/milestones/thesis/:thesisId
 * Create new milestone (student only)
 */
router.post(
  "/thesis/:thesisId",
  authGuard,
  validate(validator.createMilestoneSchema),
  controller.createMilestone
);

/**
 * POST /api/milestones/thesis/:thesisId/from-templates
 * Create milestones from templates (student only)
 */
router.post(
  "/thesis/:thesisId/from-templates",
  authGuard,
  validate(validator.createFromTemplatesSchema),
  controller.createFromTemplates
);

/**
 * PUT /api/milestones/thesis/:thesisId/reorder
 * Reorder milestones (student only)
 */
router.put(
  "/thesis/:thesisId/reorder",
  authGuard,
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
router.get("/:milestoneId", authGuard, controller.getMilestoneDetail);

/**
 * GET /api/milestones/:milestoneId/logs
 * Get milestone activity logs
 */
router.get("/:milestoneId/logs", authGuard, controller.getMilestoneLogs);

/**
 * PUT /api/milestones/:milestoneId
 * Update milestone (student only)
 */
router.put(
  "/:milestoneId",
  authGuard,
  validate(validator.updateMilestoneSchema),
  controller.updateMilestone
);

/**
 * DELETE /api/milestones/:milestoneId
 * Delete milestone (student only)
 */
router.delete("/:milestoneId", authGuard, controller.deleteMilestone);

// ============================================
// Status Management Routes
// ============================================

/**
 * PATCH /api/milestones/:milestoneId/status
 * Update milestone status (student only)
 */
router.patch(
  "/:milestoneId/status",
  authGuard,
  validate(validator.updateStatusSchema),
  controller.updateStatus
);

/**
 * PATCH /api/milestones/:milestoneId/progress
 * Update milestone progress percentage (student only)
 */
router.patch(
  "/:milestoneId/progress",
  authGuard,
  validate(validator.updateProgressSchema),
  controller.updateProgress
);

/**
 * POST /api/milestones/:milestoneId/submit-review
 * Submit milestone for review (student only)
 */
router.post(
  "/:milestoneId/submit-review",
  authGuard,
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
  authGuard,
  validate(validator.validateMilestoneSchema),
  controller.validateMilestone
);

/**
 * POST /api/milestones/:milestoneId/request-revision
 * Request revision on milestone (supervisor only)
 */
router.post(
  "/:milestoneId/request-revision",
  authGuard,
  validate(validator.requestRevisionSchema),
  controller.requestRevision
);

/**
 * POST /api/milestones/:milestoneId/feedback
 * Add supervisor feedback (supervisor only)
 */
router.post(
  "/:milestoneId/feedback",
  authGuard,
  validate(validator.addFeedbackSchema),
  controller.addFeedback
);

export default router;
