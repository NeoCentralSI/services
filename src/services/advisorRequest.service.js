import * as repo from "../repositories/advisorRequest.repository.js";
import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import THESIS_STATUS, { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import {
  LECTURER_OVERQUOTA_REASON_MIN_LENGTH,
  RED_QUOTA_JUSTIFICATION_MIN_LENGTH,
  WITHDRAW_LOCK_HOURS,
} from "../constants/advisorRequest.js";
import { generateTA04Pdf } from "../utils/ta04.pdf.js";
import { createSupervisorAssignments } from "../utils/supervisorIntegrity.js";
import {
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots,
  lockLecturerQuotaForUpdate,
  syncLecturerQuotaCurrentCount,
} from "./advisorQuota.service.js";
import { resolveMetopenEligibilityState } from "./metopenEligibility.service.js";
import {
  ADVISOR_REQUEST_BLOCKING_STATUSES,
  ADVISOR_REQUEST_BOOKING_STATUSES,
  ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  ADVISOR_REQUEST_PENDING_REVIEW_STATUSES,
  ADVISOR_REQUEST_STATUS,
} from "../constants/advisorRequestStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";

const OFFICIAL_SUPERVISOR_ROLES = new Set([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]);
const PENDING_REVIEW_STATUSES = new Set(ADVISOR_REQUEST_PENDING_REVIEW_STATUSES);
const PENDING_KADEP_STATUSES = new Set(ADVISOR_REQUEST_PENDING_KADEP_STATUSES);
const WAITING_ASSIGNMENT_STATUSES = new Set([
  ADVISOR_REQUEST_STATUS.APPROVED,
  ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED,
  ADVISOR_REQUEST_STATUS.REDIRECTED,
]);
const BLOCKING_REQUEST_STATUSES = new Set(ADVISOR_REQUEST_BLOCKING_STATUSES);
const BOOKING_STATUSES = new Set(ADVISOR_REQUEST_BOOKING_STATUSES);
const SERIALIZABLE_TX = { isolationLevel: "Serializable" };
const TA02_REVISIONABLE_STATUSES = new Set([
  ADVISOR_REQUEST_STATUS.REVISION_REQUESTED,
  ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP,
]);
const SUBMISSION_REQUIRED_FIELDS = [
  ["topicId", "Topik penelitian wajib dipilih."],
  ["proposedTitle", "Judul tugas akhir wajib diisi."],
  ["backgroundSummary", "Latar belakang singkat wajib diisi."],
  ["problemStatement", "Tujuan / permasalahan wajib diisi."],
  ["proposedSolution", "Rencana solusi wajib diisi."],
  ["researchObject", "Objek penelitian wajib diisi."],
  ["researchPermitStatus", "Status izin penelitian wajib dipilih."],
];

function deriveRequestType(lecturerId) {
  return lecturerId ? "ta_01" : "ta_02";
}

function resolveStudentJustificationInput(data = {}) {
  if (data.studentJustification !== undefined) {
    const cleanStudentJustification = sanitizeOptionalText(data.studentJustification);
    if (cleanStudentJustification !== null || data.justificationText === undefined) {
      return cleanStudentJustification;
    }
  }
  if (data.justificationText !== undefined) {
    return sanitizeOptionalText(data.justificationText);
  }
  return undefined;
}

function buildDraftPayload(data = {}) {
  const studentJustification = resolveStudentJustificationInput(data);

  return {
    lecturerId: data.lecturerId === undefined ? undefined : sanitizeOptionalText(data.lecturerId),
    topicId: data.topicId === undefined ? undefined : sanitizeOptionalText(data.topicId),
    proposedTitle:
      data.proposedTitle === undefined ? undefined : sanitizeOptionalText(data.proposedTitle),
    backgroundSummary:
      data.backgroundSummary === undefined ? undefined : sanitizeOptionalText(data.backgroundSummary),
    problemStatement:
      data.problemStatement === undefined ? undefined : sanitizeOptionalText(data.problemStatement),
    proposedSolution:
      data.proposedSolution === undefined ? undefined : sanitizeOptionalText(data.proposedSolution),
    researchObject:
      data.researchObject === undefined ? undefined : sanitizeOptionalText(data.researchObject),
    researchPermitStatus:
      data.researchPermitStatus === undefined
        ? undefined
        : sanitizeOptionalText(data.researchPermitStatus),
    justificationText: studentJustification,
    studentJustification,
    attachmentId: data.attachmentId === undefined ? undefined : sanitizeOptionalText(data.attachmentId),
  };
}

function buildDraftDataFromRequest(request) {
  if (!request) return {};

  return {
    lecturerId: request.lecturerId ?? null,
    topicId: request.topicId ?? null,
    proposedTitle: request.proposedTitle ?? null,
    backgroundSummary: request.backgroundSummary ?? null,
    problemStatement: request.problemStatement ?? null,
    proposedSolution: request.proposedSolution ?? null,
    researchObject: request.researchObject ?? null,
    researchPermitStatus: request.researchPermitStatus ?? null,
    justificationText: request.studentJustification ?? request.justificationText ?? null,
    studentJustification: request.studentJustification ?? request.justificationText ?? null,
    attachmentId: request.attachmentId ?? null,
  };
}

function buildDraftResponse(draft, fallbackRequest = null) {
  const source = draft ? "draft" : fallbackRequest ? "latest_submission" : "empty";
  const payload = draft ?? {
    id: null,
    studentId: fallbackRequest?.studentId ?? null,
    lecturerId: fallbackRequest?.lecturerId ?? null,
    topicId: fallbackRequest?.topicId ?? null,
    proposedTitle: fallbackRequest?.proposedTitle ?? null,
    backgroundSummary: fallbackRequest?.backgroundSummary ?? null,
    problemStatement: fallbackRequest?.problemStatement ?? null,
    proposedSolution: fallbackRequest?.proposedSolution ?? null,
    researchObject: fallbackRequest?.researchObject ?? null,
    researchPermitStatus: fallbackRequest?.researchPermitStatus ?? null,
    justificationText: fallbackRequest?.studentJustification ?? fallbackRequest?.justificationText ?? null,
    studentJustification: fallbackRequest?.studentJustification ?? fallbackRequest?.justificationText ?? null,
    attachmentId: fallbackRequest?.attachmentId ?? null,
    attachment: fallbackRequest?.attachment ?? null,
    lecturer: fallbackRequest?.lecturer ?? null,
    topic: fallbackRequest?.topic ?? null,
    lastSubmittedAt: fallbackRequest?.createdAt ?? null,
    createdAt: null,
    updatedAt: null,
  };

  return {
    ...payload,
    justificationText: payload.studentJustification ?? payload.justificationText ?? null,
    studentJustification: payload.studentJustification ?? payload.justificationText ?? null,
    requestType: deriveRequestType(payload.lecturerId),
    source,
  };
}

function buildEmptyDraft(studentId) {
  return {
    id: null,
    studentId,
    lecturerId: null,
    topicId: null,
    proposedTitle: null,
    backgroundSummary: null,
    problemStatement: null,
    proposedSolution: null,
    researchObject: null,
    researchPermitStatus: null,
    justificationText: null,
    studentJustification: null,
    attachmentId: null,
    attachment: null,
    lecturer: null,
    topic: null,
    lastSubmittedAt: null,
    createdAt: null,
    updatedAt: null,
    requestType: "ta_02",
    source: "empty",
  };
}

function ensureSubmissionFields(payload) {
  for (const [field, message] of SUBMISSION_REQUIRED_FIELDS) {
    const value = payload?.[field];
    if (value == null || value === "") {
      throw new BadRequestError(message);
    }
  }
}

function isOfficialSupervisorContext(thesis) {
  return (
    thesis?.proposalStatus === "accepted" &&
    !CLOSED_THESIS_STATUSES.includes(thesis?.thesisStatus?.name)
  );
}

function formatCompactSupervisorNames(supervisors = []) {
  const names = supervisors
    .slice()
    .sort((a, b) => {
      const order = (roleName) => {
        if (roleName === ROLES.PEMBIMBING_1) return 0;
        if (roleName === ROLES.PEMBIMBING_2) return 1;
        return 99;
      };
      return order(a.role?.name) - order(b.role?.name);
    })
    .map((supervisor) => supervisor.lecturer?.user?.fullName ?? "-")
    .filter(Boolean);

  return [...new Set(names)].join(", ");
}

function mapSupervisors(thesis) {
  if (!thesis?.thesisSupervisors?.length || !isOfficialSupervisorContext(thesis)) return [];

  return thesis.thesisSupervisors
    .filter((supervisor) => OFFICIAL_SUPERVISOR_ROLES.has(supervisor.role?.name))
    .map((supervisor) => ({
      id: supervisor.id,
      lecturerId: supervisor.lecturerId,
      name: supervisor.lecturer?.user?.fullName ?? "-",
      email: supervisor.lecturer?.user?.email ?? null,
      avatarUrl: supervisor.lecturer?.user?.avatarUrl ?? null,
      role: supervisor.role?.name ?? null,
    }));
}

function buildAdvisorAccessState(
  studentContext,
  blockingRequest,
  eligibilityState,
  latestRequest = null,
) {
  const thesis = studentContext?.thesis?.[0] ?? null;
  const supervisors = mapSupervisors(thesis);
  const hasOfficialSupervisor = supervisors.length > 0;
  const hasBlockingRequest = Boolean(
    blockingRequest && BLOCKING_REQUEST_STATUSES.has(blockingRequest.status)
  );
  const hasMetopenAccess = eligibilityState?.canAccess === true;
  const canUseSubmissionFlow = eligibilityState?.canSubmit === true;
  const readOnly = eligibilityState?.readOnly === true;

  let canBrowseCatalog = false;
  let canViewCatalog = hasMetopenAccess;
  let canSubmitRequest = false;
  let canOpenLogbook = hasOfficialSupervisor;
  let reason = "Akses pengajuan pembimbing sedang diproses.";
  let nextStep = "review_guidance";

  if (!hasMetopenAccess) {
    reason = eligibilityState?.hasExternalStatus
      ? "Mahasiswa belum eligible Metopen berdasarkan data eksternal SIA."
      : "Status eligibility Metopen dari SIA belum tersedia untuk mahasiswa ini.";
    nextStep = "wait_external_eligibility";
    canViewCatalog = false;
  } else if (readOnly) {
    reason = "Fase Metopen sudah menjadi arsip. Pengajuan TA-01/TA-02 baru tidak dapat dibuat.";
    nextStep = hasOfficialSupervisor ? "open_logbook" : "view_archive";
  } else if (hasOfficialSupervisor) {
    reason = "Anda sudah memiliki dosen pembimbing aktif.";
    nextStep = "open_logbook";
  } else if (hasBlockingRequest && blockingRequest) {
    if (PENDING_REVIEW_STATUSES.has(blockingRequest.status)) {
      reason = "Anda masih memiliki pengajuan pembimbing yang sedang diproses.";
      nextStep = "wait_lecturer_response";
    } else if (PENDING_KADEP_STATUSES.has(blockingRequest.status)) {
      reason = "Pengajuan pembimbing Anda sedang menunggu validasi Kepala Departemen.";
      nextStep = "wait_department_review";
    } else if (BOOKING_STATUSES.has(blockingRequest.status)) {
      reason = "Booking pembimbing Anda sudah disetujui dan menunggu pengesahan judul/proposal.";
      nextStep = "continue_metopen";
    } else if (WAITING_ASSIGNMENT_STATUSES.has(blockingRequest.status)) {
      reason = "Pengajuan Anda sudah disetujui dan sedang menunggu penetapan pembimbing.";
      nextStep = "wait_assignment";
    } else {
      reason = "Penetapan pembimbing sedang disinkronkan. Silakan tunggu beberapa saat.";
      nextStep = "wait_assignment_sync";
    }
  } else {
    canBrowseCatalog = canUseSubmissionFlow;
    canSubmitRequest = canUseSubmissionFlow;

    if (latestRequest?.status === ADVISOR_REQUEST_STATUS.REVISION_REQUESTED) {
      reason =
        "KaDep meminta revisi TA-02. Perbarui draft yang sama sesuai catatan review lalu ajukan ulang.";
      nextStep = "revise_draft";
    } else if (
      latestRequest &&
      TA02_REVISIONABLE_STATUSES.has(latestRequest.status)
    ) {
      reason =
        "Pengajuan sebelumnya sudah selesai diproses. Anda dapat menggunakan kembali draft yang sama untuk mengajukan ulang.";
      nextStep = "reuse_draft";
    } else {
      reason =
        "Silakan mulai pengajuan awal pembimbing dan judul. Gunakan TA-01 bila Anda sudah memiliki calon dosen pembimbing, atau TA-02 bila Anda belum memiliki calon pembimbing.";
      nextStep = "browse_catalog";
    }
  }

  return {
    studentId: studentContext.id,
    thesisId: thesis?.id ?? null,
    thesisTitle: thesis?.title ?? null,
    thesisStatus: thesis?.thesisStatus?.name ?? null,
    eligibleMetopen: eligibilityState?.eligibleMetopen ?? null,
    hasExternalEligibility: eligibilityState?.hasExternalStatus ?? false,
    metopenEligibilitySource: eligibilityState?.source ?? null,
    metopenEligibilityUpdatedAt: eligibilityState?.updatedAt ?? null,
    metopenReadOnly: readOnly,
    gateConfigured: false,
    gateOpen: hasMetopenAccess,
    gates: [],
    supervisors,
    hasOfficialSupervisor,
    hasBlockingRequest,
    blockingRequest,
    latestRequest,
    requestStatus: blockingRequest?.status ?? null,
    canBrowseCatalog,
    canViewCatalog,
    canSubmitRequest,
    canOpenLogbook,
    reason,
    nextStep,
  };
}

async function resolveStudentAdvisorAccessState(userId) {
  const studentContext = await repo.findStudentAdvisorAccessContext(userId);
  if (!studentContext) {
    throw new NotFoundError("Data mahasiswa tidak ditemukan");
  }

  const [blockingRequest, latestRequest, eligibilityState] = await Promise.all([
    repo.findBlockingByStudent(studentContext.id),
    repo.findLatestByStudent(studentContext.id),
    resolveMetopenEligibilityState(userId),
  ]);

  return buildAdvisorAccessState(studentContext, blockingRequest, eligibilityState, latestRequest);
}

async function getStudentRecord(userId) {
  const student = await repo.findStudentByUserId(userId);
  if (!student) {
    throw new NotFoundError("Data mahasiswa tidak ditemukan");
  }

  return student;
}

function sanitizeOptionalText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function requiresDepartmentRoute(quotaSnapshot) {
  return quotaSnapshot?.trafficLight === "red";
}

function isPathCOverquotaRequest(request) {
  return request?.requestType === "ta_01" && request?.routeType === "escalated" && Boolean(request?.lecturerId);
}

function ensurePathCDualJustification(request) {
  if (!isPathCOverquotaRequest(request)) return;

  const studentJustification = sanitizeOptionalText(
    request.studentJustification ?? request.justificationText,
  );
  if (
    !studentJustification ||
    studentJustification.length < RED_QUOTA_JUSTIFICATION_MIN_LENGTH
  ) {
    throw new BadRequestError(
      `Path C escalated TA-01 wajib memiliki justifikasi akademik mahasiswa minimal ${RED_QUOTA_JUSTIFICATION_MIN_LENGTH} karakter.`,
    );
  }

  const lecturerOverquotaReason = sanitizeOptionalText(
    request.lecturerOverquotaReason ?? request.lecturerApprovalNote,
  );
  if (
    !lecturerOverquotaReason ||
    lecturerOverquotaReason.length < LECTURER_OVERQUOTA_REASON_MIN_LENGTH
  ) {
    throw new BadRequestError(
      `Path C escalated TA-01 wajib memiliki proyeksi lulus dosen minimal ${LECTURER_OVERQUOTA_REASON_MIN_LENGTH} karakter sebelum diputuskan KaDep.`,
    );
  }
}

async function resolveAcademicYearIdOrThrow(academicYearId) {
  if (academicYearId) return academicYearId;

  const activeYear = await repo.findActiveAcademicYear();
  if (!activeYear) {
    throw new BadRequestError("Tidak ada tahun akademik aktif");
  }

  return activeYear.id;
}

async function writeAdvisorAuditLog(
  client,
  {
    actorUserId,
    actorRole,
    action,
    requestId,
    studentId,
    lecturerId,
    thesisId = null,
    oldStatus = null,
    newStatus = null,
    reason = null,
    extraMetadata = null,
  },
) {
  return repo.createAuditLogWithClient(client, {
    userId: actorUserId ?? null,
    action,
    entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
    entityId: requestId,
    changes: {
      oldValues: oldStatus ? { status: oldStatus } : null,
      newValues: newStatus ? { status: newStatus } : null,
      metadata: {
        actorRole: actorRole ?? null,
        studentId,
        lecturerId,
        thesisId,
        reason: reason ?? null,
        ...(extraMetadata ?? {}),
      },
    },
  });
}

async function ensureNoBlockingRequestConflict(tx, studentId, requestId) {
  const conflicting = await repo.findBlockingConflictByStudent(tx, studentId, requestId);
  if (!conflicting) return;

  throw new BadRequestError(
    `Mahasiswa sudah memiliki pengajuan/booking aktif lain${conflicting.lecturer?.user?.fullName ? ` pada ${conflicting.lecturer.user.fullName}` : ""}. Selesaikan konflik pengajuan terlebih dahulu.`,
  );
}

async function ensureOperationalSupervisorAssignment(tx, request, lecturerId) {
  let thesis = request.thesisId
    ? await repo.findThesisByIdWithClient(tx, request.thesisId)
    : await repo.findThesisByStudentWithClient(tx, request.studentId);

  if (!thesis) {
    thesis = await repo.createThesisWithClient(tx, {
      studentId: request.studentId,
      academicYearId: request.academicYearId,
      thesisTopicId: request.topicId ?? null,
      title: request.proposedTitle || "Judul belum ditentukan",
      isProposal: true,
    });
  } else {
    const thesisPatch = {};
    if (!thesis.academicYearId && request.academicYearId) {
      thesisPatch.academicYearId = request.academicYearId;
    }
    if (!thesis.thesisTopicId && request.topicId) {
      thesisPatch.thesisTopicId = request.topicId;
    }
    if (!thesis.title && request.proposedTitle) {
      thesisPatch.title = request.proposedTitle;
    }

    if (Object.keys(thesisPatch).length > 0) {
      thesis = await repo.updateThesisWithClient(tx, thesis.id, thesisPatch);
    }
  }

  const existingAssignment = await repo.findSupervisorAssignmentByLecturerAndThesis(
    tx,
    thesis.id,
    lecturerId,
  );

  if (!existingAssignment) {
    await createSupervisorAssignments(tx, thesis.id, [
      { lecturerId, supervisorRole: "pembimbing_1" },
    ], { requireP1: true });
  } else if (existingAssignment.role?.name !== ROLES.PEMBIMBING_1) {
    throw new BadRequestError("Dosen ini sudah terpasang pada role pembimbing lain untuk mahasiswa tersebut.");
  }

  return {
    thesisId: thesis.id,
  };
}

async function getLockedQuotaSnapshot(tx, lecturerId, academicYearId) {
  await lockLecturerQuotaForUpdate(lecturerId, academicYearId, { client: tx });
  await syncLecturerQuotaCurrentCount(lecturerId, academicYearId, { client: tx });
  return getLecturerQuotaSnapshot(lecturerId, academicYearId, { client: tx, includeEntries: true });
}

async function approveBookingInTransaction(tx, request, actorUserId, actorRole, approvalMetadata = {}) {
  const assignedLecturerId = approvalMetadata.assignedLecturerId ?? request.lecturerId;
  const redirectTargetId = approvalMetadata.redirectedTo ?? request.redirectedTo ?? null;
  const assignment = await ensureOperationalSupervisorAssignment(tx, request, assignedLecturerId);
  const oldStatus = request.status;
  const updated = await repo.updateStatusWithClient(tx, request.id, {
    status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
    routeType: request.routeType === "escalated" ? "escalated" : "normal",
    thesisId: assignment.thesisId,
    lecturerRespondedAt: approvalMetadata.lecturerRespondedAt ?? request.lecturerRespondedAt ?? null,
    reviewedBy: approvalMetadata.reviewedBy ?? request.reviewedBy ?? null,
    reviewedAt: approvalMetadata.reviewedAt ?? request.reviewedAt ?? null,
    lecturerApprovalNote: approvalMetadata.lecturerApprovalNote ?? request.lecturerApprovalNote ?? null,
    kadepNotes: approvalMetadata.kadepNotes ?? request.kadepNotes ?? null,
    redirectedTo: redirectTargetId,
  });

  const currentCount = await syncLecturerQuotaCurrentCount(assignedLecturerId, request.academicYearId, {
    client: tx,
  });

  await writeAdvisorAuditLog(tx, {
    actorUserId,
    actorRole,
    action:
      actorRole === ROLES.KETUA_DEPARTEMEN || actorRole === "kadep"
        ? AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_APPROVED
        : AUDIT_ACTIONS.REQUEST_ADVISOR_ACCEPTED,
    requestId: request.id,
    studentId: request.studentId,
    lecturerId: assignedLecturerId,
    thesisId: assignment.thesisId,
    oldStatus,
    newStatus: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
    reason:
      approvalMetadata.kadepNotes ?? approvalMetadata.lecturerApprovalNote ?? request.lecturerApprovalNote ?? null,
    extraMetadata: {
      quotaCurrentCount: currentCount,
      originalLecturerId: request.lecturerId !== assignedLecturerId ? request.lecturerId : null,
      redirectedTo: redirectTargetId,
    },
  });

  return updated;
}

async function escalateBookingToKadepInTransaction(tx, request, lecturerUserId, lecturerOverquotaReason) {
  const oldStatus = request.status;
  const updated = await repo.updateStatusWithClient(tx, request.id, {
    status: ADVISOR_REQUEST_STATUS.PENDING_KADEP,
    routeType: "escalated",
    lecturerRespondedAt: new Date(),
    lecturerApprovalNote: lecturerOverquotaReason,
    lecturerOverquotaReason,
  });

  await writeAdvisorAuditLog(tx, {
    actorUserId: lecturerUserId,
    actorRole: ROLES.PEMBIMBING_1,
    action: AUDIT_ACTIONS.REQUEST_ADVISOR_ESCALATED_TO_KADEP,
    requestId: request.id,
    studentId: request.studentId,
    lecturerId: request.lecturerId,
    thesisId: request.thesisId ?? request.thesis?.id ?? null,
    oldStatus,
    newStatus: ADVISOR_REQUEST_STATUS.PENDING_KADEP,
    reason: lecturerOverquotaReason,
  });

  return updated;
}

// ============================================
// Lecturer Catalog (Student browsing)
// ============================================

/**
 * Get lecturer catalog with traffic-light quota status
 */
export async function getLecturerCatalog(userId, academicYearId) {
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canViewCatalog || !accessState.canBrowseCatalog) {
    throw new ForbiddenError(accessState.reason);
  }

  academicYearId = await resolveAcademicYearIdOrThrow(academicYearId);

  const quotas = await getLecturerQuotaSnapshots({ academicYearId });

  return quotas.map((quota) => ({
    lecturerId: quota.lecturerId,
    fullName: quota.fullName,
    identityNumber: quota.identityNumber,
    email: quota.email,
    avatarUrl: quota.avatarUrl,
    scienceGroup: quota.scienceGroup,
    quotaMax: quota.quotaMax,
    activeTheses: quota.activeCount,
    activeCount: quota.activeCount,
    normalAvailable: quota.normalAvailable,
    trafficLight: quota.trafficLight,
    statusLabel:
      quota.normalAvailable > 0
        ? "Kuota normal tersedia"
        : "Kuota normal penuh, pengajuan baru tetap bisa diajukan dengan validasi khusus",
    supervisedTopics: [],
  }));
}

