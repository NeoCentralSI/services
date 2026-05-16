import * as monitoringService from "../../services/thesisGuidance/monitoring.service.js";
import {
  getKadepPendingTransfersService,
  getKadepAllTransfersService,
  kadepApproveTransferService,
  kadepRejectTransferService,
} from "../../services/thesisGuidance/lecturer.guidance.service.js";
import { parseAcademicYearQuery } from "../../validators/monitoring.validator.js";

/**
 * Get monitoring dashboard for management
 * @route GET /api/thesis-guidance/monitoring/dashboard
 */
export async function getMonitoringDashboard(req, res, next) {
  try {
    const { academicYear } = parseAcademicYearQuery(req.query);
    const data = await monitoringService.getMonitoringDashboard(academicYear);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get thesis list with filters for monitoring
 * @route GET /api/thesis-guidance/monitoring/theses
 */
export async function getThesesList(req, res, next) {
  try {
    const { status, lecturerId, academicYear, search, page = 1, pageSize = 20 } = req.query;

    const filters = {
      status,
      lecturerId,
      academicYear,
      search,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    };

    const data = await monitoringService.getThesesList(filters);
    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get filter options for monitoring page
 * @route GET /api/thesis-guidance/monitoring/filters
 */
export async function getFilterOptions(req, res, next) {
  try {
    const data = await monitoringService.getFilterOptions();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get at-risk students list
 * @route GET /api/thesis-guidance/monitoring/at-risk
 */
export async function getAtRiskStudents(req, res, next) {
  try {
    const { academicYear } = req.query;
    const data = await monitoringService.getAtRiskStudentsFull(academicYear);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get slow students list
 * @route GET /api/thesis-guidance/monitoring/slow
 */
export async function getSlowStudents(req, res, next) {
  try {
    const { academicYear } = req.query;
    const data = await monitoringService.getSlowStudentsFull(academicYear);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get students ready for seminar list
 * @route GET /api/thesis-guidance/monitoring/ready-seminar
 */
export async function getStudentsReadyForSeminar(req, res, next) {
  try {
    const { academicYear } = req.query;
    const data = await monitoringService.getStudentsReadyForSeminarFull(academicYear);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get lecturer supervision workload list
 * @route GET /api/thesis-guidance/monitoring/supervisor-loads
 */
export async function getSupervisorWorkloads(req, res, next) {
  try {
    const { academicYear } = parseAcademicYearQuery(req.query);
    const data = await monitoringService.getSupervisorWorkloads(academicYear);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get thesis detail by ID
 * @route GET /api/thesis-guidance/monitoring/theses/:thesisId
 */
export async function getThesisDetail(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await monitoringService.getThesisDetail(thesisId);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Send warning notification to student
 * @route POST /api/thesis-guidance/monitoring/theses/:thesisId/send-warning
 */
export async function sendWarningNotification(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { warningType } = req.body;
    const result = await monitoringService.sendWarningNotificationService(req.user.sub, thesisId, warningType);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Send batch warning notifications to students
 * @route POST /api/thesis-guidance/monitoring/batch-warning
 */
export async function sendBatchWarnings(req, res, next) {
  try {
    const { thesisIds, warningType } = req.body;
    const result = await monitoringService.sendBatchWarningNotificationService(req.user.sub, thesisIds, warningType);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get progress report data for PDF generation
 * @route GET /api/thesis-guidance/monitoring/report
 */
export async function getProgressReport(req, res, next) {
  try {
    const { academicYear, statusIds, ratings } = req.query;
    const options = {
      academicYearId: academicYear,
      statusIds: Array.isArray(statusIds) ? statusIds : (statusIds ? statusIds.split(",") : []),
      ratings: Array.isArray(ratings) ? ratings : (ratings ? ratings.split(",") : []),
    };
    const data = await monitoringService.getProgressReportService(options);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Download progress report as PDF (server-side generation via Gotenberg)
 * @route GET /api/thesis-guidance/monitoring/report/download
 */
export async function downloadProgressReport(req, res, next) {
  try {
    const { academicYear, statusIds, ratings } = req.query;
    const options = {
      academicYearId: academicYear,
      statusIds: Array.isArray(statusIds) ? statusIds : (statusIds ? statusIds.split(",") : []),
      ratings: Array.isArray(ratings) ? ratings : (ratings ? ratings.split(",") : []),
    };
    const result = await monitoringService.generateProgressReportPdfService(options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
}

// ==================== KADEP TRANSFER APPROVAL ====================

/**
 * Get pending transfer requests for Kadep
 * @route GET /api/thesis-guidance/monitoring/transfers/pending
 */
export async function getKadepPendingTransfers(req, res, next) {
  try {
    const result = await getKadepPendingTransfersService(req.user.sub);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all transfer requests for Kadep (with pagination for history)
 * @route GET /api/thesis-guidance/monitoring/transfers/all
 */
export async function getKadepAllTransfers(req, res, next) {
  try {
    const { page = 1, pageSize = 10, search = "", status = "" } = req.query;
    const result = await getKadepAllTransfersService(req.user.sub, {
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      status,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Kadep approves a transfer request
 * @route PATCH /api/thesis-guidance/monitoring/transfers/:notificationId/approve
 */
export async function kadepApproveTransfer(req, res, next) {
  try {
    const { notificationId } = req.params;
    const result = await kadepApproveTransferService(req.user.sub, notificationId);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Kadep rejects a transfer request
 * @route PATCH /api/thesis-guidance/monitoring/transfers/:notificationId/reject
 */
export async function kadepRejectTransfer(req, res, next) {
  try {
    const { notificationId } = req.params;
    const { reason } = req.body || {};
    const result = await kadepRejectTransferService(req.user.sub, notificationId, { reason });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Download supervisor transfer history report as PDF
 * @route GET /api/thesis-guidance/monitoring/transfers/report/download
 */
export async function downloadTransferReport(req, res, next) {
  try {
    const result = await monitoringService.generateTransferReportPdfService();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
}
