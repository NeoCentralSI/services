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
	upsertCompletionsValidated,
	listGuidanceHistory,
	countGraduatedAsSupervisor2,
  getThesisStatusMap,
  updateThesisStatusById,
  findThesisDetailForLecturer,
  findGuidancesPendingApproval,
  approveSessionSummary,
  findPendingGuidanceById,
  findScheduledGuidances,
} from "../../repositories/thesisGuidance/lecturer.guidance.repository.js";
import { ROLE_CATEGORY, SUPERVISOR_ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { formatDateTimeJakarta } from "../../utils/date.util.js";
import { createGuidanceCalendarEvent, deleteCalendarEvent } from "../outlook-calendar.service.js";
import { toTitleCaseName } from "../../utils/global.util.js";
import prisma from "../../config/prisma.js";

function ensureLecturer(lecturer) {
	if (!lecturer) {
		const err = new Error("Lecturer profile not found for this user");
		err.statusCode = 404;
		throw err;
	}
}

// Normalize a guidance record into a flat, tidy shape
function toFlatGuidance(g) {
  if (!g) return null;
  return {
		id: g.id,
		// Keep minimal identifiers; include studentId for UI fallbacks, omit thesisId to reduce noise
		studentId: g.thesis?.studentId || g.thesis?.student?.id || null,
		studentName: g.thesis?.student?.user?.fullName || null,
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
		document: g?.thesis?.document
			? { fileName: g.thesis.document.fileName, filePath: g.thesis.document.filePath }
			: null,
		createdAt: g.createdAt || null,
		createdAtFormatted: g.createdAt ? formatDateTimeJakarta(g.createdAt, { withDay: true }) : null,
    updatedAt: g.updatedAt || null,
		// alias for UI compatibility
		requestedAt: g.createdAt || null,
		// New fields
		duration: g.duration || null,
		completedAt: g.completedAt || null,
		rejectionReason: g.rejectionReason || null,
		// Milestone info
		milestoneId: g.milestoneId || null,
    milestone: g.milestone ? { id: g.milestone.id, title: g.milestone.title, status: g.milestone.status } : null,
    milestoneName: g.milestone?.title || null,
    milestoneStatus: g.milestone?.status || null,
    milestoneIds: Array.isArray(g.milestoneIds) ? g.milestoneIds : g.milestoneId ? [g.milestoneId] : [],
    milestoneTitles: g.milestoneTitles || (g.milestone?.title ? [g.milestone.title] : []),
  };
}

async function resolveMilestoneTitles(guidance) {
  if (!guidance) return [];
  const ids = Array.isArray(guidance.milestoneIds)
    ? guidance.milestoneIds.map(String)
    : guidance.milestoneId
      ? [String(guidance.milestoneId)]
      : [];
  if (!ids.length) return [];
  const rows = await prisma.thesisMilestone.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  const map = new Map(rows.map((m) => [String(m.id), m.title]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

export async function getMyStudentsService(userId, roles) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	// Default to supervisor roles only
	const defaultRoles = SUPERVISOR_ROLES;
	const rawStudents = await findMyStudents(
		lecturer.id,
		Array.isArray(roles) && roles.length ? roles : defaultRoles
	);
	
	// Transform data to flat structure for frontend
	const students = rawStudents.map(s => ({
		studentId: s.studentId,
		fullName: s.studentUser?.fullName || null,
		email: s.studentUser?.email || null,
		identityNumber: s.studentUser?.identityNumber || null,
		thesisId: s.thesisId,
		thesisTitle: s.thesisTitle,
		thesisStatus: s.thesisStatus || "Ongoing",
		roles: s.role ? [s.role] : [],
        thesisRating: s.thesisRating || "ONGOING",
        latestMilestone: s.latestMilestone || "Belum mulai",
        // Milestone progress info
        totalMilestones: s.totalMilestones || 0,
        completedMilestones: s.completedMilestones || 0,
        milestoneProgress: s.milestoneProgress || 0,
        // Guidance info
        completedGuidanceCount: s.completedGuidanceCount || 0,
        lastGuidanceDate: s.lastGuidanceDate ? formatDateTimeJakarta(s.lastGuidanceDate, { withDay: true }) : null,
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

    return {
        thesisId: thesis.id,
        title: thesis.title,
        status: thesis.thesisStatus?.name || "Unknown",
        rating: thesis.rating,
        startDate: thesis.startDate,
        deadlineDate: thesis.deadlineDate,
        student: {
            id: thesis.student?.id,
            fullName: thesis.student?.user?.fullName,
            nim: thesis.student?.user?.identityNumber,
            email: thesis.student?.user?.email,
        },
        document: thesis.document ? {
            id: thesis.document.id,
            fileName: thesis.document.fileName,
            url: thesis.document.filePath.startsWith('uploads/') 
                ? `/${thesis.document.filePath}` 
                : `/uploads/${thesis.document.filePath}`
        } : null,
        proposalDocument: thesis.thesisProposal?.document ? {
            id: thesis.thesisProposal.document.id,
            fileName: thesis.thesisProposal.document.fileName,
            url: thesis.thesisProposal.document.filePath.startsWith('uploads/') 
                ? `/${thesis.thesisProposal.document.filePath}` 
                : `/uploads/${thesis.thesisProposal.document.filePath}`
        } : null,
        milestones: thesis.thesisMilestones.map(m => ({
            id: m.id,
            title: m.title,
            status: m.status,
            updatedAt: m.updatedAt,
            progressPercentage: m.progressPercentage || 0,
            targetDate: m.targetDate
        }))
    };
}

export async function getRequestsService(userId, { page = 1, pageSize = 10 } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const { total, rows, page: p, pageSize: sz } = await findGuidanceRequests(lecturer.id, { page, pageSize });
  // Resolve milestone titles for multi-select
  const allMilestoneIds = new Set();
  rows?.forEach((g) => {
    if (Array.isArray(g.milestoneIds)) {
      g.milestoneIds.forEach((id) => allMilestoneIds.add(String(id)));
    } else if (g.milestoneId) {
      allMilestoneIds.add(String(g.milestoneId));
    }
  });
  let milestoneTitleMap = new Map();
  if (allMilestoneIds.size > 0) {
    const rowsTitles = await prisma.thesisMilestone.findMany({
      where: { id: { in: Array.from(allMilestoneIds) } },
      select: { id: true, title: true },
    });
    milestoneTitleMap = new Map(rowsTitles.map((m) => [String(m.id), m.title]));
  }
  const items = Array.isArray(rows)
    ? rows.map((g) => {
        const ids = Array.isArray(g.milestoneIds)
          ? g.milestoneIds.map(String)
          : g.milestoneId
            ? [String(g.milestoneId)]
            : [];
        const titles = ids.map((id) => milestoneTitleMap.get(id)).filter(Boolean);
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
	
	// Resolve milestone titles
	const allMilestoneIds = new Set();
	rows?.forEach((g) => {
		if (Array.isArray(g.milestoneIds)) {
			g.milestoneIds.forEach((id) => allMilestoneIds.add(String(id)));
		} else if (g.milestoneId) {
			allMilestoneIds.add(String(g.milestoneId));
		}
	});
	let milestoneTitleMap = new Map();
	if (allMilestoneIds.size > 0) {
		const rowsTitles = await prisma.thesisMilestone.findMany({
			where: { id: { in: Array.from(allMilestoneIds) } },
			select: { id: true, title: true },
		});
		milestoneTitleMap = new Map(rowsTitles.map((m) => [String(m.id), m.title]));
	}
	
	const items = Array.isArray(rows)
		? rows.map((g) => {
				const ids = Array.isArray(g.milestoneIds)
					? g.milestoneIds.map(String)
					: g.milestoneId
						? [String(g.milestoneId)]
						: [];
				const titles = ids.map((id) => milestoneTitleMap.get(id)).filter(Boolean);
				return toFlatGuidance({ ...g, milestoneTitles: titles });
			})
		: [];
	const totalPages = Math.max(1, Math.ceil(total / sz));
	return { page: p, pageSize: sz, total, totalPages, guidances: items };
}

export async function rejectGuidanceService(userId, guidanceId, { feedback } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const guidance = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Guidance not found or not assigned to you");
		err.statusCode = 404;
		throw err;
	}
	const updated = await rejectGuidanceById(guidanceId, { feedback });
	
	// Send notification to student
	try {
		const studentUserId = updated.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = updated.supervisor?.user?.fullName || "Dosen";
			const scheduleDateStr = updated.requestedDate 
				? formatDateTimeJakarta(new Date(updated.requestedDate), { withDay: true })
				: "";
			const dateInfo = scheduleDateStr ? ` pada ${scheduleDateStr}` : "";
			
			await createNotificationsForUsers([studentUserId], {
				title: "Bimbingan Ditolak",
				message: `${lecturerName} menolak permintaan bimbingan${dateInfo}. Alasan: ${feedback || "Tidak disebutkan"}`,
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

export async function approveGuidanceService(userId, guidanceId, { feedback, approvedDate, duration } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const guidance = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Guidance not found or not assigned to you");
		err.statusCode = 404;
		throw err;
	}
	const updated = await approveGuidanceById(guidanceId, { feedback, approvedDate, duration });
	
	// Sync to Outlook Calendar - Create events for both supervisor and student
	try {
		const studentUser = updated.thesis?.student?.user;
		const supervisorUser = updated.supervisor?.user;
		
		// Use requestedDate (the date student requested) for the event schedule
		const scheduledDate = updated.requestedDate;
		
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
				? formatDateTimeJakarta(new Date(updated.approvedDate), { withDay: true })
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
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const thesis = await getStudentActiveThesis(studentId, lecturer.id);
	if (!thesis) {
		const err = new Error("Student thesis not found for this lecturer");
		err.statusCode = 404;
		throw err;
	}
	const result = await upsertCompletionsValidated(thesis.id, componentIds);
	return { thesisId: thesis.id, ...result };
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
  const titleMap = new Map();
  const allIds = new Set();
  rows.forEach((g) => {
    if (Array.isArray(g.milestoneIds)) g.milestoneIds.forEach((id) => allIds.add(String(id)));
    else if (g.milestoneId) allIds.add(String(g.milestoneId));
  });
  if (allIds.size) {
    const ms = await prisma.thesisMilestone.findMany({
      where: { id: { in: Array.from(allIds) } },
      select: { id: true, title: true },
    });
    ms.forEach((m) => titleMap.set(String(m.id), m.title));
  }
	const items = rows.map((g) => {
    const ids = Array.isArray(g.milestoneIds) ? g.milestoneIds.map(String) : g.milestoneId ? [String(g.milestoneId)] : [];
    const titles = ids.map((id) => titleMap.get(id)).filter(Boolean);
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

// Lecturer decides to stop supervising and mark thesis as failed, only if current status is at_risk
export async function failStudentThesisService(userId, studentId, { reason } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	const thesis = await getStudentActiveThesis(studentId, lecturer.id);
	if (!thesis) {
		const err = new Error("Student thesis not found for this lecturer");
		err.statusCode = 404;
		throw err;
	}

	const statusMap = await getThesisStatusMap();
	const idAtRisk = statusMap.get("at_risk") || statusMap.get("at-risk");
	const idFailed = statusMap.get("failed");
	if (!idAtRisk || !idFailed) {
		const err = new Error("Missing ThesisStatus rows: require 'at_risk' and 'failed'");
		err.statusCode = 500;
		throw err;
	}

	if (thesis.thesisStatusId !== idAtRisk) {
		const err = new Error("Thesis cannot be failed unless current status is 'at_risk'");
		err.statusCode = 400;
		throw err;
	}

	await updateThesisStatusById(thesis.id, idFailed);
	return { thesisId: thesis.id, status: "failed" };
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
		milestoneName: g.milestone?.title || null,
	}));

	return { total, guidances, page: currentPage, pageSize: size };
}

/**
 * Approve session summary - 1 click, minimal interaction
 */
export async function approveSessionSummaryService(userId, guidanceId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);

	// Check guidance exists and is pending approval
	const guidance = await findPendingGuidanceById(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Guidance not found or not pending approval");
		err.statusCode = 404;
		throw err;
	}

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
					document: true,
				},
			},
			supervisor: { include: { user: true } },
			milestone: { select: { id: true, title: true, status: true } },
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
		// Session summary (filled by student)
		sessionSummary: guidance.sessionSummary || null,
		actionItems: guidance.actionItems || null,
		summarySubmittedAt: guidance.summarySubmittedAt || null,
		summarySubmittedAtFormatted: guidance.summarySubmittedAt
			? formatDateTimeJakarta(guidance.summarySubmittedAt, { withDay: true })
			: null,
		// Milestones
		milestoneId: guidance.milestoneId || null,
		milestoneIds: Array.isArray(guidance.milestoneIds) 
			? guidance.milestoneIds 
			: guidance.milestoneId 
				? [guidance.milestoneId] 
				: [],
		milestoneTitles,
		milestoneName: milestoneTitles.length > 0 ? milestoneTitles[0] : null,
		// Document
		document: guidance.thesis?.document
			? {
					id: guidance.thesis.document.id,
					fileName: guidance.thesis.document.fileName,
					filePath: guidance.thesis.document.filePath,
			  }
			: null,
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
			thesisParticipants: {
				where: { lecturerId: lecturer.id },
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
	if (!thesis.thesisParticipants.length) {
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
			notifBody: `Tugas akhir Anda telah melampaui batas waktu. Silakan hubungi dosen pembimbing ${lecturerName}.`
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