// ============================================
// Submit Request (Student)
// ============================================

/**
 * Submit an advisor request.
 * Enforces exclusive lock (1 active request per student)
 * and split routing (normal vs escalated).
 */
export async function submitRequest(userId, data) {
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canSubmitRequest) {
    throw new ForbiddenError(accessState.reason);
  }

  const studentId = accessState.studentId;
  const academicYearId = await resolveAcademicYearIdOrThrow();
  const draftPatch = buildDraftPayload(data);
  const submittedAt = new Date();

  return repo.executeTransaction(async (tx) => {
    await repo.lockStudentRow(tx, studentId);
    await ensureNoBlockingRequestConflict(tx, studentId, null);

    await repo.upsertDraftByStudentWithClient(tx, studentId, draftPatch);
    const draft = await repo.findDraftByStudentWithClient(tx, studentId);
    const submission = buildDraftPayload(draft);
    ensureSubmissionFields(submission);

    const cleanLecturerId = sanitizeOptionalText(submission.lecturerId);
    const cleanTopicId = sanitizeOptionalText(submission.topicId);
    const cleanStudentJustification = sanitizeOptionalText(
      submission.studentJustification ?? submission.justificationText,
    );

    const topic = await repo.findTopicByIdWithClient(tx, cleanTopicId);
    if (!topic) {
      throw new NotFoundError("Topik tidak ditemukan");
    }

    let lecturer = null;
    let quotaSnapshot = null;

    if (cleanLecturerId) {
      lecturer = await repo.findLecturerForValidationWithClient(tx, cleanLecturerId);
      if (!lecturer) {
        throw new NotFoundError("Dosen pembimbing tidak ditemukan");
      }
      if (!lecturer.acceptingRequests) {
        throw new BadRequestError(
          "Dosen yang Anda pilih sedang tidak menerima pengajuan pembimbing",
        );
      }

      quotaSnapshot = await getLecturerQuotaSnapshot(cleanLecturerId, academicYearId, {
        client: tx,
      });
    }

    const isTa02DepartmentRoute = !cleanLecturerId;
    const isRedQuotaRoute = Boolean(cleanLecturerId) && requiresDepartmentRoute(quotaSnapshot);
    const usesDepartmentReview = isTa02DepartmentRoute || isRedQuotaRoute;

    if (
      isRedQuotaRoute &&
      (!cleanStudentJustification ||
        cleanStudentJustification.length < RED_QUOTA_JUSTIFICATION_MIN_LENGTH)
    ) {
      throw new BadRequestError(
        `Pengajuan TA-01 overquota wajib menyertakan justifikasi akademik mahasiswa minimal ${RED_QUOTA_JUSTIFICATION_MIN_LENGTH} karakter.`,
      );
    }

    const requestType = deriveRequestType(cleanLecturerId);
    const initialStatus = isTa02DepartmentRoute
      ? ADVISOR_REQUEST_STATUS.PENDING_KADEP
      : ADVISOR_REQUEST_STATUS.PENDING;
    const initialRouteType = usesDepartmentReview ? "escalated" : "normal";

    const request = await repo.createWithClient(tx, {
      studentId,
      lecturerId: cleanLecturerId,
      academicYearId,
      topicId: cleanTopicId,
      thesisId: accessState.thesisId || null,
      proposedTitle: submission.proposedTitle || null,
      backgroundSummary: submission.backgroundSummary || null,
      problemStatement: submission.problemStatement || null,
      proposedSolution: submission.proposedSolution || null,
      researchObject: submission.researchObject || null,
      researchPermitStatus: submission.researchPermitStatus || null,
      justificationText: cleanStudentJustification,
      studentJustification: cleanStudentJustification,
      requestType,
      status: initialStatus,
      routeType: initialRouteType,
      attachmentId: submission.attachmentId || null,
    });

    await repo.upsertDraftByStudentWithClient(tx, studentId, {
      ...buildDraftDataFromRequest(request),
      lastSubmittedAt: submittedAt,
    });

    await writeAdvisorAuditLog(tx, {
      actorUserId: userId,
      actorRole: "student",
      action: AUDIT_ACTIONS.REQUEST_ADVISOR_CREATED,
      requestId: request.id,
      studentId,
      lecturerId: cleanLecturerId,
      thesisId: request.thesisId ?? null,
      newStatus: initialStatus,
      reason: cleanStudentJustification,
      extraMetadata: {
        routeType: initialRouteType,
        requestType,
        trafficLight: quotaSnapshot?.trafficLight ?? null,
        submissionMode: cleanLecturerId
          ? initialRouteType === "escalated"
            ? "quota_red_lecturer_review"
            : "lecturer_selected"
          : "department_open",
      },
    });

    return request;
  }, SERIALIZABLE_TX);
}

