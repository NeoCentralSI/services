import {
	getLecturerByUserId,
	findMyStudents,
	findGuidanceRequests,
	findGuidanceByIdForLecturer,
	approveGuidanceById,
	rejectGuidanceById,
	getLecturerTheses,
	countTotalProgressComponents,
	getValidatedCompletionsByThesis,
	getStudentActiveThesis,
	getAllProgressComponents,
	getCompletionsForThesis,
	listGuidanceHistory,
	countGraduatedAsSupervisor2,
	findThesisDetailForLecturer,
	findGuidancesPendingApproval,
	approveSessionSummary,
	findScheduledGuidances,
	// Transfer
	findEligibleTransferLecturers,
	findSupervisorRecords,
	lecturerHasRole,
	findActiveSupervisorRelation,
	createTransferNotification,
	findPendingTransferNotifications,
	findTransferNotificationById,
	markNotificationRead,
	createInfoNotification,
	// Kadep Transfer
	findKadepUsers,
	createKadepTransferNotification,
	findPendingKadepTransferNotifications,
	findAllKadepTransferNotifications,
	updateNotificationMessage,
	findKadepTransferNotificationsBySrcTgt,
} from "../../repositories/thesisGuidance/lecturer.guidance.repository.js";
import { THESIS_STATUS, TA_PHASE } from "../../constants/thesisStatus.js";
import { THESIS_STATUS_LABELS, GUIDANCE_STATUS_LABELS } from "../../constants/thesisLabels.js";
import {
	GUIDANCE_STATUS,
	GUIDANCE_ACTOR,
	SCHEDULED_GUIDANCE_STATUSES,
	effectiveGuidanceDate,
} from "../../constants/guidanceStatus.js";
import { ensureSupervisorAvailability } from "./student.guidance.service.js";
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { withFeedbackAuthor } from "../../repositories/thesisGuidance/milestone.repository.js";
import { guidanceDocument, findLatestThesisReport, uploadUrl } from "../../helpers/guidanceFile.helper.js";
import { ROLE_CATEGORY, ROLES, SUPERVISOR_ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { formatDateTimeJakarta, formatDateTimeWib } from "../../utils/date.util.js";
import { createGuidanceCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "../outlook-calendar.service.js";
import { resolve } from "path";
import path from "path";
import { toTitleCaseName } from "../../utils/global.util.js";
import prisma from "../../config/prisma.js";
import { ForbiddenError } from "../../utils/errors.js";
import { syncLecturerQuotaCurrentCount } from "../advisorQuota.service.js";

function ensureLecturer(lecturer) {
	if (!lecturer) {
		const err = new Error("Lecturer profile not found for this user");
		err.statusCode = 404;
		throw err;
	}
}

/**
 * Guidance revival correction: acting on a guidance session requires an ACTIVE
 * supervisor relation with the session's thesis. Being the session's supervisorId or
 * holding a global supervisor role is not enough (released/terminated rows are refused).
 */
async function assertActiveSupervisorForThesis(lecturerId, thesisId) {
	const relation = thesisId ? await findActiveSupervisorRelation(thesisId, lecturerId) : null;
	if (!relation) {
		const err = new Error("Anda bukan pembimbing aktif untuk tugas akhir ini");
		err.statusCode = 403;
		throw err;
	}
	// Session actions only for a thesis in the TA phase (not proposal, BSS, or closed).
	const thesisStatus = relation.thesis?.status;
	if (thesisStatus !== THESIS_STATUS.RESEARCH) {
		const err = new Error(
			thesisStatus === THESIS_STATUS.ON_LEAVE
				? `Tugas akhir mahasiswa sedang berstatus "${THESIS_STATUS_LABELS.on_leave}". Aksi bimbingan tidak dapat dilakukan.`
				: "Aksi bimbingan hanya dapat dilakukan untuk tugas akhir yang sedang berjalan.",
		);
		err.statusCode = 403;
		throw err;
	}
	return relation;
}

const guidanceStatusLabel = (status) => GUIDANCE_STATUS_LABELS[status] ?? status;

/** K19: a transition starts from an allowed status; otherwise 400 with labels. */
function assertGuidanceStatus(guidance, allowed, actionText) {
	if (allowed.includes(guidance.status)) return;
	const allowedText = [...new Set(allowed.map(guidanceStatusLabel))].map((l) => `"${l}"`).join(" atau ");
	const err = new Error(
		`Bimbingan tidak dapat ${actionText}. Hanya bimbingan berstatus ${allowedText} yang dapat ${actionText}; status saat ini "${guidanceStatusLabel(guidance.status)}".`,
	);
	err.statusCode = 400;
	throw err;
}

/** Loads a session of this lecturer and checks the active-supervisor + `research` rule. */
async function loadLecturerGuidance(userId, guidanceId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const guidance = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Bimbingan tidak ditemukan atau bukan bimbingan Anda");
		err.statusCode = 404;
		throw err;
	}
	await assertActiveSupervisorForThesis(lecturer.id, guidance.thesisId ?? guidance.thesis?.id);
	return { lecturer, guidance };
}

// Normalize a guidance record into a flat, tidy shape
function toFlatGuidance(g) {
	if (!g) return null;
	return {
		id: g.id,
		// Keep minimal identifiers; include studentId for UI fallbacks, omit thesisId to reduce noise
		studentId: g.thesis?.studentId || g.thesis?.student?.id || null,
		studentName: g.thesis?.student?.user?.fullName || null,
		studentNim: g.thesis?.student?.user?.identityNumber || null,
		supervisorName: g?.supervisor?.user?.fullName || null,
		status: g.status,
		requestedDate: g.requestedDate || null,
		requestedDateFormatted: g.requestedDate ? formatDateTimeJakarta(g.requestedDate, { withDay: true }) : null,
		approvedDate: g.approvedDate || null,
		approvedDateFormatted: g.approvedDate ? formatDateTimeJakarta(g.approvedDate, { withDay: true }) : null,
		documentUrl: g.documentUrl || null, // Link dokumen yang akan dibahas
		notes: g.studentNotes || null,
		studentNotes: g.studentNotes || null, // Alias for clarity
		supervisorFeedback: g.supervisorFeedback || null,
		document: guidanceDocument(g),
		createdAt: g.createdAt || null,
		createdAtFormatted: g.createdAt ? formatDateTimeJakarta(g.createdAt, { withDay: true }) : null,
		updatedAt: g.updatedAt || null,
		// alias for UI compatibility
		requestedAt: g.createdAt || null,
		// New fields
		duration: g.duration || null,
		completedAt: g.completedAt || null,
		rejectionReason: g.rejectionReason || null,
		// K19 fields
		suggestedDate: g.suggestedDate || null,
		suggestedDateFormatted: g.suggestedDate ? formatDateTimeJakarta(g.suggestedDate, { withDay: true }) : null,
		rescheduleReason: g.rescheduleReason || null,
		rescheduledAt: g.rescheduledAt || null,
		cancelReason: g.cancelReason || null,
		cancelledAt: g.cancelledAt || null,
		cancelledBy: g.cancelledBy || null,
		// Milestone info (from junction table)
		milestoneId: g.milestones?.[0]?.milestoneId || null,
		milestone: g.milestones?.[0]?.milestone ? { id: g.milestones[0].milestone.id, title: g.milestones[0].milestone.title, status: g.milestones[0].milestone.status } : null,
		milestoneName: g.milestones?.[0]?.milestone?.title || null,
		milestoneStatus: g.milestones?.[0]?.milestone?.status || null,
		milestoneIds: (g.milestones || []).map((m) => m.milestoneId),
		milestoneTitles: g.milestoneTitles || (g.milestones || []).map((m) => m.milestone?.title).filter(Boolean),
	};
}

async function resolveMilestoneTitles(guidance) {
	if (!guidance) return [];
	// Derive from junction table milestones
	return (guidance.milestones || []).map((m) => m.milestone?.title).filter(Boolean);
}

export async function getMyStudentsService(userId, roles, { filter = "active" } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	// Default to supervisor roles only
	const defaultRoles = SUPERVISOR_ROLES;
	const rawStudents = await findMyStudents(
		lecturer.id,
		Array.isArray(roles) && roles.length ? roles : defaultRoles,
		{ filter },
	);

	// Transform data to flat structure for frontend
	const students = rawStudents.map(s => ({
		studentId: s.studentId,
		fullName: s.studentUser?.fullName || null,
		email: s.studentUser?.email || null,
		identityNumber: s.studentUser?.identityNumber || null,
		thesisId: s.thesisId,
		thesisTitle: s.thesisTitle,
		thesisStatus: s.thesisStatus ?? null,
		roles: s.role ? [s.role] : [],
		supervisorStatus: s.supervisorStatus || null,
		thesisRating: s.thesisRating || "ONGOING",
		latestMilestone: s.latestMilestone || "Belum mulai",
		// Milestone progress info
		totalMilestones: s.totalMilestones || 0,
		completedMilestones: s.completedMilestones || 0,
		milestoneProgress: s.milestoneProgress || 0,
		// Guidance info
		completedGuidanceCount: s.completedGuidanceCount || 0,
		lastGuidanceDate: s.lastGuidanceDate ? formatDateTimeJakarta(s.lastGuidanceDate, { withDay: true }) : null,
		// ISO value; the frontend formats it (Paket C, C5)
		lastGuidanceAt: s.lastGuidanceDate || null,
		deadlineDate: s.deadlineDate || null,
		startDate: s.startDate || null
	}));

	return { count: students.length, students };
}

export async function getStudentDetailService(userId, thesisId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const thesis = await findThesisDetailForLecturer(thesisId, lecturer.id);
	if (!thesis) {
		const err = new Error("Thesis not found or you are not a supervisor");
		err.statusCode = 404;
		throw err;
	}

	// Fetch per-guidance uploaded documents (file versioning), stored on session rows (K17)
	const guidanceDocuments = await prisma.thesisGuidance.findMany({
		where: {
			thesisId: thesis.id,
			...TA_PHASE,
			filePath: { not: null },
		},
		select: {
			id: true,
			requestedDate: true,
			approvedDate: true,
			filePath: true,
			fileName: true,
			fileUploadedAt: true,
		},
		orderBy: { requestedDate: "desc" },
	});
	// "Laporan terbaru" = attachment of the latest TA-phase session that has a file
	const latestReport = await findLatestThesisReport(prisma, thesis.id);
	const latestReportDocument = guidanceDocument(latestReport);

	return {
		thesisId: thesis.id,
		title: thesis.title,
		status: thesis.status,
		rating: thesis.rating,
		startDate: thesis.startDate,
		deadlineDate: thesis.deadlineDate,
		student: {
			id: thesis.student?.id,
			fullName: thesis.student?.user?.fullName,
			nim: thesis.student?.user?.identityNumber,
			email: thesis.student?.user?.email,
		},
		document: latestReportDocument
			? { id: latestReportDocument.id, fileName: latestReportDocument.fileName, url: latestReportDocument.url }
			: null,
		// Revival adaptation (A2): final proposal version, fallback legacy proposal document.
		proposalDocument: (() => {
			const doc = thesis.finalProposalVersion?.document ?? thesis.proposalDocument ?? null;
			if (!doc) return null;
			const docPath = doc.filePath || "";
			return {
				id: doc.id,
				fileName: path.basename(docPath) || doc.fileName,
				// Documents without a stored file have no URL.
				url: uploadUrl(docPath),
			};
		})(),
		uploadedFiles: guidanceDocuments.map((g) => ({
			id: g.id,
			fileName: g.fileName || path.basename(g.filePath || ""),
			filePath: g.filePath,
			uploadedAt: g.fileUploadedAt,
			guidanceDate: g.approvedDate || g.requestedDate,
		})),
		milestones: (await withFeedbackAuthor(thesis.thesisMilestones)).map(m => ({
			id: m.id,
			title: m.title,
			status: m.status,
			// C9: decision notes and supervisor feedback are separate
			supervisorNotes: m.supervisorNotes || null,
			feedback: m.feedback || null,
			feedbackByName: m.feedbackByName || null,
			feedbackAt: m.feedbackAt || null,
			updatedAt: m.updatedAt,
			updatedAtFormatted: m.updatedAt ? formatDateTimeJakarta(m.updatedAt, { withDay: true }) : null,
			progressPercentage: m.progressPercentage || 0,
			targetDate: m.targetDate,
			targetDateFormatted: m.targetDate ? formatDateTimeJakarta(m.targetDate, { withDay: true }) : null,
		})),
		guidanceHistory: await (async () => {
			const studentId = thesis.student?.id || thesis.studentId;
			if (!studentId) return { count: 0, items: [] };
			const rows = await listGuidanceHistory(studentId, lecturer.id);
			const items = rows.map((g) => {
				const titles = (g.milestones || []).map((m) => m.milestone?.title).filter(Boolean);
				return toFlatGuidance({ ...g, milestoneTitles: titles });
			});
			return { count: items.length, items };
		})(),
		startDateFormatted: thesis.startDate ? formatDateTimeJakarta(thesis.startDate) : null,
		deadlineDateFormatted: thesis.deadlineDate ? formatDateTimeJakarta(thesis.deadlineDate) : null,
		userRole: thesis.thesisSupervisors?.find(p => p.lecturer?.user?.id === userId)?.role?.name || null,
	};
}

export async function getRequestsService(userId, { page = 1, pageSize = 10 } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const { total, rows, page: p, pageSize: sz } = await findGuidanceRequests(lecturer.id, { page, pageSize });
	// Milestone titles are now included via junction table
	const items = Array.isArray(rows)
		? rows.map((g) => {
			const titles = (g.milestones || []).map((m) => m.milestone?.title).filter(Boolean);
			return toFlatGuidance({ ...g, milestoneTitles: titles });
		})
		: [];
	const totalPages = Math.max(1, Math.ceil(total / sz));
	return { page: p, pageSize: sz, total, totalPages, requests: items };
}

/**
 * Get scheduled guidances (accepted or summary_pending) for lecturer
 */
export async function getScheduledGuidancesService(userId, { page = 1, pageSize = 10 } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const { total, rows, page: p, pageSize: sz } = await findScheduledGuidances(lecturer.id, { page, pageSize });

	// Milestone titles are now included via junction table
	const items = Array.isArray(rows)
		? rows.map((g) => {
			const titles = (g.milestones || []).map((m) => m.milestone?.title).filter(Boolean);
			return toFlatGuidance({ ...g, milestoneTitles: titles });
		})
		: [];
	const totalPages = Math.max(1, Math.ceil(total / sz));
	return { page: p, pageSize: sz, total, totalPages, guidances: items };
}

export async function rejectGuidanceService(userId, guidanceId, { reason, feedback, suggestedDate = null } = {}) {
	const { lecturer, guidance } = await loadLecturerGuidance(userId, guidanceId);
	assertGuidanceStatus(guidance, [GUIDANCE_STATUS.REQUESTED], "ditolak");

	// K19: a rejection always carries a reason; a suggested time is optional and future.
	const rejectReason = String(reason ?? feedback ?? "").trim();
	if (!rejectReason) {
		const err = new Error("Alasan penolakan wajib diisi");
		err.statusCode = 400;
		throw err;
	}
	if (suggestedDate && new Date(suggestedDate).getTime() <= Date.now()) {
		const err = new Error("Usulan waktu harus di masa depan");
		err.statusCode = 400;
		throw err;
	}

	const updated = await rejectGuidanceById(guidanceId, { reason: rejectReason, suggestedDate: suggestedDate ? new Date(suggestedDate) : null });
	const feedbackText = rejectReason;
	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.GUIDANCE_REJECTED,
		entityType: ENTITY_TYPES.THESIS_GUIDANCE,
		entityId: guidanceId,
		oldValues: { status: guidance.status },
		newValues: { status: GUIDANCE_STATUS.REJECTED, reason: rejectReason, suggestedDate: updated.suggestedDate },
	});

	// Send notification to student
	try {
		const studentUserId = updated.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = updated.supervisor?.user?.fullName || "Dosen";
			const scheduleDateStr = updated.requestedDate
				? formatDateTimeWib(new Date(updated.requestedDate), { withWeekday: true })
				: "";
			const dateInfo = scheduleDateStr ? ` pada ${scheduleDateStr}` : "";
			const suggestion = updated.suggestedDate
				? ` Usulan waktu lain: ${formatDateTimeWib(updated.suggestedDate, { withWeekday: true })}.`
				: "";

			await createNotificationsForUsers([studentUserId], {
				title: "Bimbingan Ditolak",
				message: `${lecturerName} menolak permintaan bimbingan${dateInfo}. Alasan: ${feedbackText}.${suggestion} Silakan ajukan bimbingan baru.`,
			});

			await sendFcmToUsers([studentUserId], {
				title: "Bimbingan Ditolak",
				body: `${lecturerName} menolak permintaan bimbingan${dateInfo}`,
				data: {
					type: "thesis-guidance:rejected",
					guidanceId: guidanceId,
					role: ROLE_CATEGORY.STUDENT,
				}
			});
		}
	} catch (e) {
		console.error("Failed to send rejection notification:", e?.message || e);
	}

	// Re-read with includes for a complete, flat response
	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	const titles = await resolveMilestoneTitles(fresh);
	return { guidance: toFlatGuidance({ ...fresh, milestoneTitles: titles }) };
}

