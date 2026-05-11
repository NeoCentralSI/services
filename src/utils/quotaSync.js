/**
 * Centralized quota synchronization utility.
 *
 * Recalculates LecturerSupervisionQuota.currentCount from the actual
 * ThesisParticipant records instead of relying on incremental updates
 * that can drift when some code paths skip the counter.
 */

import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { getLecturerQuotaSnapshot } from "../services/advisorQuota.service.js";

export const CLOSED_THESIS_STATUS_NAMES = CLOSED_THESIS_STATUSES;

/**
 * Read-only: count active supervisions for a lecturer without writing.
 * Use for validation checks where you don't want a side-effect.
 */
export async function countActiveSupervisionsAll(client, lecturerId) {
  return client.thesisParticipant.count({
    where: {
      lecturerId,
      status: "active",
      thesis: {
        OR: [
          { thesisStatusId: null },
          { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUS_NAMES } } },
        ],
      },
    },
  });
}

/**
 * Active supervisions for one lecturer scoped to a single academic year
 * (matches LecturerSupervisionQuota semantics and catalog card).
 */
export async function countActiveSupervisionsForYear(client, lecturerId, academicYearId) {
  if (!lecturerId || !academicYearId) return 0;
  return client.thesisParticipant.count({
    where: {
      lecturerId,
      status: "active",
      thesis: {
        academicYearId,
        OR: [
          { thesisStatusId: null },
          { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUS_NAMES } } },
        ],
      },
    },
  });
}

/**
 * Recalculate and persist currentCount for one lecturer + academic year.
 *
 * @param {import('@prisma/client').PrismaClient | *} client  Prisma client or transaction handle
 * @param {string} lecturerId
 * @param {string} academicYearId
 * @returns {Promise<number>} the freshly computed count
 */
export async function syncQuotaCount(client, lecturerId, academicYearId) {
  if (!lecturerId || !academicYearId) return 0;

  const snapshot = await getLecturerQuotaSnapshot(lecturerId, academicYearId, { client });
  const fallbackActiveCount = await client.thesisParticipant.count({
    where: {
      lecturerId,
      status: "active",
      thesis: {
        academicYearId,
        OR: [
          { thesisStatusId: null },
          { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUS_NAMES } } },
        ],
      },
    },
  });
  const currentCount = snapshot?.currentCount ?? fallbackActiveCount;

  await client.lecturerSupervisionQuota.upsert({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    update: { currentCount },
    create: {
      lecturerId,
      academicYearId,
      currentCount,
    },
  });

  return currentCount;
}

/**
 * Sync quota for every lecturer that has active supervisions OR an existing
 * quota record in a given academic year.  Useful for bulk repair.
 *
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} academicYearId
 * @returns {Promise<Array<{lecturerId: string, currentCount: number}>>}
 */
export async function syncAllQuotaCounts(prismaClient, academicYearId) {
  const supervisorRows = await prismaClient.thesisParticipant.findMany({
    where: {
      status: "active",
      thesis: {
        academicYearId,
        OR: [
          { thesisStatusId: null },
          { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUS_NAMES } } },
        ],
      },
    },
    select: { lecturerId: true },
    distinct: ["lecturerId"],
  });

  const quotaRows = await prismaClient.lecturerSupervisionQuota.findMany({
    where: { academicYearId },
    select: { lecturerId: true },
  });

  const allIds = [
    ...new Set([
      ...supervisorRows.map((r) => r.lecturerId),
      ...quotaRows.map((r) => r.lecturerId),
    ]),
  ];

  const results = [];
  for (const lecturerId of allIds) {
    const count = await syncQuotaCount(prismaClient, lecturerId, academicYearId);
    results.push({ lecturerId, currentCount: count });
  }
  return results;
}
