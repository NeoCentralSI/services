import * as repo from "../repositories/advisorRequest.repository.js";
import crypto from "crypto";
import * as ta04BatchRepo from "../repositories/ta04Batch.repository.js";
import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
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
import { createNotificationEventForUsers } from "./notification.service.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";

const OFFICIAL_SUPERVISOR_ROLES = new Set([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]);
const PENDING_REVIEW_STATUSES = new Set(ADVISOR_REQUEST_PENDING_REVIEW_STATUSES);
const PENDING_KADEP_STATUSES = new Set(ADVISOR_REQUEST_PENDING_KADEP_STATUSES);
// Legacy waiting-assignment statuses (pre-canon v2.2 backfill). Setelah Migration B
// rows historis ini sudah dimigrasi ke BOOKING_APPROVED + ACTIVE_OFFICIAL, jadi
// service baru harusnya tidak melihat status berikut di happy path. Hanya
// dipertahankan untuk read backward-compat.
const WAITING_ASSIGNMENT_STATUSES = new Set([
  ADVISOR_REQUEST_STATUS.APPROVED,
  ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED,
  ADVISOR_REQUEST_STATUS.REDIRECTED,
]);
// 3-path routing canon §5.2 + BPMN Gateway_TargetOverload:
// - normal     : Path B (TA-01 dosen kuota hijau/kuning)
// - escalated  : Path C (TA-01 dosen kuota merah + mahasiswa kokoh)
// - dept       : Path A (TA-02 jalur departemen tanpa target dosen)
const ROUTE_TYPE_NORMAL = "normal";
const ROUTE_TYPE_ESCALATED = "escalated";
const ROUTE_TYPE_DEPT = "dept";
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
const ACTIVE_SUPERVISOR_STATUS = "active";

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

