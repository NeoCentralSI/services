import * as repo from "../repositories/supervisionQuota.repository.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import {
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots,
  syncAllLecturerQuotaCurrentCounts,
  syncLecturerQuotaCurrentCount,
} from "./advisorQuota.service.js";
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import {
  QUOTA_LOAD_DEFINITION_LABEL,
  aggregateKbkLoads,
  periodLabelFromAcademicYear,
} from "../utils/loadScope.util.js";

/**
 * Resolve academicYearId: UUID atau slug tahun-YYYY-ganjil|genap
 * @returns {Promise<string>} UUID of AcademicYear
 */
async function resolveAcademicYearId(academicYearId) {
  if (!academicYearId) {
    throw new BadRequestError("academicYearId wajib diisi");
  }

  // UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(academicYearId)) {
    const ay = await repo.findAcademicYearById(academicYearId);
    if (!ay) {
      throw new NotFoundError("Tahun ajaran tidak ditemukan");
    }
    return ay.id;
  }

  // Slug format: tahun-YYYY-ganjil | tahun-YYYY-genap
  const slugMatch = /^tahun-(\d{4})-(ganjil|genap)$/.exec(academicYearId);
  if (slugMatch) {
    const [, yearStr, semester] = slugMatch;
    const yearNum = parseInt(yearStr, 10);
    // year in DB can be "2024/2025" - match by containing the slug year
    const ay = await repo.findAcademicYearBySlug({
      year: yearStr,
      previousYear: yearNum - 1,
      nextYear: yearNum + 1,
      semester,
    });
    if (!ay) {
      throw new NotFoundError(`Tahun ajaran ${academicYearId} tidak ditemukan`);
    }
    return ay.id;
  }

  throw new BadRequestError("academicYearId harus UUID atau format tahun-YYYY-ganjil|genap");
}

function serializeQuotaEntry(entry) {
  return {
    id: entry.id,
    source: entry.source,
    requestId: entry.requestId ?? null,
    supervisorId: entry.supervisorId ?? null,
    bucket: entry.bucket,
    studentId: entry.studentId ?? null,
    studentName: entry.studentName ?? "-",
    studentIdentityNumber: entry.studentIdentityNumber ?? "-",
    thesisId: entry.thesisId ?? null,
    thesisTitle: entry.thesisTitle ?? null,
    roleName: entry.roleName ?? null,
    requestStatus: entry.requestStatus ?? null,
    routeType: entry.routeType ?? null,
    acceptedOverNormal: Boolean(entry.acceptedOverNormal),
    createdAt: entry.createdAt ?? null,
    proposalStatus: entry.proposalStatus ?? null,
    proposalVersion: entry.proposalVersion ?? null,
    hasFinalProposal: Boolean(entry.hasFinalProposal),
    academicYearId: entry.academicYearId ?? null,
    academicYearLabel: entry.academicYearLabel ?? null,
    isCurrentPeriod: entry.isCurrentPeriod !== false,
  };
}

