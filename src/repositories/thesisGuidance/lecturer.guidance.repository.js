import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { byScheduledAt } from "../../constants/guidanceStatus.js";
import {
	THESIS_STATUS,
	THESIS_PHASE,
	TA_PHASE,
	CLOSED_THESIS_STATUSES,
	currentPhaseOf,
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

/** A release at the same moment the thesis was closed (same transaction) counts as "at closing". */
const CLOSE_TOLERANCE_MS = 60 * 1000;

/**
 * Paket E4 (1.1): where a supervisor relation stands for "Mahasiswa Bimbingan".
 * - `active`: supervising now (or still active on a completed thesis);
 * - `closed`: released together with the closing of a failed/completed thesis, so the
 *   lecturer was supervising when it ended (history filters Selesai/Gagal);
 * - `ended`: released earlier (replaced through a change request, cancelled request, Admin):
 *   the lecturer no longer supervises; only "Semua" shows it, read-only.
 */
export function supervisorRelationState(relation, thesis) {
	if (relation?.status === "active") return "active";
	if (relation?.status !== "released") return "ended";
	if (!CLOSED_THESIS_STATUSES.includes(thesis?.status)) return "ended";
	const closedAt = thesis.terminatedAt ?? thesis.statusChangedAt;
	if (!closedAt || !relation.updatedAt) return "closed";
	return new Date(relation.updatedAt).getTime() >= new Date(closedAt).getTime() - CLOSE_TOLERANCE_MS ? "closed" : "ended";
}

// List students supervised by the lecturer via ThesisSupervisors (SUPERVISOR_1/2)
/**
 * K21: "Mahasiswa Bimbingan" filters. Default = active (research + on_leave). `proposal` lists
 * the proposal-phase students (K27); one repeating its proposal stays under "Aktif" (E5).
 */
export const MY_STUDENTS_FILTERS = Object.freeze({
	active: RUNNING_TA_STATUSES,
	proposal: [THESIS_STATUS.PROPOSAL],
	completed: [THESIS_STATUS.COMPLETED],
	failed: [THESIS_STATUS.FAILED],
	all: [...RUNNING_TA_STATUSES, THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED],
});

export async function findMyStudents(lecturerId, roles, { filter = "active" } = {}) {
	const statuses = MY_STUDENTS_FILTERS[filter] ?? MY_STUDENTS_FILTERS.active;
	const where = {
		lecturerId,
		// Paket E4 (1.1): running theses count active relations only; the history filters also
		// read released rows and keep those released at closing (supervisorRelationState).
		status: filter === "active" || filter === "proposal" ? "active" : { in: ["active", "released"] },
		// A thesis that repeats its proposal is still a running one for its supervisors.
		thesis: filter === "active" || filter === "all"
			? { OR: [{ status: { in: statuses } }, REPEATING_PROPOSAL_THESIS] }
			: filter === "proposal"
				? { status: THESIS_STATUS.PROPOSAL, NOT: { thesisGuidanceEvaluations: REPEATING_PROPOSAL_THESIS.thesisGuidanceEvaluations } }
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
					// Milestones and completed sessions of both phases; each row counts its current phase (K27).
					thesisMilestones: {
						where: { status: { not: 'deleted' } },
						select: { id: true, title: true, status: true, phase: true, progressPercentage: true, updatedAt: true, completedAt: true }
					},
					thesisGuidances: {
						where: { status: 'completed' },
						orderBy: { completedAt: 'desc' },
						select: { id: true, phase: true, approvedDate: true, completedAt: true }
					},
					// Read by the derived activity level (helpers/thesis-progress.helper.js)
					thesisSeminars: THESIS_PROGRESS_SELECT.thesisSeminars,
					thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
				},
			},
		},
	});

	// One row per thesis (a student may have a failed thesis and a new one under "Semua"); a
	// lecturer with several relations to one thesis is represented by the active one first.
	const STATE_ORDER = { active: 0, closed: 1, ended: 2 };
	const rows = participants
		.filter((p) => p.thesis && p.thesis.student)
		.map((p) => ({ p, state: supervisorRelationState(p, p.thesis) }))
		.filter(({ state }) => filter === "all" || state !== "ended")
		.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
	const now = new Date();
	const seen = new Set();
	const result = [];
	for (const { p, state } of rows) {
		const sid = p.thesis.student.id;
		if (seen.has(p.thesis.id)) continue;
		seen.add(p.thesis.id);

		// Counts follow the thesis's current phase; activity stays research-only (K7).
		const phase = currentPhaseOf(p.thesis.status);
		const milestones = (p.thesis.thesisMilestones || []).filter((m) => m.phase === phase);
		const guidances = (p.thesis.thesisGuidances || []).filter((g) => g.phase === phase);
		const researchThesis = {
			...p.thesis,
			thesisMilestones: (p.thesis.thesisMilestones || []).filter((m) => m.phase === THESIS_PHASE.RESEARCH),
			thesisGuidances: (p.thesis.thesisGuidances || []).filter((g) => g.phase === THESIS_PHASE.RESEARCH),
		};

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
			...pickProgress(summarizeThesisProgress(researchThesis, now)),
			thesisStatus: p.thesis?.status ?? null,
			studentId: sid,
			studentUser: p.thesis.student.user,
			role: p.role?.name || null,
			// Relation status (active/released) so the UI only offers actions to active supervisors.
			supervisorStatus: p.status || null,
			// Released before the thesis closed (e.g. replaced): "Tidak lagi membimbing", read-only.
			noLongerSupervising: state === "ended",
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
		// K27: sessions of either phase are acted on the same way.
		where: { id: guidanceId, supervisorId: lecturerId },
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
			// Thesis status gates session actions: research, or proposal after Penetapan (K27).
			thesis: { select: { id: true, status: true, supervisorAssignedAt: true } },
		},
	});
}

export async function getLecturerTheses(lecturerId) {
	const parts = await prisma.thesisSupervisors.findMany({
		where: { lecturerId, status: "active", role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } }, thesis: { status: { in: RUNNING_TA_STATUSES } } },
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
	// K27: proposal-phase theses are read here too (guidance and milestones of both phases).
	const participant = await prisma.thesisSupervisors.findFirst({
		where: { thesisId, lecturerId },
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
			// Final proposal of the latest Research Method attempt (K32).
			researchMethodAssessments: {
				where: { proposalFilePath: { not: null } },
				orderBy: { createdAt: "desc" },
				take: 1,
				select: { id: true, proposalFilePath: true, proposalFileName: true },
			},
			// Both phases; each milestone carries its phase (10.7).
			thesisMilestones: {
				where: { status: { not: "deleted" } },
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