// ============================================
// Student History & Status
// ============================================

/**
 * Get student's request history
 */
export async function getMyRequests(userId) {
  const student = await getStudentRecord(userId);
  return repo.findByStudent(student.id);
}

/**
 * Get canonical advisor access state for the authenticated student.
 */
export async function getMyAccessState(userId) {
  return resolveStudentAdvisorAccessState(userId);
}

export async function getMyDraft(userId) {
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canViewCatalog) {
    throw new ForbiddenError(accessState.reason);
  }

  const student = await getStudentRecord(userId);
  const [draft, latestRequest] = await Promise.all([
    repo.findDraftByStudent(student.id),
    repo.findLatestByStudent(student.id),
  ]);

  if (draft) {
    return buildDraftResponse(draft, latestRequest);
  }

  if (latestRequest) {
    return buildDraftResponse(null, latestRequest);
  }

  return buildEmptyDraft(student.id);
}

export async function saveMyDraft(userId, data) {
  const accessState = await resolveStudentAdvisorAccessState(userId);
  if (!accessState.canSubmitRequest) {
    throw new ForbiddenError(accessState.reason);
  }

  const student = await getStudentRecord(userId);
  const payload = buildDraftPayload(data);
  const hasChanges = Object.values(payload).some((value) => value !== undefined);
  if (!hasChanges) {
    throw new BadRequestError("Tidak ada perubahan draft yang dikirim.");
  }

  const topicId = payload.topicId;
  if (topicId) {
    const topic = await repo.findTopicById(topicId);
    if (!topic) {
      throw new NotFoundError("Topik tidak ditemukan");
    }
  }

  const lecturerId = payload.lecturerId;
  if (lecturerId) {
    const lecturer = await repo.findLecturerForValidation(lecturerId);
    if (!lecturer) {
      throw new NotFoundError("Dosen pembimbing tidak ditemukan");
    }
  }

  const draft = await repo.upsertDraftByStudent(student.id, payload);
  return buildDraftResponse(draft);
}

