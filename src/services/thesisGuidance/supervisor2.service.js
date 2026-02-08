import {
	findAvailableSupervisor2Lecturers,
	hasPembimbing2,
	findPendingSupervisor2Request,
	createSupervisor2Request,
	findSupervisor2RequestById,
	markSupervisor2RequestProcessed,
	createThesisParticipant,
	findPendingSupervisor2RequestsForLecturer,
	countCompletedAsSupervisor2,
	hasPembimbing1Role,
	addPembimbing1Role,
} from "../../repositories/thesisGuidance/supervisor2.repository.js";

import {
	getStudentByUserId,
	getActiveThesisForStudent,
} from "../../repositories/thesisGuidance/student.guidance.repository.js";

import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { toTitleCaseName } from "../../utils/global.util.js";
import { ROLES } from "../../constants/roles.js";

const PROMOTE_THRESHOLD = 10;

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureStudent(student) {
	if (!student) {
		const err = new Error("Student profile not found for this user");
		err.statusCode = 404;
		throw err;
	}
}

async function getActiveThesisOrThrow(userId) {
	const student = await getStudentByUserId(userId);
	ensureStudent(student);
	const thesis = await getActiveThesisForStudent(student.id);
	if (!thesis) {
		const err = new Error("Active thesis not found for this student");
		err.statusCode = 404;
		throw err;
	}
	return { student, thesis };
}

// ─── Student services ───────────────────────────────────────────────────────

/**
 * Get available lecturers who can be selected as Pembimbing 2
 */
