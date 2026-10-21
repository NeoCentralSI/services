import {
	getLecturerByUserId,
	findMyStudents,
	findGuidanceRequests,
	findGuidanceByIdForLecturer,
	approveGuidanceById,
	rejectGuidanceById,
	getLecturerTheses,
	supervisorRelationState,
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
	findActiveSupervisorRelation,
} from "../../repositories/thesisGuidance/lecturer.guidance.repository.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
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
import { changeActionsForLecturerRow, positionOfSupervisorRoleName } from "../thesis-change-request.service.js";
import {
	THESIS_PROGRESS_SELECT,
	WARNING_SKIP_LABELS,
	resolveProgressWarning,
	summarizeThesisProgress,
} from "../../helpers/thesis-progress.helper.js";
import { isRepeatingProposal } from "../../repositories/thesis-guidance-evaluation.repository.js";
import { getPhaseSummary, getProposalPhaseAccess, PROPOSAL_NOT_ASSIGNED_REASON } from "../../helpers/thesis-phase-access.helper.js";

function ensureLecturer(lecturer) {
	if (!lecturer) {
		const err = new Error("Data dosen untuk akun ini tidak ditemukan");
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
	// Session actions: research, or proposal after Penetapan Pembimbing; not BSS or closed.
	const thesisStatus = relation.thesis?.status;
	if (thesisStatus === THESIS_STATUS.PROPOSAL && (await getProposalPhaseAccess(relation.thesis)).open) {
		return relation;
	}
	if (thesisStatus !== THESIS_STATUS.RESEARCH) {
		const err = new Error(
			thesisStatus === THESIS_STATUS.ON_LEAVE
				? `Tugas akhir mahasiswa sedang berstatus "${THESIS_STATUS_LABELS.on_leave}". Aksi bimbingan tidak dapat dilakukan.`
				: thesisStatus === THESIS_STATUS.PROPOSAL && !(await isRepeatingProposal(relation.thesis.id))
					? PROPOSAL_NOT_ASSIGNED_REASON
					: "Aksi bimbingan hanya dapat dilakukan untuk tugas akhir yang sedang berjalan.",
		);
		err.statusCode = 403;
		throw err;
	}
	return relation;
}

const guidanceStatusLabel = (status) => GUIDANCE_STATUS_LABELS[status] ?? status;

/** A transition starts from an allowed status; otherwise 400 with labels. */
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
		// Jenis (Proposal / Tugas Akhir)
		phase: g.phase,
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
		// Rejection, reschedule and cancellation fields
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

	// Theses whose proposal revision waits for this lecturer as Pembimbing 1 (the row's
	// "Tinjau Proposal Revisi" action).
	const reviewable = rawStudents
		.filter((s) => s.thesisStatus === THESIS_STATUS.PROPOSAL && s.role === ROLES.PEMBIMBING_1
			&& (s.supervisorStatus ?? "active") === "active" && !s.noLongerSupervising)
		.map((s) => s.thesisId);
	const waitingRevision = reviewable.length
		? new Set((await prisma.thesisProposalRevision.findMany({
			where: { thesisId: { in: reviewable }, status: "submitted" },
			select: { thesisId: true },
		})).map((row) => row.thesisId))
		: new Set();

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
		noLongerSupervising: Boolean(s.noLongerSupervising),
		// Derived when read
		activityLevel: s.activityLevel ?? null,
		lastActivityAt: s.lastActivityAt ?? null,
		daysSinceActivity: s.daysSinceActivity ?? null,
		supervisionClock: s.supervisionClock ?? null,
		latestMilestone: s.latestMilestone || "Belum mulai",
		// Milestone progress info
		totalMilestones: s.totalMilestones || 0,
		completedMilestones: s.completedMilestones || 0,
		milestoneProgress: s.milestoneProgress || 0,
		// Guidance info
		completedGuidanceCount: s.completedGuidanceCount || 0,
		lastGuidanceDate: s.lastGuidanceDate ? formatDateTimeJakarta(s.lastGuidanceDate, { withDay: true }) : null,
		// ISO value; the frontend formats it
		lastGuidanceAt: s.lastGuidanceDate || null,
		startDate: s.startDate || null,
		proposalRevisionPending: waitingRevision.has(s.thesisId),
		// "Ajukan Perubahan", "Alihkan" and the open-request marker of the row.
		changeRequest: s.changeState
			? changeActionsForLecturerRow({
				position: positionOfSupervisorRoleName(s.role),
				active: (s.supervisorStatus ?? "active") === "active" && !s.noLongerSupervising,
				thesis: s.changeState,
			})
			: null,
	}));

	return { count: students.length, students };
}

