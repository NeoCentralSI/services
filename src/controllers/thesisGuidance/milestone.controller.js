import * as milestoneService from "../../services/thesisGuidance/milestone.service.js";

// ============================================
// Template Controllers
// ============================================

/**
 * GET /milestone-templates
 * Get all milestone templates
 */
export async function getTemplates(req, res, next) {
  try {
    const { category } = req.query;
    const templates = await milestoneService.getTemplates(category);
    res.json({
      success: true,
      data: templates,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /milestone-templates/categories
 * Get template categories
 */
export async function getTemplateCategories(req, res, next) {
  try {
    const categories = await milestoneService.getTemplateCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Milestone CRUD Controllers
// ============================================

/**
 * GET /thesis/:thesisId/milestones
 * Get all milestones for a thesis
 */
export async function getMilestones(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { status } = req.query;
    const result = await milestoneService.getMilestones(thesisId, req.user.sub, status);
    res.json({
      success: true,
      data: result.milestones,
      progress: result.progress,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis/:thesisId/milestones/:milestoneId
 * Get milestone detail
 */
export async function getMilestoneDetail(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const milestone = await milestoneService.getMilestoneDetail(milestoneId, req.user.sub);
    res.json({
      success: true,
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis/:thesisId/milestones
 * Create new milestone
 */
export async function createMilestone(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = req.validated ?? req.body;
    const milestone = await milestoneService.createMilestone(thesisId, req.user.sub, data);
    res.status(201).json({
      success: true,
      message: "Milestone berhasil dibuat",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis/:thesisId/milestones/from-templates
 * Create milestones from templates (bulk)
 */
export async function createFromTemplates(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { templateIds, startDate } = req.validated ?? req.body;
    const result = await milestoneService.createMilestonesFromTemplates(
      thesisId,
      req.user.sub,
      templateIds,
      startDate
    );
    res.status(201).json({
      success: true,
      message: `${result.count} milestone berhasil dibuat dari template`,
      data: result.milestones,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /thesis/:thesisId/milestones/:milestoneId
 * Update milestone
 */
export async function updateMilestone(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const data = req.validated ?? req.body;
    const milestone = await milestoneService.updateMilestone(milestoneId, req.user.sub, data);
    res.json({
      success: true,
      message: "Milestone berhasil diperbarui",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /thesis/:thesisId/milestones/:milestoneId
 * Delete milestone
 */
export async function deleteMilestone(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const result = await milestoneService.deleteMilestone(milestoneId, req.user.sub);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Status Management Controllers
// ============================================

/**
 * PATCH /thesis/:thesisId/milestones/:milestoneId/status
 * Update milestone status
 */
export async function updateStatus(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { status, notes } = req.validated ?? req.body;
    const milestone = await milestoneService.updateMilestoneStatus(
      milestoneId,
      req.user.sub,
      status,
      notes
    );
    res.json({
      success: true,
      message: `Status milestone berhasil diubah menjadi ${status}`,
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /thesis/:thesisId/milestones/:milestoneId/progress
 * Update milestone progress percentage
 */
export async function updateProgress(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { progressPercentage } = req.validated ?? req.body;
    const result = await milestoneService.updateMilestoneProgress(
      milestoneId,
      req.user.sub,
      progressPercentage
    );
    res.json({
      success: true,
      message: `Progress milestone berhasil diperbarui menjadi ${progressPercentage}%`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis/:thesisId/milestones/:milestoneId/submit-review
 * Submit milestone for review
 */
export async function submitForReview(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { evidenceUrl, studentNotes } = req.validated ?? req.body ?? {};
    const milestone = await milestoneService.submitForReview(
      milestoneId,
      req.user.sub,
      evidenceUrl,
      studentNotes
    );
    res.json({
      success: true,
      message: "Milestone berhasil diajukan untuk review",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Supervisor Action Controllers
// ============================================

/**
 * POST /thesis/:thesisId/milestones/:milestoneId/validate
 * Validate/approve milestone (supervisor only)
 */
export async function validateMilestone(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { supervisorNotes } = req.validated ?? req.body ?? {};
    const milestone = await milestoneService.validateMilestone(
      milestoneId,
      req.user.sub,
      supervisorNotes
    );
    res.json({
      success: true,
      message: "Milestone berhasil divalidasi",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis/:thesisId/milestones/:milestoneId/request-revision
 * Request revision on milestone (supervisor only)
 */
export async function requestRevision(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { revisionNotes } = req.validated ?? req.body;
    const milestone = await milestoneService.requestRevision(
      milestoneId,
      req.user.sub,
      revisionNotes
    );
    res.json({
      success: true,
      message: "Permintaan revisi berhasil dikirim",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesis/:thesisId/milestones/:milestoneId/feedback
 * Add supervisor feedback (supervisor only)
 */
export async function addFeedback(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { feedback } = req.validated ?? req.body;
    const milestone = await milestoneService.addSupervisorFeedback(
      milestoneId,
      req.user.sub,
      feedback
    );
    res.json({
      success: true,
      message: "Feedback berhasil ditambahkan",
      data: milestone,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Progress & Analytics Controllers
// ============================================

/**
 * GET /thesis/:thesisId/milestones/progress
 * Get overall thesis milestone progress
 */
export async function getProgress(req, res, next) {
  try {
    const { thesisId } = req.params;
    const progress = await milestoneService.getThesisProgress(thesisId, req.user.sub);
    res.json({
      success: true,
      data: progress,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis/:thesisId/milestones/:milestoneId/logs
 * Get milestone activity logs
 */
export async function getMilestoneLogs(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const { limit } = req.query;
    const logs = await milestoneService.getMilestoneLogs(
      milestoneId,
      req.user.sub,
      limit ? parseInt(limit, 10) : 20
    );
    res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesis/:thesisId/milestones/logs
 * Get all milestone logs for thesis
 */
export async function getThesisMilestoneLogs(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { limit } = req.query;
    const logs = await milestoneService.getThesisMilestoneLogs(
      thesisId,
      req.user.sub,
      limit ? parseInt(limit, 10) : 50
    );
    res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Reorder Controller
// ============================================

/**
 * PUT /thesis/:thesisId/milestones/reorder
 * Reorder milestones
 */
export async function reorderMilestones(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { milestoneOrders } = req.validated ?? req.body;
    const result = await milestoneService.reorderMilestones(
      thesisId,
      req.user.sub,
      milestoneOrders
    );
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Template CRUD Controllers (Sekretaris Departemen)
// ============================================

/**
 * GET /templates/:templateId
 * Get template by ID
 */
export async function getTemplateById(req, res, next) {
  try {
    const { templateId } = req.params;
    const template = await milestoneService.getTemplateById(templateId);
    res.json({
      success: true,
      data: template,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /templates
 * Create new template (Sekretaris Departemen only)
 */
export async function createTemplate(req, res, next) {
  try {
    const data = req.validated ?? req.body;
    const template = await milestoneService.createTemplate(req.user.sub, data);
    res.status(201).json({
      success: true,
      message: "Template berhasil dibuat",
      data: template,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /templates/:templateId
 * Update template (Sekretaris Departemen only)
 */
export async function updateTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    const data = req.validated ?? req.body;
    const template = await milestoneService.updateTemplate(req.user.sub, templateId, data);
    res.json({
      success: true,
      message: "Template berhasil diperbarui",
      data: template,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /templates/:templateId
 * Delete template (Sekretaris Departemen only)
 */
export async function deleteTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    const result = await milestoneService.deleteTemplate(req.user.sub, templateId);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}
