import {
	getMyStudentsService,
	getStudentDetailService,
	getRequestsService,
	getScheduledGuidancesService,
	rejectGuidanceService,
	cancelGuidanceByLecturerService,
	approveGuidanceService,
	getAllProgressService,
	getStudentProgressDetailService,
	approveStudentProgressComponentsService,
	postGuidanceFeedbackService,
	finalApprovalService,
	guidanceHistoryService,
	supervisorEligibilityService,
	getPendingApprovalService,
	approveSessionSummaryService,
	rescheduleGuidanceByLecturerService,
	rejectSessionSummaryService,
	getGuidanceDetailService,
	sendWarningNotificationService,
	approveThesisProposalService,
} from "../../services/thesisGuidance/lecturer.guidance.service.js";
import { SUPERVISOR_ROLES } from "../../constants/roles.js";

export async function myStudents(req, res, next) {
	try {
		// Get roles from query params or use default supervisor roles
		const rolesParam = req.query?.roles;
		let roles;

		if (rolesParam) {
			// Support comma-separated roles from query
			roles = Array.isArray(rolesParam) ? rolesParam : rolesParam.split(',').map(r => r.trim());
		} else {
			// Default to supervisor roles
			roles = SUPERVISOR_ROLES;
		}

		// ?status=active (default) | proposal | completed | failed | all
		const filter = ["active", "proposal", "completed", "failed", "all"].includes(req.query?.status) ? req.query.status : "active";
		const result = await getMyStudentsService(req.user.sub, roles, { filter });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function studentDetail(req, res, next) {
	try {
		const { thesisId } = req.params;
		const result = await getStudentDetailService(req.user.sub, thesisId);
		res.json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

export async function listRequests(req, res, next) {
	try {
		const page = req.query?.page ? Number(req.query.page) : 1;
		const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : 10;
		const result = await getRequestsService(req.user.sub, { page, pageSize });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function listScheduledGuidances(req, res, next) {
	try {
		const page = req.query?.page ? Number(req.query.page) : 1;
		const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : 10;
		const result = await getScheduledGuidancesService(req.user.sub, { page, pageSize });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function rejectGuidance(req, res, next) {
	try {
		const { guidanceId } = req.params;
		// Validated body -> { reason, suggestedDate } (feedback/message accepted as aliases)
		const { reason, suggestedDate } = req.validated ?? req.body ?? {};
		const result = await rejectGuidanceService(req.user.sub, guidanceId, { reason, suggestedDate });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function approveGuidance(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const { feedback, approvedDate, duration } = req.body || {};
		const result = await approveGuidanceService(req.user.sub, guidanceId, { feedback, approvedDate, duration });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function cancelGuidance(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const { reason } = req.body || {};
		const result = await cancelGuidanceByLecturerService(req.user.sub, guidanceId, { reason });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function listProgress(req, res, next) {
	try {
		const result = await getAllProgressService(req.user.sub);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function progressDetail(req, res, next) {
	try {
		const { studentId } = req.params;
		const result = await getStudentProgressDetailService(req.user.sub, studentId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function approveProgressComponents(req, res, next) {
	try {
		const { studentId } = req.params;
		const { componentIds } = req.body || {};
		if (!Array.isArray(componentIds) || componentIds.length === 0) {
			const e = new Error("componentIds (array) is required");
			e.statusCode = 400;
			throw e;
		}
		const result = await approveStudentProgressComponentsService(req.user.sub, studentId, componentIds);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function postFeedback(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const { feedback } = req.body || {};
		if (!feedback || String(feedback).trim().length === 0) {
			const e = new Error("feedback is required");
			e.statusCode = 400;
			throw e;
		}
		const result = await postGuidanceFeedbackService(req.user.sub, guidanceId, { feedback });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function finalApproval(req, res, next) {
	try {
		const { studentId } = req.params;
		const result = await finalApprovalService(req.user.sub, studentId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function guidanceHistory(req, res, next) {
	try {
		const { studentId } = req.params;
		const result = await guidanceHistoryService(req.user.sub, studentId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function supervisorEligibility(req, res, next) {
	try {
		const threshold = req.query?.threshold ? Number(req.query.threshold) : undefined;
		const result = await supervisorEligibilityService(req.user.sub, Number.isFinite(threshold) ? threshold : undefined);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

// ==================== SESSION SUMMARY APPROVAL ====================

/**
 * GET /thesis-guidance/pending-approval
 * Get guidances pending summary approval (minimal list for 1-click approve)
 */
export async function pendingApproval(req, res, next) {
	try {
		const { page, pageSize } = req.query || {};
		const result = await getPendingApprovalService(req.user.sub, { page, pageSize });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * PUT /thesis-guidance/:guidanceId/approve-summary
 * Approve session summary - 1 click, minimal interaction
 */
/** PATCH /thesisGuidance/lecturer/guidance/:guidanceId/reschedule { newDate, reason } */
export async function rescheduleGuidanceByLecturer(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const { newDate, reason, duration } = req.validated ?? req.body ?? {};
		const result = await rescheduleGuidanceByLecturerService(req.user.sub, guidanceId, { newDate, reason, duration });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/** PUT /thesisGuidance/lecturer/guidance/:guidanceId/reject-summary { notes } */
export async function rejectSummary(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const { notes } = req.validated ?? req.body ?? {};
		const result = await rejectSessionSummaryService(req.user.sub, guidanceId, { notes });
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function approveSummary(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const result = await approveSessionSummaryService(req.user.sub, guidanceId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * GET /thesisGuidance/lecturer/guidance/:guidanceId
 * Get detailed guidance info for session detail page
 */
export async function guidanceDetail(req, res, next) {
	try {
		const { guidanceId } = req.params;
		const result = await getGuidanceDetailService(req.user.sub, guidanceId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * POST /thesisGuidance/lecturer/my-students/:thesisId/send-warning
 * Send warning notification to student about thesis progress
 */
export async function sendWarningNotification(req, res, next) {
	try {
		const { thesisId } = req.params;
		// The warning level is derived from the thesis; `warningType` in the body is ignored.
		const result = await sendWarningNotificationService(req.user.sub, thesisId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

/**
 * POST /thesis-guidance/lecturer/approve-proposal/:thesisId
 * Approve a student's thesis proposal
 */
export async function approveThesisProposal(req, res, next) {
	try {
		const { thesisId } = req.params;
		const result = await approveThesisProposalService(req.user.sub, thesisId);
		res.json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}