/**
 * Cancel a request or booking before it becomes active official.
 *
 * BR-22 (canon §5.12 + audit Q9 2026-05-10): Withdraw policy 72 jam max.
 *
 * Window 72 jam dihitung dari `request.createdAt`. Selama window aktif,
 * mahasiswa tidak boleh menarik (status pending / under_review / pending_kadep
 * / escalated). Setelah window habis, mahasiswa berhak menarik secara manual
 * dari status-status itu — TIDAK ADA special-case `under_review` yang
 * hard-disable indefinit (revisi penting dari v1.0).
 *
 * `BOOKING_APPROVED` adalah jalur cancel terpisah (sudah ada booking aktif),
 * tidak terkait window 72 jam — boleh ditarik selama belum mulai proses
 * proposal/logbook/penilaian (lihat guard di transaction di bawah).
 */
export async function withdrawRequest(requestId, userId) {
  const student = await getStudentRecord(userId);
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.studentId !== student.id) throw new ForbiddenError("Bukan pengajuan Anda");

  const cancellableStatuses = new Set([
    ADVISOR_REQUEST_STATUS.PENDING,
    ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
    ADVISOR_REQUEST_STATUS.PENDING_KADEP,
    ADVISOR_REQUEST_STATUS.ESCALATED,
    ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
  ]);
  if (!cancellableStatuses.has(request.status)) {
    throw new BadRequestError("Status pengajuan saat ini tidak dapat dibatalkan oleh mahasiswa.");
  }

  // BR-22 anti-sandera: Window 72 jam berlaku untuk semua status review aktif
  // (pending / under_review / pending_kadep / escalated). BOOKING_APPROVED
  // bukan status review — pakai jalur process-lock guard di bawah.
  const TIME_LOCKED_STATUSES = new Set([
    ADVISOR_REQUEST_STATUS.PENDING,
    ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
    ADVISOR_REQUEST_STATUS.PENDING_KADEP,
    ADVISOR_REQUEST_STATUS.ESCALATED,
  ]);
  if (TIME_LOCKED_STATUSES.has(request.status)) {
    const hoursSinceCreated =
      (Date.now() - new Date(request.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated < WITHDRAW_LOCK_HOURS) {
      const remainingHours = Math.ceil(WITHDRAW_LOCK_HOURS - hoursSinceCreated);
      throw new BadRequestError(
        `Pengajuan belum bisa ditarik. Tunggu ${remainingHours} jam lagi untuk menghormati waktu review dosen.`,
      );
    }
  }

  return repo.executeTransaction(async (tx) => {
    await repo.lockAdvisorRequestRow(tx, requestId);
    await repo.lockStudentRow(tx, student.id);

    const lockedRequest = await repo.findByIdWithClient(tx, requestId);
    if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
    if (lockedRequest.studentId !== student.id) throw new ForbiddenError("Bukan pengajuan Anda");

    const oldStatus = lockedRequest.status;
    if (!cancellableStatuses.has(oldStatus)) {
      throw new BadRequestError("Status pengajuan saat ini tidak dapat dibatalkan oleh mahasiswa.");
    }

    if (oldStatus === ADVISOR_REQUEST_STATUS.BOOKING_APPROVED && lockedRequest.thesis?.id) {
      const processLock = await repo.findThesisProcessLockState(tx, lockedRequest.thesis.id);
      const hasStartedProposalProcess =
        processLock?.proposalStatus === "accepted" ||
        Boolean(processLock?.finalProposalVersionId) ||
        (processLock?._count?.thesisGuidances ?? 0) > 0 ||
        (processLock?._count?.researchMethodScores ?? 0) > 0;

      if (hasStartedProposalProcess) {
        throw new BadRequestError(
          "Booking sudah masuk proses proposal/logbook/penilaian dan tidak dapat dibatalkan dari menu ini.",
        );
      }
    }

    const updated = await repo.updateStatusWithClient(tx, requestId, {
      status: ADVISOR_REQUEST_STATUS.CANCELED,
      withdrawnAt: new Date(),
      withdrawCount: { increment: 1 },
    });

    if (lockedRequest.thesis?.id && BOOKING_STATUSES.has(oldStatus)) {
      await repo.terminateSupervisorAssignmentByLecturerAndThesis(
        tx,
        lockedRequest.thesis.id,
        lockedRequest.lecturerId,
      );
      await syncLecturerQuotaCurrentCount(lockedRequest.lecturerId, lockedRequest.academicYearId, {
        client: tx,
      });
    }

    await writeAdvisorAuditLog(tx, {
      actorUserId: userId,
      actorRole: "student",
      action: AUDIT_ACTIONS.REQUEST_ADVISOR_CANCELLED,
      requestId,
      studentId: lockedRequest.studentId,
      lecturerId: lockedRequest.lecturerId,
      thesisId: lockedRequest.thesis?.id ?? lockedRequest.thesisId ?? null,
      oldStatus,
      newStatus: ADVISOR_REQUEST_STATUS.CANCELED,
    });

    return updated;
  }, SERIALIZABLE_TX);
}

