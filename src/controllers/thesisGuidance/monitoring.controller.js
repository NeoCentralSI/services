import * as monitoringService from "../../services/thesisGuidance/monitoring.service.js";
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
    const { status, lecturerId, topicId, academicYear, search, page = 1, pageSize = 20 } = req.query;

    const filters = {
      status,
      lecturerId,
      topicId,
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
    // The warning level is derived from the thesis; `warningType` in the body is ignored.
    const result = await monitoringService.sendWarningNotificationService(req.user.sub, thesisId);
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
    // The warning level is derived per thesis; `warningType` in the body is ignored.
    const { thesisIds } = req.body;
    const result = await monitoringService.sendBatchWarningNotificationService(req.user.sub, thesisIds);
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
    const { academicYear, statusIds, activityLevels } = req.query;
    const options = {
      academicYearId: academicYear,
      statusIds: Array.isArray(statusIds) ? statusIds : (statusIds ? statusIds.split(",") : []),
      activityLevels: Array.isArray(activityLevels) ? activityLevels : (activityLevels ? activityLevels.split(",") : []),
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
    const { academicYear, statusIds, activityLevels } = req.query;
    const options = {
      academicYearId: academicYear,
      statusIds: Array.isArray(statusIds) ? statusIds : (statusIds ? statusIds.split(",") : []),
      activityLevels: Array.isArray(activityLevels) ? activityLevels : (activityLevels ? activityLevels.split(",") : []),
    };
    const result = await monitoringService.generateProgressReportPdfService(options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    res.send(result.buffer);
  } catch (error) {
    // The service answers 503 with a message written for the user (PDF converter not
    // running). The global error handler replaces the message of every 5xx, so this one is
    // sent here.
    if (error?.statusCode === 503) {
      res.status(503).json({ success: false, status: 503, message: error.message });
      return;
    }
    next(error);
  }
}
