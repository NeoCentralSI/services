import * as monitoringService from "../../services/thesisGuidance/monitoring.service.js";

/**
 * Get monitoring dashboard for management
 * @route GET /api/thesis-guidance/monitoring/dashboard
 */
export async function getMonitoringDashboard(req, res, next) {
  try {
    const { academicYear } = req.query;
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
