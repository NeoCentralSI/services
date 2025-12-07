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
	logThesisActivity,
	listGuidanceHistory,
	listActivityLogs,
	countGraduatedAsSupervisor2,
  getThesisStatusMap,
  updateThesisStatusById,
} from "../../repositories/thesisGuidance/lecturer.guidance.repository.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { sendFcmToUsers } from "../push.service.js";
import { formatDateTimeJakarta } from "../../utils/date.util.js";

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
		// Keep minimal identifiers; include studentId for UI fallbacks, omit thesisId/scheduleId to reduce noise
		studentId: g.thesis?.studentId || g.thesis?.student?.id || null,
		studentName: g.thesis?.student?.user?.fullName || null,
		supervisorName: g?.supervisor?.user?.fullName || null,
		status: g.status,
		scheduledAt: g?.schedule?.guidanceDate || null,
		schedule: g?.schedule ? { guidanceDate: g.schedule.guidanceDate } : null,
		meetingUrl: g.meetingUrl || null,
		notes: g.studentNotes || null,
		supervisorFeedback: g.supervisorFeedback || null,
		document: g?.thesis?.document
			? { fileName: g.thesis.document.fileName, filePath: g.thesis.document.filePath }
			: null,
		createdAt: g.createdAt || null,
    updatedAt: g.updatedAt || null,
		// alias for UI compatibility
		requestedAt: g.createdAt || null,
  };
}

export async function getMyStudentsService(userId, roles) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	// Default to supervisor roles only (using actual role names from DB)
	const defaultRoles = ["pembimbing1", "pembimbing2"];
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
		roles: s.role ? [s.role] : []
	}));
	
	return { count: students.length, students };
}

export async function getRequestsService(userId, { page = 1, pageSize = 10 } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const { total, rows, page: p, pageSize: sz } = await findGuidanceRequests(lecturer.id, { page, pageSize });
	const items = Array.isArray(rows) ? rows.map((g) => toFlatGuidance(g)) : [];
	const totalPages = Math.max(1, Math.ceil(total / sz));
	return { page: p, pageSize: sz, total, totalPages, requests: items };
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
	await logThesisActivity(updated.thesisId, userId, "GUIDANCE_REJECTED", feedback || undefined);
	
	// Send notification to student
	try {
		const studentUserId = updated.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = updated.supervisor?.user?.fullName || "Dosen";
			const scheduleDateStr = updated.schedule?.guidanceDate 
				? formatDateTimeJakarta(new Date(updated.schedule.guidanceDate), { withDay: true })
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
					role: "student",
				}
			});
		}
	} catch (e) {
		console.error("Failed to send rejection notification:", e?.message || e);
	}
	
	// Re-read with includes for a complete, flat response
	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	return { guidance: toFlatGuidance(fresh) };
}

export async function approveGuidanceService(userId, guidanceId, { feedback, meetingUrl } = {}) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const guidance = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	if (!guidance) {
		const err = new Error("Guidance not found or not assigned to you");
		err.statusCode = 404;
		throw err;
	}
	const updated = await approveGuidanceById(guidanceId, { feedback, meetingUrl });
	await logThesisActivity(updated.thesisId, userId, "GUIDANCE_APPROVED", feedback || undefined);
	
	// Send notification to student
	try {
		const studentUserId = updated.thesis?.student?.user?.id;
		if (studentUserId) {
			const lecturerName = updated.supervisor?.user?.fullName || "Dosen";
			const scheduleDateStr = updated.schedule?.guidanceDate 
				? formatDateTimeJakarta(new Date(updated.schedule.guidanceDate), { withDay: true })
				: "";
			const dateInfo = scheduleDateStr ? ` pada ${scheduleDateStr}` : "";
			const meetingInfo = meetingUrl ? `\nLink Meeting: ${meetingUrl}` : "";
			
			await createNotificationsForUsers([studentUserId], {
				title: "Bimbingan Disetujui",
				message: `${lecturerName} menyetujui permintaan bimbingan${dateInfo}${meetingInfo}`,
			});
			
			await sendFcmToUsers([studentUserId], {
				title: "Bimbingan Disetujui ✓",
				body: `${lecturerName} menyetujui permintaan bimbingan${dateInfo}`,
				data: {
					type: "thesis-guidance:approved",
					guidanceId: guidanceId,
					role: "student",
				}
			});
		}
	} catch (e) {
		console.error("Failed to send approval notification:", e?.message || e);
	}
	
	// Re-read with includes for a complete, flat response
	const fresh = await findGuidanceByIdForLecturer(guidanceId, lecturer.id);
	return { guidance: toFlatGuidance(fresh) };
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
	await logThesisActivity(thesis.id, userId, "PROGRESS_COMPONENTS_VALIDATED", `components=${componentIds.length}`);
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
	await logThesisActivity(fresh.thesisId, userId, "GUIDANCE_FEEDBACK", feedback || undefined);
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
	await logThesisActivity(thesis.id, userId, "FINAL_PROGRESS_APPROVED");
	return { thesisId: thesis.id, approved: true };
}

export async function guidanceHistoryService(userId, studentId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const rows = await listGuidanceHistory(studentId, lecturer.id);
	const items = rows.map((g) => toFlatGuidance(g));
	return { count: items.length, items };
}

export async function activityLogService(userId, studentId) {
	const lecturer = await getLecturerByUserId(userId);
	ensureLecturer(lecturer);
	const items = await listActivityLogs(studentId);
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
	await logThesisActivity(thesis.id, userId, "THESIS_FAILED", reason || undefined);
	return { thesisId: thesis.id, status: "failed" };
}