function serializeLecturerQuota(
  snapshot,
  { academicYearId, lecturer = null, quotaRecord = null, includeEntries = false } = {},
) {
  const fallbackQuota = quotaRecord ?? lecturer?.supervisionQuotas?.[0] ?? null;
  // `currentCount` on the quota row is a cache. Decisions always use the
  // recomputed snapshot. Drift is healed silently in getLecturerQuotas /
  // setDefaultQuota — do not surface it as an operator alert.
  const computedCurrentCount = snapshot?.currentCount ?? 0;
  const cachedCurrentCount = fallbackQuota?.currentCount ?? null;
  const result = {
    id: snapshot?.quotaRecordId ?? fallbackQuota?.id ?? null,
    lecturerId: snapshot?.lecturerId ?? lecturer?.id ?? fallbackQuota?.lecturerId ?? null,
    academicYearId,
    fullName: snapshot?.fullName ?? lecturer?.user?.fullName ?? "-",
    identityNumber: snapshot?.identityNumber ?? lecturer?.user?.identityNumber ?? "-",
    email: snapshot?.email ?? lecturer?.user?.email ?? null,
    scienceGroupId: snapshot?.scienceGroup?.id ?? lecturer?.scienceGroup?.id ?? null,
    scienceGroup: snapshot?.scienceGroup?.name ?? lecturer?.scienceGroup?.name ?? null,
    quotaMax: snapshot?.quotaMax ?? fallbackQuota?.quotaMax ?? 10,
    quotaSoftLimit: snapshot?.quotaSoftLimit ?? fallbackQuota?.quotaSoftLimit ?? 8,
    currentCount: computedCurrentCount,
    cachedCurrentCount,
    currentCountDrift:
      cachedCurrentCount === null ? null : computedCurrentCount - cachedCurrentCount,
    activeCount: snapshot?.activeCount ?? 0,
    bookingCount: snapshot?.bookingCount ?? 0,
    pendingKadepCount: snapshot?.pendingKadepCount ?? 0,
    normalAvailable: snapshot?.normalAvailable ?? 0,
    overquotaAmount: snapshot?.overquotaAmount ?? 0,
    overquotaSahCount: snapshot?.overquotaSahCount ?? 0,
    notes: fallbackQuota?.notes ?? null,
    remaining: snapshot?.normalAvailable ?? 0,
    isNearLimit: snapshot?.isNearLimit ?? false,
    isFull: snapshot?.isFull ?? false,
  };

  if (!includeEntries) return result;

  const activeOfficialEntries = (snapshot?.activeOfficialEntries ?? []).map(serializeQuotaEntry);
  const bookingEntries = (snapshot?.bookingEntries ?? []).map(serializeQuotaEntry);
  const pendingKadepEntries = (snapshot?.pendingKadepEntries ?? []).map(serializeQuotaEntry);

  return {
    ...result,
    activeOfficialEntries,
    bookingEntries,
    pendingKadepEntries,
    overquotaSahEntries: [...activeOfficialEntries, ...bookingEntries].filter(
      (entry) => entry.acceptedOverNormal,
    ),
  };
}

function hasQuotaCountDrift(item) {
  return item.currentCountDrift != null && item.currentCountDrift !== 0;
}

function withHealedQuotaCache(item) {
  if (!hasQuotaCountDrift(item)) return item;
  return {
    ...item,
    cachedCurrentCount: item.currentCount,
    currentCountDrift: 0,
  };
}

async function healDriftedQuotaCaches(items, academicYearId) {
  const drifted = items.filter(hasQuotaCountDrift);
  if (drifted.length === 0) return items;

  for (const item of drifted) {
    if (!item.lecturerId) continue;
    await syncLecturerQuotaCurrentCount(item.lecturerId, academicYearId);
  }

  return items.map(withHealedQuotaCache);
}

/**
 * Get default quota for an academic year
 */
const HARDCODED_QUOTA_MAX = 10;
const HARDCODED_QUOTA_SOFT_LIMIT = 8;

export async function getDefaultQuota(academicYearId) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const defaultQuota = await repo.getDefaultQuota(resolvedId);
  if (!defaultQuota) {
    return {
      academicYearId: resolvedId,
      quotaMax: HARDCODED_QUOTA_MAX,
      quotaSoftLimit: HARDCODED_QUOTA_SOFT_LIMIT,
      isFallback: true,
      source: "hardcoded_fallback",
    };
  }
  return {
    ...defaultQuota,
    academicYearId: defaultQuota.academicYearId,
    isFallback: false,
    source: "stored",
  };
}

/**
 * Set default quota and apply to all lecturers
 */
export async function setDefaultQuota(academicYearId, data, actor = {}) {
  if (data.quotaSoftLimit > data.quotaMax) {
    throw new BadRequestError("Soft limit tidak boleh lebih besar dari hard limit");
  }

  const resolvedId = await resolveAcademicYearId(academicYearId);
  const previous = await repo.getDefaultQuota(resolvedId);
  const result = await repo.setDefaultQuotaAndApplyToAllLecturers(resolvedId, data);
  // New quota rows start at currentCount 0. Rewrite from live Aktif+Booking
  // so generate-default cannot leave a stale cache behind.
  await syncAllLecturerQuotaCurrentCounts(resolvedId);

  await logAudit({
    actorUserId: actor.actorUserId ?? null,
    action: AUDIT_ACTIONS.QUOTA_DEFAULT_UPDATED,
    entityType: ENTITY_TYPES.SUPERVISION_QUOTA_DEFAULT,
    entityId: resolvedId,
    oldValues: previous
      ? { quotaMax: previous.quotaMax, quotaSoftLimit: previous.quotaSoftLimit }
      : null,
    newValues: {
      quotaMax: result.defaultQuota?.quotaMax ?? data.quotaMax,
      quotaSoftLimit: result.defaultQuota?.quotaSoftLimit ?? data.quotaSoftLimit,
    },
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return {
    defaultQuota: {
      ...result.defaultQuota,
      academicYearId: result.defaultQuota.academicYearId,
      isFallback: false,
      source: "stored",
    },
    generated: result.generated,
  };
}

/**
 * Get lecturer quotas for an academic year
 */
export async function getLecturerQuotas(academicYearId, search) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const [lecturers, academicYear] = await Promise.all([
    repo.getLecturerQuotas(resolvedId, search),
    repo.findAcademicYearById(resolvedId),
  ]);
  const snapshots = await getLecturerQuotaSnapshots({
    academicYearId: resolvedId,
    lecturerIds: lecturers.map((lecturer) => lecturer.id),
  });
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.lecturerId, snapshot]));

  const items = lecturers.map((l) => {
    const quota = l.supervisionQuotas?.[0];
    const snapshot = snapshotMap.get(l.id);
    return serializeLecturerQuota(snapshot, {
      academicYearId: resolvedId,
      lecturer: l,
      quotaRecord: quota,
    });
  });
  const healedItems = await healDriftedQuotaCaches(items, resolvedId);

  return {
    definitionLabel: QUOTA_LOAD_DEFINITION_LABEL,
    periodLabel: periodLabelFromAcademicYear(academicYear),
    academicYearId: resolvedId,
    lecturers: healedItems,
    kbkLoads: aggregateKbkLoads(healedItems),
  };
}

