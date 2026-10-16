import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { OPEN_THESIS_STATUSES } from "../../constants/thesisStatus.js";
import {
  ACTIVE_REQUEST_STATUSES,
  SUPERVISOR_REQUEST_ROUTE,
  SUPERVISOR_REQUEST_STATUS,
  WAITING_KADEP_STATUSES,
  WAITING_LECTURER_STATUSES,
} from "../../constants/thesis-proposal.js";

const USER_BRIEF = { select: { id: true, fullName: true, identityNumber: true, avatarUrl: true } };
const LECTURER_BRIEF = {
  select: {
    id: true,
    acceptingRequests: true,
    user: USER_BRIEF,
    scienceGroup: { select: { id: true, name: true } },
  },
};

/** Everything a request card shows. */
export const REQUEST_INCLUDE = {
  student: { select: { id: true, user: USER_BRIEF } },
  lecturer: LECTURER_BRIEF,
  redirectTarget: LECTURER_BRIEF,
  forwardedByLecturer: { select: { id: true, user: USER_BRIEF } },
  reviewer: { select: { id: true, fullName: true } },
  topic: { select: { id: true, name: true, scienceGroupId: true, scienceGroup: { select: { id: true, name: true } } } },
  academicYear: { select: { id: true, year: true, semester: true, isActive: true } },
  thesis: { select: { id: true, title: true, status: true, supervisorAssignedAt: true } },
};

/** Row lock on a request; call inside a transaction. */
export async function lockRequest(tx, requestId) {
  await tx.$queryRaw`SELECT id FROM thesis_supervisor_requests WHERE id = ${requestId} FOR UPDATE`;
}

/** Row lock on a student, so two submissions of one student cannot both pass the checks. */
export async function lockStudent(tx, studentId) {
  await tx.$queryRaw`SELECT user_id FROM students WHERE user_id = ${studentId} FOR UPDATE`;
}

export function findRequestById(id, client = prisma) {
  return client.thesisSupervisorRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
}