// Cancel an accepted guidance session (lecturer cannot attend)
export async function cancelGuidanceByLecturerService(userId, guidanceId, { reason } = {}) {
	const { lecturer, guidance } = await loadLecturerGuidance(userId, guidanceId);
	// K19: the lecturer cancels a scheduled session (legacy "rescheduled" included).
	assertGuidanceStatus(guidance, SCHEDULED_GUIDANCE_STATUSES, "dibatalkan");
	reason = String(reason ?? "").trim();

	if (!reason) {
		const err = new Error("Alasan pembatalan wajib diisi");
		err.statusCode = 400;
		throw err;
	}

	// Delete calendar events if they exist
	try {
		if (guidance.supervisorCalendarEventId) {
			await deleteCalendarEvent(userId, guidance.supervisorCalendarEventId);
		}
		const studentUserId = guidance.thesis?.student?.user?.id;
		if (guidance.studentCalendarEventId && studentUserId) {
			await deleteCalendarEvent(studentUserId, guidance.studentCalendarEventId);
		}
	} catch (e) {
		console.error("Failed to delete calendar events:", e?.message || e);
	}

	// Update guidance status to cancelled
	await prisma.thesisGuidance.update({
		where: { id: guidance.id },
		data: {
			status: GUIDANCE_STATUS.CANCELLED,
			cancelReason: reason,
			cancelledAt: new Date(),
			cancelledBy: GUIDANCE_ACTOR.LECTURER,
			studentCalendarEventId: null,
			supervisorCalendarEventId: null,
		},
	});
	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.GUIDANCE_CANCELLED,
		entityType: ENTITY_TYPES.THESIS_GUIDANCE,
		entityId: guidance.id,
		oldValues: { status: guidance.status },
		newValues: { status: GUIDANCE_STATUS.CANCELLED, cancelledBy: GUIDANCE_ACTOR.LECTURER, reason },
	});

	// Send notification to student
	try {
		const studentUserId = guidance.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = toTitleCaseName(guidance.supervisor?.user?.fullName || "Dosen");
			const sessionDate = effectiveGuidanceDate(guidance);
			const dateStr = sessionDate
				? formatDateTimeWib(new Date(sessionDate), { withWeekday: true })
				: "belum ditentukan";

			await createNotificationsForUsers([studentUserId], {
				title: "Bimbingan Dibatalkan oleh Dosen",
				message: `${lecturerName} membatalkan bimbingan terjadwal pada ${dateStr}. Alasan: ${reason}`,
			});

			await sendFcmToUsers([studentUserId], {
				title: "Bimbingan Dibatalkan oleh Dosen",
				body: `${lecturerName} membatalkan bimbingan pada ${dateStr}. Alasan: ${reason}`,
				data: {
					type: "thesis-guidance:cancelled-by-lecturer",
					guidanceId: String(guidanceId),
					role: ROLE_CATEGORY.STUDENT,
					reason: reason,
					playSound: "true",
				},
			});
		}
	} catch (e) {
		console.warn("FCM notify failed (lecturer cancel):", e?.message || e);
	}

	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	const titles = await resolveMilestoneTitles(fresh);
	return { guidance: toFlatGuidance({ ...fresh, milestoneTitles: titles }) };
}

