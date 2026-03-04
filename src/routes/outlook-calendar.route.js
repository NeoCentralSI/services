// src/routes/outlook-calendar.route.js
import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { 
  checkCalendarAccess, 
  getUserCalendarEvents,
  reconnectCalendar,
} from "../controllers/outlook-calendar.controller.js";

const router = Router();

// Check if user has calendar access
router.get("/status", authGuard, checkCalendarAccess);

// Get reconnect URL for re-authenticating calendar access
router.get("/reconnect", authGuard, reconnectCalendar);

// Get user's calendar events
router.get("/events", authGuard, getUserCalendarEvents);

export default router;
