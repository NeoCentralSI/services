import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

/**
 * Get available lecturers for Pembimbing 2 (excludes current supervisors)
 */
export async function findAvailableSupervisor2Lecturers(thesisId) {
	// Get current thesis participants (supervisors already assigned)
	const currentParticipants = await prisma.thesisSupervisors.findMany({
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
	const existing = await prisma.thesisSupervisors.findFirst({
		where: {
			thesisId,
			status: "active",
			role: { is: { name: ROLES.PEMBIMBING_2 } },
		},
	});
	return !!existing;
}

/**
 * Check if a thesis already has an active Pembimbing 1 assigned.
 * (Berbeda dari hasPembimbing1Role yang mengecek role akun dosen.)
 */
export async function hasPembimbing1(thesisId) {
	const existing = await prisma.thesisSupervisors.findFirst({
		where: {
			thesisId,
			status: "active",
			role: { is: { name: ROLES.PEMBIMBING_1 } },
		},
	});
	return !!existing;
}

/**
 * Internal state-tracking titles untuk alur Pembimbing 2 (dua tahap):
 * - REQUEST_SUPERVISOR_2        → menunggu kesediaan dosen target
 * - REQUEST_SUPERVISOR_2_KADEP  → dosen bersedia, menunggu persetujuan KaDep
 * Keduanya disembunyikan dari feed notifikasi user (lihat notification.repository.js).
 */
export const SUPERVISOR2_STAGE_TITLES = {
	LECTURER: "REQUEST_SUPERVISOR_2",
	KADEP: "REQUEST_SUPERVISOR_2_KADEP",
};

/**
 * Check if there's already a pending request for Pembimbing 2 (tahap mana pun).
 */
export async function findPendingSupervisor2Request(thesisId) {
	return prisma.notification.findFirst({
		where: {
			title: { in: [SUPERVISOR2_STAGE_TITLES.LECTURER, SUPERVISOR2_STAGE_TITLES.KADEP] },
			isRead: false,
			message: { startsWith: `${thesisId}|` },
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
			title: SUPERVISOR2_STAGE_TITLES.LECTURER,
			message: `${thesisId}|${studentId}`,
			isRead: false,
		},
	});
}

/**
 * Create tahap-2 record (menunggu KaDep). Message: "thesisId|studentId|lecturerId".
 * Optional `client` untuk dipakai dalam prisma.$transaction.
 */
export async function createSupervisor2KadepRequest(
	{ kadepUserId, thesisId, studentId, lecturerId },
	client = prisma,
) {
	return client.notification.create({
		data: {
			userId: kadepUserId,
			title: SUPERVISOR2_STAGE_TITLES.KADEP,
			message: `${thesisId}|${studentId}|${lecturerId}`,
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
			title: SUPERVISOR2_STAGE_TITLES.LECTURER,
			isRead: false,
		},
	});
}

/**
 * Find a pending tahap-KaDep request by ID (scoped ke akun KaDep pemanggil).
 */
export async function findSupervisor2KadepRequestById(requestId, kadepUserId) {
	return prisma.notification.findFirst({
		where: {
			id: requestId,
			userId: kadepUserId,
			title: SUPERVISOR2_STAGE_TITLES.KADEP,
			isRead: false,
		},
	});
}

/**
 * Get all pending tahap-KaDep requests for a KaDep user.
 */
export async function findPendingSupervisor2KadepRequests(kadepUserId) {
	return prisma.notification.findMany({
		where: {
			userId: kadepUserId,
			title: SUPERVISOR2_STAGE_TITLES.KADEP,
			isRead: false,
		},
		orderBy: { createdAt: "desc" },
	});
}

/**
 * Tutup SEMUA record request P2 (kedua tahap) untuk satu thesis — dipakai saat
 * keputusan final (approve/reject KaDep) atau pembatalan mahasiswa, supaya tidak
 * ada record tahap lain yang tersisa menggantung.
 */
export async function markSupervisor2RequestsProcessedForThesis(thesisId, client = prisma) {
	return client.notification.updateMany({
		where: {
			title: { in: [SUPERVISOR2_STAGE_TITLES.LECTURER, SUPERVISOR2_STAGE_TITLES.KADEP] },
			isRead: false,
			message: { startsWith: `${thesisId}|` },
		},
		data: { isRead: true },
	});
}

/**
 * Mark a Pembimbing 2 request notification as read (processed).
 * Optional `client` lets caller run this inside a prisma.$transaction.
 */
export async function markSupervisor2RequestProcessed(requestId, client = prisma) {
	return client.notification.update({
		where: { id: requestId },
		data: { isRead: true },
	});
}

/**
 * Create ThesisSupervisors record for Pembimbing 2.
 * Optional `client` lets caller run this inside a prisma.$transaction.
 */
export async function createThesisSupervisors(thesisId, lecturerId, client = prisma) {
	const pembimbing2Role = await client.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) {
		const err = new Error("Role Pembimbing 2 tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	return client.thesisSupervisors.create({
		data: {
			thesisId,
			lecturerId,
			roleId: pembimbing2Role.id,
			status: "active",
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
			title: SUPERVISOR2_STAGE_TITLES.LECTURER,
			isRead: false,
		},
		orderBy: { createdAt: "desc" },
	});
}

// Auto-promotion P2→P1 DIHAPUS (audit pass 2 F2-4, keputusan OQ-2.1 2026-06-10):
// kebijakan role akademik adalah wewenang departemen (KaDep/Admin), bukan
// hitungan otomatis sistem. Helper countCompletedAsSupervisor2 /
// hasPembimbing1Role / addPembimbing1Role sengaja tidak disediakan lagi.
