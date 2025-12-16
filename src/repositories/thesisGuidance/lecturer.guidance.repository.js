import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

// Helper to resolve lecturer by userId (JWT sub)
// Schema baru: Lecturer.id adalah foreign key ke User.id
export async function getLecturerByUserId(userId) {
	return prisma.lecturer.findUnique({ where: { id: userId } });
}

// List students supervised by the lecturer via ThesisParticipant (SUPERVISOR_1/2)
export async function findMyStudents(lecturerId, roles) {
	const where = { lecturerId };
	if (Array.isArray(roles) && roles.length) {
		// Filter by role.name from UserRole
		where.role = { name: { in: roles } };
	}
	const participants = await prisma.thesisParticipant.findMany({
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
				},
			},
		},
	});

	// Build unique students (supervised) to avoid duplicates caused by multiple theses/entries
	const seen = new Set();
	const result = [];
	for (const p of participants) {
		if (!p.thesis || !p.thesis.student) continue;
		const sid = p.thesis.student.id;
		if (seen.has(sid)) continue;
		seen.add(sid);
			result.push({
			thesisId: p.thesisId,
			thesisTitle: p.thesis?.title ?? null,
			studentId: sid,
			studentUser: p.thesis.student.user,
				role: p.role?.name || null,
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
						document: true,
					},
				},
				supervisor: { include: { user: true } },
			},
			skip,
			take,
		}),
	]);

	return { total, rows, page: currentPage, pageSize: take };
}

export async function findGuidanceByIdForLecturer(guidanceId, lecturerId) {
	return prisma.thesisGuidance.findFirst({
		where: { id: guidanceId, supervisorId: lecturerId },
		include: {
			thesis: { include: { student: { include: { user: true } }, document: true } },
			supervisor: { include: { user: true } },
		},
	});
}