/**
 * Get a computed quota snapshot and the exact student rows behind each metric.
 * The entry contract intentionally excludes Path C justification and reviewer
 * notes; decision detail remains on the dedicated KaDep request endpoint.
 */
export async function getLecturerQuotaDetail(lecturerId, academicYearId) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const [snapshot, quotaRecord] = await Promise.all([
    getLecturerQuotaSnapshot(lecturerId, resolvedId, { includeEntries: true }),
    repo.getLecturerQuotaRecord(lecturerId, resolvedId),
  ]);
  if (!snapshot) {
    throw new NotFoundError("Dosen tidak ditemukan");
  }

  return serializeLecturerQuota(snapshot, {
    academicYearId: resolvedId,
    quotaRecord,
    includeEntries: true,
  });
}

/**
 * Update lecturer quota
 */
export async function updateLecturerQuota(lecturerId, academicYearId, data, actor = {}) {
  const resolvedAyId = await resolveAcademicYearId(academicYearId);
  if (data.quotaSoftLimit != null && data.quotaMax != null && data.quotaSoftLimit > data.quotaMax) {
    throw new BadRequestError("Soft limit tidak boleh lebih besar dari hard limit");
  }

  const previous = await repo.getLecturerQuotaRecord(lecturerId, resolvedAyId);
  const updated = await repo.upsertLecturerQuota(lecturerId, resolvedAyId, data);
  let quotaRecord = updated;
  if (!previous) {
    const currentCount = await syncLecturerQuotaCurrentCount(lecturerId, resolvedAyId);
    quotaRecord = { ...updated, currentCount };
  }
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, resolvedAyId);

  await logAudit({
    actorUserId: actor.actorUserId ?? null,
    action: AUDIT_ACTIONS.QUOTA_LECTURER_UPDATED,
    entityType: ENTITY_TYPES.SUPERVISION_QUOTA,
    entityId: lecturerId,
    oldValues: previous
      ? { quotaMax: previous.quotaMax, quotaSoftLimit: previous.quotaSoftLimit, notes: previous.notes ?? null }
      : null,
    newValues: {
      academicYearId: resolvedAyId,
      quotaMax: updated?.quotaMax ?? data.quotaMax ?? null,
      quotaSoftLimit: updated?.quotaSoftLimit ?? data.quotaSoftLimit ?? null,
      notes: updated?.notes ?? data.notes ?? null,
    },
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return serializeLecturerQuota(snapshot, {
    academicYearId: resolvedAyId,
    quotaRecord,
  });
}

/**
 * Recalculate currentCount for ALL lecturers in a given academic year
 * by counting actual active ThesisSupervisors records.
 * Intended for admin use to repair stale counters.
 */
export async function recalculateAllQuotas(academicYearId) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const results = await syncAllLecturerQuotaCurrentCounts(resolvedId);
  const repaired = results.filter((row) => row.drift !== 0);
  return {
    academicYearId: resolvedId,
    recalculated: results.length,
    // Only the rows whose cache actually disagreed with the recomputed count,
    // so the operator learns whether the run found anything (SIMPTA-FUN-010).
    repairedCount: repaired.length,
    repaired,
    details: results,
  };
}