export async function approveGuidanceService(userId, guidanceId, { feedback, approvedDate, duration } = {}) {
	const { lecturer, guidance } = await loadLecturerGuidance(userId, guidanceId);
	assertGuidanceStatus(guidance, [GUIDANCE_STATUS.REQUESTED], "disetujui");

	const updated = await approveGuidanceById(guidanceId, { feedback, approvedDate, duration });

	// Sync to Outlook Calendar - Create events for both supervisor and student
	try {
		const studentUser = updated.thesis?.student?.user;
		const supervisorUser = updated.supervisor?.user;

		// The agreed session time (approvedDate defaults to the requested time).
		const scheduledDate = effectiveGuidanceDate(updated);

		if (studentUser && supervisorUser && scheduledDate) {
			const calendarEvents = await createGuidanceCalendarEvent(
				{
					scheduledDate: scheduledDate,
					studentNotes: updated.studentNotes,
					duration: updated.duration,
				},
				{
					userId: studentUser.id,
					fullName: studentUser.fullName,
					email: studentUser.email,
				},
				{
					userId: supervisorUser.id,
					fullName: supervisorUser.fullName,
					email: supervisorUser.email,
				}
			);

			// Save calendar event IDs to database
			if (calendarEvents.supervisorEventId || calendarEvents.studentEventId) {
				await prisma.thesisGuidance.update({
					where: { id: guidanceId },
					data: {
						supervisorCalendarEventId: calendarEvents.supervisorEventId,
						studentCalendarEventId: calendarEvents.studentEventId,
					},
				});
				console.log("[Guidance] Calendar events synced:", calendarEvents);
			}
		}
	} catch (e) {
		console.error("Failed to sync calendar:", e?.message || e);
		// Don't fail the request if calendar sync fails
	}

	// Send notification to student
	try {
		const studentUserId = updated.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = updated.supervisor?.user?.fullName || "Dosen";
			const scheduleDateStr = updated.approvedDate
				? formatDateTimeWib(new Date(updated.approvedDate), { withWeekday: true })
				: "";
			const dateInfo = scheduleDateStr ? ` pada ${scheduleDateStr}` : "";

			await createNotificationsForUsers([studentUserId], {
				title: "Bimbingan Disetujui",
				message: `${lecturerName} menyetujui permintaan bimbingan${dateInfo}`,
			});

			await sendFcmToUsers([studentUserId], {
				title: "Bimbingan Disetujui",
				body: `${lecturerName} menyetujui permintaan bimbingan${dateInfo}`,
				data: {
					type: "thesis-guidance:approved",
					guidanceId: guidanceId,
					role: ROLE_CATEGORY.STUDENT,
				}
			});
		}
	} catch (e) {
		console.error("Failed to send approval notification:", e?.message || e);
	}

	// Re-read with includes for a complete, flat response
	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	const titles = await resolveMilestoneTitles(fresh);
	return { guidance: toFlatGuidance({ ...fresh, milestoneTitles: titles }) };
}

export async function getAllProgressService(userId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const thesisIds = await getLecturerTheses(lecturer.id);
	if (!thesisIds.length) return { totalComponents: 0, items: [] };
	const totalComponents = await countTotalProgressComponents();
	const validatedCounts = await getValidatedCompletionsByThesis(thesisIds);
	const mapCounts = new Map(validatedCounts.map((v) => [v.thesisId, v._count._all]));
	const items = thesisIds.map((tid) => ({ thesisId: tid, validated: mapCounts.get(tid) || 0, total: totalComponents }));
	return { totalComponents, items };
}

export async function getStudentProgressDetailService(userId, studentId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const thesis = await getStudentActiveThesis(studentId, lecturer.id);
	if (!thesis) {
		const err = new Error("Student thesis not found for this lecturer");
		err.statusCode = 404;
		throw err;
	}
	const components = await getAllProgressComponents();
	const completions = await getCompletionsForThesis(thesis.id);
	const byComponent = new Map(completions.map((c) => [c.componentId, c]));
	const detail = components.map((c) => ({
		componentId: c.id,
		name: c.name,
		description: c.description,
		completedAt: byComponent.get(c.id)?.completedAt || null,
		validatedBySupervisor: Boolean(byComponent.get(c.id)?.validatedBySupervisor),
	}));
	return { thesisId: thesis.id, components: detail };
}

export async function approveStudentProgressComponentsService(userId, studentId, componentIds = []) {
	// Guidance revival correction: this legacy endpoint marked milestones completed for
	// P1 or P2 without the milestone review flow. Completion is only through
	// POST /milestones/:id/validate by the active Pembimbing 1.
	void userId;
	void studentId;
	void componentIds;
	const err = new Error(
		"Validasi komponen progres lewat endpoint ini tidak tersedia. Validasi milestone dilakukan Pembimbing 1 melalui halaman milestone.",
	);
	err.statusCode = 410;
	throw err;
}

export async function postGuidanceFeedbackService(userId, guidanceId, { feedback }) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const guidance = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Guidance not found or not assigned to you");
		err.statusCode = 404;
		throw err;
	}
	await assertActiveSupervisorForThesis(lecturer.id, guidance.thesisId ?? guidance.thesis?.id);
	await approveGuidanceById(guidanceId, { feedback });
	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	return { guidance: toFlatGuidance(fresh) };
}

export async function finalApprovalService(userId, studentId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const thesis = await getStudentActiveThesis(studentId, lecturer.id);
	if (!thesis) {
		const err = new Error("Student thesis not found for this lecturer");
		err.statusCode = 404;
		throw err;
	}
	const totalComponents = await countTotalProgressComponents();
	if (totalComponents === 0) return { thesisId: thesis.id, approved: true };
	const completions = await getCompletionsForThesis(thesis.id);
	const validated = completions.filter((c) => c.validatedBySupervisor).length;
	if (validated < totalComponents) {
		const err = new Error("Cannot final-approve: not all components validated");
		err.statusCode = 400;
		throw err;
	}
	return { thesisId: thesis.id, approved: true };
}

export async function guidanceHistoryService(userId, studentId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const rows = await listGuidanceHistory(studentId, lecturer.id);
	const items = rows.map((g) => {
		const titles = (g.milestones || []).map((m) => m.milestone?.title).filter(Boolean);
		return toFlatGuidance({ ...g, milestoneTitles: titles });
	});
	return { count: items.length, items };
}

