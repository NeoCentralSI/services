import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { byScheduledAt } from "../../constants/guidanceStatus.js";
import {
	THESIS_STATUS,
	POST_PROPOSAL_THESIS_STATUSES,
	TA_PHASE,
} from "../../constants/thesisStatus.js";
import { THESIS_PROGRESS_SELECT, summarizeThesisProgress } from "../../helpers/thesis-progress.helper.js";

/** Derived progress fields carried by a "my students" row. */
const pickProgress = ({ activityLevel, lastActivityAt, daysSinceActivity, supervisionClock }) => ({
	activityLevel,
	lastActivityAt,
	daysSinceActivity,
	supervisionClock,
});

/** TA fase TA yang sedang berjalan, termasuk yang ditangguhkan (BSS). */
const RUNNING_TA_STATUSES = [THESIS_STATUS.RESEARCH, THESIS_STATUS.ON_LEAVE];

/**
 * A thesis sent back to `proposal` by an approved guidance evaluation (E5). Its supervisors
 * keep seeing it among their students, with the reason guidance is locked.
 */
const REPEATING_PROPOSAL_THESIS = Object.freeze({
	status: THESIS_STATUS.PROPOSAL,
	thesisGuidanceEvaluations: { some: { status: "approved", recommendation: "revise_proposal" } },
});

// Helper to resolve lecturer by userId (JWT sub)
// Schema baru: Lecturer.id adalah foreign key ke User.id
export async function getLecturerByUserId(userId) {
	return prisma.lecturer.findUnique({ where: { id: userId } });
}

// List students supervised by the lecturer via ThesisSupervisors (SUPERVISOR_1/2)
/** K21: "Mahasiswa Bimbingan" filters. Default = active (research + on_leave). */
export const MY_STUDENTS_FILTERS = Object.freeze({
	active: RUNNING_TA_STATUSES,
	completed: [THESIS_STATUS.COMPLETED],
	failed: [THESIS_STATUS.FAILED],
	all: [...RUNNING_TA_STATUSES, THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED],
});

export async function findMyStudents(lecturerId, roles, { filter = "active" } = {}) {
	const statuses = MY_STUDENTS_FILTERS[filter] ?? MY_STUDENTS_FILTERS.active;
	const where = {
		lecturerId,
		// Revival adaptation (A1): terminated supervisor rows no longer grant access.
		// Released rows stay visible so finished/failed students remain in the history filters.
		status: { not: "terminated" },
		// A thesis that repeats its proposal is still a running one for its supervisors.
		thesis: filter === "active" || filter === "all"
			? { OR: [{ status: { in: statuses } }, REPEATING_PROPOSAL_THESIS] }
			: { status: { in: statuses } }
	};
	if (Array.isArray(roles) && roles.length) {
		// Filter by role.name from UserRole
		where.role = { name: { in: roles } };
	}
	const participants = await prisma.thesisSupervisors.findMany({
		where,
		include: {
			role: { select: { id: true, name: true } },
			thesis: {
				include: {
					student: {
						include: {
							user: { select: { id: true, fullName: true, email: true, identityNumber: true } },
						},
					},
					// Include ALL milestones to calculate progress
					thesisMilestones: {
						where: TA_PHASE,
						select: { id: true, title: true, status: true, progressPercentage: true, updatedAt: true, completedAt: true }
					},
					// Get completed guidances count
					thesisGuidances: {
						where: { status: 'completed', ...TA_PHASE },
						orderBy: { completedAt: 'desc' },
						select: { id: true, approvedDate: true, completedAt: true }
					},
					// Read by the derived activity level (helpers/thesis-progress.helper.js)
					thesisSeminars: THESIS_PROGRESS_SELECT.thesisSeminars,
					thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
				},
			},
		},
	});

	// One row per thesis (a student may have a failed thesis and a new one under "Semua")
	const now = new Date();
	const seen = new Set();
	const result = [];
	for (const p of participants) {
		if (!p.thesis || !p.thesis.student) continue;
		const sid = p.thesis.student.id;
		if (seen.has(p.thesis.id)) continue;
		seen.add(p.thesis.id);

		// Get safe values
		const milestones = p.thesis.thesisMilestones || [];
		const guidances = p.thesis.thesisGuidances || [];

		// Calculate milestone progress
		const totalMilestones = milestones.length;
		const completedMilestones = milestones.filter(m => m.status === 'completed').length;
		const milestoneProgress = totalMilestones > 0
			? Math.round((completedMilestones / totalMilestones) * 100)
			: 0;

		// Get latest milestone (most recently updated or first incomplete)
		const latestMilestone = milestones.find(m => m.status !== 'completed') || milestones[0];

		// Calculate completed guidances count
		const completedGuidanceCount = guidances.length;
		const lastGuidanceDate = guidances[0]?.completedAt || null;

		result.push({
			thesisId: p.thesisId,
			thesisTitle: p.thesis?.title ?? null,
			// Derived when read (E3): activity level and supervision clock
			...pickProgress(summarizeThesisProgress(p.thesis, now)),
			thesisStatus: p.thesis?.status ?? null,
			studentId: sid,
			studentUser: p.thesis.student.user,
			role: p.role?.name || null,
			// Relation status (active/released) so the UI only offers actions to active supervisors.
			supervisorStatus: p.status || null,
			latestMilestone: latestMilestone ? latestMilestone.title : "Belum mulai",
			// New fields for progress info
			totalMilestones,
			completedMilestones,
			milestoneProgress, // percentage 0-100
			completedGuidanceCount,
			lastGuidanceDate,
			startDate: p.thesis?.startDate ?? null,
		});
	}
	return result;
}

