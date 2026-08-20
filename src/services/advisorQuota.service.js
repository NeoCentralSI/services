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

/** Track both thesis-key and student-key so request (thesisId null) + supervisor row don't double-count. */
function markTracked(trackedKeys, { lecturerId, thesisId, studentId }) {
  if (thesisId) trackedKeys.add(`thesis:${lecturerId}:${thesisId}`);
  if (studentId) trackedKeys.add(`student:${lecturerId}:${studentId}`);
}

function isAlreadyTracked(trackedKeys, { lecturerId, thesisId, studentId }) {
  if (thesisId && trackedKeys.has(`thesis:${lecturerId}:${thesisId}`)) return true;
  if (studentId && trackedKeys.has(`student:${lecturerId}:${studentId}`)) return true;
  return false;
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

  // 6 angka kuota canon §7.3 (handoff P0-02 + BR-06):
  // 1. Beban Aktif    → activeCount
  // 2. Booking        → bookingCount
  // 3. Sisa Normal    → normalAvailable
  // 4. Pending KaDep  → pendingKadepCount
  // 5. Overquota Sah  → overquotaSahCount (pakai acceptedOverNormal=true flag)
  // 6. Quota Max      → quotaMax
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
    overquotaSahCount: 0,
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

function formatPeriodLabel(academicYear) {
  if (!academicYear) return null;
  const semester = academicYear.semester ? ` ${academicYear.semester}` : "";
  return `${academicYear.year ?? "-"}${semester}`.trim();
}

function resolveProposalVersionInfo(thesis) {
  const latest = thesis?.proposalVersions?.[0] ?? null;
  const finalVersion = thesis?.finalProposalVersion ?? null;
  return {
    proposalStatus: thesis?.proposalStatus ?? null,
    proposalVersion: finalVersion?.version ?? latest?.version ?? null,
    hasFinalProposal: Boolean(thesis?.finalProposalVersionId),
  };
}

function resolveEntryPeriod(source, operationalAcademicYearId) {
  const thesis = source?.thesis ?? null;
  const chargedYear =
    thesis?.activeAcademicYear ??
    thesis?.academicYear ??
    source?.academicYear ??
    null;
  const chargedYearId =
    thesis?.activeAcademicYearId ??
    thesis?.academicYearId ??
    source?.academicYearId ??
    chargedYear?.id ??
    null;
  return {
    academicYearId: chargedYearId,
    academicYearLabel: formatPeriodLabel(chargedYear),
    isCurrentPeriod: chargedYearId
      ? chargedYearId === operationalAcademicYearId
      : true,
  };
}

function mapRequestEntry(request, bucket, operationalAcademicYearId) {
  const effectiveLecturerId = getEffectiveRequestLecturerId(request);
  // Resolve justifikasi canon-aligned: prefer studentJustification (canon
  // §5.2.1 v2.1), fallback ke justificationText legacy (handoff P0-05).
  const resolvedStudentJustification =
    request.studentJustification ?? request.justificationText ?? null;
  const proposalInfo = resolveProposalVersionInfo(request.thesis);
  const period = resolveEntryPeriod(request, operationalAcademicYearId);

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
    // BR-26 Path C audit (handoff P0-01).
    forwardedToKadepAt: request.forwardedToKadepAt ?? null,
    forwardedByLecturerId: request.forwardedByLecturerId ?? null,
    forwardedByLecturerName: request.forwardedByLecturer?.user?.fullName ?? null,
    // BR-06 Overquota Sah flag (handoff P0-02).
    acceptedOverNormal: Boolean(request.acceptedOverNormal),
    lecturerApprovalNote: request.lecturerApprovalNote ?? null,
    lecturerOverquotaReason: request.lecturerOverquotaReason ?? null,
    rejectionReason: request.rejectionReason ?? null,
    // Selalu expose dua field justifikasi (legacy + canon-aligned) untuk
    // backward compat consumer frontend yang belum migrate naming.
    justificationText: resolvedStudentJustification,
    studentJustification: resolvedStudentJustification,
    kadepNotes: request.kadepNotes ?? null,
    createdAt: request.createdAt ?? null,
    updatedAt: request.updatedAt ?? null,
    lecturerRespondedAt: request.lecturerRespondedAt ?? null,
    reviewedAt: request.reviewedAt ?? null,
    proposalStatus: proposalInfo.proposalStatus,
    proposalVersion: proposalInfo.proposalVersion,
    hasFinalProposal: proposalInfo.hasFinalProposal,
    thesisStatus: request.thesis?.thesisStatus?.name ?? null,
    academicYearId: period.academicYearId,
    academicYearLabel: period.academicYearLabel,
    isCurrentPeriod: period.isCurrentPeriod,
  };
}