// Policy: require at least 4 graduated students as SUPERVISOR_2 to be eligible for SUPERVISOR_1
export async function supervisorEligibilityService(userId, threshold = 4) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const graduatedAsSup2 = await countGraduatedAsSupervisor2(lecturer.id);
	const eligible = graduatedAsSup2 >= threshold;
	return { eligible, graduatedAsSup2, required: threshold };
}

// Paket A (K15): this endpoint read ThesisStatus rows "at_risk"/"failed" that never existed
// (it always failed with 500) and has no UI caller. Stopping a thesis (status `failed` with a
// mandatory reason) is an Admin action that is not built yet, so the endpoint is closed.
export async function failStudentThesisService(userId, studentId, { reason } = {}) {
	void userId;
	void studentId;
	void reason;
	const err = new Error(
		"Penghentian tugas akhir oleh pembimbing tidak tersedia. Penghentian dilakukan Admin Departemen dengan alasan yang wajib dicatat.",
	);
	err.statusCode = 410;
	throw err;
}

// ==================== SESSION SUMMARY APPROVAL ====================

/**
 * Get guidances pending summary approval (minimal list for lecturer)
 */
export async function getPendingApprovalService(userId, { page = 1, pageSize = 10 } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const { total, rows, page: currentPage, pageSize: size } = await findGuidancesPendingApproval(lecturer.id, { page, pageSize });

	const guidances = rows.map((g) => ({
		id: g.id,
		studentName: g.thesis?.student?.user?.fullName || null,
		studentId: g.thesis?.student?.user?.identityNumber || null,
		approvedDate: g.approvedDate,
		approvedDateFormatted: g.approvedDate ? formatDateTimeJakarta(g.approvedDate, { withDay: true }) : null,
		summarySubmittedAt: g.summarySubmittedAt,
		summarySubmittedAtFormatted: g.summarySubmittedAt ? formatDateTimeJakarta(g.summarySubmittedAt, { withDay: true }) : null,
		sessionSummary: g.sessionSummary,
		actionItems: g.actionItems,
		milestoneName: g.milestones?.[0]?.milestone?.title || null,
	}));

	return { total, guidances, page: currentPage, pageSize: size };
}

/**
 * Approve session summary - 1 click, minimal interaction
 */
export async function approveSessionSummaryService(userId, guidanceId) {
	const { lecturer, guidance } = await loadLecturerGuidance(userId, guidanceId);
	// K19: only a submitted summary can be approved (-> completed).
	assertGuidanceStatus(guidance, [GUIDANCE_STATUS.SUMMARY_PENDING], "disetujui ringkasannya");

	const updated = await approveSessionSummary(guidanceId);

	// Delete calendar events for both student and lecturer
	const studentUserId = updated.thesis?.student?.user?.id;
	const supervisorUserId = updated.supervisor?.user?.id;

	// Delete student's calendar event
	if (studentUserId && updated.studentCalendarEventId) {
		try {
			await deleteCalendarEvent(studentUserId, updated.studentCalendarEventId);
		} catch (e) {
			console.warn("Failed to delete student calendar event:", e?.message || e);
		}
	}

	// Delete supervisor's calendar event
	if (supervisorUserId && updated.supervisorCalendarEventId) {
		try {
			await deleteCalendarEvent(supervisorUserId, updated.supervisorCalendarEventId);
		} catch (e) {
			console.warn("Failed to delete supervisor calendar event:", e?.message || e);
		}
	}

	// Send notification to student
	if (studentUserId) {
		const lecturerName = toTitleCaseName(lecturer.user?.fullName || updated.supervisor?.user?.fullName || "Dosen");

		await createNotificationsForUsers(
			[studentUserId],
			{
				title: "Catatan Bimbingan Disetujui",
				message: `${lecturerName} telah menyetujui catatan bimbingan Anda`,
			}
		);

		sendFcmToUsers([studentUserId], {
			title: "Catatan Bimbingan Disetujui",
			body: `${lecturerName} telah menyetujui catatan bimbingan Anda. Bimbingan telah selesai.`,
			data: {
				type: "thesis-guidance:summary-approved",
				role: "student",
				guidanceId: String(guidanceId),
				thesisId: String(updated.thesisId),
				playSound: "true",
			},
			dataOnly: true,
		}).catch((e) => console.warn("FCM notify failed (summary approved):", e?.message || e));
	}

	return {
		guidance: {
			id: updated.id,
			status: updated.status,
			completedAt: updated.completedAt,
		},
	};
}

/**
 * K19: the lecturer moves a scheduled session. The new time applies immediately, the status
 * stays `accepted`, a reason is required, the student is notified, and the change is
 * audited. Outlook events are moved when their ids exist; a calendar failure never fails
 * the action.
 */
export async function rescheduleGuidanceByLecturerService(userId, guidanceId, { newDate, reason, duration } = {}) {
	const { lecturer, guidance } = await loadLecturerGuidance(userId, guidanceId);
	assertGuidanceStatus(guidance, SCHEDULED_GUIDANCE_STATUSES, "dijadwalkan ulang");

	const rescheduleReason = String(reason ?? "").trim();
	if (!rescheduleReason) {
		const err = new Error("Alasan perubahan jadwal wajib diisi");
		err.statusCode = 400;
		throw err;
	}
	const start = new Date(newDate);
	if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
		const err = new Error("Jadwal baru harus di masa depan");
		err.statusCode = 400;
		throw err;
	}
	const durationMinutes = duration || guidance.duration || 60;
	await ensureSupervisorAvailability({
		supervisorId: lecturer.id,
		start,
		durationMinutes,
		excludeGuidanceId: guidance.id,
	});

	const previousDate = effectiveGuidanceDate(guidance);
	const now = new Date();
	const updated = await prisma.thesisGuidance.update({
		where: { id: guidance.id },
		data: {
			// Legacy "rescheduled" is normalized to "accepted" (K19).
			status: GUIDANCE_STATUS.ACCEPTED,
			approvedDate: start,
			duration: durationMinutes,
			rescheduleReason,
			rescheduledAt: now,
		},
		include: {
			thesis: { include: { student: { include: { user: true } } } },
			supervisor: { include: { user: true } },
			milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
		},
	});

	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.GUIDANCE_RESCHEDULED,
		entityType: ENTITY_TYPES.THESIS_GUIDANCE,
		entityId: guidance.id,
		oldValues: { status: guidance.status, date: previousDate, duration: guidance.duration },
		newValues: { status: GUIDANCE_STATUS.ACCEPTED, date: start, duration: durationMinutes, reason: rescheduleReason },
	});

	const studentUserId = updated.thesis?.student?.user?.id;
	const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
	const calendarMoves = [
		[updated.supervisor?.user?.id || userId, updated.supervisorCalendarEventId],
		[studentUserId, updated.studentCalendarEventId],
	];
	for (const [calendarUserId, eventId] of calendarMoves) {
		if (!calendarUserId || !eventId) continue;
		try {
			await updateCalendarEvent(calendarUserId, eventId, { startTime: start, endTime: end });
		} catch (e) {
			console.warn("Failed to move calendar event (lecturer reschedule):", e?.message || e);
		}
	}

	if (studentUserId) {
		const lecturerName = toTitleCaseName(updated.supervisor?.user?.fullName || "Dosen");
		const oldStr = previousDate ? formatDateTimeWib(new Date(previousDate), { withWeekday: true }) : "-";
		const newStr = formatDateTimeWib(start, { withWeekday: true });
		try {
			await createNotificationsForUsers([studentUserId], {
				title: "Jadwal Bimbingan Diubah Dosen",
				message: `${lecturerName} mengubah jadwal bimbingan dari ${oldStr} menjadi ${newStr}. Alasan: ${rescheduleReason}`,
			});
			sendFcmToUsers([studentUserId], {
				title: "Jadwal Bimbingan Diubah Dosen",
				body: `Jadwal baru: ${newStr}. Alasan: ${rescheduleReason}`,
				data: {
					type: "thesis-guidance:rescheduled-by-lecturer",
					guidanceId: String(guidance.id),
					role: ROLE_CATEGORY.STUDENT,
					playSound: "true",
				},
			}).catch((e) => console.warn("FCM notify failed (lecturer reschedule):", e?.message || e));
		} catch (e) {
			console.warn("Notify failed (lecturer reschedule):", e?.message || e);
		}
	}

	const titles = await resolveMilestoneTitles(updated);
	return { guidance: toFlatGuidance({ ...updated, milestoneTitles: titles }) };
}

/**
 * K19: the lecturer asks for a revised summary: summary_pending -> summary_rejected, with
 * mandatory notes kept in `supervisorFeedback`. The student resubmits via submit-summary.
 */