// List guidance requests assigned to this lecturer that are pending (requested status)
// Schema baru: tidak ada schedule relation, gunakan requestedDate langsung
export async function findGuidanceRequests(lecturerId, { page = 1, pageSize = 10 } = {}) {
	const take = Math.max(1, Math.min(50, Number(pageSize) || 10));
	const currentPage = Math.max(1, Number(page) || 1);
	const skip = (currentPage - 1) * take;

	const where = {
		supervisorId: lecturerId,
		status: "requested",
		...TA_PHASE,
	};

	const [total, rows] = await prisma.$transaction([
		prisma.thesisGuidance.count({ where }),
		prisma.thesisGuidance.findMany({
			where,
			// newest-first by creation time; fallback by requestedDate then id
			orderBy: [
				{ createdAt: "desc" },
				{ requestedDate: "desc" },
				{ id: "desc" },
			],
			include: {
				thesis: {
					include: {
						student: { include: { user: true } },
					},
				},
				supervisor: { include: { user: true } },
				milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
			},
			skip,
			take,
		}),
	]);

	return { total, rows, page: currentPage, pageSize: take };
}

export async function findGuidanceByIdForLecturer(guidanceId, lecturerId) {
	return prisma.thesisGuidance.findFirst({
		where: { id: guidanceId, supervisorId: lecturerId, ...TA_PHASE },
		include: {
			thesis: { include: { student: { include: { user: true } } } },
			supervisor: { include: { user: true } },
			milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
		},
	});
}

// Schema baru: set approvedDate saat approve, support optional fields
export async function approveGuidanceById(guidanceId, { feedback, approvedDate, duration } = {}) {
	// Get existing guidance to use requestedDate as fallback
	const existing = await prisma.thesisGuidance.findUnique({
		where: { id: guidanceId },
		select: { requestedDate: true },
	});

	const data = {
		status: "accepted",
		// Use provided approvedDate, or fall back to requestedDate (the date student requested)
		approvedDate: approvedDate ? new Date(approvedDate) : (existing?.requestedDate || new Date()),
		supervisorFeedback: feedback ?? "APPROVED",
	};
	// Only set optional fields if provided
	if (duration !== undefined) data.duration = duration;

	return prisma.thesisGuidance.update({
		where: { id: guidanceId },
		data,
		include: {
			thesis: {
				include: {
					student: {
						include: {
							user: true
						}
					}
				}
			},
			supervisor: {
				include: {
					user: true
				}
			}
		},
	});
}

export async function rejectGuidanceById(guidanceId, { reason, suggestedDate = null } = {}) {
	return prisma.thesisGuidance.update({
		where: { id: guidanceId },
		data: {
			status: "rejected",
			rejectionReason: reason,
			supervisorFeedback: reason,
			suggestedDate,
		},
		include: {
			thesis: {
				include: {
					student: {
						include: {
							user: true
						}
					}
				}
			},
			supervisor: {
				include: {
					user: true
				}
			}
		},
	});
}

/**
 * Guidance revival correction: the ACTIVE supervisor relation that grants authority to
 * act on a thesis (approve/reject/cancel sessions, approve summaries, feedback,
 * warnings). Released/terminated rows never grant action authority.
 */
export function findActiveSupervisorRelation(thesisId, lecturerId) {
	return prisma.thesisSupervisors.findFirst({
		where: {
			thesisId,
			lecturerId,
			status: "active",
			role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
		},
		include: {
			role: { select: { id: true, name: true } },
			// Thesis status gates session actions (only research, K15).
			thesis: { select: { status: true } },
		},
	});
}

export async function getLecturerTheses(lecturerId) {
	const parts = await prisma.thesisSupervisors.findMany({
		where: { lecturerId, status: { not: "terminated" }, role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } }, thesis: { status: { in: RUNNING_TA_STATUSES } } },
		select: { thesisId: true },
	});
	return parts.map((p) => p.thesisId);
}

