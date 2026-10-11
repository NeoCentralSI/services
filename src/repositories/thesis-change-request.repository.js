import prisma from "../config/prisma.js";
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

/** Requests a lecturer is part of: an approval step is theirs, or they submitted it. */
export function findForLecturer(lecturerId, client = prisma) {
  return client.thesisChangeRequest.findMany({
    where: { OR: [{ approvals: { some: { lecturerId } } }, { requestedByUserId: lecturerId }] },
    include: REQUEST_INCLUDE,
    orderBy: NEWEST_FIRST,
  });
}

/** Department queue: `pending` requests, or the closed ones (history), with search. */
export async function findForDepartment({ scope = "pending", search = "", page = 1, pageSize = 20 } = {}, client = prisma) {
  const where = {
    status: scope === "pending" ? CHANGE_REQUEST_STATUS.PENDING : { not: CHANGE_REQUEST_STATUS.PENDING },
    ...(search
      ? {
        thesis: {
          OR: [
            { title: { contains: search } },
            { student: { user: { fullName: { contains: search } } } },
            { student: { user: { identityNumber: { contains: search } } } },
          ],
        },
      }
      : {}),
  };
  const [rows, total] = await Promise.all([
    client.thesisChangeRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      // Pending: oldest first (queue). History: latest decision first.
      orderBy: scope === "pending" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ decidedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    client.thesisChangeRequest.count({ where }),
  ]);
  return { rows, total };
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

/** Active supervisions on open theses, and the lecturer's quota in the active year. */
export async function getSupervisorLoad(lecturerId, client = prisma) {
  const [activeCount, quota] = await Promise.all([
    client.thesisSupervisors.count({
      where: { lecturerId, status: "active", thesis: { status: { in: ["proposal", "research", "on_leave"] } } },
    }),
    client.lecturerSupervisionQuota.findFirst({
      where: { lecturerId, academicYear: { isActive: true } },
      select: { quotaMax: true },
    }),
  ]);
  return { activeCount, quotaMax: quota?.quotaMax ?? null };
}