export async function rejectSessionSummaryService(userId, guidanceId, { notes } = {}) {
	const { guidance } = await loadLecturerGuidance(userId, guidanceId);
	assertGuidanceStatus(guidance, [GUIDANCE_STATUS.SUMMARY_PENDING], "diminta perbaikan ringkasannya");

	const revisionNotes = String(notes ?? "").trim();
	if (!revisionNotes) {
		const err = new Error("Catatan perbaikan ringkasan wajib diisi");
		err.statusCode = 400;
		throw err;
	}

	const updated = await prisma.thesisGuidance.update({
		where: { id: guidance.id },
		data: { status: GUIDANCE_STATUS.SUMMARY_REJECTED, supervisorFeedback: revisionNotes },
		include: {
			thesis: { include: { student: { include: { user: true } } } },
			supervisor: { include: { user: true } },
			milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
		},
	});

	await logAudit({
		actorUserId: userId,
		action: AUDIT_ACTIONS.GUIDANCE_SUMMARY_REJECTED,
		entityType: ENTITY_TYPES.THESIS_GUIDANCE,
		entityId: guidance.id,
		oldValues: { status: guidance.status },
		newValues: { status: GUIDANCE_STATUS.SUMMARY_REJECTED, notes: revisionNotes },
	});

	const studentUserId = updated.thesis?.student?.user?.id;
	if (studentUserId) {
		const lecturerName = toTitleCaseName(updated.supervisor?.user?.fullName || "Dosen");
		try {
			await createNotificationsForUsers([studentUserId], {
				title: "Ringkasan Bimbingan Perlu Diperbaiki",
				message: `${lecturerName} meminta perbaikan ringkasan bimbingan. Catatan: ${revisionNotes}`,
			});
			sendFcmToUsers([studentUserId], {
				title: "Ringkasan Bimbingan Perlu Diperbaiki",
				body: `Catatan: ${revisionNotes}`,
				data: {
					type: "thesis-guidance:summary-rejected",
					guidanceId: String(guidance.id),
					role: ROLE_CATEGORY.STUDENT,
					playSound: "true",
				},
			}).catch((e) => console.warn("FCM notify failed (summary rejected):", e?.message || e));
		} catch (e) {
			console.warn("Notify failed (summary rejected):", e?.message || e);
		}
	}

	const titles = await resolveMilestoneTitles(updated);
	return { guidance: toFlatGuidance({ ...updated, milestoneTitles: titles }) };
}

/**
 * Get detailed guidance info for lecturer (for session detail page)
 */
export async function getGuidanceDetailService(userId, guidanceId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Find guidance with all related data
	const guidance = await prisma.thesisGuidance.findFirst({
		where: { id: guidanceId, supervisorId: lecturer.id },
		include: {
			thesis: {
				include: {
					student: { include: { user: true } },
				},
			},
			supervisor: { include: { user: true } },
			milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
		},
	});

	if (!guidance) {
		const err = new Error("Guidance not found or not assigned to you");
		err.statusCode = 404;
		throw err;
	}

	// Resolve milestone titles
	const milestoneTitles = await resolveMilestoneTitles(guidance);

	const flat = {
		id: guidance.id,
		status: guidance.status,
		studentId: guidance.thesis?.studentId || guidance.thesis?.student?.id || null,
		studentName: guidance.thesis?.student?.user?.fullName || null,
		studentNim: guidance.thesis?.student?.user?.identityNumber || null,
		studentEmail: guidance.thesis?.student?.user?.email || null,
		supervisorId: guidance.supervisorId,
		supervisorName: guidance.supervisor?.user?.fullName || null,
		thesisId: guidance.thesisId,
		thesisTitle: guidance.thesis?.title || null,
		// Dates
		requestedDate: guidance.requestedDate || null,
		requestedDateFormatted: guidance.requestedDate
			? formatDateTimeJakarta(guidance.requestedDate, { withDay: true })
			: null,
		approvedDate: guidance.approvedDate || null,
		approvedDateFormatted: guidance.approvedDate
			? formatDateTimeJakarta(guidance.approvedDate, { withDay: true })
			: null,
		completedAt: guidance.completedAt || null,
		completedAtFormatted: guidance.completedAt
			? formatDateTimeJakarta(guidance.completedAt, { withDay: true })
			: null,
		// Session details
		duration: guidance.duration || 60,
		documentUrl: guidance.documentUrl || null,
		// Notes
		studentNotes: guidance.studentNotes || null,
		supervisorFeedback: guidance.supervisorFeedback || null,
		rejectionReason: guidance.rejectionReason || null,
		// K19: suggested time, lecturer reschedule, cancellation
		suggestedDate: guidance.suggestedDate || null,
		suggestedDateFormatted: guidance.suggestedDate ? formatDateTimeJakarta(guidance.suggestedDate, { withDay: true }) : null,
		rescheduleReason: guidance.rescheduleReason || null,
		rescheduledAt: guidance.rescheduledAt || null,
		cancelReason: guidance.cancelReason || null,
		cancelledAt: guidance.cancelledAt || null,
		cancelledBy: guidance.cancelledBy || null,
		// Session summary (filled by student)
		sessionSummary: guidance.sessionSummary || null,
		actionItems: guidance.actionItems || null,
		summarySubmittedAt: guidance.summarySubmittedAt || null,
		summarySubmittedAtFormatted: guidance.summarySubmittedAt
			? formatDateTimeJakarta(guidance.summarySubmittedAt, { withDay: true })
			: null,
		// Milestones
		milestoneId: guidance.milestones?.[0]?.milestoneId || null,
		milestoneIds: (guidance.milestones || []).map((m) => m.milestoneId),
		milestoneTitles,
		milestoneName: milestoneTitles.length > 0 ? milestoneTitles[0] : null,
		document: guidanceDocument(guidance),
		// Timestamps
		createdAt: guidance.createdAt || null,
		createdAtFormatted: guidance.createdAt
			? formatDateTimeJakarta(guidance.createdAt, { withDay: true })
			: null,
		updatedAt: guidance.updatedAt || null,
	};

	return { guidance: flat };
}

/**
 * Send warning notification to student about thesis progress
 */
export async function sendWarningNotificationService(userId, thesisId, warningType) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Get thesis with student info
	const thesis = await prisma.thesis.findUnique({
		where: { id: thesisId },
		include: {
			student: {
				include: {
					user: { select: { id: true, fullName: true } }
				}
			},
			thesisSupervisors: {
				// Only an ACTIVE supervisor relation may send a warning as supervisor.
				where: { lecturerId: lecturer.id, status: "active" },
				include: {
					role: { select: { name: true } }
				}
			}
		}
	});

	if (!thesis) {
		const err = new Error("Thesis not found");
		err.statusCode = 404;
		throw err;
	}

	// Check if lecturer is supervisor of this thesis
	if (!thesis.thesisSupervisors.length) {
		const err = new Error("You are not a supervisor of this thesis");
		err.statusCode = 403;
		throw err;
	}

	const studentUserId = thesis.student?.user?.id;
	const studentName = thesis.student?.user?.fullName || "Mahasiswa";
	const lecturerName = toTitleCaseName((await prisma.user.findUnique({ where: { id: userId } }))?.fullName || "Dosen");

	if (!studentUserId) {
		const err = new Error("Student not found for this thesis");
		err.statusCode = 404;
		throw err;
	}

	// Define warning messages based on type
	const warningMessages = {
		SLOW: {
			title: "⚠️ Peringatan Progress Tugas Akhir",
			body: `Halo ${toTitleCaseName(studentName)}, progress tugas akhir Anda terdeteksi lambat. Segera jadwalkan bimbingan dengan dosen pembimbing untuk mendiskusikan kendala yang dihadapi.`,
			notifBody: `Progress tugas akhir Anda terdeteksi lambat. Dosen pembimbing ${lecturerName} mengingatkan Anda untuk segera menjadwalkan bimbingan.`
		},
		AT_RISK: {
			title: "🚨 Peringatan Serius: Progress Tugas Akhir",
			body: `Halo ${toTitleCaseName(studentName)}, status tugas akhir Anda dalam kondisi BERISIKO. Segera hubungi dosen pembimbing untuk menghindari kegagalan.`,
			notifBody: `Status tugas akhir Anda dalam kondisi BERISIKO. Dosen pembimbing ${lecturerName} meminta Anda segera menghubungi beliau.`
		},
		FAILED: {
			title: "❌ Pemberitahuan Status Tugas Akhir",
			body: `Halo ${toTitleCaseName(studentName)}, tugas akhir Anda telah melampaui batas waktu. Segera hubungi dosen pembimbing untuk langkah selanjutnya.`,
			notifBody: `Tugas akhir Anda telah melampaui batas waktu. Segera lakukan pendaftaran ulang tugas akhir ke Departemen.`
		}
	};

	const message = warningMessages[warningType] || warningMessages.SLOW;

	// Send FCM notification
	await sendFcmToUsers([studentUserId], {
		title: message.title,
		body: message.body,
		data: {
			type: "thesis_warning",
			thesisId: thesis.id,
			warningType
		}
	});

	// Create in-app notification
	await createNotificationsForUsers([studentUserId], {
		title: message.title,
		message: message.notifBody,
		type: "thesis_warning",
		referenceId: thesis.id
	});

	return {
		success: true,
		message: `Peringatan telah dikirim ke ${toTitleCaseName(studentName)}`
	};
}

/**
 * Approve Thesis Proposal (Lifecycle Phase 3)
 * @param {string} userId
 * @param {string} thesisId
 */
