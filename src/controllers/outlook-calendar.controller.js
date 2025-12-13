// src/controllers/outlook-calendar.controller.js
import { hasCalendarAccess, getCalendarEvents } from "../services/outlook-calendar.service.js";

/**
 * Check if current user has calendar access (Microsoft account connected)
 */
export async function checkCalendarAccess(req, res, next) {
  try {
    const userId = req.user.sub;
    const hasAccess = await hasCalendarAccess(userId);
    
    res.json({
      success: true,
      hasCalendarAccess: hasAccess,
      message: hasAccess 
        ? "Calendar sync is enabled" 
        : "Please connect your Microsoft account to enable calendar sync",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's calendar events for a date range
 */
export async function getUserCalendarEvents(req, res, next) {
  try {
    const userId = req.user.sub;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      const err = new Error("startDate and endDate query parameters are required");
      err.statusCode = 400;
      throw err;
    }
    
    const events = await getCalendarEvents(
      userId,
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    next(error);
  }
}