// ============================================
// Dosen Inbox & Response
// ============================================

/**
 * Get pending requests for a lecturer
 */
export async function getDosenInbox(userId) {
  const academicYearId = await resolveAcademicYearIdOrThrow();
  const [pendingRequests, quotaSummary] = await Promise.all([
    repo.findByLecturerId(userId),
    getLecturerQuotaSnapshot(userId, academicYearId, { includeEntries: true }),
  ]);

  return {
    summary: quotaSummary,
    pendingRequests,
    activeOfficial: quotaSummary?.activeOfficialEntries ?? [],
    bookings: quotaSummary?.bookingEntries ?? [],
    pendingKadep: quotaSummary?.pendingKadepEntries ?? [],
  };
}

/**
 * Get responded/historical requests for a lecturer
 */
export async function getDosenInboxHistory(userId) {
  return repo.findRespondedByLecturerId(userId);
}

/**
 * Lecturer responds to a request (accept/reject)
 */
export async function respondByLecturer(
  requestId,
  userId,
  { action, approvalNote, lecturerOverquotaReason, rejectionReason },
) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
  if (!PENDING_REVIEW_STATUSES.has(request.status)) {
    throw new BadRequestError("Hanya pengajuan dengan status pending/sedang ditinjau yang bisa direspon");
  }

  if (action === "accept") {
    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      await repo.lockStudentRow(tx, request.studentId);

      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (lockedRequest.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
      if (!PENDING_REVIEW_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      await ensureNoBlockingRequestConflict(tx, lockedRequest.studentId, lockedRequest.id);
      const quotaSnapshot = await getLockedQuotaSnapshot(
        tx,
        lockedRequest.lecturerId,
        lockedRequest.academicYearId,
      );
      const approvalAt = new Date();

      if ((quotaSnapshot?.currentCount ?? 0) < (quotaSnapshot?.quotaMax ?? 0)) {
        return approveBookingInTransaction(tx, lockedRequest, userId, "lecturer", {
          lecturerRespondedAt: approvalAt,
          lecturerApprovalNote: sanitizeOptionalText(approvalNote),
        });
      }

      const cleanStudentJustification = sanitizeOptionalText(
        lockedRequest.studentJustification ?? lockedRequest.justificationText,
      );
      if (
        !cleanStudentJustification ||
        cleanStudentJustification.length < RED_QUOTA_JUSTIFICATION_MIN_LENGTH
      ) {
        throw new BadRequestError(
          `Pengajuan overquota tidak memiliki justifikasi akademik mahasiswa minimal ${RED_QUOTA_JUSTIFICATION_MIN_LENGTH} karakter. Minta mahasiswa mengajukan ulang lewat jalur escalated TA-01.`,
        );
      }

      const cleanLecturerOverquotaReason = sanitizeOptionalText(
        lecturerOverquotaReason ?? approvalNote,
      );
      if (
        !cleanLecturerOverquotaReason ||
        cleanLecturerOverquotaReason.length < LECTURER_OVERQUOTA_REASON_MIN_LENGTH
      ) {
        throw new BadRequestError(
          `Proyeksi lulus/alasan dosen menerima mahasiswa di atas kuota normal wajib diisi minimal ${LECTURER_OVERQUOTA_REASON_MIN_LENGTH} karakter.`,
        );
      }

      return escalateBookingToKadepInTransaction(
        tx,
        lockedRequest,
        userId,
        cleanLecturerOverquotaReason,
      );
    }, SERIALIZABLE_TX);
  } else if (action === "reject") {
    const cleanReason = sanitizeOptionalText(rejectionReason);
    if (!cleanReason || cleanReason.length < 5) {
      throw new BadRequestError("Alasan penolakan wajib diisi (minimal 5 karakter)");
    }
    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (lockedRequest.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
      if (!PENDING_REVIEW_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      const updated = await repo.updateStatusWithClient(tx, requestId, {
        status: ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN,
        rejectionReason: cleanReason,
        lecturerRespondedAt: new Date(),
      });

      await repo.upsertDraftByStudentWithClient(tx, lockedRequest.studentId, {
        ...buildDraftDataFromRequest(lockedRequest),
        lastSubmittedAt: lockedRequest.createdAt ?? lockedRequest.updatedAt ?? null,
      });

      await writeAdvisorAuditLog(tx, {
        actorUserId: userId,
        actorRole: "lecturer",
        action: AUDIT_ACTIONS.REQUEST_ADVISOR_REJECTED,
        requestId,
        studentId: lockedRequest.studentId,
        lecturerId: lockedRequest.lecturerId,
        thesisId: lockedRequest.thesis?.id ?? lockedRequest.thesisId ?? null,
        oldStatus: lockedRequest.status,
        newStatus: ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN,
        reason: cleanReason,
      });

      return updated;
    }, SERIALIZABLE_TX);
  } else {
    throw new BadRequestError("Action harus 'accept' atau 'reject'");
  }
}