export async function approveThesisProposalService(userId, thesisId) {
	// Revival decision (e3): baseline let a supervisor activate a proposal directly
	// (thesisStatusId=null). That would bypass TA-03/TA-04 promotion, so the lock is kept.
	void userId;
	void thesisId;
	throw new ForbiddenError(
		"Pengesahan proposal tidak lagi dilakukan oleh dosen pembimbing. Lanjutkan proses melalui penilaian TA-03; promosi aktif berjalan otomatis setelah TA-03 final dan KRS Tugas Akhir terkonfirmasi.",
	);
}

// ==================== STUDENT TRANSFER ====================

/**
 * Get eligible lecturers for student transfer (have active "Pembimbing 1" role)
 */
export async function getEligibleTransferLecturersService(userId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const lecturers = await findEligibleTransferLecturers(lecturer.id);
	return { lecturers };
}

/**
 * Request student transfer to another lecturer
 */
export async function requestStudentTransferService(userId, { thesisIds, targetLecturerId, reason }) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Verify current lecturer owns these theses
	const supervisorRecords = await findSupervisorRecords(thesisIds, lecturer.id);
	if (supervisorRecords.length !== thesisIds.length) {
		const err = new Error("Some theses are not supervised by you");
		err.statusCode = 400;
		throw err;
	}

	// Verify target lecturer has "Pembimbing 1" role
	const targetHasP1 = await lecturerHasRole(targetLecturerId, ROLES.PEMBIMBING_1);
	if (!targetHasP1) {
		const err = new Error("Dosen tujuan tidak memiliki role Pembimbing 1");
		err.statusCode = 400;
		throw err;
	}

	// Verify target is not the same as source
	if (targetLecturerId === lecturer.id) {
		const err = new Error("Tidak bisa transfer ke diri sendiri");
		err.statusCode = 400;
		throw err;
	}

	// Build minimal student refs (IDs only, no names — keeps payload small)
	const refs = supervisorRecords.map((sr) => ({
		tId: sr.thesisId,
		sId: sr.id,
	}));

	// Find all active Kadep users
	const kadepUsers = await findKadepUsers();
	if (kadepUsers.length === 0) {
		const err = new Error("Tidak ditemukan Ketua Departemen aktif untuk menyetujui transfer");
		err.statusCode = 400;
		throw err;
	}

	// --- Send notification to TARGET LECTURER (Dosen B) ---
	const txPayload = JSON.stringify({
		t: "TX",
		src: lecturer.id,
		refs,
		r: reason,
	});
	await createTransferNotification(targetLecturerId, txPayload);

	// --- Send notification to KADEP ---
	const kadepPayload = JSON.stringify({
		t: "TX_KADEP",
		src: lecturer.id,
		tgt: targetLecturerId,
		refs,
		r: reason,
		tgtApproved: false,
		st: "pending",
	});
	for (const kadep of kadepUsers) {
		await createKadepTransferNotification(kadep.id, kadepPayload);
	}

	// Build student names for readable notifications
	const studentNames = supervisorRecords
		.map((sr) => toTitleCaseName(sr.thesis?.student?.user?.fullName || "Mahasiswa"))
		.join(", ");

	// Get names
	const sourceUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
	const sourceName = toTitleCaseName(sourceUser?.fullName || "Dosen");
	const targetUser = await prisma.user.findUnique({ where: { id: targetLecturerId }, select: { fullName: true } });
	const targetName = toTitleCaseName(targetUser?.fullName || "Dosen");

	// Send human-readable notification to target lecturer
	await createInfoNotification(
		targetLecturerId,
		"Permintaan Transfer Mahasiswa",
		`${sourceName} ingin mentransfer ${refs.length} mahasiswa (${studentNames}) kepada Anda. Silakan review.`
	);

	// Send FCM to target lecturer
	await sendFcmToUsers([targetLecturerId], {
		title: "Permintaan Transfer Mahasiswa",
		body: `${sourceName} ingin mentransfer ${refs.length} mahasiswa kepada Anda`,
		data: { type: "transfer-request-incoming" },
	});

	// Send human-readable notification to all Kadep
	const kadepUserIds = kadepUsers.map((k) => k.id);
	await createNotificationsForUsers(kadepUserIds, {
		title: "Permintaan Transfer Mahasiswa",
		message: `${sourceName} mengajukan transfer ${refs.length} mahasiswa (${studentNames}) ke ${targetName}. Menunggu persetujuan dosen tujuan.`,
	});

	// Send FCM push notification to Kadep
	await sendFcmToUsers(kadepUserIds, {
		title: "Permintaan Transfer Mahasiswa",
		body: `${sourceName} mengajukan transfer ${refs.length} mahasiswa ke ${targetName}`,
		data: { type: "transfer-request-kadep" },
	});

	// Also notify source lecturer that request was sent
	await createInfoNotification(
		userId,
		"Transfer Mahasiswa Dikirim",
		`Permintaan transfer ${refs.length} mahasiswa ke ${targetName} telah dikirim. Menunggu persetujuan dosen tujuan dan Ketua Departemen.`
	);

	return {
		message: `Permintaan transfer ${refs.length} mahasiswa ke ${targetName} berhasil dikirim. Menunggu persetujuan dosen tujuan dan Ketua Departemen.`,
		studentCount: refs.length,
	};
}

/**
 * Get incoming transfer requests for the current lecturer
 * Reads compact payload from notification and enriches with student details from DB
 */
export async function getIncomingTransferRequestsService(userId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const notifications = await findPendingTransferNotifications(lecturer.id);
	const transfers = [];

	for (const notif of notifications) {
		try {
			const payload = JSON.parse(notif.message);
			if (payload.t !== "TX") continue;

			// Look up source lecturer name
			const srcUser = await prisma.user.findUnique({
				where: { id: payload.src },
				select: { fullName: true },
			});

			// Enrich student details from thesis supervisor records
			const thesisIds = (payload.refs || []).map((r) => r.tId);
			const supRecords = thesisIds.length
				? await prisma.thesisSupervisors.findMany({
					where: { thesisId: { in: thesisIds } },
					include: {
						role: { select: { name: true } },
						thesis: {
							include: {
								student: {
									include: { user: { select: { fullName: true, identityNumber: true } } },
								},
							},
						},
					},
				})
				: [];

			// Build look-up map: thesisId -> first matching supervisor record
			const byThesis = {};
			for (const sr of supRecords) {
				if (!byThesis[sr.thesisId]) byThesis[sr.thesisId] = sr;
			}

			const students = (payload.refs || []).map((ref) => {
				const sr = byThesis[ref.tId];
				return {
					thesisId: ref.tId,
					thesisSupervisorId: ref.sId,
					studentName: sr?.thesis?.student?.user?.fullName || "Unknown",
					studentNim: sr?.thesis?.student?.user?.identityNumber || "-",
					thesisTitle: sr?.thesis?.title || "Untitled",
					role: sr?.role?.name || "Pembimbing",
				};
			});

			transfers.push({
				notificationId: notif.id,
				sourceLecturerId: payload.src,
				sourceLecturerName: toTitleCaseName(srcUser?.fullName || "Dosen"),
				students,
				reason: payload.r,
				createdAt: notif.createdAt,
			});
		} catch {
			// Skip non-JSON or malformed notifications
		}
	}

	return { count: transfers.length, transfers };
}

/**
 * Approve a transfer request (TARGET LECTURER) — does NOT execute swap yet.
 * Marks target notification read, updates kadep notifications to tgtApproved=true,
 * and notifies kadep + source that target has approved.
 */
export async function approveTransferRequestService(userId, notificationId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Find and validate the notification
	const notif = await findTransferNotificationById(notificationId);
	if (!notif || notif.userId !== lecturer.id) {
		const err = new Error("Transfer request not found");
		err.statusCode = 404;
		throw err;
	}
	if (notif.isRead) {
		const err = new Error("Transfer request already processed");
		err.statusCode = 400;
		throw err;
	}

	let payload;
	try {
		payload = JSON.parse(notif.message);
	} catch {
		const err = new Error("Invalid transfer data");
		err.statusCode = 400;
		throw err;
	}

	if (payload.t !== "TX") {
		const err = new Error("Invalid or already processed transfer request");
		err.statusCode = 400;
		throw err;
	}

	const sourceLecturerId = payload.src;
	const refs = payload.refs || [];

	// Mark target notification as read
	await markNotificationRead(notificationId);

	// Update all kadep TX_KADEP notifications for this transfer to tgtApproved=true
	const kadepNotifs = await findKadepTransferNotificationsBySrcTgt(sourceLecturerId, lecturer.id);
	for (const kn of kadepNotifs) {
		try {
			const kPayload = JSON.parse(kn.message);
			kPayload.tgtApproved = true;
			await updateNotificationMessage(kn.id, JSON.stringify(kPayload));
		} catch {
			// skip malformed
		}
	}

	// Get names for notifications
	const approverUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
	const approverName = toTitleCaseName(approverUser?.fullName || "Dosen");
	const sourceUser = await prisma.user.findUnique({ where: { id: sourceLecturerId }, select: { fullName: true } });
	const sourceName = toTitleCaseName(sourceUser?.fullName || "Dosen");

	// Notify source lecturer
	await createInfoNotification(
		sourceLecturerId,
		"Transfer Disetujui Dosen Tujuan",
		`${approverName} telah menyetujui transfer ${refs.length} mahasiswa. Menunggu persetujuan Ketua Departemen.`
	);

	// Notify kadep that target has approved
	const kadepUsers = await findKadepUsers();
	const kadepUserIds = kadepUsers.map((k) => k.id);
	await createNotificationsForUsers(kadepUserIds, {
		title: "Dosen Tujuan Menyetujui Transfer",
		message: `${approverName} menyetujui permintaan transfer dari ${sourceName}. Silakan berikan persetujuan akhir.`,
	});
	await sendFcmToUsers(kadepUserIds, {
		title: "Dosen Tujuan Menyetujui Transfer",
		body: `${approverName} menyetujui transfer dari ${sourceName}. Menunggu approval Kadep.`,
		data: { type: "transfer-target-approved" },
	});

	return {
		message: `Transfer disetujui. Menunggu persetujuan Ketua Departemen.`,
		results: refs.map((r) => ({ thesisId: r.tId, success: true })),
	};
}

