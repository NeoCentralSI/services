import prisma from "../config/prisma.js";
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
    const ay = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true },
    });
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
    const ay = await prisma.academicYear.findFirst({
      where: {
        semester,
        OR: [
          { year: { contains: yearStr } },
          { year: { contains: `${yearNum - 1}/${yearNum}` } },
          { year: { contains: `${yearNum}/${yearNum + 1}` } },
        ],
      },
      select: { id: true },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    });
    if (!ay) {
      throw new NotFoundError(`Tahun ajaran ${academicYearId} tidak ditemukan`);
    }
    return ay.id;
  }

  throw new BadRequestError("academicYearId harus UUID atau format tahun-YYYY-ganjil|genap");
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
  const defaultQuota = await repo.upsertDefaultQuota(resolvedId, data);

  // Get all lecturers and upsert their quotas
  const lecturers = await prisma.lecturer.findMany({
    select: { id: true },
  });

  let created = 0;
  let updated = 0;

  for (const lecturer of lecturers) {
    const existing = await prisma.lecturerSupervisionQuota.findUnique({
      where: {
        lecturerId_academicYearId: { lecturerId: lecturer.id, academicYearId: resolvedId },
      },
    });
    await prisma.lecturerSupervisionQuota.upsert({
      where: {
        lecturerId_academicYearId: { lecturerId: lecturer.id, academicYearId: resolvedId },
      },
      create: {
        lecturerId: lecturer.id,
        academicYearId: resolvedId,
        quotaMax: data.quotaMax,
        quotaSoftLimit: data.quotaSoftLimit,
      },
      update: {
        quotaMax: data.quotaMax,
        quotaSoftLimit: data.quotaSoftLimit,
      },
    });
    if (existing) updated++;
    else created++;
  }

  return {
    defaultQuota: {
      ...defaultQuota,
      academicYearId: defaultQuota.academicYearId,
    },
    generated: {
      created,
      updated,
      total: lecturers.length,
    },
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

    return {
      id: snapshot?.quotaRecordId ?? quota?.id ?? null,
      lecturerId: l.id,
      fullName: snapshot?.fullName ?? l.user?.fullName ?? "-",
      identityNumber: snapshot?.identityNumber ?? l.user?.identityNumber ?? "-",
      email: snapshot?.email ?? l.user?.email ?? null,
      scienceGroup: snapshot?.scienceGroup?.name ?? l.scienceGroup?.name ?? null,
      quotaMax: snapshot?.quotaMax ?? quota?.quotaMax ?? 10,
      quotaSoftLimit: snapshot?.quotaSoftLimit ?? quota?.quotaSoftLimit ?? 8,
      currentCount: snapshot?.currentCount ?? 0,
      activeCount: snapshot?.activeCount ?? 0,
      bookingCount: snapshot?.bookingCount ?? 0,
      pendingKadepCount: snapshot?.pendingKadepCount ?? 0,
      normalAvailable: snapshot?.normalAvailable ?? 0,
      overquotaAmount: snapshot?.overquotaAmount ?? 0,
      notes: quota?.notes ?? null,
      remaining: snapshot?.normalAvailable ?? 0,
      isNearLimit: snapshot?.isNearLimit ?? false,
      isFull: snapshot?.isFull ?? false,
    };
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

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    include: {
      user: { select: { fullName: true, identityNumber: true, email: true } },
      scienceGroup: { select: { name: true } },
    },
  });

  return {
    id: updated.id,
    lecturerId: updated.lecturerId,
    fullName: snapshot?.fullName ?? lecturer?.user?.fullName ?? "-",
    identityNumber: snapshot?.identityNumber ?? lecturer?.user?.identityNumber ?? "-",
    email: snapshot?.email ?? lecturer?.user?.email ?? null,
    scienceGroup: snapshot?.scienceGroup?.name ?? lecturer?.scienceGroup?.name ?? null,
    quotaMax: snapshot?.quotaMax ?? updated.quotaMax,
    quotaSoftLimit: snapshot?.quotaSoftLimit ?? updated.quotaSoftLimit,
    currentCount: snapshot?.currentCount ?? 0,
    activeCount: snapshot?.activeCount ?? 0,
    bookingCount: snapshot?.bookingCount ?? 0,
    pendingKadepCount: snapshot?.pendingKadepCount ?? 0,
    normalAvailable: snapshot?.normalAvailable ?? 0,
    overquotaAmount: snapshot?.overquotaAmount ?? 0,
    notes: updated.notes,
    remaining: snapshot?.normalAvailable ?? 0,
    isNearLimit: snapshot?.isNearLimit ?? false,
    isFull: snapshot?.isFull ?? false,
  };
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