/**
 * Lecturer marks a pending request as "under review" to lock withdrawal (FR-MHS-03).
 */
export async function markUnderReview(requestId, userId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
  if (request.status !== ADVISOR_REQUEST_STATUS.PENDING) {
    throw new BadRequestError("Hanya pengajuan dengan status pending yang bisa ditandai sedang ditinjau");
  }

  return repo.updateStatus(requestId, { status: ADVISOR_REQUEST_STATUS.UNDER_REVIEW });
}

// ============================================
// KaDep Queue & Decision
// ============================================

/**
 * Get KaDep queue (escalated + pending assignment)
 */
export async function getKadepQueue() {
  const [escalated, pendingAssignment] = await Promise.all([
    repo.findEscalated(),
    repo.findPendingAssignment(),
  ]);

  return {
    escalated: await Promise.all(
      escalated.map(async (item) => {
        if (!item.lecturerId) {
          return {
            ...item,
            quotaSnapshot: null,
            quotaPreview: null,
          };
        }

        const quotaSnapshot = await getLecturerQuotaSnapshot(
          item.lecturerId,
          item.academicYearId ?? null,
          { includeEntries: true },
        );
        const projectedCount = (quotaSnapshot?.currentCount ?? 0) + 1;
        const projectedOverquotaAmount = Math.max(
          0,
          projectedCount - (quotaSnapshot?.quotaMax ?? 0),
        );

        return {
          ...item,
          quotaSnapshot,
          quotaPreview: {
            projectedCurrentCount: projectedCount,
            willBeOverquota: projectedOverquotaAmount > 0,
            projectedOverquotaAmount,
          },
        };
      }),
    ),
    pendingAssignment,
  };
}

/**
 * Get smart recommendations for alternative lecturers
 * Score = (quotaRemaining * 3) + (sameTopicCount * 2) + (10 - activeThesisCount)
 */
export async function getRecommendations(requestId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const topicId = request.topicId;
  const scienceGroupId = request.topic?.scienceGroupId ?? null;

  if (!scienceGroupId) {
    return {
      alternatives: [],
      message: "KBK topik belum dipetakan. Minta Admin/Sekdep untuk menghubungkan topik ini ke Kelompok Bidang Keahlian.",
    };
  }

  const academicYearId = request.academicYearId ?? (await resolveAcademicYearIdOrThrow(null));

  // Find alternative lecturers in same KBK
  const alternatives = await repo.findAlternativeLecturers(
    scienceGroupId,
    academicYearId,
    request.lecturerId,
  );
  if (alternatives.length === 0) {
    return { alternatives: [] };
  }
  const quotaSnapshots = await getLecturerQuotaSnapshots({
    academicYearId,
    lecturerIds: alternatives.map((item) => item.lecturerId),
  });
  const quotaMap = new Map(quotaSnapshots.map((item) => [item.lecturerId, item]));

  const scored = alternatives
    .map((q) => {
      const quotaSnapshot = quotaMap.get(q.lecturerId);
      const activeTheses = quotaSnapshot?.activeCount ?? 0;
      const effectiveCount = quotaSnapshot?.currentCount ?? 0;
      const remaining = quotaSnapshot?.normalAvailable ?? Math.max(0, q.quotaMax - effectiveCount);

      const sameTopicCount = q.lecturer.thesisSupervisors?.filter(
        (ts) => ts.thesis?.thesisTopicId === topicId
      ).length || 0;

      const score = (remaining * 3) + (sameTopicCount * 2) + Math.max(0, 10 - activeTheses);

      const trafficLight = quotaSnapshot?.trafficLight ?? "green";

      return {
        lecturerId: q.lecturerId,
        fullName: q.lecturer.user?.fullName,
        identityNumber: q.lecturer.user?.identityNumber,
        avatarUrl: q.lecturer.user?.avatarUrl,
        scienceGroup: q.lecturer.scienceGroup,
        quotaMax: quotaSnapshot?.quotaMax ?? q.quotaMax,
        currentCount: effectiveCount,
        remaining,
        activeTheses,
        bookingCount: quotaSnapshot?.bookingCount ?? 0,
        sameTopicCount,
        trafficLight,
        score,
      };
    })
    .filter((l) => l.trafficLight !== "red")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { alternatives: scored };
}

/**
 * KaDep decides on an escalated request (override or redirect)
 */