// Schema baru: set approvedDate saat approve, support optional fields
export async function approveGuidanceById(guidanceId, { feedback, meetingUrl, approvedDate, type, duration, location } = {}) {
	const data = {
		status: "accepted",
		approvedDate: approvedDate ? new Date(approvedDate) : new Date(), // Use provided date or current time
		supervisorFeedback: feedback ?? "APPROVED",
	};
	// Only set optional fields if provided
	if (meetingUrl !== undefined) data.meetingUrl = meetingUrl;
	if (type !== undefined) data.type = type;
	if (duration !== undefined) data.duration = duration;
	if (location !== undefined) data.location = location;
	
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

export async function rejectGuidanceById(guidanceId, { feedback } = {}) {
	return prisma.thesisGuidance.update({
		where: { id: guidanceId },
		data: {
			status: "rejected",
			rejectionReason: feedback ?? "REJECTED",
			supervisorFeedback: feedback ?? "REJECTED",
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

export async function getLecturerTheses(lecturerId) {
	const parts = await prisma.thesisParticipant.findMany({
		where: { lecturerId, role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
		select: { thesisId: true },
	});
	return parts.map((p) => p.thesisId);
}

export async function countTotalProgressComponents() {
	return prisma.thesisProgressComponent.count();
}

export async function getValidatedCompletionsByThesis(thesisIds = []) {
	if (!thesisIds.length) return [];
	return prisma.thesisProgressCompletion.groupBy({
		by: ["thesisId"],
		where: { thesisId: { in: thesisIds }, validatedBySupervisor: true },
		_count: { _all: true },
	});
}

export async function getStudentActiveThesis(studentId, lecturerId) {
	// Thesis where studentId matches and lecturer is a supervisor
	return prisma.thesis.findFirst({
		where: {
			studentId,
			thesisParticipants: { some: { lecturerId, role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } } },
		},
		include: { thesisProgressCompletions: true },
	});
}

export async function getAllProgressComponents() {
	// Schema baru: orderBy orderIndex untuk urutan milestone
	return prisma.thesisProgressComponent.findMany({ orderBy: { orderIndex: "asc" } });
}

export async function getCompletionsForThesis(thesisId) {
	return prisma.thesisProgressCompletion.findMany({ where: { thesisId } });
}

// Schema baru: tambah validatedAt saat validasi
export async function upsertCompletionsValidated(thesisId, componentIds = []) {
	if (!componentIds.length) return { updated: 0, created: 0 };

	const existing = await prisma.thesisProgressCompletion.findMany({
		where: { thesisId, componentId: { in: componentIds } },
		select: { id: true, componentId: true },
	});
	const existingSet = new Set(existing.map((e) => e.componentId));

	const toUpdateIds = existing.map((e) => e.id);
	const toCreateComponentIds = componentIds.filter((cid) => !existingSet.has(cid));

	const now = new Date();
	const [updateRes, createRes] = await prisma.$transaction([
		toUpdateIds.length
			? prisma.thesisProgressCompletion.updateMany({
					where: { id: { in: toUpdateIds } },
					data: { validatedBySupervisor: true, validatedAt: now, completedAt: now },
				})
			: Promise.resolve({ count: 0 }),
		toCreateComponentIds.length
			? prisma.thesisProgressCompletion.createMany({
					data: toCreateComponentIds.map((cid) => ({ 
						thesisId, 
						componentId: cid, 
						validatedBySupervisor: true, 
						validatedAt: now,
						completedAt: now 
					})),
					skipDuplicates: true,
				})
			: Promise.resolve({ count: 0 }),
	]);

	return { updated: updateRes.count || 0, created: createRes.count || 0 };
}

// Schema baru: tambah activityType untuk ThesisActivityLog
export async function logThesisActivity(thesisId, userId, activity, notes = null, activityType = "other") {
	return prisma.thesisActivityLog.create({ 
		data: { thesisId, userId, activity, notes, activityType } 
	});
}

export async function listGuidanceHistory(studentId, lecturerId) {
	return prisma.thesisGuidance.findMany({
		where: {
			thesis: { studentId },
			supervisorId: lecturerId,
		},
		include: { supervisor: { include: { user: true } } },
		orderBy: { requestedDate: "asc" },
	});
}

export async function listActivityLogs(studentId) {
	return prisma.thesisActivityLog.findMany({
		where: { thesis: { studentId } },
		orderBy: { createdAt: "desc" },
	});
}

// Count number of unique students where this lecturer served as SUPERVISOR_2 and the student has completed Yudisium
export async function countGraduatedAsSupervisor2(lecturerId) {
	// Get studentIds supervised as SUPERVISOR_2
	const parts = await prisma.thesisParticipant.findMany({
		where: { lecturerId, role: { name: ROLES.PEMBIMBING_2 } },
		select: { thesis: { select: { studentId: true } } },
	});
	const studentIds = Array.from(new Set(parts.map((p) => p.thesis?.studentId).filter(Boolean)));
	if (!studentIds.length) return 0;

	// Find Yudisium participants where schedule is completed
	const yps = await prisma.yudisiumParticipant.findMany({
		where: {
			applicant: { studentId: { in: studentIds } },
			yudisium: { schedule: { status: "completed" } },
		},
		select: { applicant: { select: { studentId: true } } },
	});
	const graduatedStudentIds = new Set(yps.map((y) => y.applicant?.studentId).filter(Boolean));
	return graduatedStudentIds.size;
}

// Resolve ThesisStatus name->id map (lowercased name keys)
export async function getThesisStatusMap() {
	const statuses = await prisma.thesisStatus.findMany({ select: { id: true, name: true } });
	const map = new Map(statuses.map((s) => [String(s.name || "").toLowerCase(), s.id]));
	return map;
}

// Update thesis status by id
export async function updateThesisStatusById(thesisId, thesisStatusId) {
	return prisma.thesis.update({ where: { id: thesisId }, data: { thesisStatusId } });
}

