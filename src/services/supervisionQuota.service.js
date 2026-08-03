import * as repo from "../repositories/supervisionQuota.repository.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import {
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots,
  syncAllLecturerQuotaCurrentCounts,
} from "./advisorQuota.service.js";

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
  };
}

function serializeLecturerQuota(
  snapshot,
  { academicYearId, lecturer = null, quotaRecord = null, includeEntries = false } = {},
) {
  const fallbackQuota = quotaRecord ?? lecturer?.supervisionQuotas?.[0] ?? null;
  const result = {
    id: snapshot?.quotaRecordId ?? fallbackQuota?.id ?? null,
    lecturerId: snapshot?.lecturerId ?? lecturer?.id ?? fallbackQuota?.lecturerId ?? null,
    academicYearId,
    fullName: snapshot?.fullName ?? lecturer?.user?.fullName ?? "-",
    identityNumber: snapshot?.identityNumber ?? lecturer?.user?.identityNumber ?? "-",
    email: snapshot?.email ?? lecturer?.user?.email ?? null,
    scienceGroup: snapshot?.scienceGroup?.name ?? lecturer?.scienceGroup?.name ?? null,
    quotaMax: snapshot?.quotaMax ?? fallbackQuota?.quotaMax ?? 10,
    quotaSoftLimit: snapshot?.quotaSoftLimit ?? fallbackQuota?.quotaSoftLimit ?? 8,
    currentCount: snapshot?.currentCount ?? 0,
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

/**
 * Get default quota for an academic year
 */
export async function getDefaultQuota(academicYearId) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const defaultQuota = await repo.getDefaultQuota(resolvedId);
  if (!defaultQuota) {
    return {
      academicYearId: resolvedId,
      quotaMax: 10,
      quotaSoftLimit: 8,
    };
  }
  return {
    ...defaultQuota,
    academicYearId: defaultQuota.academicYearId,
  };
}

/**
 * Set default quota and apply to all lecturers
 */
export async function setDefaultQuota(academicYearId, data) {
  if (data.quotaSoftLimit > data.quotaMax) {
    throw new BadRequestError("Soft limit tidak boleh lebih besar dari hard limit");
  }

  const resolvedId = await resolveAcademicYearId(academicYearId);
  const result = await repo.setDefaultQuotaAndApplyToAllLecturers(resolvedId, data);

  return {
    defaultQuota: {
      ...result.defaultQuota,
      academicYearId: result.defaultQuota.academicYearId,
    },
    generated: result.generated,
  };
}

/**
 * Get lecturer quotas for an academic year
 */
export async function getLecturerQuotas(academicYearId, search) {
  const resolvedId = await resolveAcademicYearId(academicYearId);
  const lecturers = await repo.getLecturerQuotas(resolvedId, search);
  const snapshots = await getLecturerQuotaSnapshots({
    academicYearId: resolvedId,
    lecturerIds: lecturers.map((lecturer) => lecturer.id),
  });
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.lecturerId, snapshot]));

  return lecturers.map((l) => {
    const quota = l.supervisionQuotas?.[0];
    const snapshot = snapshotMap.get(l.id);
    return serializeLecturerQuota(snapshot, {
      academicYearId: resolvedId,
      lecturer: l,
      quotaRecord: quota,
    });
  });
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
export async function updateLecturerQuota(lecturerId, academicYearId, data) {
  const resolvedAyId = await resolveAcademicYearId(academicYearId);
  if (data.quotaSoftLimit != null && data.quotaMax != null && data.quotaSoftLimit > data.quotaMax) {
    throw new BadRequestError("Soft limit tidak boleh lebih besar dari hard limit");
  }

  const updated = await repo.upsertLecturerQuota(lecturerId, resolvedAyId, data);
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, resolvedAyId);
  return serializeLecturerQuota(snapshot, {
    academicYearId: resolvedAyId,
    quotaRecord: updated,
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
  return {
    academicYearId: resolvedId,
    recalculated: results.length,
    details: results,
  };
}
