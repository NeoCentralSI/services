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
 * Supervision load per lecturer (K4): every active supervisor relation on a thesis that has
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
