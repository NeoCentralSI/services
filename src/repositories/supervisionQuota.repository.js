import prisma from "../config/prisma.js";

export async function findAcademicYearById(academicYearId) {
  return prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true },
  });
}

export async function findAcademicYearBySlug({ year, previousYear, nextYear, semester }) {
  return prisma.academicYear.findFirst({
    where: {
      semester,
      OR: [
        { year: { contains: year } },
        { year: { contains: `${previousYear}/${year}` } },
        { year: { contains: `${year}/${nextYear}` } },
      ],
    },
    select: { id: true },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
}

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
 * Save the default and apply it to every lecturer atomically.
 */
export async function setDefaultQuotaAndApplyToAllLecturers(academicYearId, data) {
  return prisma.$transaction(async (tx) => {
    const defaultQuota = await tx.supervisionQuotaDefault.upsert({
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
    const [lecturers, existingQuotas] = await Promise.all([
      tx.lecturer.findMany({ select: { id: true } }),
      tx.lecturerSupervisionQuota.findMany({
        where: { academicYearId },
        select: { lecturerId: true },
      }),
    ]);
    const existingLecturerIds = new Set(existingQuotas.map((quota) => quota.lecturerId));

    for (const lecturer of lecturers) {
      await tx.lecturerSupervisionQuota.upsert({
        where: {
          lecturerId_academicYearId: {
            lecturerId: lecturer.id,
            academicYearId,
          },
        },
        create: {
          lecturerId: lecturer.id,
          academicYearId,
          quotaMax: data.quotaMax,
          quotaSoftLimit: data.quotaSoftLimit,
        },
        update: {
          quotaMax: data.quotaMax,
          quotaSoftLimit: data.quotaSoftLimit,
        },
      });
    }

    const updated = lecturers.filter((lecturer) => existingLecturerIds.has(lecturer.id)).length;
    return {
      defaultQuota,
      generated: {
        created: lecturers.length - updated,
        updated,
        total: lecturers.length,
      },
    };
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

export async function getLecturerQuotaRecord(lecturerId, academicYearId) {
  return prisma.lecturerSupervisionQuota.findUnique({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    select: {
      id: true,
      lecturerId: true,
      academicYearId: true,
      quotaMax: true,
      quotaSoftLimit: true,
      notes: true,
    },
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