// Revival adaptation (A5): baseline used thesisProgressComponent/Completion delegates that
// do not exist in the schema; the milestone-based implementation from the active app is kept.
export async function countTotalProgressComponents() {
	return prisma.thesisMilestoneTemplate.count({
		where: {
			...TA_PHASE,
			isActive: true,
		},
	});
}

export async function getValidatedCompletionsByThesis(thesisIds = []) {
	if (!thesisIds.length) return [];
	return prisma.thesisMilestone.groupBy({
		by: ["thesisId"],
		where: {
			thesisId: { in: thesisIds },
			...TA_PHASE,
			validatedBy: { not: null },
		},
		_count: { _all: true },
	});
}

export async function getStudentActiveThesis(studentId, lecturerId) {
	// Thesis where studentId matches and lecturer is a supervisor
	return prisma.thesis.findFirst({
		where: {
			studentId,
			status: { in: RUNNING_TA_STATUSES },
			// Action family (final approval, fail): ACTIVE supervisor relation only.
			thesisSupervisors: { some: { lecturerId, status: "active", role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } } },
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		include: {
			thesisMilestones: {
				where: TA_PHASE,
				include: {
					milestoneTemplate: {
						select: { id: true, name: true, description: true, orderIndex: true },
					},
				},
				orderBy: { orderIndex: "asc" },
			},
		},
	});
}

export async function getAllProgressComponents() {
	return prisma.thesisMilestoneTemplate.findMany({
		where: {
			...TA_PHASE,
			isActive: true,
		},
		select: {
			id: true,
			name: true,
			description: true,
			orderIndex: true,
		},
		orderBy: { orderIndex: "asc" },
	});
}

export async function getCompletionsForThesis(thesisId) {
	const milestones = await prisma.thesisMilestone.findMany({
		where: {
			thesisId,
			...TA_PHASE,
		},
		select: {
			id: true,
			title: true,
			status: true,
			completedAt: true,
			validatedAt: true,
			validatedBy: true,
			milestoneTemplateId: true,
		},
		orderBy: { orderIndex: "asc" },
	});

	return milestones.map((milestone) => ({
		id: milestone.id,
		componentId: milestone.milestoneTemplateId || milestone.id,
		name: milestone.title,
		status: milestone.status,
		completedAt: milestone.completedAt,
		validatedAt: milestone.validatedAt,
		validatedBySupervisor: Boolean(milestone.validatedBy),
	}));
}

// Schema baru: tambah validatedAt saat validasi
export async function upsertCompletionsValidated(thesisId, componentIds = [], validatedBy = null) {
	if (!componentIds.length) return { updated: 0, created: 0 };

	const now = new Date();
	const result = await prisma.thesisMilestone.updateMany({
		where: {
			thesisId,
			milestoneTemplateId: { in: componentIds },
			...TA_PHASE,
		},
		data: {
			status: "completed",
			progressPercentage: 100,
			completedAt: now,
			validatedAt: now,
			validatedBy: validatedBy || "supervisor-validation",
		},
	});

	return { updated: result.count || 0, created: 0 };
}

export async function listGuidanceHistory(studentId, lecturerId) {
	const rows = await prisma.thesisGuidance.findMany({
		where: {
			...TA_PHASE,
			thesis: { studentId },
			status: { not: "deleted" },
		},
		include: {
			supervisor: { include: { user: true } },
			milestones: { include: { milestone: { select: { id: true, title: true } } } },
		},
		orderBy: { requestedDate: "asc" },
	});
	// C6: oldest first by the effective schedule (approvedDate ?? requestedDate)
	return rows.sort(byScheduledAt("asc"));
}

// Revival adaptation (A5): baseline queried yudisiumParticipant.applicant/schedule (absent in schema).
// Count number of unique students where this lecturer served as SUPERVISOR_2 and the student has completed Yudisium
export async function countGraduatedAsSupervisor2(lecturerId) {
	// Get studentIds supervised as SUPERVISOR_2
	const parts = await prisma.thesisSupervisors.findMany({
		where: { lecturerId, role: { name: ROLES.PEMBIMBING_2 } },
		select: { thesis: { select: { studentId: true } } },
	});
	const studentIds = Array.from(new Set(parts.map((p) => p.thesis?.studentId).filter(Boolean)));
	if (!studentIds.length) return 0;

	// Consider a student "graduated" when their yudisium participant or yudisium itself is finalized.
	const yps = await prisma.yudisiumParticipant.findMany({
		where: {
			thesis: { studentId: { in: studentIds } },
			OR: [
				{ status: "finalized" },
				{ yudisium: { status: "finalized" } },
			],
		},
		select: { thesis: { select: { studentId: true } } },
	});
	const graduatedStudentIds = new Set(yps.map((y) => y.thesis?.studentId).filter(Boolean));
	return graduatedStudentIds.size;
}

