import * as eventMonitoringService from "../../services/thesisGuidance/thesis-event-monitoring.service.js";
import { parseAcademicYearQuery } from "../../validators/monitoring.validator.js";

/**
 * Seminar Hasil tab of the monitoring page
 * @route GET /api/thesis-guidance/monitoring/seminars
 */
export async function getSeminarMonitoring(req, res, next) {
  try {
    const { academicYear } = parseAcademicYearQuery(req.query);
    const data = await eventMonitoringService.getSeminarMonitoring(academicYear);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Sidang tab of the monitoring page
 * @route GET /api/thesis-guidance/monitoring/defences
 */
export async function getDefenceMonitoring(req, res, next) {
  try {
    const { academicYear } = parseAcademicYearQuery(req.query);
    const data = await eventMonitoringService.getDefenceMonitoring(academicYear);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
