import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError } from "../utils/errors.js";
import { getLecturerQuotaSnapshot, getLecturerQuotaSnapshots } from "./advisorQuota.service.js";
import { getDefaultQuota as getSupervisionDefaultQuota } from "./supervisionQuota.service.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";
import { ADMIN_ROLES, DEPARTMENT_ROLES, normalize } from "../constants/roles.js";
import {
  QUOTA_LOAD_DEFINITION_LABEL,
  aggregateKbkLoads,
  periodLabelFromAcademicYear,
} from "../utils/loadScope.util.js";

function hasAnyRole(roleNames = [], expected = []) {
  const actual = new Set((roleNames ?? []).map((name) => normalize(name)));
  return expected.some((roleName) => actual.has(normalize(roleName)));
}

/**
 * Full six figures for Admin/KaDep/Sekdep/GKM, or a dosen viewing themselves.
 * Internal callers (no viewer context) also get the complete snapshot so
 * downstream sanitizers (P2 catalog) can pick mahasiswa-safe fields.
 * Peer dosen see the same surface as mahasiswa (canon §7.3 / SIMPTA-FUN-034).
 */
export function canSeeFullSixQuotaFigures({ viewerUserId, viewerRoles } = {}, targetLecturerId) {
  if (viewerUserId == null && (!viewerRoles || viewerRoles.length === 0)) {
    return true;
  }
  if (hasAnyRole(viewerRoles, [...ADMIN_ROLES, ...DEPARTMENT_ROLES])) {
    return true;
  }
  return Boolean(viewerUserId && targetLecturerId && viewerUserId === targetLecturerId);
}

function serializeQuotaSnapshot(snapshot, { includeSensitive = true } = {}) {
  const base = {
    lecturerId: snapshot.lecturerId,
    fullName: snapshot.fullName,
    identityNumber: snapshot.identityNumber,
    email: snapshot.email,
    avatarUrl: snapshot.avatarUrl,
    scienceGroup: snapshot.scienceGroup,
    quotaMax: snapshot.quotaMax,
    quotaSoftLimit: snapshot.quotaSoftLimit,
    activeCount: snapshot.activeCount,
    normalAvailable: snapshot.normalAvailable,
    remaining: snapshot.normalAvailable,
    activeTheses: snapshot.activeCount,
    trafficLight: snapshot.trafficLight,
    acceptingRequests: snapshot.acceptingRequests,
  };

  if (!includeSensitive) {
    return base;
  }

  return {
    ...base,
    currentCount: snapshot.currentCount,
    bookingCount: snapshot.bookingCount,
    pendingKadepCount: snapshot.pendingKadepCount,
    overquotaAmount: snapshot.overquotaAmount,
    overquotaSahCount: snapshot.overquotaSahCount,
  };
}

async function resolveActiveAcademicYearId(academicYearId) {
  if (academicYearId) return academicYearId;

  const activeYear = await resolveOperationalAcademicYear();
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
export async function browseLecturerQuotas(academicYearId, visibility = {}) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);

  const snapshots = await getLecturerQuotaSnapshots({ academicYearId });
  return snapshots.map((snapshot) =>
    serializeQuotaSnapshot(snapshot, {
      includeSensitive: canSeeFullSixQuotaFigures(visibility, snapshot.lecturerId),
    }),
  );
}

/**
 * Get quota details for a specific lecturer.
 */
export async function getLecturerQuotaDetail(lecturerId, academicYearId, visibility = {}) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, academicYearId, { includeEntries: true });
  if (!snapshot) throw new NotFoundError("Dosen tidak ditemukan");

  return {
    ...serializeQuotaSnapshot(snapshot, {
      includeSensitive: canSeeFullSixQuotaFigures(visibility, snapshot.lecturerId),
    }),
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
    overquotaSahCount: snapshot.overquotaSahCount,
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
  // Same payload as GET /supervision-quota/default/:id (SIMPTA-FUN-021).
  return getSupervisionDefaultQuota(academicYearId);
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

export async function checkQuotaAvailability(lecturerId, academicYearId, visibility = {}) {
  // Compute traffic light from the full snapshot, then sanitize the payload
  // for peer viewers (canon §7.3). Internal callers (empty visibility) still
  // receive complete figures so sanitizers downstream can pick fields.
  const detail = await getLecturerQuotaDetail(lecturerId, academicYearId);
  const currentCount = detail.currentCount ?? 0;

  let trafficLight = "green";
  if (currentCount >= detail.quotaMax) trafficLight = "red";
  else if (currentCount >= detail.quotaSoftLimit) trafficLight = "yellow";

  const remaining = Math.max(0, detail.quotaMax - currentCount);
  const isAcceptingRequests = detail.acceptingRequests !== false;
  // Red quota is informational for KaDep P2 (overquota sah). Only a closed
  // intake flag blocks the check endpoint.
  const allowed = isAcceptingRequests;

  let reason = null;
  if (!isAcceptingRequests) {
    reason = "Dosen sedang menutup penerimaan permintaan pembimbing.";
  } else if (trafficLight === "red") {
    reason = "Kuota pembimbing penuh.";
  }

  const payload = {
    lecturerId: detail.lecturerId,
    quotaMax: detail.quotaMax,
    quotaSoftLimit: detail.quotaSoftLimit,
    trafficLight,
    acceptingRequests: detail.acceptingRequests,
    allowed,
    reason,
  };

  if (canSeeFullSixQuotaFigures(visibility, detail.lecturerId)) {
    payload.currentCount = currentCount;
    payload.remaining = remaining;
  }

  return payload;
}

// ============================================
// Monitoring (KaDep / Admin)
// ============================================

/**
 * Get the current computed quota monitoring snapshot for all lecturers.
 * Never uses LecturerSupervisionQuota.currentCount as decision-time truth.
 */
export async function getQuotaMonitoring(academicYearId) {
  academicYearId = await resolveActiveAcademicYearId(academicYearId);
  const [snapshots, academicYear] = await Promise.all([
    getLecturerQuotaSnapshots({ academicYearId }),
    prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, year: true, semester: true },
    }),
  ]);

  const lecturers = snapshots.map((snapshot) => ({
    id: snapshot.quotaRecordId,
    lecturerId: snapshot.lecturerId,
    fullName: snapshot.fullName,
    identityNumber: snapshot.identityNumber,
    scienceGroupId: snapshot.scienceGroup?.id ?? null,
    scienceGroup: snapshot.scienceGroup?.name ?? null,
    quotaMax: snapshot.quotaMax,
    quotaSoftLimit: snapshot.quotaSoftLimit,
    currentCount: snapshot.currentCount,
    activeCount: snapshot.activeCount,
    bookingCount: snapshot.bookingCount,
    pendingKadepCount: snapshot.pendingKadepCount,
    normalAvailable: snapshot.normalAvailable,
    overquotaAmount: snapshot.overquotaAmount,
    overquotaSahCount: snapshot.overquotaSahCount,
    remaining: snapshot.normalAvailable,
    trafficLight: snapshot.trafficLight,
  }));

  return {
    definitionLabel: QUOTA_LOAD_DEFINITION_LABEL,
    periodLabel: periodLabelFromAcademicYear(academicYear),
    academicYearId,
    lecturers,
    kbkLoads: aggregateKbkLoads(lecturers),
  };
}
