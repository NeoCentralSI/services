import * as repo from "../repositories/advisorQuota.repository.js";
import {
  ADVISOR_REQUEST_STATUS,
  ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES,
  ADVISOR_REQUEST_BOOKING_STATUSES,
  ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  isAdvisorRequestLegacyBookingOrActive,
} from "../constants/advisorRequestStatus.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { ROLES } from "../constants/roles.js";

const DEFAULT_QUOTA_MAX = 10;
const DEFAULT_QUOTA_SOFT_LIMIT = 8;
const OFFICIAL_PROPOSAL_STATUS = "accepted";
const LEGACY_CANCELLED_TITLE_SUFFIX_PATTERN = /(?:\s*\(Dibatalkan\))+$/iu;

function normalizeQuotaThesisTitle(title) {
  if (typeof title !== "string") return title ?? null;

  const normalizedTitle = title.replace(LEGACY_CANCELLED_TITLE_SUFFIX_PATTERN, "").trim();
  return normalizedTitle || title.trim() || null;
}

function isClosedThesisStatus(thesisStatusName) {
  return Boolean(thesisStatusName) && CLOSED_THESIS_STATUSES.includes(thesisStatusName);
}

function isOfficialAccepted(thesis) {
  return (
    thesis?.proposalStatus === OFFICIAL_PROPOSAL_STATUS &&
    !isClosedThesisStatus(thesis?.thesisStatus?.name)
  );
}

function shouldIgnoreForQuota(thesis) {
  return isClosedThesisStatus(thesis?.thesisStatus?.name);
}

function getTrackedKey({ lecturerId, thesisId, studentId }) {
  if (thesisId) return `thesis:${lecturerId}:${thesisId}`;
  return `student:${lecturerId}:${studentId}`;
}

function getEffectiveRequestLecturerId(request) {
  if (
    request?.redirectedTo &&
    request?.status !== ADVISOR_REQUEST_STATUS.PENDING_KADEP &&
    request?.status !== ADVISOR_REQUEST_STATUS.ESCALATED
  ) {
    return request.redirectedTo;
  }

  return request?.lecturerId ?? null;
}

function createEmptySnapshot(lecturer) {
  const quota = lecturer?.supervisionQuotas?.[0];
  const quotaMax = quota?.quotaMax ?? DEFAULT_QUOTA_MAX;
  const quotaSoftLimit = quota?.quotaSoftLimit ?? DEFAULT_QUOTA_SOFT_LIMIT;

  return {
    lecturerId: lecturer?.id ?? null,
    fullName: lecturer?.user?.fullName ?? "-",
    identityNumber: lecturer?.user?.identityNumber ?? "-",
    email: lecturer?.user?.email ?? null,
    avatarUrl: lecturer?.user?.avatarUrl ?? null,
    scienceGroup: lecturer?.scienceGroup ?? null,
    acceptingRequests: lecturer?.acceptingRequests ?? false,
    quotaRecordId: quota?.id ?? null,
    quotaMax,
    quotaSoftLimit,
    currentCount: 0,
    activeCount: 0,
    bookingCount: 0,
    pendingKadepCount: 0,
    normalAvailable: quotaMax,
    overquotaAmount: 0,
    isNearLimit: false,
    isFull: false,
    trafficLight: "green",
    activeOfficialEntries: [],
    bookingEntries: [],
    pendingKadepEntries: [],
  };
}

function finalizeSnapshot(snapshot, includeEntries) {
  const currentCount = snapshot.activeCount + snapshot.bookingCount;
  const normalAvailable = Math.max(0, snapshot.quotaMax - currentCount);
  const overquotaAmount = Math.max(0, currentCount - snapshot.quotaMax);
  const isFull = currentCount >= snapshot.quotaMax;
  const isNearLimit = !isFull && currentCount >= snapshot.quotaSoftLimit;

  const next = {
    ...snapshot,
    currentCount,
    normalAvailable,
    overquotaAmount,
    isNearLimit,
    isFull,
    trafficLight: isFull ? "red" : isNearLimit ? "yellow" : "green",
  };

  if (!includeEntries) {
    delete next.activeOfficialEntries;
    delete next.bookingEntries;
    delete next.pendingKadepEntries;
  }

  return next;
}

