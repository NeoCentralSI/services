import { getMyCalendarEvents, getUpcomingEvents, getEventStatistics } from "../services/calendar.service.js";

/**
 * @route GET /calendar/my-events
 * @desc The viewer's events (the service decides from the viewer's records and roles).
 */
export async function getMyCalendarEventsController(req, res, next) {
  try {
    const { startDate, endDate, types } = req.query;
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (types) filters.types = String(types).split(",");
    const result = await getMyCalendarEvents(req.user.sub, null, filters);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * @route GET /calendar/upcoming
 * @desc Agenda Mendatang: events still going on or coming (`limit`, default 5; `days`, default 730).
 */
export async function getUpcomingEventsController(req, res, next) {
  try {
    const days = Number.parseInt(req.query.days, 10) || 730;
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 5, 20);
    const result = await getUpcomingEvents(req.user.sub, null, days, limit);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * @route GET /calendar/statistics
 * @desc Event counts for the dashboard.
 */
export async function getEventStatisticsController(req, res, next) {
  try {
    const stats = await getEventStatistics(req.user.sub, null);
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}
