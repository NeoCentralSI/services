import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { getLecturerQuotaSnapshot, getLecturerQuotaSnapshots } from "./advisorQuota.service.js";

async function resolveActiveAcademicYearId(academicYearId) {
  if (academicYearId) return academicYearId;

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) throw new BadRequestError("Tidak ada tahun akademik aktif");
  return activeYear.id;
}

// ============================================
// Quota Browse (for advisor catalog / quota view)
// ============================================

/**
 * Browse all lecturer quotas for a given academic year.
 * Returns lecturers with their traffic-light quota status.
 */
export async function browseLecturerQuotas(academicYearId) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);

  const snapshots = await getLecturerQuotaSnapshots({ academicYearId });
  return snapshots.map((snapshot) => ({
    lecturerId: snapshot.lecturerId,
    fullName: snapshot.fullName,
    identityNumber: snapshot.identityNumber,
    email: snapshot.email,
    avatarUrl: snapshot.avatarUrl,
    scienceGroup: snapshot.scienceGroup,
    quotaMax: snapshot.quotaMax,
    quotaSoftLimit: snapshot.quotaSoftLimit,
    currentCount: snapshot.currentCount,
    activeCount: snapshot.activeCount,
    bookingCount: snapshot.bookingCount,
    pendingKadepCount: snapshot.pendingKadepCount,
    normalAvailable: snapshot.normalAvailable,
    overquotaAmount: snapshot.overquotaAmount,
    activeTheses: snapshot.activeCount,
    trafficLight: snapshot.trafficLight,
    acceptingRequests: snapshot.acceptingRequests,
  }));
}

/**
 * Get quota details for a specific lecturer.
 */
export async function getLecturerQuotaDetail(lecturerId, academicYearId) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, academicYearId, { includeEntries: true });
  if (!snapshot) throw new NotFoundError("Dosen tidak ditemukan");

  return {
    lecturerId: snapshot.lecturerId,
    fullName: snapshot.fullName,
    scienceGroup: snapshot.scienceGroup,
    acceptingRequests: snapshot.acceptingRequests,
    quotaMax: snapshot.quotaMax,
    quotaSoftLimit: snapshot.quotaSoftLimit,
    currentCount: snapshot.currentCount,
    activeCount: snapshot.activeCount,
    bookingCount: snapshot.bookingCount,
    pendingKadepCount: snapshot.pendingKadepCount,
    normalAvailable: snapshot.normalAvailable,
    overquotaAmount: snapshot.overquotaAmount,
    quotaRecord: snapshot.quotaRecordId ? { id: snapshot.quotaRecordId } : null,
  };
}

/**
 * Check the quota status of a specific lecturer (for quick gate check).
 */
export async function checkLecturerQuota(lecturerId, academicYearId) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, academicYearId);
  if (!snapshot) throw new NotFoundError("Dosen tidak ditemukan");

  return {
    lecturerId,
    quotaMax: snapshot.quotaMax,
    quotaSoftLimit: snapshot.quotaSoftLimit,
    currentCount: snapshot.currentCount,
    activeCount: snapshot.activeCount,
    bookingCount: snapshot.bookingCount,
    pendingKadepCount: snapshot.pendingKadepCount,
    normalAvailable: snapshot.normalAvailable,
    overquotaAmount: snapshot.overquotaAmount,
    trafficLight: snapshot.trafficLight,
  };
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
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
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
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
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
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
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

export async function toggleLecturerAcceptingRequests(lecturerId, acceptingRequests) {
  if (!lecturerId) throw new BadRequestError("lecturerId wajib diisi");
  if (typeof acceptingRequests !== "boolean") {
    throw new BadRequestError("acceptingRequests harus boolean");
  }

  const lecturer = await prisma.lecturer.findUnique({ where: { id: lecturerId } });
  if (!lecturer) throw new NotFoundError("Dosen tidak ditemukan");

  return prisma.lecturer.update({
    where: { id: lecturerId },
    data: { acceptingRequests },
    select: {
      id: true,
      acceptingRequests: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
  });
}

export async function checkQuotaAvailability(lecturerId, academicYearId) {
  const detail = await getLecturerQuotaDetail(lecturerId, academicYearId);

  let trafficLight = "green";
  if (detail.currentCount >= detail.quotaMax) trafficLight = "red";
  else if (detail.currentCount >= detail.quotaSoftLimit) trafficLight = "yellow";

  const remaining = Math.max(0, detail.quotaMax - detail.currentCount);
  const isAcceptingRequests = detail.acceptingRequests !== false;
  const allowed = isAcceptingRequests && trafficLight !== "red";

  let reason = null;
  if (!isAcceptingRequests) {
    reason = "Dosen sedang menutup penerimaan permintaan pembimbing.";
  } else if (trafficLight === "red") {
    reason = "Kuota pembimbing penuh.";
  }

  return {
    lecturerId: detail.lecturerId,
    quotaMax: detail.quotaMax,
    quotaSoftLimit: detail.quotaSoftLimit,
    currentCount: detail.currentCount,
    remaining,
    trafficLight,
    acceptingRequests: detail.acceptingRequests,
    allowed,
    reason,
  };
}

// ============================================
// Monitoring (KaDep / Admin)
// ============================================

/**
 * Get quota monitoring summary for all lecturers in an academic year.
 * Uses stored currentCount (cache). Call syncAllQuotaCounts first for
 * up-to-date numbers; the controller/job should ensure sync runs
 * periodically or before displaying monitoring dashboards.
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