function mapRequestEntry(request, bucket) {
  const effectiveLecturerId = getEffectiveRequestLecturerId(request);

  return {
    id: request.id,
    source: "request",
    requestId: request.id,
    supervisorId: null,
    bucket,
    lecturerId: effectiveLecturerId,
    studentId: request.studentId,
    studentName: request.student?.user?.fullName ?? "-",
    studentIdentityNumber: request.student?.user?.identityNumber ?? "-",
    studentAvatarUrl: request.student?.user?.avatarUrl ?? null,
    thesisId: request.thesisId ?? request.thesis?.id ?? null,
    thesisTitle: normalizeQuotaThesisTitle(request.thesis?.title ?? request.proposedTitle ?? null),
    topicId: request.topic?.id ?? null,
    topicName: request.topic?.name ?? null,
    roleName: ROLES.PEMBIMBING_1,
    requestStatus: request.status,
    routeType: request.routeType ?? null,
    lecturerApprovalNote: request.lecturerApprovalNote ?? null,
    rejectionReason: request.rejectionReason ?? null,
    justificationText: request.justificationText ?? null,
    kadepNotes: request.kadepNotes ?? null,
    createdAt: request.createdAt ?? null,
    updatedAt: request.updatedAt ?? null,
    lecturerRespondedAt: request.lecturerRespondedAt ?? null,
    reviewedAt: request.reviewedAt ?? null,
    proposalStatus: request.thesis?.proposalStatus ?? null,
    thesisStatus: request.thesis?.thesisStatus?.name ?? null,
  };
}

function mapSupervisorEntry(supervisor, bucket) {
  return {
    id: `supervisor:${supervisor.id}`,
    source: "supervisor",
    requestId: null,
    supervisorId: supervisor.id,
    bucket,
    lecturerId: supervisor.lecturerId,
    studentId: supervisor.thesis?.studentId ?? supervisor.thesis?.student?.id ?? null,
    studentName: supervisor.thesis?.student?.user?.fullName ?? "-",
    studentIdentityNumber: supervisor.thesis?.student?.user?.identityNumber ?? "-",
    studentAvatarUrl: supervisor.thesis?.student?.user?.avatarUrl ?? null,
    thesisId: supervisor.thesis?.id ?? null,
    thesisTitle: normalizeQuotaThesisTitle(supervisor.thesis?.title ?? null),
    topicId: null,
    topicName: null,
    roleName: supervisor.role?.name ?? null,
    requestStatus: bucket === "active" ? ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES[0] : ADVISOR_REQUEST_BOOKING_STATUSES[0],
    routeType: null,
    lecturerApprovalNote: null,
    rejectionReason: null,
    justificationText: null,
    kadepNotes: null,
    createdAt: supervisor.createdAt ?? null,
    updatedAt: supervisor.updatedAt ?? null,
    lecturerRespondedAt: null,
    reviewedAt: null,
    proposalStatus: supervisor.thesis?.proposalStatus ?? null,
    thesisStatus: supervisor.thesis?.thesisStatus?.name ?? null,
  };
}

function classifyRequestBucket(request) {
  const thesis = request.thesis ?? null;
  if (shouldIgnoreForQuota(thesis)) return null;

  if (ADVISOR_REQUEST_PENDING_KADEP_STATUSES.includes(request.status)) {
    return "pendingKadep";
  }

  if (ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES.includes(request.status)) {
    return "active";
  }

  if (ADVISOR_REQUEST_BOOKING_STATUSES.includes(request.status)) {
    return isOfficialAccepted(thesis) ? "active" : "booking";
  }

  if (isAdvisorRequestLegacyBookingOrActive(request.status)) {
    return isOfficialAccepted(thesis) ? "active" : "booking";
  }

  return null;
}

function classifySupervisorBucket(supervisor) {
  const thesis = supervisor.thesis ?? null;
  if (shouldIgnoreForQuota(thesis)) return null;
  return isOfficialAccepted(thesis) ? "active" : "booking";
}

function pushEntry(snapshot, bucket, entry) {
  if (bucket === "active") {
    snapshot.activeCount += 1;
    snapshot.activeOfficialEntries.push(entry);
    return;
  }
  if (bucket === "booking") {
    snapshot.bookingCount += 1;
    snapshot.bookingEntries.push(entry);
    return;
  }
  if (bucket === "pendingKadep") {
    snapshot.pendingKadepCount += 1;
    snapshot.pendingKadepEntries.push(entry);
  }
}