function normalizeComparableTitle(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Judul TA-04 / pengajuan harus berupa judul rencana TA, bukan label topik/KBK.
 * Mencegah PDF batch menampilkan nama topik sebagai "Judul Tugas Akhir"
 * (KC-20260709-05). Cek terhadap SEMUA topik master karena UI menampilkan
 * "Nama Topik - Nama KBK" dan mahasiswa sering menyalin label itu ke field judul.
 */
function assertProposedTitleIsNotTopicLabel(proposedTitle, topic, allTopics = []) {
  const cleanTitle = sanitizeOptionalText(proposedTitle);
  if (!cleanTitle) {
    throw new BadRequestError("Judul tugas akhir wajib diisi.");
  }
  if (cleanTitle.length < 12) {
    throw new BadRequestError(
      "Judul tugas akhir terlalu pendek. Isi judul rencana penelitian yang spesifik, bukan nama topik.",
    );
  }

  const titleKey = normalizeComparableTitle(cleanTitle);
  const topicCatalog = allTopics.length > 0 ? allTopics : topic ? [topic] : [];
  const bannedLabels = [];

  for (const item of topicCatalog) {
    const topicName = sanitizeOptionalText(item?.name);
    const scienceGroupName = sanitizeOptionalText(item?.scienceGroup?.name);
    if (topicName) bannedLabels.push(topicName);
    if (scienceGroupName) bannedLabels.push(scienceGroupName);
    if (topicName && scienceGroupName) {
      bannedLabels.push(`${topicName} - ${scienceGroupName}`);
      bannedLabels.push(`${topicName} – ${scienceGroupName}`);
    }
  }

  for (const label of bannedLabels) {
    if (titleKey === normalizeComparableTitle(label)) {
      throw new BadRequestError(
        "Judul tugas akhir tidak boleh sama dengan nama topik/KBK. Isi judul rencana TA yang spesifik (bukan menyalin label topik dari dropdown).",
      );
    }
  }

  return cleanTitle;
}

function buildTopicLabelBanSet(topics = []) {
  const banned = new Set();
  for (const item of topics) {
    const topicName = sanitizeOptionalText(item?.name);
    const scienceGroupName = sanitizeOptionalText(item?.scienceGroup?.name);
    if (topicName) banned.add(normalizeComparableTitle(topicName));
    if (scienceGroupName) banned.add(normalizeComparableTitle(scienceGroupName));
    if (topicName && scienceGroupName) {
      banned.add(normalizeComparableTitle(`${topicName} - ${scienceGroupName}`));
      banned.add(normalizeComparableTitle(`${topicName} – ${scienceGroupName}`));
    }
  }
  return banned;
}

function resolveTa04DocumentTitle(thesis, topicBanSet = null) {
  const banSet =
    topicBanSet ??
    buildTopicLabelBanSet(
      thesis?.thesisTopic
        ? [thesis.thesisTopic]
        : [],
    );

  const looksLikeTopic = (value) => {
    const key = normalizeComparableTitle(value);
    return Boolean(key) && banSet.has(key);
  };

  // Snapshot pertama tetap dihormati, kecuali isinya jelas label topik/KBK
  // (data kotor) — boleh diganti saat refresh batch (KC-20260709-05).
  const frozenTitle = sanitizeOptionalText(thesis?.ta04AssignmentTitle);
  if (frozenTitle && !looksLikeTopic(frozenTitle)) return frozenTitle;

  const liveTitle = sanitizeOptionalText(thesis?.title);
  const requestTitle = sanitizeOptionalText(thesis?.advisorRequests?.[0]?.proposedTitle);
  const candidates = [liveTitle, requestTitle].filter(Boolean);
  for (const candidate of candidates) {
    if (!looksLikeTopic(candidate)) return candidate;
  }

  return "Judul belum ditentukan";
}

function isOfficialSupervisorContext(thesis) {
  return Boolean(thesis) && !CLOSED_THESIS_STATUSES.includes(thesis?.thesisStatus?.name);
}

function looksLikeSupervisorRoleLabel(value) {
  const key = normalizeComparableTitle(value);
  if (!key) return false;
  return /^(pembimbing [12]|pembimbing (utama|pendamping)|dosen pembimbing( [12])?)$/.test(key);
}

function snapshotLooksLikeRoleLabels(value) {
  if (!value) return false;
  return String(value)
    .split(/[,;/|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => looksLikeSupervisorRoleLabel(part));
}

function formatCompactSupervisorNames(supervisors = []) {
  const names = supervisors
    .filter(
      (supervisor) =>
        (supervisor.status == null || supervisor.status === ACTIVE_SUPERVISOR_STATUS) &&
        OFFICIAL_SUPERVISOR_ROLES.has(supervisor.role?.name)
    )
    .slice()
    .sort((a, b) => {
      const order = (roleName) => {
        if (roleName === ROLES.PEMBIMBING_1) return 0;
        if (roleName === ROLES.PEMBIMBING_2) return 1;
        return 99;
      };
      return order(a.role?.name) - order(b.role?.name);
    })
    .map((supervisor) => sanitizeOptionalText(supervisor.lecturer?.user?.fullName))
    .filter((name) => name && !looksLikeSupervisorRoleLabel(name));

  return [...new Set(names)].join(", ");
}

function mapSupervisors(thesis) {
  if (!thesis?.thesisSupervisors?.length || !isOfficialSupervisorContext(thesis)) return [];

  return thesis.thesisSupervisors
    .filter(
      (supervisor) =>
        supervisor.status === ACTIVE_SUPERVISOR_STATUS &&
        OFFICIAL_SUPERVISOR_ROLES.has(supervisor.role?.name)
    )
    .map((supervisor) => {
      const liveName = sanitizeOptionalText(supervisor.lecturer?.user?.fullName);
      return {
        id: supervisor.id,
        lecturerId: supervisor.lecturerId,
        name: liveName && !looksLikeSupervisorRoleLabel(liveName) ? liveName : "-",
        email: supervisor.lecturer?.user?.email ?? null,
        avatarUrl: supervisor.lecturer?.user?.avatarUrl ?? null,
        identityNumber: supervisor.lecturer?.user?.identityNumber ?? null,
        scienceGroup: supervisor.lecturer?.scienceGroup ?? null,
        expertise: supervisor.lecturer?.scienceGroup?.name ?? null,
        assignedAt: supervisor.createdAt ?? null,
        role: supervisor.role?.name ?? null,
      };
    });
}

function buildAdvisorAccessState(
  studentContext,
  blockingRequest,
  eligibilityState,
  latestRequest = null,
) {
  const thesis = studentContext?.thesis?.[0] ?? null;
  const supervisors = mapSupervisors(thesis);
  const hasActiveP1 = supervisors.some((supervisor) => supervisor.role === ROLES.PEMBIMBING_1);
  const hasBookedSupervisor =
    hasActiveP1 && (thesis?.advisorRequests?.length ?? 0) > 0;
  const hasOfficialSupervisor = hasActiveP1 && Boolean(thesis?.ta04AssignmentIssuedAt);
  const guidanceGateOpen = hasOfficialSupervisor;
  const guidanceGateReason = hasBookedSupervisor && !hasOfficialSupervisor
    ? "Booking pembimbing sudah disetujui, tetapi Formulir TA-04 belum difinalisasi KaDep. Bimbingan proposal yang tercatat sistem belum dapat dimulai."
    : null;
  const hasBlockingRequest = Boolean(
    blockingRequest && BLOCKING_REQUEST_STATUSES.has(blockingRequest.status)
  );
  const hasMetopenAccess = eligibilityState?.canAccess === true;
  const canUseSubmissionFlow = eligibilityState?.canSubmit === true;
  const readOnly = eligibilityState?.readOnly === true;

  let canBrowseCatalog = false;
  let canViewCatalog = hasMetopenAccess;
  let canSubmitRequest = false;
  let canOpenLogbook = guidanceGateOpen;
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
  } else if (hasBookedSupervisor) {
    reason = guidanceGateReason;
    nextStep = "wait_ta04_assignment";
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
    thesisAcademicYearId: thesis?.academicYearId ?? null,
    thesisTitle: thesis?.title ?? null,
    thesisStatus: thesis?.thesisStatus?.name ?? null,
    eligibleMetopen: eligibilityState?.eligibleMetopen ?? null,
    hasExternalEligibility: eligibilityState?.hasExternalStatus ?? false,
    metopenEligibilitySource: eligibilityState?.source ?? null,
    metopenEligibilityUpdatedAt: eligibilityState?.updatedAt ?? null,
    metopenReadOnly: readOnly,
    hasTakenMetopen: eligibilityState?.hasTakenMetopen === true,
    takingThesisCourse:
      typeof eligibilityState?.takingThesisCourse === "boolean"
        ? eligibilityState.takingThesisCourse
        : null,
    isMetopenArchive: eligibilityState?.isMetopenArchive === true || readOnly,
    gateConfigured: false,
    gateOpen: hasMetopenAccess,
    gates: [],
    supervisors,
    hasBookedSupervisor,
    hasOfficialSupervisor,
    ta04AssignmentIssued: Boolean(thesis?.ta04AssignmentIssuedAt),
    guidanceGateOpen,
    guidanceGateReason,
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
      `Pengajuan TA-01 di atas kuota normal wajib memiliki justifikasi akademik mahasiswa minimal ${RED_QUOTA_JUSTIFICATION_MIN_LENGTH} karakter.`,
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
      `Pengajuan TA-01 di atas kuota normal wajib memiliki proyeksi lulus dosen minimal ${LECTURER_OVERQUOTA_REASON_MIN_LENGTH} karakter sebelum diputuskan KaDep.`,
    );
  }
}

async function resolveAcademicYearIdOrThrow(academicYearId) {
  const activeYear = await resolveOperationalAcademicYear();
  if (!activeYear) {
    throw new BadRequestError("Tidak ada tahun akademik aktif");
  }
  if (academicYearId && academicYearId !== activeYear.id) {
    throw new BadRequestError(
      "Pengajuan pembimbing hanya dapat dibuat pada periode akademik operasional.",
    );
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
    : null;

  if (thesis && thesis.academicYearId !== request.academicYearId) {
    thesis = null;
  }

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
  // Preserve routeType menurut canon §5.2 + handoff P0-04:
  //  - dept (Path A TA-02) → tetap dept setelah KaDep approve
  //  - escalated (Path C TA-01 overquota) → tetap escalated
  //  - lainnya → normal (Path B TA-01 dosen langsung)
  // Jangan downcast escalated → normal karena kehilangan jejak Path C.
  const preservedRouteType =
    request.routeType === ROUTE_TYPE_DEPT
      ? ROUTE_TYPE_DEPT
      : request.routeType === ROUTE_TYPE_ESCALATED
        ? ROUTE_TYPE_ESCALATED
        : ROUTE_TYPE_NORMAL;
  // BR-06 + handoff P0-02: flag eksplisit "Overquota Sah".
  // Canon v3.3: pada redirect KaDep, flag mengikuti kapasitas dosen target
  // (boleh overquota baru atas kehendak KaDep). Override eksplisit lewat
  // approvalMetadata.acceptedOverNormal jika diset.
  const isPathCApproval =
    preservedRouteType === ROUTE_TYPE_ESCALATED &&
    Boolean(request.lecturerOverquotaReason ?? null);
  const acceptedOverNormal =
    approvalMetadata.acceptedOverNormal !== undefined
      ? Boolean(approvalMetadata.acceptedOverNormal)
      : isPathCApproval || Boolean(request.acceptedOverNormal);

  const updated = await repo.updateStatusWithClient(tx, request.id, {
    status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
    routeType: preservedRouteType,
    acceptedOverNormal,
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
      routeType: preservedRouteType,
      acceptedOverNormal,
    },
  });

  return updated;
}

