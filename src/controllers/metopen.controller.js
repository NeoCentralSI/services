import * as metopenService from "../services/metopen.service.js";

// ============================================
// Eligibility
// ============================================

export async function checkEligibility(req, res, next) {
  try {
    const data = await metopenService.checkEligibility(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEligibleStudents(req, res, next) {
  try {
    const students = await metopenService.getEligibleStudents(req.query.academicYearId || null);
    res.json({ success: true, data: students });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Template Controllers
// ============================================

export async function getTemplates(req, res, next) {
  try {
    const { isActive, topicId } = req.query;
    const templates = await metopenService.getTemplates({ isActive, topicId });
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
}

export async function getTemplateById(req, res, next) {
  try {
    const { id } = req.params;
    const template = await metopenService.getTemplateById(id);
    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const template = await metopenService.createTemplate(req.validated ?? req.body);
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const template = await metopenService.updateTemplate(id, req.validated ?? req.body);
    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
}

export async function deleteTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const result = await metopenService.deleteTemplate(id);
    res.json({ success: true, data: result, message: "Template berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

export async function reorderTemplates(req, res, next) {
  try {
    const { orders } = req.validated ?? req.body;
    await metopenService.reorderTemplates(orders);
    res.json({ success: true, message: "Urutan template berhasil diperbarui" });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Template Attachments
// ============================================

export async function addTemplateAttachment(req, res, next) {
  try {
    const { id } = req.params;
    const attachment = await metopenService.addAttachment(id, req.file, req.user.sub);
    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    console.error("Error in addTemplateAttachment:", err);
    next(err);
  }
}

export async function addTemplateAttachmentsBatch(req, res, next) {
  try {
    const { id } = req.params;
    const files = Array.isArray(req.files) ? req.files : [];
    const attachments = await metopenService.addAttachmentsBatch(id, files, req.user.sub);
    res.status(201).json({ success: true, data: attachments });
  } catch (err) {
    console.error("Error in addTemplateAttachmentsBatch:", err);
    next(err);
  }
}

export async function removeTemplateAttachment(req, res, next) {
  try {
    const { attachmentId } = req.params;
    await metopenService.removeAttachment(attachmentId);
    res.json({ success: true, message: "Attachment berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

export async function getTemplateAttachments(req, res, next) {
  try {
    const { id } = req.params;
    const data = await metopenService.getAttachments(id);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error in getTemplateAttachments:", err);
    next(err);
  }
}

// ============================================
// Publish Stats
// ============================================

export async function getPublishStats(req, res, next) {
  try {
    const data = await metopenService.getPublishStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Publish Tasks
// ============================================

export async function publishTasks(req, res, next) {
  try {
    const { startDate, templateDeadlines, studentIds, templateIds, classId } = req.validated ?? req.body ?? {};
    const data = await metopenService.publishTasks({ startDate, templateDeadlines, studentIds, templateIds, classId });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updatePublishDeadline(req, res, next) {
  try {
    const { templateId, classId, deadline } = req.validated ?? req.body ?? {};
    const data = await metopenService.updatePublishDeadline(templateId, classId, deadline);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deletePublishedTasks(req, res, next) {
  try {
    const { templateId, classId } = req.body ?? {};
    if (!templateId || classId === undefined) {
      return res.status(400).json({ success: false, message: 'templateId dan classId diperlukan' });
    }
    const data = await metopenService.deletePublishedTasks(templateId, classId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Student Task Controllers
// ============================================

export async function getMyTasks(req, res, next) {
  try {
    const data = await metopenService.getMyTasks(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTaskDetail(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const data = await metopenService.getTaskDetail(milestoneId, req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function submitTask(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
    const data = await metopenService.submitTask(milestoneId, req.user.sub, {
      ...req.body,
      files,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Gate Status
// ============================================

export async function getMyGateStatus(req, res, next) {
  try {
    const data = await metopenService.getMyGateStatus(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyCompletedGuidances(req, res, next) {
  try {
    const data = await metopenService.getMyCompletedGuidances(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLinkedGuidances(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const data = await metopenService.getLinkedGuidances(milestoneId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Grading Controllers (Dosen)
// ============================================

export async function getGradingQueue(req, res, next) {
  try {
    const { status } = req.query;
    const data = await metopenService.getGradingQueue(status);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMySupervisedProgress(req, res, next) {
  try {
    const data = await metopenService.getMySupervisedProgress(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function gradeMilestone(req, res, next) {
  try {
    const { milestoneId } = req.params;
    const data = await metopenService.gradeMilestone(milestoneId, req.user.sub, req.validated ?? req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Progress & Gate Status
// ============================================

export async function getProgress(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await metopenService.getProgress(thesisId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getGateStatus(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await metopenService.getGateStatus(thesisId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Monitoring
// ============================================

export async function getMonitoringSummary(req, res, next) {
  try {
    const { academicYearId } = req.query;
    const data = await metopenService.getMonitoringSummary(academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Seminar Eligibility (FR-SYS-01)
// ============================================

export async function checkSeminarEligibility(req, res, next) {
  try {
    const data = await metopenService.checkSeminarEligibility(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ============================================
// Lapor Judul TA
// ============================================

export async function submitTitleReport(req, res, next) {
  try {
    const data = await metopenService.submitTitleReport(req.user.sub);
    res.status(201).json({ success: true, data, message: "Judul TA berhasil diajukan untuk review" });
  } catch (err) {
    next(err);
  }
}

export async function reviewTitleReport(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { action, notes } = req.validated ?? req.body;
    const data = await metopenService.reviewTitleReport(thesisId, action, notes);
    res.json({ success: true, data, message: action === "accept" ? "Judul TA disetujui" : "Judul TA ditolak" });
  } catch (err) {
    next(err);
  }
}

export async function getPendingTitleReports(req, res, next) {
  try {
    const data = await metopenService.getPendingTitleReports();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