export async function findThesisDetailForLecturer(thesisId, lecturerId) {
	// Check if lecturer participates in this thesis
	// History read: any supervisor relation (active, released, terminated) may read the
	// detail, as before the revival. Action authority is checked separately via
	// findActiveSupervisorRelation; userRole in the response comes from active rows only.
	const participant = await prisma.thesisSupervisors.findFirst({
		where: {
			thesisId,
			lecturerId,
			thesis: { OR: [{ status: { in: POST_PROPOSAL_THESIS_STATUSES } }, REPEATING_PROPOSAL_THESIS] }
		},
		include: { role: { select: { id: true, name: true } } },
	});
	if (!participant) return null;

	return await prisma.thesis.findUnique({
		where: { id: thesisId },
		include: {
			student: {
				include: {
					user: {
						select: {
							id: true,
							fullName: true,
							identityNumber: true,
							email: true,
						}
					}
				}
			},
			// Revival adaptation (A2): baseline `thesisProposal` relation no longer exists.
			proposalDocument: true,
			finalProposalVersion: {
				include: { document: true }
			},
			thesisMilestones: {
				where: TA_PHASE,
				orderBy: { updatedAt: "desc" }
			},
			thesisSupervisors: {
				where: { status: "active" },
				include: {
					role: { select: { id: true, name: true } },
					lecturer: { include: { user: { select: { id: true, fullName: true } } } }
				}
			}
		}
	});
}

// ==================== SESSION SUMMARY APPROVAL ====================

/**
 * Find guidances pending summary approval for a lecturer
 */
export async function findGuidancesPendingApproval(lecturerId, { page = 1, pageSize = 10 } = {}) {
	const take = Math.max(1, Math.min(50, Number(pageSize) || 10));
	const currentPage = Math.max(1, Number(page) || 1);
	const skip = (currentPage - 1) * take;

	const where = {
		supervisorId: lecturerId,
		status: "summary_pending",
		...TA_PHASE,
	};

	const [total, rows] = await prisma.$transaction([
		prisma.thesisGuidance.count({ where }),
		prisma.thesisGuidance.findMany({
			where,
			orderBy: [{ summarySubmittedAt: "desc" }, { id: "desc" }],
			include: {
				thesis: {
					include: {
						student: { include: { user: true } },
					},
				},
				supervisor: { include: { user: true } },
				milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
			},
			skip,
			take,
		}),
	]);

	return { total, rows, page: currentPage, pageSize: take };
}

/**
 * Approve session summary - minimal interaction, just 1 click
 * Changes status from 'summary_pending' to 'completed'
 */
export async function approveSessionSummary(guidanceId) {
	const updated = await prisma.thesisGuidance.update({
		where: { id: guidanceId },
		data: {
			status: "completed",
			completedAt: new Date(),
		},
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

	if (updated.thesisId) {
		await prisma.thesis.update({
			where: { id: updated.thesisId },
			data: { updatedAt: new Date() }
		});
	}

	return updated;
}

/**
 * Get guidance by ID for lecturer (with summary_pending status check)
 */
export async function findPendingGuidanceById(guidanceId, lecturerId) {
	return prisma.thesisGuidance.findFirst({
		where: {
			id: guidanceId,
			supervisorId: lecturerId,
			status: "summary_pending",
			...TA_PHASE,
		},
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
}

/**
 * Find scheduled guidances (accepted or summary_pending) for a lecturer
 */
export async function findScheduledGuidances(lecturerId, { page = 1, pageSize = 10 } = {}) {
	const take = Math.max(1, Math.min(200, Number(pageSize) || 10));
	const currentPage = Math.max(1, Number(page) || 1);
	const skip = (currentPage - 1) * take;

	const where = {
		supervisorId: lecturerId,
		// K19: every post-request state; legacy "rescheduled" stays visible as a scheduled session.
		status: { in: ["accepted", "rescheduled", "summary_rejected", "summary_pending", "completed", "cancelled", "rejected"] },
		...TA_PHASE,
	};

	const [total, rows] = await prisma.$transaction([
		prisma.thesisGuidance.count({ where }),
		prisma.thesisGuidance.findMany({
			where,
			orderBy: [
				{ createdAt: "desc" },
				{ approvedDate: "desc" },
				{ requestedDate: "desc" },
				{ id: "desc" },
			],
			include: {
				thesis: {
					include: {
						student: { include: { user: true } },
					},
				},
				supervisor: { include: { user: true } },
				milestones: { include: { milestone: { select: { id: true, title: true, status: true } } } },
			},
			skip,
			take,
		}),
	]);

	return { total, rows, page: currentPage, pageSize: take };
}