export async function getStudentDetailService(userId, thesisId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const thesis = await findThesisDetailForLecturer(thesisId, lecturer.id);
	if (!thesis) {
		const err = new Error("Tugas akhir tidak ditemukan atau Anda bukan pembimbingnya");
		err.statusCode = 404;
		throw err;
	}

	// Fetch per-guidance uploaded documents (file versioning), stored on session rows
	// Attachments of both phases: proposal drafts travel as session attachments (10.3).
	const guidanceDocuments = await prisma.thesisGuidance.findMany({
		where: {
			thesisId: thesis.id,
			filePath: { not: null },
		},
		select: {
			id: true,
			phase: true,
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
	// Activity level and supervision clock are derived when read.
	const progressSource = await prisma.thesis.findUnique({ where: { id: thesis.id }, select: THESIS_PROGRESS_SELECT });
	const progress = summarizeThesisProgress(progressSource ?? thesis);

	return {
		thesisId: thesis.id,
		title: thesis.title,
		status: thesis.status,
		activityLevel: progress.activityLevel,
		lastActivityAt: progress.lastActivityAt,
		daysSinceActivity: progress.daysSinceActivity,
		supervisionClock: progress.supervisionClock,
		// True while the thesis is back in proposal because of a guidance evaluation.
		repeatingProposal: thesis.status === THESIS_STATUS.PROPOSAL ? await isRepeatingProposal(thesis.id) : false,
		// Current phase, Penetapan Pembimbing, and per-phase counts for display.
		...(await getPhaseSummary(thesis)),
		startDate: thesis.startDate,
		student: {
			id: thesis.student?.id,
			fullName: thesis.student?.user?.fullName,
			nim: thesis.student?.user?.identityNumber,
			email: thesis.student?.user?.email,
		},
		document: latestReportDocument
			? { id: latestReportDocument.id, fileName: latestReportDocument.fileName, url: latestReportDocument.url }
			: null,
		// Final proposal of the latest Research Method attempt.
		proposalDocument: (() => {
			const attempt = thesis.researchMethodAssessments?.[0];
			if (!attempt?.proposalFilePath) return null;
			return {
				id: attempt.id,
				fileName: attempt.proposalFileName || path.basename(attempt.proposalFilePath),
				url: uploadUrl(attempt.proposalFilePath),
			};
		})(),
		uploadedFiles: guidanceDocuments.map((g) => ({
			id: g.id,
			phase: g.phase,
			fileName: g.fileName || path.basename(g.filePath || ""),
			filePath: g.filePath,
			uploadedAt: g.fileUploadedAt,
			guidanceDate: g.approvedDate || g.requestedDate,
		})),
		milestones: (await withFeedbackAuthor(thesis.thesisMilestones)).map(m => ({
			id: m.id,
			title: m.title,
			status: m.status,
			phase: m.phase,
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
		userRole: thesis.thesisSupervisors?.find(p => p.lecturer?.user?.id === userId)?.role?.name || null,
		// A lecturer whose relation ended before the thesis closed reads only.
		noLongerSupervising: await (async () => {
			const relations = (await prisma.thesisSupervisors.findMany({
				where: { thesisId: thesis.id, lecturerId: lecturer.id },
				select: { status: true, updatedAt: true },
			})) ?? [];
			return relations.length > 0 && relations.every((relation) => supervisorRelationState(relation, thesis) === "ended");
		})(),
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

	// A rejection always carries a reason; a suggested time is optional and future.
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
	// The lecturer cancels a scheduled session (legacy "rescheduled" included).
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
		const err = new Error("Tugas akhir mahasiswa ini tidak ada di daftar bimbingan Anda");
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
	// Pembimbing 1 or Pembimbing 2 without the milestone review flow. Completion is only through
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
		const err = new Error("Bimbingan tidak ditemukan atau bukan bimbingan Anda");
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
		const err = new Error("Tugas akhir mahasiswa ini tidak ada di daftar bimbingan Anda");
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
		phase: g.phase,
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
	// Only a submitted summary can be approved (-> completed).
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
 * The lecturer moves a scheduled session. The new time applies immediately, the status
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
			// Legacy "rescheduled" is normalized to "accepted".
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
 * The lecturer asks for a revised summary: summary_pending -> summary_rejected, with
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
		const err = new Error("Bimbingan tidak ditemukan atau bukan bimbingan Anda");
		err.statusCode = 404;
		throw err;
	}

	// Resolve milestone titles
	const milestoneTitles = await resolveMilestoneTitles(guidance);

	const flat = {
		id: guidance.id,
		status: guidance.status,
		phase: guidance.phase,
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
		// Suggested time, lecturer reschedule, cancellation
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
 * Send warning notification to student about thesis progress.
 * The wording follows the activity level of the thesis, derived here: the client does not
 * choose it. A thesis that is not `research`, or whose activity is Lancar, gets no warning (400).
 */
export async function sendWarningNotificationService(userId, thesisId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Get thesis with student info and what the activity helper reads
	const thesis = await prisma.thesis.findUnique({
		where: { id: thesisId },
		select: {
			id: true,
			...THESIS_PROGRESS_SELECT,
			student: {
				select: {
					user: { select: { id: true, fullName: true } }
				}
			},
			thesisSupervisors: {
				// Only an ACTIVE supervisor relation may send a warning as supervisor.
				where: { lecturerId: lecturer.id, status: "active" },
				select: {
					role: { select: { name: true } }
				}
			}
		}
	});

	if (!thesis) {
		const err = new Error("Tugas akhir tidak ditemukan");
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
		const err = new Error("Mahasiswa pada tugas akhir ini tidak ditemukan");
		err.statusCode = 404;
		throw err;
	}

	const { level, skipReason } = resolveProgressWarning(thesis);
	if (!level) {
		const err = new Error(`Peringatan tidak dikirim: ${WARNING_SKIP_LABELS[skipReason]}.`);
		err.statusCode = 400;
		throw err;
	}

	// Warning text per activity level (`slow` | `at_risk`).
	const warningMessages = {
		slow: {
			title: "⚠️ Peringatan Progress Tugas Akhir",
			body: `Halo ${studentName}, progress tugas akhir Anda terdeteksi lambat. Segera jadwalkan bimbingan dengan dosen pembimbing untuk mendiskusikan kendala yang dihadapi.`,
			notifBody: `Progress tugas akhir Anda terdeteksi lambat. Dosen pembimbing ${lecturerName} mengingatkan Anda untuk segera menjadwalkan bimbingan.`
		},
		at_risk: {
			title: "🚨 Peringatan Serius: Progress Tugas Akhir",
			body: `Halo ${studentName}, aktivitas tugas akhir Anda berstatus Berisiko (tanpa aktivitas lebih dari 120 hari). Segera hubungi dosen pembimbing.`,
			notifBody: `Aktivitas tugas akhir Anda berstatus Berisiko. Dosen pembimbing ${lecturerName} meminta Anda segera menghubungi beliau.`
		},
	};

	const message = warningMessages[level];

	// Send FCM notification
	await sendFcmToUsers([studentUserId], {
		title: message.title,
		body: message.body,
		data: {
			type: "thesis_warning",
			thesisId: thesis.id,
			warningType: level
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
		message: `Peringatan telah dikirim ke ${studentName}`,
		warningType: level
	};
}

/**
 * Approve Thesis Proposal (Lifecycle Phase 3)
 * @param {string} userId
 * @param {string} thesisId
 */
export async function approveThesisProposalService(userId, thesisId) {
	// Revival decision (e3): baseline let a supervisor activate a proposal directly
	// (thesisStatusId=null). That would bypass Penilaian Proposal and the start of the research phase, so the lock is kept.
	void userId;
	void thesisId;
	throw new ForbiddenError(
		"Pengesahan proposal tidak lagi dilakukan oleh dosen pembimbing. Lanjutkan lewat Nilai Proposal di Tugas Akhir > Proposal; tugas akhir masuk fase Penelitian setelah lulus Metode Penelitian dan KRS Tugas Akhir terkonfirmasi.",
	);
}
