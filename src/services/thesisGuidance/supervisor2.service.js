import {
	findAvailableSupervisor2Lecturers,
	hasPembimbing2,
	hasPembimbing1,
	findPendingSupervisor2Request,
	createSupervisor2Request,
	createSupervisor2KadepRequest,
	findSupervisor2RequestById,
	findSupervisor2KadepRequestById,
	findPendingSupervisor2KadepRequests,
	markSupervisor2RequestProcessed,
	markSupervisor2RequestsProcessedForThesis,
	createThesisSupervisors,
	findPendingSupervisor2RequestsForLecturer,
	SUPERVISOR2_STAGE_TITLES,
} from "../../repositories/thesisGuidance/supervisor2.repository.js";

import {
	getStudentByUserId,
	getActiveThesisForStudent,
} from "../../repositories/thesisGuidance/student.guidance.repository.js";

import { findUsersByActiveRole } from "../../repositories/thesisGuidanceEvaluation.repository.js";

import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { toTitleCaseName } from "../../utils/global.util.js";
import { ROLES } from "../../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../../constants/thesisStatus.js";
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { checkQuotaAvailability, browseLecturerQuotas } from "../quota.service.js";

// Catatan audit pass 2 (F2-4, keputusan OQ-2.1 2026-06-10): auto-promotion role
// Pembimbing 2 → Pembimbing 1 (threshold 10 bimbingan selesai) DIHAPUS.
// Promosi role akademik adalah keputusan manual departemen (KaDep/Admin).

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

/**
 * Hardening: Pembimbing 2 hanya boleh diajukan setelah Pembimbing 1 ditetapkan.
 */
async function ensurePembimbing1Exists(thesisId) {
	const hasP1 = await hasPembimbing1(thesisId);
	if (!hasP1) {
		const err = new Error(
			"Pembimbing 1 belum ditetapkan. Tetapkan Pembimbing 1 terlebih dahulu sebelum mengajukan Pembimbing 2.",
		);
		err.statusCode = 400;
		throw err;
	}
}

/**
 * Guard fase/status (audit pass 2 F2-2): penambahan Pembimbing 2 hanya untuk
 * thesis fase Tugas Akhir (post-TA-04, `isProposal=false`) yang masih berjalan.
 * Fase proposal memakai jalur TA-01/TA-02 + pengesahan TA-04 (canon §5.2, §5.8);
 * thesis yang sudah selesai/ditutup tidak menerima perubahan pembimbing.
 */
function ensureThesisOpenForSupervisor2(thesis) {
	if (!thesis) {
		const err = new Error("Thesis tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}
	if (thesis.isProposal === true) {
		const err = new Error(
			"Pengajuan Pembimbing 2 hanya tersedia setelah TA-04 disahkan (fase Tugas Akhir). Pada fase proposal, penetapan pembimbing mengikuti jalur TA-01/TA-02.",
		);
		err.statusCode = 400;
		throw err;
	}
	const statusName = thesis.thesisStatus?.name ?? null;
	if (statusName && CLOSED_THESIS_STATUSES.includes(statusName)) {
		const err = new Error(
			`Thesis berstatus "${statusName}" sudah ditutup — penambahan Pembimbing 2 tidak tersedia.`,
		);
		err.statusCode = 400;
		throw err;
	}
}

/** Ambil thesis minimal untuk re-validasi pada tahap approve. */
async function getThesisForValidation(thesisId) {
	return prisma.thesis.findUnique({
		where: { id: thesisId },
		select: {
			id: true,
			title: true,
			isProposal: true,
			academicYearId: true,
			proposalStatus: true,
			thesisStatus: { select: { name: true } },
		},
	});
}

/** Re-check kuota dosen (audit pass 2 F2-3) — dipanggil di setiap titik keputusan. */
async function ensureLecturerQuotaAvailable(lecturerId, academicYearId) {
	const quotaResult = await checkQuotaAvailability(lecturerId, academicYearId);
	if (!quotaResult.allowed) {
		const err = new Error(
			quotaResult.reason || "Kuota pembimbing penuh, pilih dosen lain atau tunggu.",
		);
		err.statusCode = 400;
		throw err;
	}
	return quotaResult;
}

/**
 * Lampirkan info kuota yang AMAN ditampilkan ke mahasiswa (canon v2.1 §7.3):
 * hanya trafficLight, sisa normal (normalAvailable), dan beban aktif (activeCount).
 * Sembunyikan booking, pending KaDep, dan overquota (anti-pattern #17).
 */
async function enrichWithQuotaVisibility(lecturers, academicYearId) {
	if (!Array.isArray(lecturers) || lecturers.length === 0) return lecturers;
	let quotaMap = new Map();
	try {
		const quotas = await browseLecturerQuotas(academicYearId);
		quotaMap = new Map(quotas.map((q) => [q.lecturerId, q]));
	} catch {
		// Jika snapshot kuota gagal, tetap kembalikan daftar dosen tanpa info kuota.
	}
	return lecturers.map((l) => {
		const q = quotaMap.get(l.id);
		return {
			...l,
			trafficLight: q?.trafficLight ?? null,
			normalAvailable: q?.normalAvailable ?? null,
			activeCount: q?.activeCount ?? null,
			acceptingRequests: q?.acceptingRequests ?? null,
		};
	});
}

/** Parse message record internal: "thesisId|studentId" atau "thesisId|studentId|lecturerId". */
function parseSupervisor2Message(message) {
	const parts = (message || "").split("|");
	if (parts.length < 2) {
		const err = new Error("Data permintaan tidak valid");
		err.statusCode = 400;
		throw err;
	}
	const [thesisId, studentId, lecturerId = null] = parts;
	return { thesisId, studentId, lecturerId };
}

async function getUserFullName(userId, fallback) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { fullName: true },
	});
	return user?.fullName ? toTitleCaseName(user.fullName) : fallback;
}

