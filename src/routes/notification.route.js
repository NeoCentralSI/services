import express from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import {
	getNotifications,
	getUnreadCountController,
	markNotificationRead,
	markAllRead,
	deleteNotification,
	deleteAllNotifications,
	registerFcm,
	unregisterFcm,
	checkThesisDeletionController,
} from "../controllers/notification.controller.js";

const router = express.Router();

// All notification routes require authentication
router.use(authGuard);

// GET /notification - Get user's notifications
router.get("/", getNotifications);

// GET /notification/unread-count - Get unread count
router.get("/unread-count", getUnreadCountController);

// GET /notification/check-thesis-deleted - Check if student has thesis deletion notification
router.get("/check-thesis-deleted", checkThesisDeletionController);

// PATCH /notification/read-all - Mark all as read
router.patch("/read-all", markAllRead);

// DELETE /notification/all - Delete all notifications (must be before /:id)
router.delete("/all", deleteAllNotifications);

// PATCH /notification/:id/read - Mark notification as read
router.patch("/:id/read", markNotificationRead);

// DELETE /notification/:id - Delete notification
router.delete("/:id", deleteNotification);

// FCM endpoints
router.post("/fcm/register", registerFcm);
router.delete("/fcm/unregister", unregisterFcm);

export default router;