export async function decideByKadep(requestId, kadepUserId, { action, targetLecturerId, notes }) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (!PENDING_KADEP_STATUSES.has(request.status)) {
    throw new BadRequestError("Hanya pengajuan eskalasi yang bisa diputuskan oleh KaDep");
  }

  const now = new Date();
  const hasOriginalLecturerTarget = Boolean(request.lecturerId);
  const cleanTargetLecturerId = sanitizeOptionalText(targetLecturerId);
  const cleanNotes = sanitizeOptionalText(notes);

  if (action === "approve" || action === "override") {
    const assignedLecturerId = hasOriginalLecturerTarget
      ? request.lecturerId
      : cleanTargetLecturerId;

    if (!assignedLecturerId) {
      throw new BadRequestError(
        "Pengajuan TA-02 tanpa dosen target harus diputuskan dengan memilih dosen pembimbing terlebih dahulu.",
      );
    }

    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      await repo.lockStudentRow(tx, request.studentId);

      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      ensurePathCDualJustification(lockedRequest);
      await ensureNoBlockingRequestConflict(tx, lockedRequest.studentId, lockedRequest.id);
      await getLockedQuotaSnapshot(tx, assignedLecturerId, lockedRequest.academicYearId);

      return approveBookingInTransaction(tx, lockedRequest, kadepUserId, "kadep", {
        assignedLecturerId,
        reviewedBy: kadepUserId,
        reviewedAt: now,
        kadepNotes: cleanNotes,
        lecturerApprovalNote: lockedRequest.lecturerApprovalNote ?? cleanNotes,
      });
    }, SERIALIZABLE_TX);
  } else if (action === "request_revision") {
    if (request.requestType !== "ta_02") {
      throw new BadRequestError("Request revision hanya berlaku untuk pengajuan TA-02.");
    }
    if (!cleanNotes || cleanNotes.length < 10) {
      throw new BadRequestError("Catatan revisi KaDep wajib diisi minimal 10 karakter.");
    }

    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      const updated = await repo.updateStatusWithClient(tx, requestId, {
        status: ADVISOR_REQUEST_STATUS.REVISION_REQUESTED,
        reviewedBy: kadepUserId,
        reviewedAt: now,
        kadepNotes: cleanNotes,
      });

      await repo.upsertDraftByStudentWithClient(tx, lockedRequest.studentId, {
        ...buildDraftDataFromRequest(lockedRequest),
        lastSubmittedAt: lockedRequest.createdAt ?? lockedRequest.updatedAt ?? null,
      });

      await writeAdvisorAuditLog(tx, {
        actorUserId: kadepUserId,
        actorRole: "kadep",
        action: AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_REVISION_REQUESTED,
        requestId,
        studentId: lockedRequest.studentId,
        lecturerId: lockedRequest.lecturerId,
        thesisId: lockedRequest.thesis?.id ?? lockedRequest.thesisId ?? null,
        oldStatus: lockedRequest.status,
        newStatus: ADVISOR_REQUEST_STATUS.REVISION_REQUESTED,
        reason: cleanNotes,
      });

      return updated;
    }, SERIALIZABLE_TX);
  } else if (action === "reject") {
    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      const updated = await repo.updateStatusWithClient(tx, requestId, {
        status: ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP,
        reviewedBy: kadepUserId,
        reviewedAt: now,
        kadepNotes: cleanNotes,
      });

      await repo.upsertDraftByStudentWithClient(tx, lockedRequest.studentId, {
        ...buildDraftDataFromRequest(lockedRequest),
        lastSubmittedAt: lockedRequest.createdAt ?? lockedRequest.updatedAt ?? null,
      });

      await writeAdvisorAuditLog(tx, {
        actorUserId: kadepUserId,
        actorRole: "kadep",
        action: AUDIT_ACTIONS.REQUEST_ADVISOR_KADEP_REJECTED,
        requestId,
        studentId: lockedRequest.studentId,
        lecturerId: lockedRequest.lecturerId,
        thesisId: lockedRequest.thesis?.id ?? lockedRequest.thesisId ?? null,
        oldStatus: lockedRequest.status,
        newStatus: ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP,
        reason: cleanNotes,
      });

      return updated;
    }, SERIALIZABLE_TX);
  } else if (action === "redirect") {
    if (!cleanTargetLecturerId) {
      throw new BadRequestError("Pilih dosen tujuan untuk pengalihan");
    }
    return repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      await repo.lockStudentRow(tx, request.studentId);

      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      ensurePathCDualJustification(lockedRequest);
      const targetLecturer = await repo.findLecturerForAssignment(cleanTargetLecturerId);
      if (!targetLecturer) throw new NotFoundError("Dosen tujuan tidak ditemukan");

      const targetQuotaSnapshot = await getLockedQuotaSnapshot(
        tx,
        cleanTargetLecturerId,
        lockedRequest.academicYearId,
      );
      if ((targetQuotaSnapshot?.normalAvailable ?? 0) <= 0) {
        throw new BadRequestError(
          "Dosen alternatif yang dipilih sudah tidak memiliki slot normal. Muat ulang rekomendasi lalu pilih dosen lain.",
        );
      }

      await ensureNoBlockingRequestConflict(tx, lockedRequest.studentId, lockedRequest.id);

      return approveBookingInTransaction(tx, lockedRequest, kadepUserId, "kadep", {
        assignedLecturerId: cleanTargetLecturerId,
        redirectedTo: cleanTargetLecturerId,
        reviewedBy: kadepUserId,
        reviewedAt: now,
        kadepNotes: cleanNotes,
        lecturerApprovalNote: lockedRequest.lecturerApprovalNote ?? cleanNotes,
      });
    }, SERIALIZABLE_TX);
  } else {
    throw new BadRequestError(
      "Action harus 'approve', 'reject', 'override', 'redirect', atau 'request_revision'",
    );
  }
}

/**
 * KaDep assigns advisor â€” creates ThesisSupervisors record
 */
export async function assignAdvisor(requestId, kadepUserId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const validStatuses = ["approved", "override_approved", "redirected"];
  if (!validStatuses.includes(request.status)) {
    throw new BadRequestError(
      `Pengajuan harus berstatus approved/override_approved/redirected, status saat ini: ${request.status}`
    );
  }

  // Determine which lecturer gets assigned
  const assignedLecturerId =
    request.status === "redirected" && request.redirectedTo
      ? request.redirectedTo
      : request.lecturerId;

  if (!request.academicYearId) {
    throw new BadRequestError(
      "Pengajuan tidak memiliki data tahun akademik. Pastikan mahasiswa terdaftar di periode aktif."
    );
  }

  const thesisStatus = await repo.findThesisStatusByName(THESIS_STATUS.BIMBINGAN);

  if (!thesisStatus) {
    throw new BadRequestError(
      "Status thesis 'Bimbingan' belum dikonfigurasi di database. Jalankan seed: npx prisma db seed"
    );
  }

  // Prefer the thesisId stored on the request (accurate pivot); fallback to findFirst (legacy).
  const existingThesis = request.thesisId
    ? await repo.findThesisByStudent(request.studentId).then((t) => t?.id === request.thesisId ? t : null) || await repo.findThesisById(request.thesisId)
    : await repo.findThesisByStudent(request.studentId);

  const lecturerExists = await repo.findLecturerForAssignment(assignedLecturerId);
  if (!lecturerExists) {
    throw new BadRequestError(
      `Dosen dengan ID ${assignedLecturerId} tidak ditemukan di database. Pastikan data dosen sudah tersinkronisasi.`
    );
  }

  const result = await repo.executeAssignmentTransaction(async (tx) => {
    let thesisId = existingThesis?.id ?? null;

    if (!thesisId) {
      const createdThesis = await tx.thesis.create({
        data: {
          studentId: request.studentId,
          academicYearId: request.academicYearId,
          thesisTopicId: request.topicId || null,
          title: request.proposedTitle || "Judul belum ditentukan",
          thesisStatusId: thesisStatus.id,
          isProposal: true,
        },
        select: { id: true },
      });
      thesisId = createdThesis.id;
    } else {
      await tx.thesis.update({
        where: { id: thesisId },
        data: {
          academicYearId: existingThesis.academicYearId ?? request.academicYearId,
          thesisTopicId: existingThesis.thesisTopicId ?? request.topicId ?? null,
          title: existingThesis.title ?? request.proposedTitle ?? "Judul belum ditentukan",
          thesisStatusId: thesisStatus.id,
          isProposal: true,
        },
      });
    }

    await createSupervisorAssignments(tx, thesisId, [
      { lecturerId: assignedLecturerId, supervisorRole: "pembimbing_1" },
    ], { requireP1: true });

    await tx.thesisAdvisorRequest.update({
      where: { id: requestId },
      data: {
        status: "assigned",
        reviewedBy: kadepUserId,
        reviewedAt: new Date(),
      },
    });

    await syncLecturerQuotaCurrentCount(assignedLecturerId, request.academicYearId, { client: tx });

    return { thesisId };
  }, SERIALIZABLE_TX);

  return {
    message: "Pembimbing berhasil ditetapkan",
    thesisId: result.thesisId,
    assignedLecturerId,
    studentId: request.studentId,
  };
}