function mapSupervisorEntry(supervisor, bucket, operationalAcademicYearId) {
  const proposalInfo = resolveProposalVersionInfo(supervisor.thesis);
  const period = resolveEntryPeriod(supervisor, operationalAcademicYearId);
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
    proposalStatus: proposalInfo.proposalStatus,
    proposalVersion: proposalInfo.proposalVersion,
    hasFinalProposal: proposalInfo.hasFinalProposal,
    thesisStatus: supervisor.thesis?.thesisStatus?.name ?? null,
    academicYearId: period.academicYearId,
    academicYearLabel: period.academicYearLabel,
    isCurrentPeriod: period.isCurrentPeriod,
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

function thesisBelongsToQuotaYear(thesis, academicYearId) {
  if (isOfficialAccepted(thesis)) {
    return (thesis.activeAcademicYearId ?? thesis.academicYearId) === academicYearId;
  }
  return thesis?.academicYearId === academicYearId;
}

function supervisorBelongsToQuotaYear(supervisor, academicYearId) {
  if (!academicYearId) return true;
  return thesisBelongsToQuotaYear(supervisor.thesis ?? null, academicYearId);
}

/**
 * A booking consumes exactly one slot, in exactly one period (canon §7.3).
 *
 * Once a request has materialized into a thesis, the thesis period decides
 * which period the slot belongs to; the request's own period only applies to
 * reservations that have no thesis yet. Without this, a request created in an
 * earlier period and the supervisor row of its thesis in the operational
 * period are counted as two separate bookings (SIMPTA-FUN-006).
 */
function requestBelongsToQuotaYear(request, academicYearId) {
  if (!academicYearId) return true;
  const thesis = request.thesis ?? null;
  if (!thesis) return request.academicYearId === academicYearId;
  return thesisBelongsToQuotaYear(thesis, academicYearId);
}

function pushEntry(snapshot, bucket, entry) {
  if (bucket === "active") {
    snapshot.activeCount += 1;
    snapshot.activeOfficialEntries.push(entry);
    // Overquota Sah valid baik di status BOOKING_APPROVED (pra-TA-04) maupun
    // ACTIVE_OFFICIAL (post-TA-04) — flag acceptedOverNormal=true tetap relevan.
    if (entry.acceptedOverNormal) snapshot.overquotaSahCount += 1;
    return;
  }
  if (bucket === "booking") {
    snapshot.bookingCount += 1;
    snapshot.bookingEntries.push(entry);
    if (entry.acceptedOverNormal) snapshot.overquotaSahCount += 1;
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
    if (!requestBelongsToQuotaYear(request, resolvedAcademicYearId)) continue;

    const effectiveLecturerId = getEffectiveRequestLecturerId(request);
    const snapshot = snapshots.get(effectiveLecturerId);
    if (!snapshot) continue;

    const bucket = classifyRequestBucket(request);
    if (!bucket) continue;

    markTracked(trackedKeys, {
      lecturerId: effectiveLecturerId,
      thesisId: request.thesisId ?? request.thesis?.id ?? null,
      studentId: request.studentId,
    });
    pushEntry(snapshot, bucket, mapRequestEntry(request, bucket, resolvedAcademicYearId));
  }

  for (const supervisor of trackedSupervisors) {
    if (!supervisorBelongsToQuotaYear(supervisor, resolvedAcademicYearId)) continue;

    const snapshot = snapshots.get(supervisor.lecturerId);
    if (!snapshot) continue;

    const supervisorIdentity = {
      lecturerId: supervisor.lecturerId,
      thesisId: supervisor.thesis?.id ?? null,
      studentId: supervisor.thesis?.studentId ?? supervisor.thesis?.student?.id ?? null,
    };
    if (isAlreadyTracked(trackedKeys, supervisorIdentity)) continue;

    const bucket = classifySupervisorBucket(supervisor);
    if (!bucket) continue;

    markTracked(trackedKeys, supervisorIdentity);
    pushEntry(snapshot, bucket, mapSupervisorEntry(supervisor, bucket, resolvedAcademicYearId));
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
    const existing = await repo.ensureLecturerQuotaRow(
      client,
      snapshot.lecturerId,
      academicYearId,
    );
    await repo.updateLecturerQuotaCurrentCount(
      client,
      snapshot.lecturerId,
      academicYearId,
      snapshot.currentCount,
    );
    const previousCount = existing?.currentCount ?? 0;
    results.push({
      lecturerId: snapshot.lecturerId,
      fullName: snapshot.fullName,
      previousCount,
      currentCount: snapshot.currentCount,
      // Non-zero means the cache had drifted and this run repaired it.
      drift: snapshot.currentCount - previousCount,
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