/**
 * Reject a transfer request (TARGET LECTURER)
 * Marks target notification read, updates kadep notifications to st=target_rejected, notifies source.
 */
export async function rejectTransferRequestService(userId, notificationId, { reason } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const notif = await findTransferNotificationById(notificationId);
	if (!notif || notif.userId !== lecturer.id) {
		const err = new Error("Transfer request not found");
		err.statusCode = 404;
		throw err;
	}
	if (notif.isRead) {
		const err = new Error("Transfer request already processed");
		err.statusCode = 400;
		throw err;
	}

	let payload;
	try {
		payload = JSON.parse(notif.message);
	} catch {
		const err = new Error("Invalid transfer data");
		err.statusCode = 400;
		throw err;
	}

	// Mark target notification as read (processed)
	await markNotificationRead(notificationId);

	// Update all kadep TX_KADEP notifications: mark as rejected by target, mark read
	const kadepNotifs = await findKadepTransferNotificationsBySrcTgt(payload.src, lecturer.id);
	for (const kn of kadepNotifs) {
		try {
			const kPayload = JSON.parse(kn.message);
			kPayload.st = "target_rejected";
			await updateNotificationMessage(kn.id, JSON.stringify(kPayload));
			await markNotificationRead(kn.id);
		} catch {
			// skip malformed
		}
	}

	// Notify source lecturer
	const rejecterUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
	const rejecterName = toTitleCaseName(rejecterUser?.fullName || "Dosen");
	const rejectReason = reason ? ` Alasan: ${reason}` : "";

	await createInfoNotification(
		payload.src,
		"Transfer Mahasiswa Ditolak",
		`${rejecterName} menolak permintaan transfer mahasiswa.${rejectReason}`
	);

	// Notify kadep that target rejected
	const kadepUsers = await findKadepUsers();
	const kadepUserIds = kadepUsers.map((k) => k.id);
	if (kadepUserIds.length > 0) {
		const sourceUser = await prisma.user.findUnique({ where: { id: payload.src }, select: { fullName: true } });
		const sourceName = toTitleCaseName(sourceUser?.fullName || "Dosen");
		await createNotificationsForUsers(kadepUserIds, {
			title: "Transfer Ditolak Dosen Tujuan",
			message: `${rejecterName} menolak permintaan transfer dari ${sourceName}.${rejectReason}`,
		});
	}

	return { message: "Transfer request ditolak" };
}

// ==================== KADEP TRANSFER APPROVAL ====================

/**
 * Get pending transfer requests for Kadep review
 */
export async function getKadepPendingTransfersService(userId) {
	const notifications = await findPendingKadepTransferNotifications(userId);
	const transfers = [];

	for (const notif of notifications) {
		try {
			const payload = JSON.parse(notif.message);
			if (payload.t !== "TX_KADEP") continue;

			// Get source lecturer info
			const srcUser = await prisma.user.findUnique({
				where: { id: payload.src },
				select: { fullName: true },
			});

			// Get target lecturer info
			const tgtUser = await prisma.user.findUnique({
				where: { id: payload.tgt },
				select: { fullName: true },
			});

			// Get student details
			const thesisIds = (payload.refs || []).map((r) => r.tId);
			const supRecords = thesisIds.length
				? await prisma.thesisSupervisors.findMany({
					where: { thesisId: { in: thesisIds } },
					include: {
						role: { select: { name: true } },
						thesis: {
							include: {
								student: {
									include: { user: { select: { fullName: true, identityNumber: true } } },
								},
							},
						},
					},
				})
				: [];

			const byThesis = {};
			for (const sr of supRecords) {
				if (!byThesis[sr.thesisId]) byThesis[sr.thesisId] = sr;
			}

			const students = (payload.refs || []).map((ref) => {
				const sr = byThesis[ref.tId];
				return {
					thesisId: ref.tId,
					thesisSupervisorId: ref.sId,
					studentName: sr?.thesis?.student?.user?.fullName || "Unknown",
					studentNim: sr?.thesis?.student?.user?.identityNumber || "-",
					thesisTitle: sr?.thesis?.title || "Untitled",
					role: sr?.role?.name || "Pembimbing",
				};
			});

			transfers.push({
				notificationId: notif.id,
				sourceLecturerId: payload.src,
				sourceLecturerName: toTitleCaseName(srcUser?.fullName || "Dosen"),
				targetLecturerId: payload.tgt,
				targetLecturerName: toTitleCaseName(tgtUser?.fullName || "Dosen"),
				students,
				reason: payload.r,
				targetApproved: !!payload.tgtApproved,
				status: payload.st || "pending",
				createdAt: notif.createdAt,
			});
		} catch {
			// Skip non-JSON or malformed notifications
		}
	}

	return { count: transfers.length, transfers };
}

/**
 * Get ALL kadep transfer notifications (for history view with pagination)
 */
export async function getKadepAllTransfersService(userId, { page = 1, pageSize = 10, search = "", status = "" } = {}) {
	const { notifications, total } = await findAllKadepTransferNotifications(userId, { page, pageSize, search });
	const transfers = [];

	for (const notif of notifications) {
		try {
			const payload = JSON.parse(notif.message);
			if (payload.t !== "TX_KADEP") continue;

			// Filter by status if provided
			const transferStatus = payload.st || "pending";
			if (status && transferStatus !== status) continue;

			const srcUser = await prisma.user.findUnique({ where: { id: payload.src }, select: { fullName: true } });
			const tgtUser = await prisma.user.findUnique({ where: { id: payload.tgt }, select: { fullName: true } });

			const thesisIds = (payload.refs || []).map((r) => r.tId);
			const supRecords = thesisIds.length
				? await prisma.thesisSupervisors.findMany({
					where: { thesisId: { in: thesisIds } },
					include: {
						role: { select: { name: true } },
						thesis: {
							include: {
								student: {
									include: { user: { select: { fullName: true, identityNumber: true } } },
								},
							},
						},
					},
				})
				: [];

			const byThesis = {};
			for (const sr of supRecords) {
				if (!byThesis[sr.thesisId]) byThesis[sr.thesisId] = sr;
			}

			const students = (payload.refs || []).map((ref) => {
				const sr = byThesis[ref.tId];
				return {
					thesisId: ref.tId,
					thesisSupervisorId: ref.sId,
					studentName: sr?.thesis?.student?.user?.fullName || "Unknown",
					studentNim: sr?.thesis?.student?.user?.identityNumber || "-",
					thesisTitle: sr?.thesis?.title || "Untitled",
					role: sr?.role?.name || "Pembimbing",
				};
			});

			transfers.push({
				notificationId: notif.id,
				sourceLecturerId: payload.src,
				sourceLecturerName: toTitleCaseName(srcUser?.fullName || "Dosen"),
				targetLecturerId: payload.tgt,
				targetLecturerName: toTitleCaseName(tgtUser?.fullName || "Dosen"),
				students,
				reason: payload.r,
				targetApproved: !!payload.tgtApproved,
				status: transferStatus,
				createdAt: notif.createdAt,
			});
		} catch {
			// Skip non-JSON or malformed
		}
	}

	return {
		data: transfers,
		pagination: {
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		},
	};
}

/**
 * Kadep approves a transfer request → executes the actual supervisor swap
 * Only allowed if target lecturer has already approved (tgtApproved=true)
 */