export function findRequestsByStudent(studentId, client = prisma) {
  return client.thesisSupervisorRequest.findMany({
    where: { studentId },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** The student's request that still blocks a new one (rule: one active request). */
export function findActiveRequestByStudent(studentId, client = prisma, excludeId = null) {
  return client.thesisSupervisorRequest.findFirst({
    where: {
      studentId,
      status: { in: ACTIVE_REQUEST_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export function findDraftByStudent(studentId, client = prisma) {
  return client.thesisSupervisorRequestDraft.findUnique({
    where: { studentId },
    include: {
      topic: { select: { id: true, name: true, scienceGroup: { select: { id: true, name: true } } } },
      lecturer: LECTURER_BRIEF,
    },
  });
}

export function upsertDraft(studentId, data, client = prisma) {
  return client.thesisSupervisorRequestDraft.upsert({
    where: { studentId },
    create: { studentId, ...data },
    update: data,
  });
}

export function createRequest(data, client = prisma) {
  return client.thesisSupervisorRequest.create({ data, include: REQUEST_INCLUDE });
}

export function updateRequest(id, data, client = prisma) {
  return client.thesisSupervisorRequest.update({ where: { id }, data, include: REQUEST_INCLUDE });
}

/** Requests waiting for this lecturer (pending, under review), oldest first. */
export function findWaitingForLecturer(lecturerId, client = prisma) {
  return client.thesisSupervisorRequest.findMany({
    where: { lecturerId, status: { in: WAITING_LECTURER_STATUSES } },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

/** Requests this lecturer already handled, or that were redirected to them. */
export function findLecturerHistory(lecturerId, client = prisma, take = 50) {
  return client.thesisSupervisorRequest.findMany({
    where: {
      OR: [{ lecturerId }, { redirectedTo: lecturerId }],
      status: { notIn: WAITING_LECTURER_STATUSES },
    },
    include: REQUEST_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take,
  });
}

/** Paket E5: one page of a lecturer's requests for a filter built by the service. */
export function findRequestPage(where, orderBy, { skip, take }, client = prisma) {
  return client.thesisSupervisorRequest.findMany({ where, include: REQUEST_INCLUDE, orderBy, skip, take });
}

export function countRequests(where, client = prisma) {
  return client.thesisSupervisorRequest.count({ where });
}

/** Requests waiting for the Head of Department, per route. */
export function findWaitingForKadep(route, client = prisma) {
  return client.thesisSupervisorRequest.findMany({
    where: { status: { in: WAITING_KADEP_STATUSES }, ...(route ? { route } : {}) },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

/** Requests the Head of Department decided (approved, redirected, rejected, revision). */
export function findKadepHistory(client = prisma, take = 50) {
  return client.thesisSupervisorRequest.findMany({
    where: {
      reviewedAt: { not: null },
      route: { in: [SUPERVISOR_REQUEST_ROUTE.DEPARTMENT, SUPERVISOR_REQUEST_ROUTE.OVER_QUOTA] },
    },
    include: REQUEST_INCLUDE,
    orderBy: { reviewedAt: "desc" },
    take,
  });
}

export function findTopicWithGroup(id, client = prisma) {
  return client.thesisTopic.findUnique({
    where: { id },
    select: { id: true, name: true, scienceGroupId: true, scienceGroup: { select: { id: true, name: true } } },
  });
}

export function findAllTopicsWithGroup(client = prisma) {
  return client.thesisTopic.findMany({
    select: { id: true, name: true, scienceGroupId: true, scienceGroup: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
}

export function findLecturer(id, client = prisma) {
  return client.lecturer.findUnique({ where: { id }, ...LECTURER_BRIEF });
}

/**
 * Lecturers a student may choose: an active "Pembimbing 1" role. Includes the topics of the
 * open theses they supervise (shown in the catalog).
 */
export function findSupervisingLecturers({ scienceGroupId = null, acceptingOnly = false } = {}, client = prisma) {
  return client.lecturer.findMany({
    where: {
      user: { userHasRoles: { some: { status: "active", role: { name: ROLES.PEMBIMBING_1 } } } },
      ...(scienceGroupId ? { scienceGroupId } : {}),
      ...(acceptingOnly ? { acceptingRequests: true } : {}),
    },
    select: {
      ...LECTURER_BRIEF.select,
      thesisSupervisors: {
        where: { status: "active", thesis: { status: { in: OPEN_THESIS_STATUSES } } },
        select: { thesis: { select: { thesisTopicId: true, thesisTopic: { select: { name: true } } } } },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

/**
 * The student's open thesis, if any. A thesis without an active supervisor (its accepted request
 * was cancelled) is reused when a new request is accepted, so a student never has two open theses.
 */
export function findOpenThesisByStudent(studentId, client = prisma) {
  return client.thesis.findFirst({
    where: { studentId, status: { in: OPEN_THESIS_STATUSES } },
    select: {
      id: true,
      title: true,
      status: true,
      academicYearId: true,
      supervisorAssignedAt: true,
      thesisSupervisors: {
        where: { status: "active" },
        select: { id: true, lecturerId: true, role: { select: { name: true } }, lecturer: { select: { user: USER_BRIEF } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Whether proposal work started on a thesis (cancelling an accepted request is then closed). */
export async function hasProposalActivity(thesisId, client = prisma) {
  const [guidances, assessments] = await Promise.all([
    client.thesisGuidance.count({ where: { thesisId } }),
    client.researchMethodAssessment.count({ where: { thesisId } }),
  ]);
  return guidances + assessments > 0;
}

/** End the active supervisor relation of one lecturer on a thesis (request cancelled). */
export function releaseSupervisor(thesisId, lecturerId, client = prisma) {
  return client.thesisSupervisors.updateMany({
    where: { thesisId, lecturerId, status: "active" },
    data: { status: "terminated", activeRoleKey: null },
  });
}

export function findActiveUserIdsByRole(roleName, client = prisma) {
  return client.userHasRole
    .findMany({ where: { status: "active", role: { name: roleName } }, select: { userId: true } })
    .then((rows) => rows.map((row) => row.userId));
}

export function userHasAnyActiveRole(userId, roleNames, client = prisma) {
  return client.userHasRole
    .count({ where: { userId, status: "active", role: { name: { in: roleNames } } } })
    .then((count) => count > 0);
}

export function createAuditLog(data, client = prisma) {
  return client.auditLog.create({ data });
}

/** Requests in the given statuses created before `before` (reminder job). */
export function findStaleWaitingRequests(before, client = prisma) {
  return client.thesisSupervisorRequest.findMany({
    where: {
      status: { in: [...WAITING_LECTURER_STATUSES, ...WAITING_KADEP_STATUSES] },
      withdrawnAt: null,
      createdAt: { lte: before },
    },
    include: { lecturer: { select: { user: { select: { fullName: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

export { SUPERVISOR_REQUEST_STATUS };
