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

/** Semester intake quota can override the default; total capacity is always general. */
export async function getApplicableLimits(academicYearId, { client = prisma } = {}) {
  const [general, period] = await Promise.all([
    repo.findGeneralQuota(client),
    academicYearId ? repo.findPeriodQuota(academicYearId, client) : null,
  ]);
  return {
    totalLimit: general?.totalLimit ?? DEFAULT_SUPERVISION_LIMITS.totalLimit,
    semesterQuota: period?.semesterQuota ?? general?.semesterQuota ?? DEFAULT_SUPERVISION_LIMITS.semesterQuota,
    source: period ? SUPERVISION_LIMIT_SOURCE.PERIOD : general ? SUPERVISION_LIMIT_SOURCE.GENERAL : SUPERVISION_LIMIT_SOURCE.DEFAULT,
  };
}

/** A new acceptance exceeds a limit when the existing count has reached it. */
export function isAtCapacity(activeCount, acceptedCount, limits) {
  return activeCount >= limits.totalLimit || acceptedCount >= limits.semesterQuota;
}

export function classifyLoad(activeCount, limits, acceptedCount = 0) {
  if (isAtCapacity(activeCount, acceptedCount, limits)) return SUPERVISION_LOAD_LEVEL.FULL;
  if (activeCount === limits.totalLimit - 1 || acceptedCount === limits.semesterQuota - 1) return SUPERVISION_LOAD_LEVEL.NEAR_LIMIT;
  return SUPERVISION_LOAD_LEVEL.AVAILABLE;
}

export async function getLecturerLoad(lecturerId, academicYearId, options = {}) {
  return { lecturerId, ...(await getLecturerLoads([lecturerId], academicYearId, options)).get(lecturerId) };
}

export async function getLecturerLoads(lecturerIds, academicYearId, { client = prisma } = {}) {
  const [limits, counts, intake] = await Promise.all([
    getApplicableLimits(academicYearId, { client }),
    repo.countActiveSupervisions(lecturerIds, client),
    repo.countSemesterIntake(academicYearId, client),
  ]);
  const ids = lecturerIds ?? [...new Set([...counts.keys(), ...intake.keys()])];
  return new Map(ids.map((id) => {
    const activeCount = counts.get(id) ?? 0;
    const { acceptedCount = 0, pendingCount = 0 } = intake.get(id) ?? {};
    return [id, { activeCount, acceptedCount, pendingCount, totalLimit: limits.totalLimit,
      semesterQuota: limits.semesterQuota, limitSource: limits.source,
      level: classifyLoad(activeCount, limits, acceptedCount) }];
  }));
}

// ── Load screen (Kadep/Sekdep/Admin) ──────────────────────────────────────────────────

export function assertLimits(values) {
  for (const [field, label] of [["semesterQuota", "Kuota semester"], ["totalLimit", "Batas total"]]) {
    if (!(field in values)) continue;
    const value = values[field];
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new BadRequestError(`${label} harus bilangan bulat 1–100.`);
  }
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
  const [general, period, applicable, lecturers, rows, intake, operational] = await Promise.all([
    repo.findGeneralQuota(client),
    year ? repo.findPeriodQuota(year.id, client) : null,
    getApplicableLimits(year?.id ?? null, { client }),
    repo.findLecturersForLoadScreen(client),
    repo.findActiveSupervisionRows(null, client),
    repo.countSemesterIntake(year?.id, client),
    resolveOperationalAcademicYear(client),
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
  const limit = (row) => (row ? { semesterQuota: row.semesterQuota, totalLimit: row.totalLimit, updatedAt: row.updatedAt } : null);
  return {
    academicYear: year ? { id: year.id, semester: year.semester, year: year.year, label: formatAcademicYearLabel(year), isActive: year.id === operational?.id } : null,
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
        acceptedCount: intake.get(lecturer.id)?.acceptedCount ?? 0,
        pendingCount: intake.get(lecturer.id)?.pendingCount ?? 0,
        breakdown: counts,
        level: classifyLoad(counts.total, applicable, intake.get(lecturer.id)?.acceptedCount ?? 0),
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

export async function setGeneralLimits({ semesterQuota, totalLimit }, actorUserId) {
  assertLimits({ semesterQuota, totalLimit });
  const existing = await repo.findGeneralQuota();
  const row = await repo.upsertGeneralQuota(existing?.id ?? null, { semesterQuota, totalLimit, updatedByUserId: actorUserId });
  await auditLimit(actorUserId, row.id, existing ? { semesterQuota: existing.semesterQuota, totalLimit: existing.totalLimit } : null, { semesterQuota, totalLimit }, { scope: "general" });
  return getLoadOverview();
}

export async function setPeriodLimits(academicYearId, { semesterQuota }, actorUserId) {
  assertLimits({ semesterQuota });
  await assertOperationalPeriod(academicYearId);
  const year = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  const existing = await repo.findPeriodQuota(academicYearId);
  const row = await repo.upsertPeriodQuota(academicYearId, { semesterQuota, updatedByUserId: actorUserId });
  await auditLimit(actorUserId, row.id, existing ? { semesterQuota: existing.semesterQuota, totalLimit: existing.totalLimit } : null, { semesterQuota }, { scope: "period", academicYearId });
  return getLoadOverview(academicYearId);
}

async function assertOperationalPeriod(academicYearId) {
  const year = await resolveOperationalAcademicYear();
  if (year?.id !== academicYearId) throw new BadRequestError("Kuota semester hanya dapat diubah untuk semester aktif.");
}

export async function clearPeriodLimits(academicYearId, actorUserId) {
  await assertOperationalPeriod(academicYearId);
  const existing = await repo.findPeriodQuota(academicYearId);
  if (!existing) throw new NotFoundError("Batas periode ini belum diatur.");
  await repo.deletePeriodQuota(academicYearId);
  await auditLimit(actorUserId, existing.id, { semesterQuota: existing.semesterQuota, totalLimit: existing.totalLimit }, null, { scope: "period", academicYearId });
  return getLoadOverview(academicYearId);
}

/** A lecturer opens or closes intake of new supervisor requests (kept from the old module). */
export async function setAcceptingRequests(lecturerId, acceptingRequests) {
  const lecturer = await prisma.lecturer.findUnique({ where: { id: lecturerId }, select: { id: true } });
  if (!lecturer) throw new NotFoundError("Data dosen tidak ditemukan.");
  await prisma.lecturer.update({ where: { id: lecturerId }, data: { acceptingRequests: Boolean(acceptingRequests) } });
  return { lecturerId, acceptingRequests: Boolean(acceptingRequests) };
}
