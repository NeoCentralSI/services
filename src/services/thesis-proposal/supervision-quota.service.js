import prisma from "../../config/prisma.js";
import {
  DEFAULT_SUPERVISION_LIMITS,
  SUPERVISION_LIMIT_SOURCE,
  SUPERVISION_LOAD_LEVEL,
} from "../../constants/supervisionQuota.js";
import * as repo from "../../repositories/thesis-proposal/supervision-quota.repository.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";

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

// ── Load screen (Kadep/Sekdep/Admin) ──────────────────────────────────────────────────

/** Validate a pair of limits: whole numbers, soft at most hard. */
export function assertLimits({ softLimit, hardLimit }) {
  for (const [label, value] of [["Batas lunak", softLimit], ["Batas keras", hardLimit]]) {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestError(`${label} harus bilangan bulat 1–100.`);
    }
  }
  if (softLimit > hardLimit) throw new BadRequestError("Batas lunak tidak boleh lebih besar dari batas keras.");
}

/**
 * General limits, period limits, the limits that apply, and every lecturer's load against them,
 * broken down into proposal phase (waiting for Penetapan Pembimbing / assigned), research and
 * on leave.
 */
export async function getLoadOverview(academicYearId = null, { client = prisma } = {}) {
  const year = academicYearId
    ? await client.academicYear.findUnique({ where: { id: academicYearId } })
    : await resolveOperationalAcademicYear(client);
  if (academicYearId && !year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  const [general, period, applicable, lecturers, rows] = await Promise.all([
    repo.findGeneralQuota(client),
    year ? repo.findPeriodQuota(year.id, client) : null,
    getApplicableLimits(year?.id ?? null, { client }),
    repo.findLecturersForLoadScreen(client),
    repo.findActiveSupervisionRows(null, client),
  ]);
  const breakdown = new Map();
  for (const row of rows) {
    const entry = breakdown.get(row.lecturerId) ?? { total: 0, waitingAssignment: 0, proposal: 0, research: 0, onLeave: 0, asSupervisor2: 0 };
    entry.total += 1;
    if (row.role?.name === "Pembimbing 2") entry.asSupervisor2 += 1;
    if (row.thesis.status === THESIS_STATUS.PROPOSAL) {
      if (row.thesis.supervisorAssignedAt) entry.proposal += 1;
      else entry.waitingAssignment += 1;
    } else if (row.thesis.status === THESIS_STATUS.RESEARCH) entry.research += 1;
    else entry.onLeave += 1;
    breakdown.set(row.lecturerId, entry);
  }
  const limit = (row) => (row ? { softLimit: row.softLimit, hardLimit: row.hardLimit, updatedAt: row.updatedAt } : null);
  return {
    academicYear: year ? { id: year.id, semester: year.semester, year: year.year, label: formatAcademicYearLabel(year) } : null,
    general: limit(general),
    period: limit(period),
    applicable,
    lecturers: lecturers.map((lecturer) => {
      const counts = breakdown.get(lecturer.id) ?? { total: 0, waitingAssignment: 0, proposal: 0, research: 0, onLeave: 0, asSupervisor2: 0 };
      return {
        lecturerId: lecturer.id,
        fullName: lecturer.user?.fullName ?? null,
        identityNumber: lecturer.user?.identityNumber ?? null,
        scienceGroup: lecturer.scienceGroup ?? null,
        acceptingRequests: lecturer.acceptingRequests !== false,
        activeCount: counts.total,
        breakdown: counts,
        level: classifyLoad(counts.total, applicable),
      };
    }),
  };
}

async function auditLimit(actorUserId, entityId, oldValues, newValues, metadata) {
  await logAudit({
    actorUserId,
    action: AUDIT_ACTIONS.SUPERVISION_LIMIT_UPDATED,
    entityType: ENTITY_TYPES.SUPERVISION_QUOTA,
    entityId,
    oldValues,
    newValues,
    metadata,
  });
}

export async function setGeneralLimits({ softLimit, hardLimit }, actorUserId) {
  assertLimits({ softLimit, hardLimit });
  const existing = await repo.findGeneralQuota();
  const row = await repo.upsertGeneralQuota(existing?.id ?? null, { softLimit, hardLimit, updatedByUserId: actorUserId });
  await auditLimit(actorUserId, row.id, existing ? { softLimit: existing.softLimit, hardLimit: existing.hardLimit } : null, { softLimit, hardLimit }, { scope: "general" });
  return getLoadOverview();
}

export async function setPeriodLimits(academicYearId, { softLimit, hardLimit }, actorUserId) {
  assertLimits({ softLimit, hardLimit });
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  const existing = await repo.findPeriodQuota(academicYearId);
  const row = await repo.upsertPeriodQuota(academicYearId, { softLimit, hardLimit, updatedByUserId: actorUserId });
  await auditLimit(actorUserId, row.id, existing ? { softLimit: existing.softLimit, hardLimit: existing.hardLimit } : null, { softLimit, hardLimit }, { scope: "period", academicYearId });
  return getLoadOverview(academicYearId);
}

export async function clearPeriodLimits(academicYearId, actorUserId) {
  const existing = await repo.findPeriodQuota(academicYearId);
  if (!existing) throw new NotFoundError("Batas periode ini belum diatur.");
  await repo.deletePeriodQuota(academicYearId);
  await auditLimit(actorUserId, existing.id, { softLimit: existing.softLimit, hardLimit: existing.hardLimit }, null, { scope: "period", academicYearId });
  return getLoadOverview(academicYearId);
}

/** A lecturer opens or closes intake of new supervisor requests (kept from the old module). */
export async function setAcceptingRequests(lecturerId, acceptingRequests) {
  const lecturer = await prisma.lecturer.findUnique({ where: { id: lecturerId }, select: { id: true } });
  if (!lecturer) throw new NotFoundError("Data dosen tidak ditemukan.");
  await prisma.lecturer.update({ where: { id: lecturerId }, data: { acceptingRequests: Boolean(acceptingRequests) } });
  return { lecturerId, acceptingRequests: Boolean(acceptingRequests) };
}
