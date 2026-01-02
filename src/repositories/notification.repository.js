import prisma from "../config/prisma.js";

/**
 * Get all notifications for a user
 * @param {string} userId
 * @param {object} options - { limit, offset, onlyUnread }
 */
export async function findNotificationsByUserId(userId, { limit = 20, offset = 0, onlyUnread = false } = {}) {
	const where = { userId };
	if (onlyUnread) {
		where.isRead = false;
	}

	return await prisma.notification.findMany({
		where,
		orderBy: { createdAt: "desc" },
		take: limit,
		skip: offset,
	});
}

/**
 * Count unread notifications for a user
 * @param {string} userId
 */
export async function countUnreadNotifications(userId) {
	return await prisma.notification.count({
		where: { userId, isRead: false },
	});
}

/**
 * Mark a notification as read
 * @param {string} notificationId
 * @param {string} userId
 */
export async function markNotificationAsRead(notificationId, userId) {
	return await prisma.notification.updateMany({
		where: { id: notificationId, userId },
		data: { isRead: true },
	});
}

/**
 * Mark all notifications as read for a user
 * @param {string} userId
 */
export async function markAllNotificationsAsRead(userId) {
	return await prisma.notification.updateMany({
		where: { userId, isRead: false },
		data: { isRead: true },
	});
}

/**
 * Create a new notification
 * @param {object} data - { userId, title, message }
 */
export async function createNotification(data) {
	return await prisma.notification.create({
		data,
	});
}

/**
 * Create many notifications at once
 * @param {Array<{ userId: string, title?: string, message?: string }>} dataArray
 */
export async function createNotificationsMany(dataArray = []) {
	if (!Array.isArray(dataArray) || dataArray.length === 0) {
		return { count: 0 };
	}
	return await prisma.notification.createMany({
		data: dataArray,
	});
}

/**
 * Delete a notification
 * @param {string} notificationId
 * @param {string} userId
 */
export async function deleteNotification(notificationId, userId) {
	return await prisma.notification.deleteMany({
		where: { id: notificationId, userId },
	});
}

/**
 * Delete all notifications for a user
 * @param {string} userId
 */
export async function deleteAllNotifications(userId) {
	return await prisma.notification.deleteMany({
		where: { userId },
	});
}