// ─── Student services ───────────────────────────────────────────────────────

/**
 * Get available lecturers who can be selected as Pembimbing 2
 */
export async function getAvailableSupervisor2Service(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);

	// Guard fase/status (F2-2) + hardening P1 wajib ada.
	ensureThesisOpenForSupervisor2(thesis);
	await ensurePembimbing1Exists(thesis.id);

	// Check if student already has Pembimbing 2
	const alreadyHas = await hasPembimbing2(thesis.id);
	if (alreadyHas) {
		const err = new Error("Anda sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	const lecturers = await findAvailableSupervisor2Lecturers(thesis.id);
	return enrichWithQuotaVisibility(lecturers, thesis.academicYearId);
}

/**
 * Student requests a Pembimbing 2
 */
export async function requestSupervisor2Service(userId, { lecturerId }) {
	const { student, thesis } = await getActiveThesisOrThrow(userId);

	// 0. Guard fase/status (F2-2) + hardening P1 wajib ada.
	ensureThesisOpenForSupervisor2(thesis);
	await ensurePembimbing1Exists(thesis.id);

	// 1. Check if student already has Pembimbing 2
	const alreadyHas = await hasPembimbing2(thesis.id);
	if (alreadyHas) {
		const err = new Error("Anda sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	// 2. Check for pending request (tahap dosen ATAU tahap KaDep)
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

	// 3b. Quota enforcement — reject if lecturer quota is full
	await ensureLecturerQuotaAvailable(lecturerId, thesis.academicYearId);

	// 4. Get student name and thesis title for notification
	const studentName = await getUserFullName(userId, "Mahasiswa");
	const thesisTitle = thesis.title || "Tugas Akhir";

	// 5. Create request notification for the lecturer (Lecturer.id === User.id)
	const request = await createSupervisor2Request({
		lecturerId,
		thesisId: thesis.id,
		studentId: student.id,
	});

	// 6. Send FCM to the lecturer
	await sendFcmToUsers([lecturerId], {
		title: "Permintaan Pembimbing 2",
		body: `${studentName} mengajukan Anda sebagai Pembimbing 2 untuk tugas akhir "${thesisTitle}"`,
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
		message: `${studentName} mengajukan Anda sebagai Pembimbing 2 untuk tugas akhir "${thesisTitle}"`,
	});

	// Audit log: supervisor-2 request created
	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.REQUEST_ADVISOR_CREATED,
		entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
		entityId: request.id,
		newValues: { thesisId: thesis.id, lecturerId, lecturerName: selectedLecturer.fullName },
	});

	return {
		requestId: request.id,
		lecturerName: selectedLecturer.fullName,
	};
}

/**
 * Student checks their pending Pembimbing 2 request status.
 * `stage`: "lecturer" (menunggu kesediaan dosen) | "kadep" (menunggu persetujuan KaDep).
 */
export async function getPendingSupervisor2RequestService(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);
	const pending = await findPendingSupervisor2Request(thesis.id);
	if (!pending) return null;

	const stage = pending.title === SUPERVISOR2_STAGE_TITLES.KADEP ? "kadep" : "lecturer";
	// Tahap dosen: target = pemilik record. Tahap KaDep: dosen ada di segmen ke-3 message.
	const { lecturerId: parsedLecturerId } = parseSupervisor2Message(pending.message);
	const lecturerUserId = stage === "kadep" ? parsedLecturerId : pending.userId;

	const lecturerName = lecturerUserId
		? await getUserFullName(lecturerUserId, null)
		: null;

	return {
		requestId: pending.id,
		lecturerId: lecturerUserId,
		lecturerName,
		requestedAt: pending.createdAt,
		stage,
	};
}

