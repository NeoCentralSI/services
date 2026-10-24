import prisma from "../../config/prisma.js";
import { OPEN_THESIS_STATUSES } from "../../constants/thesisStatus.js";

/** The general limits row (`academic_year_id` NULL), if any. */
export function findGeneralQuota(client = prisma) {
  return client.supervisionQuota.findFirst({
    where: { academicYearId: null },
    orderBy: { createdAt: "asc" },
  });
}

/** The period limits row of one academic year, if any. */
export function findPeriodQuota(academicYearId, client = prisma) {
  if (!academicYearId) return null;
  return client.supervisionQuota.findUnique({ where: { academicYearId } });
}

/**
 * Supervision load per lecturer: every active supervisor relation on a thesis that has
 * not ended, in any phase. An accepted request already holds an active Pembimbing 1 relation,
 * so accepted-but-not-yet-assigned requests are counted through it.
 *
 * @param {string[] | null} lecturerIds - null counts every lecturer
 * @returns {Promise<Map<string, number>>}
 */
export async function countActiveSupervisions(lecturerIds = null, client = prisma) {
  const rows = await client.thesisSupervisors.groupBy({
    by: ["lecturerId"],
    where: {
      status: "active",
      ...(lecturerIds ? { lecturerId: { in: lecturerIds } } : {}),
      thesis: { status: { in: OPEN_THESIS_STATUSES } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.lecturerId, row._count._all]));
}

/** Active supervisor relations on open theses, with what the load screen breaks down. */
export function findActiveSupervisionRows(lecturerIds = null, client = prisma) {
  return client.thesisSupervisors.findMany({
    where: {
      status: "active",
      ...(lecturerIds ? { lecturerId: { in: lecturerIds } } : {}),
      thesis: { status: { in: OPEN_THESIS_STATUSES } },
    },
    select: {
      lecturerId: true,
      role: { select: { name: true } },
      thesis: { select: { status: true, supervisorAssignedAt: true } },
    },
  });
}

/** Lecturers shown on the load screen: every lecturer with an active supervisor role. */
export function findLecturersForLoadScreen(client = prisma) {
  return client.lecturer.findMany({
    where: { user: { userHasRoles: { some: { status: "active", role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } } } } } },
    select: {
      id: true,
      acceptingRequests: true,
      scienceGroup: { select: { id: true, name: true } },
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

export function upsertGeneralQuota(existingId, data, client = prisma) {
  return existingId
    ? client.supervisionQuota.update({ where: { id: existingId }, data })
    : client.supervisionQuota.create({ data: { id: "general", academicYearId: null, ...data } });
}

export function upsertPeriodQuota(academicYearId, data, client = prisma) {
  return client.supervisionQuota.upsert({
    where: { academicYearId },
    create: { academicYearId, ...data },
    update: data,
  });
}

export function deletePeriodQuota(academicYearId, client = prisma) {
  return client.supervisionQuota.deleteMany({ where: { academicYearId } });
}

/** Accepted students remain in semester distribution after graduation or supervisor changes.
 * Redirected and department requests belong to the lecturer who actually accepted them.
 */
export async function countSemesterIntake(academicYearId, client = prisma) {
  if (!academicYearId) return new Map();
  const rows = await client.thesisSupervisorRequest.findMany({
    where: { academicYearId, status: { in: ["accepted", "redirected", "assigned", "pending", "under_review", "pending_kadep"] } },
    select: { studentId: true, lecturerId: true, redirectedTo: true, status: true },
  });
  const result = new Map();
  const accepted = new Map();
  for (const row of rows) {
    const id = row.redirectedTo ?? row.lecturerId;
    if (!id) continue;
    const entry = result.get(id) ?? { acceptedCount: 0, pendingCount: 0 };
    if (["accepted", "redirected", "assigned"].includes(row.status)) {
      const students = accepted.get(id) ?? new Set();
      students.add(row.studentId);
      accepted.set(id, students);
      entry.acceptedCount = students.size;
    } else entry.pendingCount += 1;
    result.set(id, entry);
  }
  return result;
}
