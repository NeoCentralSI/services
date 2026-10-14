import prisma from "../../config/prisma.js";
import {
  DEFAULT_SUPERVISION_LIMITS,
  SUPERVISION_LIMIT_SOURCE,
  SUPERVISION_LOAD_LEVEL,
} from "../../constants/supervisionQuota.js";
import * as repo from "../../repositories/thesis-proposal/supervision-quota.repository.js";

/**
 * Limits that apply in an academic year (10.1): the period limits when set, else the general
 * limits, else the defaults.
 */
export async function getApplicableLimits(academicYearId, { client = prisma } = {}) {
  const period = academicYearId ? await repo.findPeriodQuota(academicYearId, client) : null;
  if (period) {
    return { softLimit: period.softLimit, hardLimit: period.hardLimit, source: SUPERVISION_LIMIT_SOURCE.PERIOD };
  }
  const general = await repo.findGeneralQuota(client);
  if (general) {
    return { softLimit: general.softLimit, hardLimit: general.hardLimit, source: SUPERVISION_LIMIT_SOURCE.GENERAL };
  }
  return { ...DEFAULT_SUPERVISION_LIMITS, source: SUPERVISION_LIMIT_SOURCE.DEFAULT };
}

/** Load level of a count against limits. */
export function classifyLoad(activeCount, limits) {
  if (activeCount >= limits.hardLimit) return SUPERVISION_LOAD_LEVEL.FULL;
  if (activeCount >= limits.softLimit) return SUPERVISION_LOAD_LEVEL.NEAR_LIMIT;
  return SUPERVISION_LOAD_LEVEL.AVAILABLE;
}

/** True when one more accepted student would put the lecturer over the hard limit. */
export function isAtHardLimit(activeCount, limits) {
  return activeCount >= limits.hardLimit;
}

/**
 * Load of one lecturer against the limits of an academic year.
 * @returns {Promise<{ lecturerId, activeCount, softLimit, hardLimit, limitSource, level }>}
 */
export async function getLecturerLoad(lecturerId, academicYearId, { client = prisma } = {}) {
  const [limits, counts] = await Promise.all([
    getApplicableLimits(academicYearId, { client }),
    repo.countActiveSupervisions([lecturerId], client),
  ]);
  const activeCount = counts.get(lecturerId) ?? 0;
  return {
    lecturerId,
    activeCount,
    softLimit: limits.softLimit,
    hardLimit: limits.hardLimit,
    limitSource: limits.source,
    level: classifyLoad(activeCount, limits),
  };
}

/**
 * Loads of several lecturers (or every lecturer when `lecturerIds` is null) against the
 * limits of an academic year.
 * @returns {Promise<Map<string, { activeCount, softLimit, hardLimit, limitSource, level }>>}
 */
export async function getLecturerLoads(lecturerIds, academicYearId, { client = prisma } = {}) {
  const [limits, counts] = await Promise.all([
    getApplicableLimits(academicYearId, { client }),
    repo.countActiveSupervisions(lecturerIds, client),
  ]);
  const ids = lecturerIds ?? [...counts.keys()];
  return new Map(
    ids.map((id) => {
      const activeCount = counts.get(id) ?? 0;
      return [
        id,
        {
          activeCount,
          softLimit: limits.softLimit,
          hardLimit: limits.hardLimit,
          limitSource: limits.source,
          level: classifyLoad(activeCount, limits),
        },
      ];
    }),
  );
}
