import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";

const CLOSED_THESIS_STATUSES = ["Selesai", "Gagal", "Dibatalkan", "Lulus", "Drop Out"];

// ============================================
// Quota Browse (for advisor catalog / quota view)
// ============================================

/**
 * Browse all lecturer quotas for a given academic year.
 * Returns lecturers with their traffic-light quota status.
 */
export async function browseLecturerQuotas(academicYearId) {
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");
    academicYearId = activeYear.id;
  }

  const lecturers = await prisma.lecturer.findMany({
    where: {
      user: {
        userHasRoles: {
          some: {
            status: "active",
            role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
          },
        },
      },
    },
    include: {
      user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
      scienceGroup: { select: { id: true, name: true } },
      supervisionQuotas: {
        where: { academicYearId },
        take: 1,
      },
      thesisSupervisors: {
        where: {
          thesis: {
            OR: [
              { thesisStatusId: null },
              { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUSES } } },
            ],
          },
        },
        select: { id: true },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return lecturers.map((l) => {
    const quota = l.supervisionQuotas?.[0];
    const quotaMax = quota?.quotaMax ?? 10;
    const quotaSoftLimit = quota?.quotaSoftLimit ?? 8;
    const currentCount = quota?.currentCount ?? 0;

    let trafficLight = "green";
    if (currentCount >= quotaMax) trafficLight = "red";
    else if (currentCount >= quotaSoftLimit) trafficLight = "yellow";

    return {
      lecturerId: l.id,
      fullName: l.user?.fullName,
      identityNumber: l.user?.identityNumber,
      email: l.user?.email,
      avatarUrl: l.user?.avatarUrl,
      scienceGroup: l.scienceGroup,
      quotaMax,
      quotaSoftLimit,
      currentCount,
      activeTheses: l.thesisSupervisors?.length ?? 0,
      trafficLight,
      acceptingRequests: l.acceptingRequests,
    };
  });
}

/**
 * Get quota details for a specific lecturer.
 */
export async function getLecturerQuotaDetail(lecturerId, academicYearId) {
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");
    academicYearId = activeYear.id;
  }

  const lecturer = await prisma.lecturer.findUnique({
    where: { id: lecturerId },
    include: {
      user: { select: { id: true, fullName: true, identityNumber: true, email: true } },
      scienceGroup: { select: { id: true, name: true } },
      supervisionQuotas: {
        where: { academicYearId },
        take: 1,
      },
    },
  });

  if (!lecturer) throw new NotFoundError("Dosen tidak ditemukan");

  const quota = lecturer.supervisionQuotas?.[0];
  return {
    lecturerId: lecturer.id,
    fullName: lecturer.user?.fullName,
    scienceGroup: lecturer.scienceGroup,
    acceptingRequests: lecturer.acceptingRequests,
    quotaMax: quota?.quotaMax ?? 10,
    quotaSoftLimit: quota?.quotaSoftLimit ?? 8,
    currentCount: quota?.currentCount ?? 0,
    quotaRecord: quota ?? null,
  };
}

/**
 * Check the quota status of a specific lecturer (for quick gate check).
 */
export async function checkLecturerQuota(lecturerId, academicYearId) {
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    academicYearId = activeYear?.id ?? null;
  }

  const quota = academicYearId
    ? await prisma.lecturerSupervisionQuota.findUnique({
        where: { lecturerId_academicYearId: { lecturerId, academicYearId } },
      })
    : null;

  const quotaMax = quota?.quotaMax ?? 10;
  const quotaSoftLimit = quota?.quotaSoftLimit ?? 8;
  const currentCount = quota?.currentCount ?? 0;

  let trafficLight = "green";
  if (currentCount >= quotaMax) trafficLight = "red";
  else if (currentCount >= quotaSoftLimit) trafficLight = "yellow";

  return { lecturerId, quotaMax, quotaSoftLimit, currentCount, trafficLight };
}

// ============================================
// Science Groups & Topics (for catalog filters)
// ============================================

export async function getScienceGroups() {
  return prisma.scienceGroup.findMany({ orderBy: { name: "asc" } });
}

export async function getTopics() {
  return prisma.thesisTopic.findMany({ orderBy: { name: "asc" } });
}

