import express from "express";
import * as holidayController from "../../controllers/insternship/holiday.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes require authentication
router.use(authGuard);

/**
 * @route GET /insternship/holidays
 * @desc Get all holidays (optional ?year=2026)
 */
router.get("/", holidayController.getHolidays);

// Write routes require Admin role
router.use(requireRole(ROLES.ADMIN));

/**
 * @route POST /insternship/holidays
 * @desc Create a single holiday
 */
router.post("/", holidayController.createHoliday);

/**
 * @route POST /insternship/holidays/bulk
 * @desc Create multiple holidays at once
 */
router.post("/bulk", holidayController.createManyHolidays);

/**
 * @route PATCH /insternship/holidays/:id
 * @desc Update a holiday
 */
router.patch("/:id", holidayController.updateHoliday);

/**
 * @route DELETE /insternship/holidays/:id
 * @desc Delete a holiday
 */
router.delete("/:id", holidayController.deleteHoliday);

export default router;
