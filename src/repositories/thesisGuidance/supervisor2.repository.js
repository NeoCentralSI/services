import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

/**
 * Get available lecturers for Pembimbing 2 (excludes current supervisors)
 */
export async function findAvailableSupervisor2Lecturers(thesisId) {
	// Get current thesis participants (supervisors already assigned)
	const currentParticipants = await prisma.thesisParticipant.findMany({
		where: { thesisId },
		select: { lecturerId: true },
	});
	const excludeIds = currentParticipants.map((p) => p.lecturerId);

	// Find lecturers who have Pembimbing 2 role (active)
	const pembimbing2Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) return [];

	const lecturers = await prisma.lecturer.findMany({
		where: {
			id: { notIn: excludeIds },
			user: {
				userHasRoles: {
					some: {
						roleId: pembimbing2Role.id,
						status: "active",
					},
				},
			},
		},
		include: {
			user: {
				select: { id: true, fullName: true, email: true, identityNumber: true },
			},
			scienceGroup: { select: { name: true } },
		},
		orderBy: { user: { fullName: "asc" } },
	});

	return lecturers.map((l) => ({
		id: l.id,
		fullName: l.user?.fullName || null,
		email: l.user?.email || null,
		identityNumber: l.user?.identityNumber || null,
		scienceGroup: l.scienceGroup?.name || null,
	}));
}

/**
 * Check if student already has Pembimbing 2
 */
export async function hasPembimbing2(thesisId) {
	const pembimbing2Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) return false;

	const existing = await prisma.thesisParticipant.findFirst({
		where: { thesisId, roleId: pembimbing2Role.id },
	});
	return !!existing;
}

/**
 * Check if there's already a pending request for Pembimbing 2
 */
export async function findPendingSupervisor2Request(thesisId) {
	return prisma.notification.findFirst({
		where: {
			title: "REQUEST_SUPERVISOR_2",
			isRead: false,
			message: { contains: thesisId },
		},
		orderBy: { createdAt: "desc" },
	});
}

/**
 * Create a Pembimbing 2 request notification for the lecturer
 * Message format kept short to fit VARCHAR(191): "thesisId|studentId"
 */
export async function createSupervisor2Request({ lecturerId, thesisId, studentId }) {
	return prisma.notification.create({
		data: {
			userId: lecturerId,
			title: "REQUEST_SUPERVISOR_2",
			message: `${thesisId}|${studentId}`,
			isRead: false,
		},
	});
}

/**
 * Find a pending Pembimbing 2 request notification by ID
 */
export async function findSupervisor2RequestById(requestId, lecturerId) {
	return prisma.notification.findFirst({
		where: {
			id: requestId,
			userId: lecturerId,
			title: "REQUEST_SUPERVISOR_2",
			isRead: false,
		},
	});
}

/**
 * Mark a Pembimbing 2 request notification as read (processed)
 */
export async function markSupervisor2RequestProcessed(requestId) {
	return prisma.notification.update({
		where: { id: requestId },
		data: { isRead: true },
	});
}

/**
 * Create ThesisParticipant record for Pembimbing 2
 */
export async function createThesisParticipant(thesisId, lecturerId) {
	const pembimbing2Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) {
		const err = new Error("Role Pembimbing 2 not found in database");
		err.statusCode = 500;
		throw err;
	}

	return prisma.thesisParticipant.create({
		data: {
			thesisId,
			lecturerId,
			roleId: pembimbing2Role.id,
		},
	});
}

/**
 * Get all pending Pembimbing 2 requests for a lecturer
 */
export async function findPendingSupervisor2RequestsForLecturer(lecturerId) {
	return prisma.notification.findMany({
		where: {
			userId: lecturerId,
			title: "REQUEST_SUPERVISOR_2",
			isRead: false,
		},
		orderBy: { createdAt: "desc" },
	});
}

/**
 * Count completed theses as Pembimbing 2 (thesis status = "Selesai")
 */
export async function countCompletedAsSupervisor2(lecturerId) {
	const pembimbing2Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) return 0;

	const selesaiStatus = await prisma.thesisStatus.findFirst({
		where: { name: "Selesai" },
		select: { id: true },
	});
	if (!selesaiStatus) return 0;

	const count = await prisma.thesisParticipant.count({
		where: {
			lecturerId,
			roleId: pembimbing2Role.id,
			thesis: {
				thesisStatusId: selesaiStatus.id,
			},
		},
	});
	return count;
}

/**
 * Check if lecturer already has Pembimbing 1 role
 */
export async function hasPembimbing1Role(lecturerId) {
	const pembimbing1Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_1 },
		select: { id: true },
	});
	if (!pembimbing1Role) return false;

	const existing = await prisma.userHasRole.findFirst({
		where: {
			userId: lecturerId,
			roleId: pembimbing1Role.id,
		},
	});
	return !!existing;
}

/**
 * Add Pembimbing 1 role to a lecturer
 */
export async function addPembimbing1Role(lecturerId) {
	const pembimbing1Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_1 },
		select: { id: true },
	});
	if (!pembimbing1Role) return null;

	// Upsert to prevent duplicate
	return prisma.userHasRole.upsert({
		where: {
			userId_roleId: {
				userId: lecturerId,
				roleId: pembimbing1Role.id,
			},
		},
		create: {
			userId: lecturerId,
			roleId: pembimbing1Role.id,
			status: "active",
		},
		update: {},
	});
}