export async function getAvailableSupervisor2Service(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);

	// Check if student already has Pembimbing 2
	const alreadyHas = await hasPembimbing2(thesis.id);
	if (alreadyHas) {
		const err = new Error("Anda sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	const lecturers = await findAvailableSupervisor2Lecturers(thesis.id);
	return lecturers;
}

/**
 * Student requests a Pembimbing 2
 */
export async function requestSupervisor2Service(userId, { lecturerId }) {
	const { student, thesis } = await getActiveThesisOrThrow(userId);

	// 1. Check if student already has Pembimbing 2
	const alreadyHas = await hasPembimbing2(thesis.id);
	if (alreadyHas) {
		const err = new Error("Anda sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	// 2. Check for pending request
	const pendingRequest = await findPendingSupervisor2Request(thesis.id);
	if (pendingRequest) {
		const err = new Error("Anda sudah memiliki permintaan Pembimbing 2 yang menunggu konfirmasi");
		err.statusCode = 400;
		throw err;
	}

	// 3. Validate that lecturerId is a valid lecturer with Pembimbing 2 role
	const availableLecturers = await findAvailableSupervisor2Lecturers(thesis.id);
	const selectedLecturer = availableLecturers.find((l) => l.id === lecturerId);
	if (!selectedLecturer) {
		const err = new Error("Dosen yang dipilih tidak tersedia sebagai Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	// 4. Get student name and thesis title for notification
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { fullName: true },
	});
	const studentName = user?.fullName || "Mahasiswa";
	const thesisTitle = thesis.title || "Tugas Akhir";

	// 5. Create request notification for the lecturer (lecturerId === userId for lecturer)
	const request = await createSupervisor2Request({
		lecturerId,
		thesisId: thesis.id,
		studentId: student.id,
	});

	// 6. Send FCM to the lecturer
	await sendFcmToUsers([lecturerId], {
		title: "Permintaan Pembimbing 2",
		body: `${toTitleCaseName(studentName)} mengajukan Anda sebagai Pembimbing 2 untuk tugas akhir "${thesisTitle}"`,
		data: {
			type: "supervisor2_request",
			requestId: request.id,
			thesisId: thesis.id,
		},
		dataOnly: true,
	});

	// 7. Also create a regular notification for the lecturer
	await createNotificationsForUsers([lecturerId], {
		title: "Permintaan Pembimbing 2",
		message: `${toTitleCaseName(studentName)} mengajukan Anda sebagai Pembimbing 2 untuk tugas akhir "${thesisTitle}"`,
	});

	return {
		requestId: request.id,
		lecturerName: selectedLecturer.fullName,
	};
}

/**
 * Student checks their pending Pembimbing 2 request status
 */
export async function getPendingSupervisor2RequestService(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);
	const pending = await findPendingSupervisor2Request(thesis.id);
	if (!pending) return null;

	// Get lecturer name
	const lecturer = await prisma.user.findUnique({
		where: { id: pending.userId },
		select: { fullName: true },
	});
	return {
		requestId: pending.id,
		lecturerId: pending.userId,
		lecturerName: lecturer ? toTitleCaseName(lecturer.fullName) : null,
		requestedAt: pending.createdAt,
	};
}

/**
 * Student cancels their pending Pembimbing 2 request
 */
export async function cancelSupervisor2RequestService(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);
	const pending = await findPendingSupervisor2Request(thesis.id);
	if (!pending) {
		const err = new Error("Tidak ada permintaan Pembimbing 2 yang aktif");
		err.statusCode = 404;
		throw err;
	}

	await markSupervisor2RequestProcessed(pending.id);
	return { success: true };
}

// ─── Lecturer services ──────────────────────────────────────────────────────

/**
 * Get pending Pembimbing 2 requests for lecturer
 */
export async function getSupervisor2RequestsService(lecturerId) {
	const requests = await findPendingSupervisor2RequestsForLecturer(lecturerId);

	const parsed = [];
	for (const req of requests) {
		// Message format: "thesisId|studentId"
		const parts = (req.message || "").split("|");
		if (parts.length < 2) continue;
		const [thesisId, studentId] = parts;

		// Get student's user info and thesis title
		const [studentUser, thesis] = await Promise.all([
			prisma.user.findUnique({
				where: { id: studentId },
				select: { fullName: true, email: true, identityNumber: true },
			}),
			prisma.thesis.findUnique({
				where: { id: thesisId },
				select: { title: true },
			}),
		]);

		parsed.push({
			requestId: req.id,
			thesisId,
			studentId,
			studentName: studentUser ? toTitleCaseName(studentUser.fullName) : "Mahasiswa",
			studentEmail: studentUser?.email || null,
			studentNim: studentUser?.identityNumber || null,
			thesisTitle: thesis?.title || "Tugas Akhir",
			requestedAt: req.createdAt,
		});
	}

	return parsed;
}

/**
 * Approve a Pembimbing 2 request
 */
export async function approveSupervisor2RequestService(lecturerId, requestId) {
	// 1. Find the request
	const request = await findSupervisor2RequestById(requestId, lecturerId);
	if (!request) {
		const err = new Error("Permintaan tidak ditemukan atau sudah diproses");
		err.statusCode = 404;
		throw err;
	}

	// 2. Parse request data — format: "thesisId|studentId"
	const parts = (request.message || "").split("|");
	if (parts.length < 2) {
		const err = new Error("Data permintaan tidak valid");
		err.statusCode = 400;
		throw err;
	}
	const [thesisId, studentId] = parts;

	// 3. Check if thesis already has pembimbing 2
	const alreadyHas = await hasPembimbing2(thesisId);
	if (alreadyHas) {
		await markSupervisor2RequestProcessed(requestId);
		const err = new Error("Mahasiswa sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	// 4. Create ThesisParticipant
	await createThesisParticipant(thesisId, lecturerId);

	// 5. Mark request as processed
	await markSupervisor2RequestProcessed(requestId);

	// 6. Get lecturer name for notification
	const lecturerUser = await prisma.user.findUnique({
		where: { id: lecturerId },
		select: { fullName: true },
	});
	const lecturerName = lecturerUser ? toTitleCaseName(lecturerUser.fullName) : "Dosen";

	// 7. Send notification & FCM to student
	await createNotificationsForUsers([studentId], {
		title: "Pembimbing 2 Disetujui",
		message: `${lecturerName} telah menyetujui menjadi Pembimbing 2 untuk tugas akhir Anda.`,
	});

	await sendFcmToUsers([studentId], {
		title: "Pembimbing 2 Disetujui",
		body: `${lecturerName} telah menyetujui menjadi Pembimbing 2 untuk tugas akhir Anda.`,
		data: { type: "supervisor2_approved", thesisId },
		dataOnly: true,
	});

	return { success: true, lecturerName };
}

/**
 * Reject a Pembimbing 2 request
 */
export async function rejectSupervisor2RequestService(lecturerId, requestId, { reason }) {
	// 1. Find the request
	const request = await findSupervisor2RequestById(requestId, lecturerId);
	if (!request) {
		const err = new Error("Permintaan tidak ditemukan atau sudah diproses");
		err.statusCode = 404;
		throw err;
	}

	// 2. Parse request data — format: "thesisId|studentId"
	const parts = (request.message || "").split("|");
	if (parts.length < 2) {
		const err = new Error("Data permintaan tidak valid");
		err.statusCode = 400;
		throw err;
	}
	const [thesisId, studentId] = parts;

	// 3. Mark request as processed
	await markSupervisor2RequestProcessed(requestId);

	// 4. Get lecturer name for notification
	const lecturerUser = await prisma.user.findUnique({
		where: { id: lecturerId },
		select: { fullName: true },
	});
	const lecturerName = lecturerUser ? toTitleCaseName(lecturerUser.fullName) : "Dosen";

	// 5. Send rejection notification & FCM to student
	const reasonText = reason ? `. Alasan: ${reason}` : "";
	await createNotificationsForUsers([studentId], {
		title: "Pembimbing 2 Ditolak",
		message: `${lecturerName} menolak permintaan menjadi Pembimbing 2 untuk tugas akhir Anda${reasonText}`,
	});

	await sendFcmToUsers([studentId], {
		title: "Pembimbing 2 Ditolak",
		body: `${lecturerName} menolak permintaan menjadi Pembimbing 2 untuk tugas akhir Anda${reasonText}`,
		data: { type: "supervisor2_rejected", thesisId },
		dataOnly: true,
	});

	return { success: true };
}

// ─── Auto-promote Pembimbing 2 → Pembimbing 1 ──────────────────────────────

/**
 * Check and auto-promote a lecturer from Pembimbing 2 to Pembimbing 1
 * Called after a thesis status is changed to "Selesai"
 * Threshold: 10 completed theses as Pembimbing 2
 */
export async function checkAndPromoteSupervisor(lecturerId) {
	// 1. Skip if already has Pembimbing 1 role
	const alreadyHas = await hasPembimbing1Role(lecturerId);
	if (alreadyHas) return { promoted: false, reason: "already_has_role" };

	// 2. Count completed theses as Pembimbing 2
	const count = await countCompletedAsSupervisor2(lecturerId);
	if (count < PROMOTE_THRESHOLD) {
		return { promoted: false, reason: "below_threshold", count, threshold: PROMOTE_THRESHOLD };
	}

	// 3. Add Pembimbing 1 role
	await addPembimbing1Role(lecturerId);

	// 4. Notify the lecturer
	await createNotificationsForUsers([lecturerId], {
		title: "Role Pembimbing 1 Ditambahkan",
		message: `Selamat! Anda telah membimbing ${count} mahasiswa sebagai Pembimbing 2 yang berhasil menyelesaikan tugas akhir. Anda kini memiliki role Pembimbing 1.`,
	});

	await sendFcmToUsers([lecturerId], {
		title: "Role Pembimbing 1 Ditambahkan",
		body: `Selamat! Anda kini memiliki role Pembimbing 1 setelah membimbing ${count} mahasiswa yang menyelesaikan tugas akhir.`,
		data: { type: "role_promotion" },
		dataOnly: true,
	});

	return { promoted: true, count };
}

/**
 * Check all Pembimbing 2 supervisors on a thesis for promotion eligibility
 * Call this when a thesis status changes to "Selesai"
 */
export async function checkPromotionForThesisSupervisors(thesisId) {
	const pembimbing2Role = await prisma.userRole.findFirst({
		where: { name: ROLES.PEMBIMBING_2 },
		select: { id: true },
	});
	if (!pembimbing2Role) return [];

	// Get all Pembimbing 2 on this thesis
	const participants = await prisma.thesisParticipant.findMany({
		where: { thesisId, roleId: pembimbing2Role.id },
		select: { lecturerId: true },
	});

	const results = [];
	for (const p of participants) {
		const result = await checkAndPromoteSupervisor(p.lecturerId);
		results.push({ lecturerId: p.lecturerId, ...result });
	}
	return results;
}
