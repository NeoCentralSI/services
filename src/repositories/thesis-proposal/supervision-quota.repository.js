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
    : client.supervisionQuota.create({ data: { academicYearId: null, ...data } });
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