/**
 * Student cancels their pending Pembimbing 2 request (tahap mana pun).
 */
export async function cancelSupervisor2RequestService(userId) {
	const { thesis } = await getActiveThesisOrThrow(userId);
	const pending = await findPendingSupervisor2Request(thesis.id);
	if (!pending) {
		const err = new Error("Tidak ada permintaan Pembimbing 2 yang aktif");
		err.statusCode = 404;
		throw err;
	}

	// Tutup semua record tahap (dosen + KaDep) untuk thesis ini.
	await markSupervisor2RequestsProcessedForThesis(thesis.id);

	// Audit log: supervisor-2 request cancelled
	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.REQUEST_ADVISOR_CANCELLED,
		entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
		entityId: pending.id,
		newValues: { thesisId: thesis.id, stage: pending.title === SUPERVISOR2_STAGE_TITLES.KADEP ? "kadep" : "lecturer" },
	});

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
 * Lecturer menyatakan BERSEDIA menjadi Pembimbing 2 → diteruskan ke KaDep.
 *
 * Keputusan audit pass 2 (F2-5, OQ-2.2 2026-06-10): penambahan Pembimbing 2
 * pasca TA-04 wajib persetujuan KaDep (selaras Panduan TA: perubahan pembimbing
 * disetujui Ketua Departemen). Kesediaan dosen TIDAK langsung membuat
 * `thesis_participants` — partisipan baru dibuat saat KaDep approve.
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
	const { thesisId, studentId } = parseSupervisor2Message(request.message);

	// 3. Re-validasi: thesis masih terbuka + belum punya P2
	const thesis = await getThesisForValidation(thesisId);
	ensureThesisOpenForSupervisor2(thesis);
	const alreadyHas = await hasPembimbing2(thesisId);
	if (alreadyHas) {
		await markSupervisor2RequestProcessed(requestId);
		const err = new Error("Mahasiswa sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}

	// 3b. Re-check kuota (F2-3) — slot bisa terisi antara request dan kesediaan dosen.
	await ensureLecturerQuotaAvailable(lecturerId, thesis.academicYearId);

	// 4. Resolve akun KaDep aktif sebagai penerima tahap persetujuan.
	const kadepUsers = await findUsersByActiveRole(ROLES.KETUA_DEPARTEMEN);
	if (!Array.isArray(kadepUsers) || kadepUsers.length === 0) {
		const err = new Error(
			"Akun Ketua Departemen aktif tidak ditemukan — permintaan tidak dapat diteruskan. Hubungi Admin.",
		);
		err.statusCode = 500;
		throw err;
	}

	// 5. Atomik: tutup tahap dosen + buka tahap KaDep.
	await prisma.$transaction(async (tx) => {
		await markSupervisor2RequestProcessed(requestId, tx);
		for (const kadep of kadepUsers) {
			await createSupervisor2KadepRequest(
				{ kadepUserId: kadep.id, thesisId, studentId, lecturerId },
				tx,
			);
		}
	});

	// 6. Notifikasi
	const lecturerName = await getUserFullName(lecturerId, "Dosen");
	await createNotificationsForUsers([studentId], {
		title: "Pembimbing 2 Menunggu Persetujuan KaDep",
		message: `${lecturerName} bersedia menjadi Pembimbing 2 Anda. Permintaan diteruskan ke Ketua Departemen untuk persetujuan akhir.`,
	});
	await sendFcmToUsers([studentId], {
		title: "Pembimbing 2 Menunggu Persetujuan KaDep",
		body: `${lecturerName} bersedia menjadi Pembimbing 2 Anda. Menunggu persetujuan Ketua Departemen.`,
		data: { type: "supervisor2_forwarded_kadep", thesisId },
		dataOnly: true,
	});
	const kadepUserIds = kadepUsers.map((u) => u.id);
	await createNotificationsForUsers(kadepUserIds, {
		title: "Persetujuan Pembimbing 2",
		message: `${lecturerName} bersedia menjadi Pembimbing 2 untuk mahasiswa bimbingan baru. Tinjau dan putuskan di Kelola TA-01 s.d. TA-04 (tab Pembimbing 2).`,
	});
	await sendFcmToUsers(kadepUserIds, {
		title: "Persetujuan Pembimbing 2",
		body: `${lecturerName} bersedia menjadi Pembimbing 2. Menunggu keputusan Anda.`,
		data: { type: "supervisor2_kadep_queue", thesisId },
		dataOnly: true,
	});

	// Audit log: lecturer bersedia → forwarded to KaDep
	await logAudit({
		actorUserId: lecturerId,
		action: AUDIT_ACTIONS.REQUEST_ADVISOR_ACCEPTED,
		entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
		entityId: requestId,
		newValues: { thesisId, studentId, lecturerId, lecturerName, role: "pembimbing_2", forwardedToKadep: true },
	});

	return { success: true, lecturerName, forwardedToKadep: true };
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
	const { thesisId, studentId } = parseSupervisor2Message(request.message);

	// 3. Mark request as processed
	await markSupervisor2RequestProcessed(requestId);

	// 4. Get lecturer name for notification
	const lecturerName = await getUserFullName(lecturerId, "Dosen");

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

	// Audit log: supervisor-2 request rejected by lecturer
	await logAudit({
		actorUserId: lecturerId,
		action: AUDIT_ACTIONS.REQUEST_ADVISOR_REJECTED,
		entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
		entityId: requestId,
		newValues: { thesisId, studentId, reason: reason || null },
	});

	return { success: true };
}

// ─── KaDep services (tahap persetujuan akhir, F2-5 / OQ-2.2) ────────────────

/**
 * Antrean persetujuan Pembimbing 2 untuk KaDep.
 */
export async function getSupervisor2KadepQueueService(kadepUserId) {
	const requests = await findPendingSupervisor2KadepRequests(kadepUserId);

	const parsed = [];
	for (const req of requests) {
		const parts = (req.message || "").split("|");
		if (parts.length < 3) continue;
		const [thesisId, studentId, lecturerId] = parts;

		const [studentUser, lecturerUser, thesis] = await Promise.all([
			prisma.user.findUnique({
				where: { id: studentId },
				select: { fullName: true, identityNumber: true },
			}),
			prisma.user.findUnique({
				where: { id: lecturerId },
				select: { fullName: true, identityNumber: true },
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
			lecturerId,
			studentName: studentUser ? toTitleCaseName(studentUser.fullName) : "Mahasiswa",
			studentNim: studentUser?.identityNumber || null,
			lecturerName: lecturerUser ? toTitleCaseName(lecturerUser.fullName) : "Dosen",
			thesisTitle: thesis?.title || "Tugas Akhir",
			requestedAt: req.createdAt,
		});
	}

	return parsed;
}

/**
 * Keputusan KaDep atas permintaan Pembimbing 2.
 * Approve → buat `thesis_participants` P2. Jika TA-04 sudah pernah
 * difinalisasi, Formulir TA-04 batch periode perlu diperbarui.
 * Reject  → tutup permintaan + notifikasi mahasiswa & dosen.
 */
export async function decideSupervisor2ByKadepService(kadepUserId, requestId, { approve, reason }) {
	const request = await findSupervisor2KadepRequestById(requestId, kadepUserId);
	if (!request) {
		const err = new Error("Permintaan tidak ditemukan atau sudah diproses");
		err.statusCode = 404;
		throw err;
	}

	const { thesisId, studentId, lecturerId } = parseSupervisor2Message(request.message);
	if (!lecturerId) {
		const err = new Error("Data permintaan tidak valid");
		err.statusCode = 400;
		throw err;
	}

	const lecturerName = await getUserFullName(lecturerId, "Dosen");

	if (!approve) {
		await markSupervisor2RequestsProcessedForThesis(thesisId);

		const reasonText = reason ? `. Alasan: ${reason}` : "";
		await createNotificationsForUsers([studentId], {
			title: "Pembimbing 2 Tidak Disetujui KaDep",
			message: `Ketua Departemen tidak menyetujui ${lecturerName} sebagai Pembimbing 2 Anda${reasonText}`,
		});
		await createNotificationsForUsers([lecturerId], {
			title: "Pembimbing 2 Tidak Disetujui KaDep",
			message: `Ketua Departemen tidak menyetujui Anda sebagai Pembimbing 2 untuk mahasiswa tersebut${reasonText}`,
		});
		await sendFcmToUsers([studentId, lecturerId], {
			title: "Pembimbing 2 Tidak Disetujui KaDep",
			body: `Keputusan KaDep: permintaan Pembimbing 2 tidak disetujui${reasonText}`,
			data: { type: "supervisor2_kadep_rejected", thesisId },
			dataOnly: true,
		});

		await logAudit({
			actorUserId: kadepUserId,
			action: AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_REJECTED,
			entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
			entityId: requestId,
			newValues: { thesisId, studentId, lecturerId, reason: reason || null },
		});

		return { success: true, approved: false };
	}

	// ── Approve path ──
	// Re-validasi: thesis masih terbuka + belum punya P2 + kuota dosen masih tersedia.
	const thesis = await getThesisForValidation(thesisId);
	ensureThesisOpenForSupervisor2(thesis);
	const alreadyHas = await hasPembimbing2(thesisId);
	if (alreadyHas) {
		await markSupervisor2RequestsProcessedForThesis(thesisId);
		const err = new Error("Mahasiswa sudah memiliki Pembimbing 2");
		err.statusCode = 400;
		throw err;
	}
	await ensureLecturerQuotaAvailable(lecturerId, thesis.academicYearId);

	// Atomik: buat participant P2 + tutup seluruh record request thesis ini.
	await prisma.$transaction(async (tx) => {
		await createThesisSupervisors(thesisId, lecturerId, tx);
		if (thesis.proposalStatus === "accepted") {
			await tx.thesis.update({
				where: { id: thesisId },
				data: { titleApprovalDocumentId: null },
			});
		}
		await markSupervisor2RequestsProcessedForThesis(thesisId, tx);
	});

	// Notifikasi mahasiswa + dosen
	await createNotificationsForUsers([studentId], {
		title: "Pembimbing 2 Disetujui",
		message: thesis.proposalStatus === "accepted"
			? `Ketua Departemen menyetujui ${lecturerName} sebagai Pembimbing 2 Anda. Formulir TA-04 batch periode perlu difinalisasi ulang sebelum dapat diunduh dari arsip.`
			: `Ketua Departemen menyetujui ${lecturerName} sebagai Pembimbing 2 Anda.`,
	});
	await createNotificationsForUsers([lecturerId], {
		title: "Penetapan Pembimbing 2",
		message: thesis.proposalStatus === "accepted"
			? "Ketua Departemen menyetujui Anda sebagai Pembimbing 2. Formulir TA-04 batch periode perlu difinalisasi ulang."
			: "Ketua Departemen menyetujui Anda sebagai Pembimbing 2.",
	});
	await sendFcmToUsers([studentId, lecturerId], {
		title: "Pembimbing 2 Disetujui",
		body: `KaDep menyetujui ${lecturerName} sebagai Pembimbing 2.`,
		data: { type: "supervisor2_kadep_approved", thesisId },
		dataOnly: true,
	});

	await logAudit({
		actorUserId: kadepUserId,
		action: AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_APPROVED,
		entityType: ENTITY_TYPES.SUPERVISOR2_REQUEST,
		entityId: requestId,
		newValues: { thesisId, studentId, lecturerId, lecturerName, role: "pembimbing_2" },
	});

	return { success: true, approved: true, lecturerName };
}