async function escalateBookingToKadepInTransaction(tx, request, lecturerUserId, lecturerOverquotaReason) {
  const oldStatus = request.status;
  const forwardedAt = new Date();
  // BR-26 + handoff P0-01: forwardedToKadepAt + forwardedByLecturerId audit
  // trail wajib di-set bersamaan dengan lecturerOverquotaReason supaya KaDep
  // bisa lihat "Disampaikan {dosen} pada {forwardedAt}" di Tab Validasi Kuota.
  const updated = await repo.updateStatusWithClient(tx, request.id, {
    status: ADVISOR_REQUEST_STATUS.PENDING_KADEP,
    routeType: ROUTE_TYPE_ESCALATED,
    lecturerRespondedAt: forwardedAt,
    lecturerApprovalNote: lecturerOverquotaReason,
    lecturerOverquotaReason,
    forwardedToKadepAt: forwardedAt,
    forwardedByLecturerId: lecturerUserId,
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
    extraMetadata: {
      forwardedToKadepAt: forwardedAt.toISOString(),
      forwardedByLecturerId: lecturerUserId,
    },
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
  const topicsByLecturer = await repo.findSupervisedTopicsByLecturerIds(
    quotas.map((quota) => quota.lecturerId),
    academicYearId,
  );

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
    acceptingRequests: quota.acceptingRequests !== false,
    statusLabel:
      quota.acceptingRequests === false
        ? "Dosen ini sedang tidak menerima pengajuan pembimbing"
        : quota.normalAvailable > 0
          ? "Kuota normal tersedia"
          : "Kuota normal penuh, pengajuan baru tetap bisa diajukan dengan validasi khusus",
    supervisedTopics: topicsByLecturer.get(quota.lecturerId) ?? [],
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

  const request = await repo.executeTransaction(async (tx) => {
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
    if (!topic.scienceGroupId) {
      throw new BadRequestError(
        "Topik penelitian belum terhubung ke KBK. Minta Sekdep/Admin memperbarui master topik sebelum mengajukan TA-01/TA-02.",
      );
    }
    const allTopics = await repo.findAllTopicsWithScienceGroupWithClient(tx);
    const cleanProposedTitle = assertProposedTitleIsNotTopicLabel(
      submission.proposedTitle,
      topic,
      allTopics,
    );

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
    // Canon §5.2 + handoff P0-04: TA-02 = Path A (dept), TA-01 escalated = Path C,
    // TA-01 normal = Path B. TA-02 TIDAK boleh memakai routeType='escalated' karena
    // semantik berbeda (departemen sourcing vs overquota override).
    const initialRouteType = isTa02DepartmentRoute
      ? ROUTE_TYPE_DEPT
      : isRedQuotaRoute
        ? ROUTE_TYPE_ESCALATED
        : ROUTE_TYPE_NORMAL;

    const reusableThesisId =
      accessState.latestRequest?.status !== ADVISOR_REQUEST_STATUS.RELEASED
      && accessState.thesisAcademicYearId === academicYearId
        ? accessState.thesisId
        : null;

    const request = await repo.createWithClient(tx, {
      studentId,
      lecturerId: cleanLecturerId,
      academicYearId,
      topicId: cleanTopicId,
      thesisId: reusableThesisId,
      proposedTitle: cleanProposedTitle,
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
        submissionMode: !cleanLecturerId
          ? "department_open"
          : initialRouteType === ROUTE_TYPE_ESCALATED
            ? "quota_red_lecturer_review"
            : "lecturer_selected",
      },
    });

    return request;
  }, SERIALIZABLE_TX);

  await notifyAdvisorRequestSubmitted(request);
  return request;
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
    if (!topic.scienceGroupId) {
      throw new BadRequestError(
        "Topik penelitian belum terhubung ke KBK. Minta Sekdep/Admin memperbarui master topik sebelum mengajukan TA-01/TA-02.",
      );
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
 * tidak terkait window 72 jam — hanya boleh ditarik sebelum TA-04 terbit dan
 * selama proses proposal/logbook/penilaian belum dimulai.
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
      if (processLock?.ta04AssignmentIssuedAt) {
        throw new BadRequestError(
          "TA-04 sudah diterbitkan. Pergantian pembimbing masuk ranah TA-05 dan tidak dapat dilakukan melalui penarikan pengajuan.",
        );
      }

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
      const assignedLecturerId = lockedRequest.redirectedTo ?? lockedRequest.lecturerId;
      await repo.terminateSupervisorAssignmentByLecturerAndThesis(
        tx,
        lockedRequest.thesis.id,
        assignedLecturerId,
      );
      await syncLecturerQuotaCurrentCount(assignedLecturerId, lockedRequest.academicYearId, {
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
 * Stamp every queued request with the period it belongs to.
 *
 * The quota summary shipped alongside these lists is scoped to the operational
 * period, while the queue itself may still hold requests filed in an earlier
 * one. Without an explicit marker the two disagree silently and the decision
 * buttons look equally safe for both (SIMPTA-FUN-004, SIMPTA-FUN-005).
 * Out-of-period requests are kept visible on purpose: hiding them would strand
 * students with no way to get a decision.
 */
function withPeriodContext(requests, operationalAcademicYearId) {
  return (requests ?? []).map((request) => ({
    ...request,
    isCurrentPeriod: request.academicYearId === operationalAcademicYearId,
    periodLabel: formatAcademicPeriodLabel(request.academicYear),
  }));
}

function formatAcademicPeriodLabel(academicYear) {
  if (!academicYear) return null;
  const semester = academicYear.semester ? ` ${academicYear.semester}` : "";
  return `${academicYear.year ?? "-"}${semester}`.trim();
}

/**
 * Get pending requests for a lecturer
 */
export async function getDosenInbox(userId) {
  const activeYear = await resolveOperationalAcademicYear();
  if (!activeYear) {
    throw new BadRequestError("Tidak ada tahun akademik aktif");
  }
  const academicYearId = activeYear.id;
  const [pendingRequests, quotaSummary] = await Promise.all([
    repo.findByLecturerId(userId),
    getLecturerQuotaSnapshot(userId, academicYearId, { includeEntries: true }),
  ]);

  const stampedRequests = withPeriodContext(pendingRequests, academicYearId);

  return {
    summary: quotaSummary,
    // The summary counts only the operational period, so state that period
    // explicitly instead of letting the reader assume the list matches it.
    academicYearId,
    academicYearLabel: formatAcademicPeriodLabel(activeYear),
    pendingRequests: stampedRequests,
    outOfPeriodCount: stampedRequests.filter((request) => !request.isCurrentPeriod).length,
    activeOfficial: quotaSummary?.activeOfficialEntries ?? [],
    bookings: quotaSummary?.bookingEntries ?? [],
    pendingKadep: quotaSummary?.pendingKadepEntries ?? [],
  };
}

/**
 * Get responded/historical requests for a lecturer
 */
export async function getDosenInboxHistory(userId) {
  const [history, activeYear] = await Promise.all([
    repo.findRespondedByLecturerId(userId),
    resolveOperationalAcademicYear(),
  ]);
  return withPeriodContext(history, activeYear?.id ?? null);
}

async function hydrateAdvisorRequestForNotification(request) {
  if (!request?.id) return request;
  try {
    return (await repo.findById(request.id)) ?? request;
  } catch {
    return request;
  }
}

function getStudentUserIdFromRequest(request) {
  return request?.student?.user?.id ?? request?.studentId ?? null;
}

function getLecturerUserIdFromRequest(request) {
  return request?.lecturer?.user?.id ?? null;
}

async function safeCreateSimptaNotification(userIds, payload, options, context) {
  try {
    await createNotificationEventForUsers(userIds, payload, options);
  } catch (err) {
    console.error(`[${context}] gagal mengirim notifikasi SIMPTA:`, err?.message || err);
  }
}

async function notifyAdvisorRequestSubmitted(request) {
  const hydrated = await hydrateAdvisorRequestForNotification(request);
  const requestId = hydrated?.id ?? request?.id ?? null;
  if (!requestId) return;

  const studentName = hydrated?.student?.user?.fullName ?? "Mahasiswa";
  const title = hydrated?.proposedTitle ?? hydrated?.thesis?.title ?? "Judul belum tersedia";
  const baseData = {
    requestId,
    thesisId: hydrated?.thesisId ?? hydrated?.thesis?.id ?? null,
  };

  if (hydrated?.lecturerId) {
    const lecturerUserId = getLecturerUserIdFromRequest(hydrated);
    if (!lecturerUserId) return;
    const isPathC = hydrated.routeType === ROUTE_TYPE_ESCALATED;
    await safeCreateSimptaNotification(
      [lecturerUserId],
      {
        title: isPathC ? "Pengajuan TA-01 Overquota Baru" : "Pengajuan TA-01 Baru",
        message: `${studentName} mengajukan ${isPathC ? "TA-01 overquota" : "TA-01"} untuk judul "${title}". Tinjau di inbox pembimbing.`,
        type: isPathC
          ? "simpta_advisor_request_escalated_to_lecturer"
          : "simpta_advisor_request_submitted_to_lecturer",
        data: {
          ...baseData,
          route: "/dosen/inbox-pembimbing",
        },
      },
      { push: true },
      "notifyAdvisorRequestSubmitted",
    );
    return;
  }

  const kadep = await repo.findActiveKaDep();
  if (!kadep?.id) return;
  await safeCreateSimptaNotification(
    [kadep.id],
    {
      title: "Pengajuan TA-02 Baru",
      message: `${studentName} mengajukan TA-02 untuk judul "${title}". Tetapkan pembimbing melalui antrean KaDep.`,
      type: "simpta_advisor_request_submitted_to_kadep",
      data: {
        ...baseData,
        route: "/kelola/tugas-akhir/kadep/pembimbing",
      },
    },
    { push: true },
    "notifyAdvisorRequestSubmitted",
  );
}

async function notifyAdvisorRequestForwardedToKadep(request) {
  const hydrated = await hydrateAdvisorRequestForNotification(request);
  const requestId = hydrated?.id ?? request?.id ?? null;
  if (!requestId) return;

  const studentUserId = getStudentUserIdFromRequest(hydrated);
  const kadep = await repo.findActiveKaDep();
  const studentName = hydrated?.student?.user?.fullName ?? "Mahasiswa";
  const lecturerName = hydrated?.lecturer?.user?.fullName ?? "Dosen pembimbing";
  const title = hydrated?.proposedTitle ?? hydrated?.thesis?.title ?? "Judul belum tersedia";
  const baseData = {
    requestId,
    thesisId: hydrated?.thesisId ?? hydrated?.thesis?.id ?? null,
  };

  await safeCreateSimptaNotification(
    [studentUserId],
    {
      title: "Pengajuan Diteruskan ke KaDep",
      message: `${lecturerName} menerima pengajuan Anda di atas kuota normal dan meneruskannya ke validasi KaDep.`,
      type: "simpta_advisor_request_forwarded_student",
      data: {
        ...baseData,
        route: "/metopel",
      },
    },
    { push: true },
    "notifyAdvisorRequestForwardedToKadep",
  );

  if (!kadep?.id) return;
  await safeCreateSimptaNotification(
    [kadep.id],
    {
      title: "Validasi TA-01 Overquota",
      message: `${lecturerName} meneruskan pengajuan TA-01 di atas kuota normal dari ${studentName} untuk judul "${title}".`,
      type: "simpta_advisor_request_forwarded_to_kadep",
      data: {
        ...baseData,
        route: "/kelola/tugas-akhir/kadep/pembimbing",
      },
    },
    { push: true },
    "notifyAdvisorRequestForwardedToKadep",
  );
}

async function notifyAdvisorBookingApproved(request, actor = "lecturer") {
  const hydrated = await hydrateAdvisorRequestForNotification(request);
  const studentUserId = getStudentUserIdFromRequest(hydrated);
  if (!studentUserId) return;

  const actorLabel = actor === "kadep" ? "KaDep" : "Dosen pembimbing";
  const lecturerName =
    hydrated?.redirectTarget?.user?.fullName ??
    hydrated?.lecturer?.user?.fullName ??
    "dosen pembimbing";
  const title = hydrated?.proposedTitle ?? hydrated?.thesis?.title ?? "judul Anda";
  await safeCreateSimptaNotification(
    [studentUserId],
    {
      title: "Booking Pembimbing Disetujui",
      message: `${actorLabel} menyetujui booking pembimbing ${lecturerName} untuk ${title}. Anda boleh menyimpan draf proposal pribadi, tetapi bimbingan tercatat dan submit proposal final menunggu TA-04 difinalisasi KaDep.`,
      type: "simpta_advisor_booking_approved",
      data: {
        requestId: hydrated?.id ?? request?.id ?? null,
        thesisId: hydrated?.thesisId ?? hydrated?.thesis?.id ?? null,
        route: "/metopel",
      },
    },
    { push: true },
    "notifyAdvisorBookingApproved",
  );
}

/**
 * Fire-and-forget: notifikasi mahasiswa bahwa pengajuan pembimbing ditolak
 * (oleh dosen atau KaDep). Membawa alasan/catatan supaya mahasiswa tahu
 * arahan selanjutnya. Selaras BPMN `Task_UpdateRejectedRequest` "mengirim
 * notifikasi" (canon v2.6 §5.8 + label BPMN).
 */
async function notifyAdvisorRequestRejected(request, { actor, reason }) {
  const studentUserId = request?.student?.user?.id;
  if (!studentUserId) return;
  const isKadep = actor === "kadep";
  const title = isKadep
    ? "Pengajuan Pembimbing Ditolak KaDep"
    : "Pengajuan Pembimbing Ditolak Dosen";
  const message = reason?.trim()
    ? isKadep
      ? `Ketua Departemen menolak pengajuan pembimbing Anda. Catatan: ${reason.trim()}`
      : `Dosen pembimbing menolak pengajuan Anda. Alasan: ${reason.trim()}`
    : isKadep
      ? "Ketua Departemen menolak pengajuan pembimbing Anda. Silakan ajukan ke dosen lain atau gunakan jalur TA-02."
      : "Dosen pembimbing menolak pengajuan Anda. Silakan pilih dosen lain atau gunakan jalur TA-02.";
  const type = isKadep ? "advisor_request_rejected_by_kadep" : "advisor_request_rejected_by_dosen";
  const data = {
    type,
    requestId: request?.id ?? null,
    route: "/metopel",
  };
  await safeCreateSimptaNotification(
    [studentUserId],
    { title, message, type, data },
    { push: true },
    "notifyAdvisorRequestRejected",
  );
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
    const updated = await repo.executeTransaction(async (tx) => {
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
          `Pengajuan overquota tidak memiliki justifikasi akademik mahasiswa minimal ${RED_QUOTA_JUSTIFICATION_MIN_LENGTH} karakter. Minta mahasiswa mengajukan ulang lewat jalur TA-01 di atas kuota normal.`,
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

    if (updated?.status === ADVISOR_REQUEST_STATUS.PENDING_KADEP) {
      await notifyAdvisorRequestForwardedToKadep(updated);
    } else if (updated?.status === ADVISOR_REQUEST_STATUS.BOOKING_APPROVED) {
      await notifyAdvisorBookingApproved(updated, "lecturer");
    }
    return updated;
  } else if (action === "reject") {
    const cleanReason = sanitizeOptionalText(rejectionReason);
    if (!cleanReason || cleanReason.length < 5) {
      throw new BadRequestError("Alasan penolakan wajib diisi (minimal 5 karakter)");
    }
    const updated = await repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (lockedRequest.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
      if (!PENDING_REVIEW_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      const updatedRow = await repo.updateStatusWithClient(tx, requestId, {
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

      return updatedRow;
    }, SERIALIZABLE_TX);
    await notifyAdvisorRequestRejected(request, { actor: "lecturer", reason: cleanReason });
    return updated;
  } else {
    throw new BadRequestError("Action harus 'accept' atau 'reject'");
  }
}

/**
 * Lecturer marks a pending request as "under review" to lock withdrawal (FR-MHS-03).
 * Lost-update guard: lock the row then only transition from `pending`. A concurrent
 * accept that already wrote `booking_approved` must not be overwritten.
 */
export async function markUnderReview(requestId, userId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (request.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda");
  if (request.status !== ADVISOR_REQUEST_STATUS.PENDING) {
    throw new BadRequestError("Hanya pengajuan dengan status pending yang bisa ditandai sedang ditinjau");
  }

  return repo.executeTransaction(async (tx) => {
    await repo.lockAdvisorRequestRow(tx, requestId);
    const locked = await repo.findByIdWithClient(tx, requestId);
    if (!locked) throw new NotFoundError("Pengajuan tidak ditemukan");
    if (locked.status !== ADVISOR_REQUEST_STATUS.PENDING) {
      throw new BadRequestError("Hanya pengajuan dengan status pending yang bisa ditandai sedang ditinjau");
    }

    const changed = await repo.updateStatusIfCurrent(
      tx,
      requestId,
      ADVISOR_REQUEST_STATUS.PENDING,
      { status: ADVISOR_REQUEST_STATUS.UNDER_REVIEW },
    );
    if (changed === 0) {
      throw new BadRequestError("Hanya pengajuan dengan status pending yang bisa ditandai sedang ditinjau");
    }

    return repo.findByIdWithClient(tx, requestId);
  }, SERIALIZABLE_TX);
}

// ============================================
// KaDep Queue & Decision
// ============================================

/**
 * Get KaDep queue (escalated + pending assignment)
 */
export async function getKadepQueue() {
  const [escalated, pendingAssignment, activeYear] = await Promise.all([
    repo.findEscalated(),
    repo.findPendingAssignment(),
    resolveOperationalAcademicYear(),
  ]);

  const operationalAcademicYearId = activeYear?.id ?? null;

  return {
    academicYearId: operationalAcademicYearId,
    academicYearLabel: formatAcademicPeriodLabel(activeYear),
    escalated: await Promise.all(
      withPeriodContext(escalated, operationalAcademicYearId).map(async (item) => {
        if (!item.lecturerId) {
          return {
            ...item,
            quotaSnapshot: null,
            operationalQuotaSnapshot: null,
            quotaPreview: null,
          };
        }

        const requestAcademicYearId = item.academicYearId ?? null;
        const quotaSnapshot = await getLecturerQuotaSnapshot(
          item.lecturerId,
          requestAcademicYearId,
          { includeEntries: true },
        );
        // A request filed in a closed period is still decided today, so KaDep
        // needs the load the lecturer actually carries right now next to the
        // load recorded for the period of the request. Showing only one of the
        // two made the same lecturer read green here and red there
        // (SIMPTA-FUN-005).
        const operationalQuotaSnapshot = item.isCurrentPeriod
          ? quotaSnapshot
          : await getLecturerQuotaSnapshot(item.lecturerId, operationalAcademicYearId, {
              includeEntries: true,
            });
        const projectedCount = (quotaSnapshot?.currentCount ?? 0) + 1;
        const projectedOverquotaAmount = Math.max(
          0,
          projectedCount - (quotaSnapshot?.quotaMax ?? 0),
        );

        return {
          ...item,
          quotaSnapshot,
          operationalQuotaSnapshot,
          quotaPreview: {
            projectedCurrentCount: projectedCount,
            willBeOverquota: projectedOverquotaAmount > 0,
            projectedOverquotaAmount,
          },
        };
      }),
    ),
    pendingAssignment: withPeriodContext(pendingAssignment, operationalAcademicYearId),
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
 * KaDep assignable lecturers — seluruh dosen aktif terdaftar (lintas KBK),
 * termasuk traffic light merah. Rekomendasi top-3 tetap di getRecommendations.
 * Canon v3.3 §5.2.1 / FR-DEC-06.
 */
export async function getAssignableLecturers(requestId) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");

  const topicId = request.topicId;
  const academicYearId = request.academicYearId ?? (await resolveAcademicYearIdOrThrow(null));
  const lecturers = await repo.findAssignableLecturers(academicYearId, request.lecturerId);
  if (lecturers.length === 0) {
    return { lecturers: [] };
  }

  const quotaSnapshots = await getLecturerQuotaSnapshots({
    academicYearId,
    lecturerIds: lecturers.map((item) => item.lecturerId),
  });
  const quotaMap = new Map(quotaSnapshots.map((item) => [item.lecturerId, item]));

  const mapped = lecturers
    .map((q) => {
      const quotaSnapshot = quotaMap.get(q.lecturerId);
      const activeTheses = quotaSnapshot?.activeCount ?? 0;
      const effectiveCount = quotaSnapshot?.currentCount ?? 0;
      const remaining = quotaSnapshot?.normalAvailable ?? Math.max(0, q.quotaMax - effectiveCount);
      const sameTopicCount =
        q.lecturer.thesisSupervisors?.filter((ts) => ts.thesis?.thesisTopicId === topicId).length ||
        0;
      const trafficLight = quotaSnapshot?.trafficLight ?? "green";
      const score = remaining * 3 + sameTopicCount * 2 + Math.max(0, 10 - activeTheses);

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
    .sort((a, b) => {
      const nameA = (a.fullName || "").localeCompare(b.fullName || "", "id");
      if (nameA !== 0) return nameA;
      return b.score - a.score;
    });

  return { lecturers: mapped };
}

/**
 * KaDep decides on an escalated request (override or redirect)
 */
export async function decideByKadep(requestId, kadepUserId, { action, targetLecturerId, notes }) {
  const request = await repo.findById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan");
  if (!PENDING_KADEP_STATUSES.has(request.status)) {
    throw new BadRequestError("Hanya pengajuan TA-01 di atas kuota yang bisa diputuskan oleh KaDep");
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

    const updated = await repo.executeTransaction(async (tx) => {
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
    await notifyAdvisorBookingApproved(updated, "kadep");
    return updated;
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
    // Canon v3.3 §5.2.1 / FR-DEC-06: Path C TA-01 overquota tidak boleh ditolak.
    // KaDep wajib approve dosen pengaju atau redirect ke dosen alternatif.
    if (request.requestType !== "ta_02") {
      throw new BadRequestError(
        "Pengajuan TA-01 di atas kuota normal tidak dapat ditolak. Setujui dosen pengaju atau tetapkan dosen alternatif.",
      );
    }

    const updated = await repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      const updatedRow = await repo.updateStatusWithClient(tx, requestId, {
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

      return updatedRow;
    }, SERIALIZABLE_TX);
    await notifyAdvisorRequestRejected(request, { actor: "kadep", reason: cleanNotes });
    return updated;
  } else if (action === "redirect") {
    if (!cleanTargetLecturerId) {
      throw new BadRequestError("Pilih dosen tujuan untuk pengalihan");
    }
    const updated = await repo.executeTransaction(async (tx) => {
      await repo.lockAdvisorRequestRow(tx, requestId);
      await repo.lockStudentRow(tx, request.studentId);

      const lockedRequest = await repo.findByIdWithClient(tx, requestId);
      if (!lockedRequest) throw new NotFoundError("Pengajuan tidak ditemukan");
      if (!PENDING_KADEP_STATUSES.has(lockedRequest.status)) {
        throw new BadRequestError("Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.");
      }

      if (lockedRequest.requestType !== "ta_02") {
        ensurePathCDualJustification(lockedRequest);
      }
      const targetLecturer = await repo.findLecturerForAssignment(cleanTargetLecturerId);
      if (!targetLecturer) throw new NotFoundError("Dosen tujuan tidak ditemukan");
      if (targetLecturer.acceptingRequests === false) {
        throw new BadRequestError("Dosen tujuan sedang tidak menerima pengajuan bimbingan.");
      }

      const targetQuotaSnapshot = await getLockedQuotaSnapshot(
        tx,
        cleanTargetLecturerId,
        lockedRequest.academicYearId,
      );
      // Canon v3.3: KaDep boleh menetapkan dosen tanpa Sisa Normal (overquota baru).
      const targetIsOverquota = (targetQuotaSnapshot?.normalAvailable ?? 0) <= 0;

      await ensureNoBlockingRequestConflict(tx, lockedRequest.studentId, lockedRequest.id);

      return approveBookingInTransaction(tx, lockedRequest, kadepUserId, "kadep", {
        assignedLecturerId: cleanTargetLecturerId,
        redirectedTo: cleanTargetLecturerId,
        reviewedBy: kadepUserId,
        reviewedAt: now,
        kadepNotes: cleanNotes,
        lecturerApprovalNote: lockedRequest.lecturerApprovalNote ?? cleanNotes,
        acceptedOverNormal: targetIsOverquota,
      });
    }, SERIALIZABLE_TX);
    await notifyAdvisorBookingApproved(updated, "kadep");
    return updated;
  } else {
    throw new BadRequestError(
      "Action harus 'approve', 'reject', 'override', 'redirect', atau 'request_revision'",
    );
  }
}

/**
 * DEPRECATED (canon v3.3 / §5.8 / §5.10): jalur mandiri assign→active_official
 * ditutup. Happy path = decideByKadep (booking_approved) → finalizeBatchTA04 →
 * promosi otomatis ke active_official. Dipertahankan sebagai stub throw agar
 * klien legacy mendapat pesan jelas (pola sama regenerateTitleApprovalLetter).
 */
export async function assignAdvisor(_requestId, _kadepUserId) {
  throw new BadRequestError(
    "Penetapan pembimbing mandiri sudah dinonaktifkan. Gunakan keputusan KaDep (setujui/alihkan) lalu finalisasi Formulir TA-04 batch; beban aktif dipromosikan otomatis setelah penilaian dan konfirmasi KRS Tugas Akhir.",
  );
}

/**
 * Legacy helper. Formulir TA-04 resmi tidak diterbitkan per mahasiswa; gunakan
 * `finalizeBatchTA04` untuk menerbitkan satu dokumen batch periode.
 */
export async function generateTA04Letter(thesisId, lecturerId, request) {
  void thesisId;
  void lecturerId;
  void request;
  throw new BadRequestError(
    "Formulir TA-04 resmi hanya diterbitkan melalui finalisasi batch periode.",
  );
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

function buildTa04Cohort(theses = [], topicBanSet = null) {
  const entries = theses.map((t) => {
    const currentSupervisorNames = formatCompactSupervisorNames(t.thesisSupervisors);
    const frozenNames = sanitizeOptionalText(t.ta04AssignmentSupervisorNames);
    const supervisorNames =
      t.ta04AssignmentIssuedAt && frozenNames && !snapshotLooksLikeRoleLabels(frozenNames)
        ? frozenNames
        : currentSupervisorNames;
    const resolvedTitle = resolveTa04DocumentTitle(t, topicBanSet);
    const frozenTitle = sanitizeOptionalText(t.ta04AssignmentTitle);
    // Refresh snapshot bila belum pernah issued ATAU snapshot lama berupa label topik.
    const needsAssignmentSnapshot =
      !t.ta04AssignmentIssuedAt ||
      (Boolean(frozenTitle) && frozenTitle !== resolvedTitle) ||
      snapshotLooksLikeRoleLabels(frozenNames);

    return {
      thesisId: t.id,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      title: resolvedTitle,
      supervisorNames: supervisorNames || "-",
      needsAssignmentSnapshot,
    };
  });

  const hashPayload = entries
    .map((entry) => ({
      thesisId: entry.thesisId,
      studentName: entry.studentName,
      studentNim: entry.studentNim,
      title: entry.title,
      supervisorNames: entry.supervisorNames,
    }))
    .sort((a, b) => a.thesisId.localeCompare(b.thesisId));

  return {
    entries,
    cohortHash: crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex"),
  };
}

function isBatchCurrentForCohort(batch, cohortHash, thesisIds = []) {
  if (!batch?.document?.filePath?.includes("uploads/documents/ta04/TA04_BATCH_")) {
    return false;
  }
  if (batch.cohortHash !== cohortHash) return false;

  const expectedIds = new Set(thesisIds);
  const memberIds = new Set((batch.members ?? []).map((member) => member.thesisId));
  if (expectedIds.size !== memberIds.size) return false;
  for (const thesisId of expectedIds) {
    if (!memberIds.has(thesisId)) return false;
  }
  return true;
}

/**
 * FR-TA04-08 / KC-20260727-02 / FUN-024: gerbang kelengkapan yang sama dengan
 * getTitleApprovalDocumentForKadep. Sekdep memakai GET batch-ta04, jadi gerbang
 * harus di sini, bukan hanya di UI KaDep.
 */
async function assertTa04BatchCompleteForDownload(academicYearId) {
  const currentBatch = await ta04BatchRepo.findCurrentTa04BatchByAcademicYear(academicYearId);
  if (!currentBatch?.document) {
    throw new BadRequestError(
      "Formulir TA-04 periode ini belum difinalisasi. Unduhan hanya tersedia setelah batch sinkron.",
    );
  }

  const eligibleTheses = await repo.findThesesWithSupervisors(academicYearId);
  const memberIds = new Set((currentBatch.members ?? []).map((member) => member.thesisId));
  const missingCount = eligibleTheses.filter((item) => !memberIds.has(item.id)).length;
  if (missingCount > 0) {
    throw new BadRequestError(
      `Formulir TA-04 periode ini belum diperbarui (${missingCount} mahasiswa belum masuk dokumen batch). Jalankan Perbarui Formulir TA-04 terlebih dahulu sebelum mengunduh.`,
    );
  }
}

async function callerMustUseKadepCompletenessGate(callerUserId) {
  if (!callerUserId) return false;
  const isKadepOrAdmin = await repo.hasAnyActiveRole(callerUserId, [
    ROLES.KETUA_DEPARTEMEN,
    ROLES.ADMIN,
  ]);
  if (isKadepOrAdmin) return false;
  const isSekdep = await repo.hasAnyActiveRole(callerUserId, [ROLES.SEKRETARIS_DEPARTEMEN]);
  return Boolean(isSekdep);
}

/**
 * UQ-4 / FUN-008: satu-satunya penulis produksi ta04AssignmentIssuedAt.
 * Hanya thesis yang sudah menjadi anggota batch yang sedang difinalisasi.
 */
async function writeTa04AssignmentIssuedAtForBatchMembers({
  entries,
  academicYearId,
  generatedByUserId,
  memberThesisIds,
}) {
  const allowed = new Set(memberThesisIds ?? []);
  const snapshotEntries = (entries ?? []).filter(
    (entry) => entry.needsAssignmentSnapshot && allowed.has(entry.thesisId),
  );
  if (snapshotEntries.length === 0) return 0;

  const issuedAt = new Date();
  await prisma.$transaction(
    snapshotEntries.map((entry) =>
      prisma.thesis.update({
        where: { id: entry.thesisId },
        data: {
          ta04AssignmentIssuedAt: issuedAt,
          ta04AssignmentIssuedByUserId: generatedByUserId,
          ta04AssignmentTitle: entry.title,
          ta04AssignmentSupervisorNames: entry.supervisorNames,
          ta04AssignmentAcademicYearId: academicYearId,
        },
      }),
    ),
  );
  return snapshotEntries.length;
}

/**
 * Generate Formulir TA-04 preview for an entire academic year.
 * TA-04 is an early official assignment batch for approved TA-01/TA-02
 * bookings; it does not promote advisor load to active official.
 *
 * @param {string} academicYearId
 * @param {{ callerUserId?: string }} [options]
 */
export async function generateBatchTA04(academicYearId, { callerUserId } = {}) {
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) throw new NotFoundError("Tahun akademik tidak ditemukan");

  if (await callerMustUseKadepCompletenessGate(callerUserId)) {
    await assertTa04BatchCompleteForDownload(academicYearId);
  }

  const theses = await repo.findThesesWithSupervisors(academicYearId);

  if (theses.length === 0) {
    throw new BadRequestError(
      "Tidak ada mahasiswa dengan booking pembimbing TA-01/TA-02 yang sudah disetujui untuk tahun akademik ini."
    );
  }

  const kadep = await repo.findActiveKaDep();
  const allTopics = await repo.findAllTopicsWithScienceGroup();
  const topicBanSet = buildTopicLabelBanSet(allTopics);

  const semesterLabel = `${academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${academicYear.year ?? ""}`;

  const { entries: cohortEntries } = buildTa04Cohort(theses, topicBanSet);
  const pdfEntries = cohortEntries.map((entry) => ({
    studentName: entry.studentName,
    nim: entry.studentNim,
    title: entry.title,
    supervisorName: entry.supervisorNames,
  }));

  const now = new Date();
  const pdfBuffer = await generateTA04Pdf({
    semester: semesterLabel,
    entries: pdfEntries,
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
 * Finalize the semester TA-04 form as the official early assignment document.
 * This persists the PDF, links it to all booking theses, and freezes the
 * first TA-04 title/supervisor snapshot. It intentionally keeps theses in
 * Metopen phase until automatic promotion.
 */
export async function finalizeBatchTA04(academicYearId, generatedByUserId = null) {
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) throw new NotFoundError("Tahun akademik tidak ditemukan");

  const theses = await repo.findThesesWithSupervisors(academicYearId);
  if (theses.length === 0) {
    throw new BadRequestError(
      "Tidak ada mahasiswa dengan booking pembimbing TA-01/TA-02 yang sudah disetujui untuk tahun akademik ini."
    );
  }

  const allTopics = await repo.findAllTopicsWithScienceGroup();
  const topicBanSet = buildTopicLabelBanSet(allTopics);
  const { entries: cohortEntries, cohortHash } = buildTa04Cohort(theses, topicBanSet);
  const thesisIds = cohortEntries.map((entry) => entry.thesisId);
  const currentBatch = await ta04BatchRepo.findCurrentTa04BatchByAcademicYear(academicYearId);
  if (isBatchCurrentForCohort(currentBatch, cohortHash, thesisIds)) {
    const semesterName = academicYear.semester === "genap" ? "Genap" : "Ganjil";
    await repo.updateThesisDocuments(thesisIds, currentBatch.document.id);
    await writeTa04AssignmentIssuedAtForBatchMembers({
      entries: cohortEntries,
      academicYearId,
      generatedByUserId,
      memberThesisIds: (currentBatch.members ?? []).map((member) => member.thesisId),
    });
    return {
      batchId: currentBatch.id,
      documentId: currentBatch.document.id,
      fileName: currentBatch.document.fileName,
      storedFileName: currentBatch.document.fileName,
      filePath: currentBatch.document.filePath,
      thesisCount: theses.length,
      academicYear: `${academicYear.year ?? "-"} ${semesterName}`,
      cohortHash,
      alreadyFinalized: true,
    };
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

  const { document, batch } = await ta04BatchRepo.createTa04BatchWithDocument({
    academicYearId,
    documentData: {
      fileName: persistedFileName,
      filePath: `uploads/documents/ta04/${persistedFileName}`,
      fileSize: pdfBuffer.length,
      mimeType: "application/pdf",
      documentTypeId: null,
    },
    thesisIds,
    cohortHash,
    members: cohortEntries,
    generatedByUserId,
  });

  // Notifikasi ke mahasiswa affected bahwa Formulir TA-04 awal telah
  // diterbitkan. Mahasiswa tetap berada di fase Metopel sampai promosi otomatis.
  try {
    const studentIds = theses.map((t) => t.student?.user?.id).filter(Boolean);
    if (studentIds.length > 0) {
      const semesterPretty = `${academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${academicYear.year ?? ""}`.trim();
      await createNotificationEventForUsers(
        studentIds,
        {
          title: "Formulir TA-04 Diterbitkan",
          message: `Formulir TA-04 penugasan awal periode ${semesterPretty} telah diterbitkan KaDep. Status pembimbing tetap booking sampai TA-03 final dan KRS Tugas Akhir terkonfirmasi.`,
          type: "simpta_ta04_batch_finalized",
          data: {
            academicYearId,
            batchId: batch.id,
            documentId: document.id,
            route: "/metopel",
          },
        },
        { push: true },
      );
    }
  } catch (notifErr) {
    console.error("[finalizeBatchTA04] gagal mengirim notifikasi ke mahasiswa:", notifErr?.message || notifErr);
  }

  return {
    batchId: batch.id,
    documentId: document.id,
    fileName,
    storedFileName: persistedFileName,
    filePath: document.filePath,
    thesisCount: theses.length,
    academicYear: `${academicYear.year ?? "-"} ${semesterName}`,
    cohortHash,
    alreadyFinalized: false,
  };
}