// ============================================
// Default Quota Config (Admin)
// ============================================

/**
 * Get the default supervision quota config for an academic year.
 */
export async function getDefaultQuotaConfig(academicYearId) {
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    academicYearId = activeYear?.id;
  }
  if (!academicYearId) throw new BadRequestError("academicYearId wajib diisi");

  const config = await prisma.supervisionQuotaDefault.findUnique({
    where: { academicYearId },
  });
  return { academicYearId, config: config ?? null };
}

/**
 * Set/update the default quota config for an academic year.
 */
export async function setDefaultQuotaConfig(academicYearId, { quotaMax, quotaSoftLimit }) {
  if (!academicYearId) throw new BadRequestError("academicYearId wajib diisi");
  if (quotaMax == null || quotaSoftLimit == null) {
    throw new BadRequestError("quotaMax dan quotaSoftLimit wajib diisi");
  }

  return prisma.supervisionQuotaDefault.upsert({
    where: { academicYearId },
    create: { academicYearId, quotaMax: parseInt(quotaMax), quotaSoftLimit: parseInt(quotaSoftLimit) },
    update: { quotaMax: parseInt(quotaMax), quotaSoftLimit: parseInt(quotaSoftLimit) },
  });
}

// ============================================
// Per-Lecturer Quota Config (Admin)
// ============================================

/**
 * Set/update quota config for a specific lecturer and academic year.
 */
export async function setLecturerQuotaConfig(lecturerId, academicYearId, { quotaMax, quotaSoftLimit }) {
  if (!lecturerId || !academicYearId) throw new BadRequestError("lecturerId dan academicYearId wajib diisi");

  return prisma.lecturerSupervisionQuota.upsert({
    where: { lecturerId_academicYearId: { lecturerId, academicYearId } },
    create: {
      lecturerId,
      academicYearId,
      quotaMax: quotaMax != null ? parseInt(quotaMax) : 10,
      quotaSoftLimit: quotaSoftLimit != null ? parseInt(quotaSoftLimit) : 8,
      currentCount: 0,
    },
    update: {
      quotaMax: quotaMax != null ? parseInt(quotaMax) : undefined,
      quotaSoftLimit: quotaSoftLimit != null ? parseInt(quotaSoftLimit) : undefined,
    },
  });
}

/**
 * Delete a per-lecturer quota config record.
 */
export async function deleteLecturerQuotaConfig(quotaId) {
  const record = await prisma.lecturerSupervisionQuota.findUnique({ where: { id: quotaId } });
  if (!record) throw new NotFoundError("Konfigurasi kuota tidak ditemukan");
  return prisma.lecturerSupervisionQuota.delete({ where: { id: quotaId } });
}

// ============================================
// Accepting Requests Toggle (Lecturer)
// ============================================

/**
 * Get lecturers who are currently accepting requests.
 */
export async function getAcceptingLecturers() {
  return prisma.lecturer.findMany({
    where: { acceptingRequests: true },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
  });
}

// ============================================
// Monitoring (KaDep / Admin)
// ============================================

/**
 * Get quota monitoring summary for all lecturers in an academic year.
 */
export async function getQuotaMonitoring(academicYearId) {
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");
    academicYearId = activeYear.id;
  }

  const quotas = await prisma.lecturerSupervisionQuota.findMany({
    where: { academicYearId },
    include: {
      lecturer: {
        include: {
          user: { select: { fullName: true, identityNumber: true } },
          scienceGroup: { select: { name: true } },
        },
      },
    },
    orderBy: { lecturer: { user: { fullName: "asc" } } },
  });

  return quotas.map((q) => {
    const remaining = q.quotaMax - q.currentCount;
    let trafficLight = "green";
    if (q.currentCount >= q.quotaMax) trafficLight = "red";
    else if (q.currentCount >= q.quotaSoftLimit) trafficLight = "yellow";

    return {
      id: q.id,
      lecturerId: q.lecturerId,
      fullName: q.lecturer?.user?.fullName,
      scienceGroup: q.lecturer?.scienceGroup?.name,
      quotaMax: q.quotaMax,
      quotaSoftLimit: q.quotaSoftLimit,
      currentCount: q.currentCount,
      remaining,
      trafficLight,
    };
  });
}
