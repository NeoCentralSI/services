import prisma from "../config/prisma.js";
import { getLecturerLoad, getLecturerLoads } from "../services/thesis-proposal/supervision-quota.service.js";
import { CHANGE_REQUEST_STATUS } from "../constants/thesis-change-request.js";

const USER_NAME = { select: { id: true, fullName: true, identityNumber: true } };

/** Everything a request response shows: before/after, steps and the people involved. */
export const REQUEST_INCLUDE = Object.freeze({
  thesis: {
    select: {
      id: true,
      title: true,
      status: true,
      studentId: true,
      academicYearId: true,
      thesisTopic: { select: { id: true, name: true } },
      student: { select: { id: true, user: USER_NAME } },
      // Paket E6: whether an open request may still be approved now (K34, K8).
      thesisSeminars: { select: { status: true } },
      thesisDefences: { select: { status: true } },
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          roleId: true,
          role: { select: { id: true, name: true } },
          lecturer: { select: { user: USER_NAME } },
        },
      },
    },
  },
  newTopic: { select: { id: true, name: true } },
  newSupervisor: { select: { id: true, user: USER_NAME } },
  replacedSupervisor: { select: { id: true, user: USER_NAME } },
  requestedBy: USER_NAME,
  decidedBy: USER_NAME,
  approvals: {
    orderBy: { stepOrder: "asc" },
    include: { lecturer: { select: { id: true, user: USER_NAME } } },
  },
});

const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }];

export function findById(id, client = prisma) {
  return client.thesisChangeRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
}

export function findOpenByThesisId(thesisId, client = prisma) {
  return client.thesisChangeRequest.findFirst({
    where: { thesisId, status: CHANGE_REQUEST_STATUS.PENDING },
    include: REQUEST_INCLUDE,
  });
}

export function findByThesisId(thesisId, client = prisma) {
  return client.thesisChangeRequest.findMany({ where: { thesisId }, include: REQUEST_INCLUDE, orderBy: NEWEST_FIRST });
}

/**
 * Lanjutan Paket E4: ids of the pending requests whose current step (the first pending
 * approval) belongs to this lecturer. "First pending" compares rows, so it is read here.
 */
export async function findIdsAtLecturerStep(lecturerId, client = prisma) {
  const rows = await client.thesisChangeRequest.findMany({
    where: { status: CHANGE_REQUEST_STATUS.PENDING, approvals: { some: { lecturerId, status: "pending" } } },
    select: { id: true, approvals: { orderBy: { stepOrder: "asc" }, select: { lecturerId: true, status: true } } },
  });
  return rows
    .filter((row) => row.approvals.find((approval) => approval.status === "pending")?.lecturerId === lecturerId)
    .map((row) => row.id);
}

/** One page of requests for a filter built by the service, and the total of that filter. */
export async function findPage(where, orderBy, { skip, take }, client = prisma) {
  const [rows, total] = await Promise.all([
    client.thesisChangeRequest.findMany({ where, include: REQUEST_INCLUDE, orderBy, skip, take }),
    client.thesisChangeRequest.count({ where }),
  ]);
  return { rows, total };
}

export function countWhere(where, client = prisma) {
  return client.thesisChangeRequest.count({ where });
}

export function findPendingByBatchId(batchId, client = prisma) {
  return client.thesisChangeRequest.findMany({
    where: { batchId, status: CHANGE_REQUEST_STATUS.PENDING },
    include: REQUEST_INCLUDE,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export function countPending(client = prisma) {
  return client.thesisChangeRequest.count({ where: { status: CHANGE_REQUEST_STATUS.PENDING } });
}

/** Thesis with what the change rules read: status, seminars and active supervisors. */
export function findThesisForChange(thesisId, client = prisma) {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      status: true,
      studentId: true,
      academicYearId: true,
      thesisTopicId: true,
      thesisTopic: { select: { id: true, name: true } },
      student: { select: { id: true, user: USER_NAME } },
      thesisSeminars: { select: { id: true, status: true } },
      // K34 (Paket E6): a title-only change waits while the defence is in process.
      thesisDefences: { select: { id: true, status: true } },
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          roleId: true,
          role: { select: { id: true, name: true } },
          lecturer: { select: { user: USER_NAME } },
        },
      },
    },
  });
}

/** The thesis a student's change request is about: the open one, else the latest. */
export async function findStudentThesisId(studentId, client = prisma) {
  const theses = await client.thesis.findMany({
    where: { studentId },
    select: { id: true, status: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const open = theses.find((thesis) => ["research", "on_leave", "proposal"].includes(thesis.status));
  return (open ?? theses[0])?.id ?? null;
}

/** Active users holding a role, e.g. the lecturers who may become Pembimbing 1. */
export function findUsersWithRole(roleName, client = prisma) {
  return client.user.findMany({
    where: { userHasRoles: { some: { status: "active", role: { name: roleName } } } },
    select: { id: true, fullName: true, identityNumber: true },
    orderBy: { fullName: "asc" },
  });
}

export async function userHasActiveRole(userId, roleName, client = prisma) {
  const row = await client.userHasRole.findFirst({
    where: { userId, status: "active", role: { name: roleName } },
    select: { userId: true },
  });
  return Boolean(row);
}

/** Active supervisions on open theses, and the hard limit that applies in the active year (10.1). */
export async function getSupervisorLoad(lecturerId, client = prisma) {
  const activeYear = await client.academicYear.findFirst({ where: { isActive: true }, select: { id: true } });
  const load = await getLecturerLoad(lecturerId, activeYear?.id ?? null, { client });
  return { activeCount: load.activeCount, quotaMax: load.hardLimit };
}

/** Paket E6: the loads of several lecturers at once (the supervisor picker). */
export async function getSupervisorLoads(lecturerIds, client = prisma) {
  const activeYear = await client.academicYear.findFirst({ where: { isActive: true }, select: { id: true } });
  const loads = await getLecturerLoads(lecturerIds, activeYear?.id ?? null, { client });
  return new Map([...loads].map(([id, load]) => [id, { activeCount: load.activeCount, quotaMax: load.hardLimit }]));
}