export async function kadepApproveTransferService(userId, notificationId) {
	const notif = await findTransferNotificationById(notificationId);
	if (!notif || notif.userId !== userId) {
		const err = new Error("Transfer request not found");
		err.statusCode = 404;
		throw err;
	}
	if (notif.isRead) {
		const err = new Error("Transfer request already processed");
		err.statusCode = 400;
		throw err;
	}

	let payload;
	try {
		payload = JSON.parse(notif.message);
	} catch {
		const err = new Error("Invalid transfer data");
		err.statusCode = 400;
		throw err;
	}

	if (payload.t !== "TX_KADEP") {
		const err = new Error("Invalid kadep transfer request");
		err.statusCode = 400;
		throw err;
	}

	if (!payload.tgtApproved) {
		const err = new Error("Dosen tujuan belum menyetujui transfer ini");
		err.statusCode = 400;
		throw err;
	}

	const targetLecturerId = payload.tgt;
	const sourceLecturerId = payload.src;
	const refs = payload.refs || [];

	// Revival decision (e5): baseline flow is kept, but the transaction body follows the
	// active app (status-based rows, quota sync, no P2 deletion or automatic P2->P1 promotion).
	// Execute the actual supervisor swap in a transaction
	const results = await prisma.$transaction(async (tx) => {
		const txResults = [];
		for (const ref of refs) {
			const sourceRecord = await tx.thesisSupervisors.findFirst({
				where: { id: ref.sId, thesisId: ref.tId, status: "active" },
				include: {
					role: { select: { id: true, name: true } },
					thesis: { select: { academicYearId: true } },
				},
			});

			if (!sourceRecord) {
				throw new Error(`Active supervisor record not found for thesis ${ref.tId}`);
			}

			const targetActiveRecords = await tx.thesisSupervisors.findMany({
				where: {
					thesisId: ref.tId,
					lecturerId: targetLecturerId,
					status: "active",
					id: { not: ref.sId },
				},
				select: { id: true },
			});

			if (targetActiveRecords.length > 0) {
				await tx.thesisSupervisors.updateMany({
					where: { id: { in: targetActiveRecords.map((record) => record.id) } },
					data: { status: "terminated", activeRoleKey: null },
				});
			}

			// Transfer the supervisor record to the target lecturer.
			await tx.thesisSupervisors.update({
				where: { id: ref.sId },
				data: { lecturerId: targetLecturerId },
			});

			const allSupRecords = await tx.thesisSupervisors.findMany({
				where: { thesisId: ref.tId, status: "active" },
				include: { role: { select: { id: true, name: true } } },
			});

			const duplicateRole = [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2].find(
				(roleName) => allSupRecords.filter((record) => record.role?.name === roleName).length > 1,
			);
			if (duplicateRole) {
				throw new Error(`Duplicate active ${duplicateRole} remains after transfer for thesis ${ref.tId}`);
			}

			if (sourceRecord.thesis?.academicYearId) {
				await syncLecturerQuotaCurrentCount(sourceLecturerId, sourceRecord.thesis.academicYearId, { client: tx });
				await syncLecturerQuotaCurrentCount(targetLecturerId, sourceRecord.thesis.academicYearId, { client: tx });
			}

			txResults.push({ thesisId: ref.tId, success: true, promoted: false });
		}
		return txResults;
	});

	// Mark kadep notification as read and update status
	const updatedPayload = { ...payload, st: "approved" };
	await updateNotificationMessage(notificationId, JSON.stringify(updatedPayload));
	await markNotificationRead(notificationId);

	// Also mark other kadep notifications for the same transfer
	const allKadepNotifs = await findKadepTransferNotificationsBySrcTgt(sourceLecturerId, targetLecturerId);
	for (const kn of allKadepNotifs) {
		if (kn.id !== notificationId) {
			try {
				const kPayload = JSON.parse(kn.message);
				kPayload.st = "approved";
				await updateNotificationMessage(kn.id, JSON.stringify(kPayload));
				await markNotificationRead(kn.id);
			} catch {
				// skip
			}
		}
	}

	// Get names for notifications
	const kadepUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
	const kadepName = toTitleCaseName(kadepUser?.fullName || "Ketua Departemen");
	const sourceUser = await prisma.user.findUnique({ where: { id: sourceLecturerId }, select: { fullName: true } });
	const sourceName = toTitleCaseName(sourceUser?.fullName || "Dosen");
	const targetUser = await prisma.user.findUnique({ where: { id: targetLecturerId }, select: { fullName: true } });
	const targetName = toTitleCaseName(targetUser?.fullName || "Dosen");

	const successCount = results.filter((r) => r.success).length;

	// Notify source lecturer
	await createInfoNotification(
		sourceLecturerId,
		"Transfer Mahasiswa Disetujui",
		`${kadepName} telah menyetujui transfer ${successCount} mahasiswa ke ${targetName}. Transfer berhasil dilaksanakan.`
	);

	// Notify target lecturer
	await createInfoNotification(
		targetLecturerId,
		"Transfer Mahasiswa Selesai",
		`${kadepName} menyetujui transfer. ${successCount} mahasiswa dari ${sourceName} sekarang menjadi bimbingan Anda.`
	);

	// Send FCM
	await sendFcmToUsers([targetLecturerId], {
		title: "Transfer Mahasiswa Selesai",
		body: `${successCount} mahasiswa dari ${sourceName} sekarang menjadi bimbingan Anda`,
		data: { type: "transfer-completed" },
	});

	// Notify students that their supervisor has changed
	try {
		for (const ref of refs) {
			const thesis = await prisma.thesis.findUnique({
				where: { id: ref.tId },
				include: { student: { include: { user: { select: { id: true } } } } },
			});
			const studentUserId = thesis?.student?.user?.id;
			if (studentUserId) {
				await createNotificationsForUsers([studentUserId], {
					title: "Dosen Pembimbing Berubah",
					message: `Dosen pembimbing Anda telah berubah. ${targetName} sekarang menjadi pembimbing Anda.`,
				});
				await sendFcmToUsers([studentUserId], {
					title: "Dosen Pembimbing Berubah",
					body: `${targetName} sekarang menjadi dosen pembimbing Anda.`,
					data: { type: "thesis-guidance:supervisor-changed", thesisId: ref.tId },
				});
			}
		}
	} catch (e) {
		console.error("Failed to notify students about transfer:", e?.message || e);
	}

	return {
		message: `Transfer ${successCount} mahasiswa berhasil disetujui dan dilaksanakan`,
		results,
	};
}

/**
 * Kadep rejects a transfer request
 */
export async function kadepRejectTransferService(userId, notificationId, { reason } = {}) {
	const notif = await findTransferNotificationById(notificationId);
	if (!notif || notif.userId !== userId) {
		const err = new Error("Transfer request not found");
		err.statusCode = 404;
		throw err;
	}
	if (notif.isRead) {
		const err = new Error("Transfer request already processed");
		err.statusCode = 400;
		throw err;
	}

	let payload;
	try {
		payload = JSON.parse(notif.message);
	} catch {
		const err = new Error("Invalid transfer data");
		err.statusCode = 400;
		throw err;
	}

	if (payload.t !== "TX_KADEP") {
		const err = new Error("Invalid kadep transfer request");
		err.statusCode = 400;
		throw err;
	}

	// Update status and mark as read
	const updatedPayload = { ...payload, st: "rejected" };
	await updateNotificationMessage(notificationId, JSON.stringify(updatedPayload));
	await markNotificationRead(notificationId);

	// Also mark other kadep notifications for the same transfer
	const allKadepNotifs = await findKadepTransferNotificationsBySrcTgt(payload.src, payload.tgt);
	for (const kn of allKadepNotifs) {
		if (kn.id !== notificationId) {
			try {
				const kPayload = JSON.parse(kn.message);
				kPayload.st = "rejected";
				await updateNotificationMessage(kn.id, JSON.stringify(kPayload));
				await markNotificationRead(kn.id);
			} catch {
				// skip
			}
		}
	}

	// Also mark target lecturer's TX notification as read (cancel it)
	const targetTxNotifs = await findPendingTransferNotifications(payload.tgt);
	for (const txn of targetTxNotifs) {
		try {
			const txPayload = JSON.parse(txn.message);
			if (txPayload.t === "TX" && txPayload.src === payload.src) {
				await markNotificationRead(txn.id);
			}
		} catch {
			// skip
		}
	}

	// Notify source lecturer about rejection
	const kadepUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
	const kadepName = toTitleCaseName(kadepUser?.fullName || "Ketua Departemen");
	const rejectReason = reason ? ` Alasan: ${reason}` : "";

	await createInfoNotification(
		payload.src,
		"Transfer Mahasiswa Ditolak oleh Kadep",
		`${kadepName} menolak permintaan transfer mahasiswa.${rejectReason}`
	);

	// Notify target lecturer that transfer was cancelled
	const targetUser = await prisma.user.findUnique({ where: { id: payload.tgt }, select: { fullName: true } });
	const targetName = toTitleCaseName(targetUser?.fullName || "Dosen");
	await createInfoNotification(
		payload.tgt,
		"Transfer Mahasiswa Dibatalkan",
		`${kadepName} menolak permintaan transfer mahasiswa. Transfer tidak dilanjutkan.`
	);

	// Send FCM to source lecturer
	await sendFcmToUsers([payload.src], {
		title: "Transfer Mahasiswa Ditolak",
		body: `${kadepName} menolak permintaan transfer mahasiswa`,
		data: { type: "transfer-request-rejected-kadep" },
	});

	return { message: "Transfer request ditolak oleh Kadep" };
}