/**
 * Generate TA-04 individual PDF (legacy helper). Resmi: gunakan pengesahan KaDep
 * (`reviewTitleReport` accept â†’ `generateTitleApprovalLetter`) atau batch setelah
 * `proposalStatus === accepted` (Panduan Langkah 6).
 */
export async function generateTA04Letter(thesisId, lecturerId, request) {
  const [thesis, lecturer, student] = await repo.findTA04LetterData(
    thesisId,
    lecturerId,
    request.studentId,
  );

  if (!thesis || !lecturer || !student) return;

  const kadep = await repo.findActiveKaDep();
  const fs = await import("fs/promises");
  const path = await import("path");
  const now = new Date();

  const semesterLabel = thesis.academicYear
    ? `${thesis.academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${thesis.academicYear.year ?? ""}`
    : "-";

  const pdfBuffer = await generateTA04Pdf({
    semester: semesterLabel,
    entries: [
      {
        studentName: student.user?.fullName ?? "-",
        nim: student.user?.identityNumber ?? "-",
        title: thesis.title || "Belum ditentukan",
        supervisorName: lecturer.user?.fullName ?? "-",
      },
    ],
    dateGenerated: now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    kadepName: kadep?.fullName ?? "(...............................)",
    kadepNip: kadep?.identityNumber ?? "(...............................)",
  });

  const outputDir = path.join(process.cwd(), "uploads", "documents", "ta04");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `TA04_${student.user?.identityNumber}_${Date.now()}.pdf`;
  const filePath = path.join(outputDir, fileName);
  await fs.writeFile(filePath, pdfBuffer);

  const doc = await repo.createDocument({
    fileName,
    filePath: `uploads/documents/ta04/${fileName}`,
    fileSize: pdfBuffer.length,
    mimeType: "application/pdf",
    documentTypeId: null,
  });

  await repo.updateThesisDocument(thesisId, doc.id);
}

/**
 * Get request detail by ID with actor-based access control.
 * Allowed actors: the requesting student, the target lecturer,
 * the redirect target lecturer, or a KaDep/Sekdep/Admin.
 */
export async function getRequestDetail(requestId, callerUserId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const isOwnerStudent = request.studentId === callerUserId;
  const isTargetLecturer = request.lecturerId === callerUserId;
  const isRedirectTarget = request.redirectedTo === callerUserId;

  if (isOwnerStudent || isTargetLecturer || isRedirectTarget) {
    return request;
  }

  const privilegedRoles = await repo.hasAnyActiveRole(callerUserId, [
    "Ketua Departemen",
    "Sekretaris Departemen",
    "Admin",
  ]);

  if (!privilegedRoles) {
    throw new ForbiddenError("Anda tidak memiliki akses ke detail pengajuan ini.");
  }

  return request;
}

/**
 * Generate batch TA-04 PDF preview for an entire academic year.
 * This is the semester document that should be finalized at the end of the semester.
 */
export async function generateBatchTA04(academicYearId) {
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) throw new NotFoundError("Tahun akademik tidak ditemukan");

  const theses = await repo.findThesesWithSupervisors(academicYearId);

  if (theses.length === 0) {
    throw new BadRequestError(
      "Tidak ada mahasiswa dengan pengesahan judul (status proposal diterima KaDep) untuk tahun akademik ini. Batch TA-04 resmi mengikuti Panduan Langkah 6."
    );
  }

  const kadep = await repo.findActiveKaDep();

  const semesterLabel = `${academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${academicYear.year ?? ""}`;

  const entries = theses.map((t) => {
    const supervisorNames = formatCompactSupervisorNames(t.thesisSupervisors);

    return {
      studentName: t.student?.user?.fullName ?? "-",
      nim: t.student?.user?.identityNumber ?? "-",
      title: t.title ?? "Judul belum ditentukan",
      supervisorName: supervisorNames || "-",
    };
  });

  const now = new Date();
  const pdfBuffer = await generateTA04Pdf({
    semester: semesterLabel,
    entries,
    dateGenerated: now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    kadepName: kadep?.fullName ?? "(...............................)",
    kadepNip: kadep?.identityNumber ?? "(...............................)",
  });

  const yearLabel = `${academicYear.year ?? "-"}-${academicYear.semester === "genap" ? "Genap" : "Ganjil"}`;
  return { pdfBuffer, fileName: `TA04-Batch-${yearLabel}.pdf` };
}

/**
 * Finalize the semester TA-04 batch as the official archived document.
 * This persists the PDF and links the same document to all theses in that semester.
 */
export async function finalizeBatchTA04(academicYearId) {
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) throw new NotFoundError("Tahun akademik tidak ditemukan");

  const theses = await repo.findThesesWithSupervisors(academicYearId);
  if (theses.length === 0) {
    throw new BadRequestError(
      "Tidak ada mahasiswa dengan pengesahan judul (status proposal diterima KaDep) untuk tahun akademik ini. Batch TA-04 resmi mengikuti Panduan Langkah 6."
    );
  }

  const existingDocIds = [...new Set(theses.map((thesis) => thesis.titleApprovalDocumentId).filter(Boolean))];
  if (existingDocIds.length === 1) {
    const existingDocument = await repo.findDocumentById(existingDocIds[0]);
    if (existingDocument?.filePath?.includes("uploads/documents/ta04/TA04_BATCH_")) {
      const semesterName = academicYear.semester === "genap" ? "Genap" : "Ganjil";
      return {
        documentId: existingDocument.id,
        fileName: existingDocument.fileName,
        storedFileName: existingDocument.fileName,
        filePath: existingDocument.filePath,
        thesisCount: theses.length,
        academicYear: `${academicYear.year ?? "-"} ${semesterName}`,
        alreadyFinalized: true,
      };
    }
  }

  const { pdfBuffer, fileName } = await generateBatchTA04(academicYearId);
  const fs = await import("fs/promises");
  const path = await import("path");

  const outputDir = path.join(process.cwd(), "uploads", "documents", "ta04");
  await fs.mkdir(outputDir, { recursive: true });

  const safeAcademicYear = String(academicYear.year ?? "-").replace(/[\/\\?%*:|"<>]/g, "-");
  const semesterName = academicYear.semester === "genap" ? "Genap" : "Ganjil";
  const persistedFileName = `TA04_BATCH_${safeAcademicYear}_${semesterName}_${Date.now()}.pdf`;
  const filePath = path.join(outputDir, persistedFileName);
  await fs.writeFile(filePath, pdfBuffer);

  const document = await repo.createDocument({
    fileName: persistedFileName,
    filePath: `uploads/documents/ta04/${persistedFileName}`,
    fileSize: pdfBuffer.length,
    mimeType: "application/pdf",
    documentTypeId: null,
  });

  await repo.updateThesisDocuments(
    theses.map((thesis) => thesis.id),
    document.id,
  );

  return {
    documentId: document.id,
    fileName,
    storedFileName: persistedFileName,
    filePath: document.filePath,
    thesisCount: theses.length,
    academicYear: `${academicYear.year ?? "-"} ${semesterName}`,
    alreadyFinalized: false,
  };
}