export async function getLecturerQuotaSnapshots({
  academicYearId,
  lecturerIds = null,
  client,
  includeEntries = false,
} = {}) {
  let resolvedAcademicYearId = academicYearId;
  if (!resolvedAcademicYearId) {
    const activeYear = await repo.findActiveAcademicYear(client);
    resolvedAcademicYearId = activeYear?.id ?? null;
  }

  if (!resolvedAcademicYearId) {
    return [];
  }

  const [lecturers, trackedRequests, trackedSupervisors] = await Promise.all([
    repo.findQuotaLecturerMetadata(client, resolvedAcademicYearId, lecturerIds),
    repo.findTrackedAdvisorRequests(client, resolvedAcademicYearId, lecturerIds),
    repo.findTrackedSupervisorAssignments(client, resolvedAcademicYearId, lecturerIds),
  ]);

  const snapshots = new Map(
    lecturers.map((lecturer) => [lecturer.id, createEmptySnapshot(lecturer)]),
  );

  const trackedKeys = new Set();

  for (const request of trackedRequests) {
    const effectiveLecturerId = getEffectiveRequestLecturerId(request);
    const snapshot = snapshots.get(effectiveLecturerId);
    if (!snapshot) continue;

    const bucket = classifyRequestBucket(request);
    if (!bucket) continue;

    trackedKeys.add(
      getTrackedKey({
        lecturerId: effectiveLecturerId,
        thesisId: request.thesisId ?? request.thesis?.id ?? null,
        studentId: request.studentId,
      }),
    );
    pushEntry(snapshot, bucket, mapRequestEntry(request, bucket));
  }

  for (const supervisor of trackedSupervisors) {
    const snapshot = snapshots.get(supervisor.lecturerId);
    if (!snapshot) continue;

    const trackedKey = getTrackedKey({
      lecturerId: supervisor.lecturerId,
      thesisId: supervisor.thesis?.id ?? null,
      studentId: supervisor.thesis?.studentId ?? supervisor.thesis?.student?.id ?? null,
    });
    if (trackedKeys.has(trackedKey)) continue;

    const bucket = classifySupervisorBucket(supervisor);
    if (!bucket) continue;

    pushEntry(snapshot, bucket, mapSupervisorEntry(supervisor, bucket));
  }

  return [...snapshots.values()].map((snapshot) => finalizeSnapshot(snapshot, includeEntries));
}

export async function getLecturerQuotaSnapshot(
  lecturerId,
  academicYearId,
  { client, includeEntries = false } = {},
) {
  const snapshots = await getLecturerQuotaSnapshots({
    academicYearId,
    lecturerIds: lecturerId ? [lecturerId] : null,
    client,
    includeEntries,
  });

  return snapshots[0] ?? null;
}

export async function syncLecturerQuotaCurrentCount(
  lecturerId,
  academicYearId,
  { client } = {},
) {
  if (!lecturerId || !academicYearId) return 0;

  await repo.ensureLecturerQuotaRow(client, lecturerId, academicYearId);
  const snapshot = await getLecturerQuotaSnapshot(lecturerId, academicYearId, { client });
  const currentCount = snapshot?.currentCount ?? 0;

  await repo.updateLecturerQuotaCurrentCount(client, lecturerId, academicYearId, currentCount);
  return currentCount;
}

export async function lockLecturerQuotaForUpdate(
  lecturerId,
  academicYearId,
  { client } = {},
) {
  if (!lecturerId || !academicYearId) return null;

  await repo.ensureLecturerQuotaRow(client, lecturerId, academicYearId);
  return repo.lockLecturerQuotaRow(client, lecturerId, academicYearId);
}

export async function syncAllLecturerQuotaCurrentCounts(academicYearId, { client } = {}) {
  const snapshots = await getLecturerQuotaSnapshots({ academicYearId, client });
  const results = [];

  for (const snapshot of snapshots) {
    if (!snapshot.lecturerId) continue;
    await repo.ensureLecturerQuotaRow(client, snapshot.lecturerId, academicYearId);
    await repo.updateLecturerQuotaCurrentCount(
      client,
      snapshot.lecturerId,
      academicYearId,
      snapshot.currentCount,
    );
    results.push({
      lecturerId: snapshot.lecturerId,
      currentCount: snapshot.currentCount,
      activeCount: snapshot.activeCount,
      bookingCount: snapshot.bookingCount,
      pendingKadepCount: snapshot.pendingKadepCount,
    });
  }

  return results;
}

export default {
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots,
  syncLecturerQuotaCurrentCount,
  syncAllLecturerQuotaCurrentCounts,
};
