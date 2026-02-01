import {
	getUserNotifications,
	getUnreadCount,
	markAsRead,
	markAllAsRead,
	deleteNotificationService,
	deleteAllNotificationsService,
	checkThesisDeletionNotification,
} from "../services/notification.service.js";
import { registerFcmToken, unregisterFcmToken } from "../services/push.service.js";

/**
 * GET /notification - Get user's notifications
 */
export async function getNotifications(req, res, next) {
	try {
		const userId = req.user.sub;
		const { limit, offset, onlyUnread } = req.query;

		const options = {
			limit: limit ? parseInt(limit) : 20,
			offset: offset ? parseInt(offset) : 0,
			onlyUnread: onlyUnread === "true",
		};

		const result = await getUserNotifications(userId, options);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /notification/unread-count - Get unread count
 */
export async function getUnreadCountController(req, res, next) {
	try {
		const userId = req.user.sub;
		const result = await getUnreadCount(userId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /notification/:id/read - Mark notification as read
 */
export async function markNotificationRead(req, res, next) {
	try {
		const userId = req.user.sub;
		const { id } = req.params;

		const result = await markAsRead(id, userId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * PATCH /notification/read-all - Mark all as read
 */
export async function markAllRead(req, res, next) {
	try {
		const userId = req.user.sub;
		const result = await markAllAsRead(userId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * DELETE /notification/:id - Delete notification
 */
export async function deleteNotification(req, res, next) {
	try {
		const userId = req.user.sub;
		const { id } = req.params;

		const result = await deleteNotificationService(id, userId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * DELETE /notification - Delete all notifications
 */
export async function deleteAllNotifications(req, res, next) {
	try {
		const userId = req.user.sub;
		const result = await deleteAllNotificationsService(userId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * POST /notification/fcm/register - Register FCM token for this user
 */
export async function registerFcm(req, res, next) {
	try {
		const userId = req.user.sub;
		const { token } = req.body || {};
		if (!token) {
			const e = new Error("token is required");
			e.statusCode = 400;
			throw e;
		}
		const masked = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-6)}` : token;
		console.log(`[FCM] register token user=${userId} token=${masked}`);
		const result = await registerFcmToken(userId, token);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * DELETE /notification/fcm/unregister - Unregister FCM token for this user
 */
export async function unregisterFcm(req, res, next) {
	try {
		const userId = req.user.sub;
		const { token } = req.body || {};
		if (!token) {
			const e = new Error("token is required");
			e.statusCode = 400;
			throw e;
		}
		const masked = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-6)}` : token;
		console.log(`[FCM] unregister token user=${userId} token=${masked}`);
		const result = await unregisterFcmToken(userId, token);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /notification/check-thesis-deleted - Check if student has thesis deletion notification
 * Used to show "please re-register" message on frontend
 */
export async function checkThesisDeletionController(req, res, next) {
	try {
		const userId = req.user.sub;
		const result = await checkThesisDeletionNotification(userId);
		res.json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

