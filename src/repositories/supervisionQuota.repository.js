import prisma from "../config/prisma.js";

/**
 * Get default quota for an academic year
 */
export async function getDefaultQuota(academicYearId) {
  return prisma.supervisionQuotaDefault.findUnique({
    where: { academicYearId },
    select: {
      id: true,
      academicYearId: true,
      quotaMax: true,
      quotaSoftLimit: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Upsert default quota for an academic year
 */
export async function upsertDefaultQuota(academicYearId, data) {
  return prisma.supervisionQuotaDefault.upsert({
    where: { academicYearId },
    create: {
      academicYearId,
      quotaMax: data.quotaMax,
      quotaSoftLimit: data.quotaSoftLimit,
    },
    update: {
      quotaMax: data.quotaMax,
      quotaSoftLimit: data.quotaSoftLimit,
    },
    select: {
      id: true,
      academicYearId: true,
      quotaMax: true,
      quotaSoftLimit: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Get all lecturers with their quotas for an academic year
 */
export async function getLecturerQuotas(academicYearId, search) {
  const lecturers = await prisma.lecturer.findMany({
    where: search
      ? {
          user: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { identityNumber: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : undefined,
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          identityNumber: true,
          email: true,
        },
      },
      scienceGroup: {
        select: { name: true },
      },
      supervisionQuotas: {
        where: { academicYearId },
        select: {
          id: true,
          quotaMax: true,
          quotaSoftLimit: true,
          currentCount: true,
          notes: true,
        },
        take: 1,
      },
    },
  });

  return lecturers;
}

/**
 * Get default quota for computing fallback
 */
export async function getDefaultQuotaForYear(academicYearId) {
  return prisma.supervisionQuotaDefault.findUnique({
    where: { academicYearId },
    select: { quotaMax: true, quotaSoftLimit: true },
  });
}

/**
 * Upsert lecturer quota
 */
export async function upsertLecturerQuota(lecturerId, academicYearId, data) {
  return prisma.lecturerSupervisionQuota.upsert({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    create: {
      lecturerId,
      academicYearId,
      quotaMax: data.quotaMax ?? 10,
      quotaSoftLimit: data.quotaSoftLimit ?? 8,
      notes: data.notes ?? null,
    },
    update: {
      ...(data.quotaMax != null && { quotaMax: data.quotaMax }),
      ...(data.quotaSoftLimit != null && { quotaSoftLimit: data.quotaSoftLimit }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
    select: {
      id: true,
      lecturerId: true,
      academicYearId: true,
      quotaMax: true,
      quotaSoftLimit: true,
      currentCount: true,
      notes: true,
    },
  });
}
