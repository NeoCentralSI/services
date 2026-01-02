import {
	findNotificationsByUserId,
	countUnreadNotifications,
	markNotificationAsRead,
	markAllNotificationsAsRead,
	createNotification,
	createNotificationsMany,
	deleteNotification,
	deleteAllNotifications,
} from "../repositories/notification.repository.js";

/**
 * Get user's notifications
 * @param {string} userId
 * @param {object} options
 */
export async function getUserNotifications(userId, options = {}) {
	const notifications = await findNotificationsByUserId(userId, options);
	const unreadCount = await countUnreadNotifications(userId);

	return {
		notifications,
		unreadCount,
		total: notifications.length,
	};
}

/**
 * Get unread count only
 * @param {string} userId
 */
export async function getUnreadCount(userId) {
	const count = await countUnreadNotifications(userId);
	return { unreadCount: count };
}

/**
 * Mark notification as read
 * @param {string} notificationId
 * @param {string} userId
 */
export async function markAsRead(notificationId, userId) {
	const result = await markNotificationAsRead(notificationId, userId);
	if (result.count === 0) {
		const err = new Error("Notification not found or already read");
		err.statusCode = 404;
		throw err;
	}
	return { success: true };
}

/**
 * Mark all notifications as read
 * @param {string} userId
 */
export async function markAllAsRead(userId) {
	const result = await markAllNotificationsAsRead(userId);
	return { success: true, marked: result.count };
}

/**
 * Create a notification
 * @param {object} data
 */
export async function createNotificationService(data) {
	const notification = await createNotification(data);
	return { notification };
}

/**
 * Create notifications for multiple userIds
 * @param {string[]} userIds
 * @param {{ title?: string, message?: string }} payload
 */
export async function createNotificationsForUsers(userIds = [], { title = "", message = "" } = {}) {
	const data = (userIds || [])
		.filter(Boolean)
		.map((userId) => ({ userId, title, message }));
	if (!data.length) return { count: 0 };
	const result = await createNotificationsMany(data);
	return { count: result.count || 0 };
}

/**
 * Delete a notification
 * @param {string} notificationId
 * @param {string} userId
 */
export async function deleteNotificationService(notificationId, userId) {
	const result = await deleteNotification(notificationId, userId);
	if (result.count === 0) {
		const err = new Error("Notification not found");
		err.statusCode = 404;
		throw err;
	}
	return { success: true };
}

/**
 * Delete all notifications for a user
 * @param {string} userId
 */
export async function deleteAllNotificationsService(userId) {
	const result = await deleteAllNotifications(userId);
	return { success: true, deleted: result.count };
}

