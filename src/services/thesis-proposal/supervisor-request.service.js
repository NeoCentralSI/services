import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import {
  ACCEPTED_STATUSES,
  MIN_KADEP_REVISION_NOTES_LENGTH,
  MIN_LECTURER_OVERQUOTA_REASON_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
  MIN_STUDENT_JUSTIFICATION_LENGTH,
  MIN_TITLE_LENGTH,
  RECOMMENDATION_LIMIT,
  SUPERVISOR_REQUEST_ROUTE as ROUTE,
  SUPERVISOR_REQUEST_STATUS as STATUS,
  WAITING_KADEP_STATUSES,
  WAITING_LECTURER_STATUSES,
  LECTURER_INBOX_KIND as KIND,
  WITHDRAWABLE_STATUSES,
  WITHDRAW_LOCK_HOURS,
} from "../../constants/thesis-proposal.js";
import { SUPERVISION_LOAD_LEVEL } from "../../constants/supervisionQuota.js";
import { pageAcrossGroups, pageMeta, pageWindow } from "../../helpers/priority-paging.helper.js";
import { LECTURER_INBOX_JENIS, LECTURER_INBOX_PRIORITY } from "../../constants/lecturer-inbox.js";
import { CHANGE_REQUEST_VIEW_STATUS } from "../../constants/thesis-change-request.js";
import * as changeRepo from "../../repositories/thesis-change-request.repository.js";
import { changeRequestSearchWhere, lecturerStepFilters, toLecturerStepRow } from "../thesis-change-request.service.js";
import { resolveOperationalAcademicYear, formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { createSupervisorAssignments } from "../../utils/supervisorIntegrity.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { getStudentPeriodFlags } from "../research-method/eligibility.service.js";
import * as repo from "../../repositories/thesis-proposal/supervisor-request.repository.js";
import { classifyLoad, getApplicableLimits, getLecturerLoads } from "./supervision-quota.service.js";

/**
 * Pengajuan Pembimbing (formulir TA-01/TA-02). Rules are those of the old module (Ilham),
 * with the two-tier supervision limits of plan 10.1: a full lecturer is never blocked; an
 * acceptance over the hard limit becomes a "Pengajuan di Atas Kuota" for the Head of Department.
 */

const ROUTES = {
  student: "/tugas-akhir/proposal",
  // Paket E4 (4.1): Tugas Akhir > Permohonan.
  lecturer: "/tugas-akhir/permohonan",
  kadepDepartment: "/kelola/tugas-akhir/kadep/penetapan-pembimbing?tab=departemen",
  kadepOverQuota: "/kelola/tugas-akhir/kadep/penetapan-pembimbing?tab=atas-kuota",
};

const HOUR = 60 * 60 * 1000;
const REQUIRED_FIELDS = [
  ["topicId", "Pilih topik penelitian."],
  ["proposedTitle", "Judul tugas akhir wajib diisi."],
  ["backgroundSummary", "Latar belakang singkat wajib diisi."],
  ["problemStatement", "Rumusan masalah wajib diisi."],
  ["proposedSolution", "Rencana solusi wajib diisi."],
  ["researchObject", "Objek penelitian wajib diisi."],
  ["researchPermitStatus", "Status izin penelitian wajib dipilih."],
];
const DRAFT_FIELDS = [
  "lecturerId",
  "topicId",
  "proposedTitle",
  "backgroundSummary",
  "problemStatement",
  "proposedSolution",
  "researchObject",
  "researchPermitStatus",
  "studentJustification",
];

const clean = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

function normalizeComparable(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** R4: at least 12 characters and not a topic or KBK label copied from the dropdown. */
export function assertTitleIsSpecific(title, topics = []) {
  const text = clean(title);
  if (!text) throw new BadRequestError("Judul tugas akhir wajib diisi.");
  if (text.length < MIN_TITLE_LENGTH) {
    throw new BadRequestError("Judul tugas akhir terlalu pendek. Isi judul rencana penelitian yang spesifik, bukan nama topik.");
  }
  const key = normalizeComparable(text);
  for (const topic of topics) {
    const labels = [topic.name, topic.scienceGroup?.name];
    if (topic.name && topic.scienceGroup?.name) {
      labels.push(`${topic.name} - ${topic.scienceGroup.name}`, `${topic.name} – ${topic.scienceGroup.name}`);
    }
    if (labels.filter(Boolean).some((label) => normalizeComparable(label) === key)) {
      throw new BadRequestError(
        "Judul tugas akhir tidak boleh sama dengan nama topik atau KBK. Isi judul rencana penelitian yang spesifik.",
      );
    }
  }
  return text;
}

function hoursSince(date, now = new Date()) {
  return (now.getTime() - new Date(date).getTime()) / HOUR;
}

/** When the student may pull a waiting request back (72 hours after it was sent). */
export function withdrawAvailableAt(request) {
  if (!request || !WITHDRAWABLE_STATUSES.includes(request.status)) return null;
  return new Date(new Date(request.createdAt).getTime() + WITHDRAW_LOCK_HOURS * HOUR);
}

function personOf(row) {
  if (!row) return null;
  const user = row.user ?? row;
  return {
    id: row.id,
    fullName: user.fullName ?? null,
    identityNumber: user.identityNumber ?? null,
    avatarUrl: user.avatarUrl ?? null,
    scienceGroup: row.scienceGroup ?? null,
  };
}

/** The request as the API returns it (enum values; labels are given by the frontend). */
export function mapRequest(request, operationalAcademicYearId = null) {
  if (!request) return null;
  const effective = request.redirectTarget ?? request.lecturer ?? null;
  return {
    id: request.id,
    status: request.status,
    route: request.route,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    academicYear: request.academicYear
      ? { ...request.academicYear, label: formatAcademicYearLabel(request.academicYear) }
      : null,
    isCurrentPeriod: operationalAcademicYearId ? request.academicYearId === operationalAcademicYearId : null,
    student: request.student
      ? {
        id: request.student.id,
        fullName: request.student.user?.fullName ?? null,
        identityNumber: request.student.user?.identityNumber ?? null,
        avatarUrl: request.student.user?.avatarUrl ?? null,
      }
      : null,
    topic: request.topic ?? null,
    proposedTitle: request.proposedTitle,
    backgroundSummary: request.backgroundSummary,
    problemStatement: request.problemStatement,
    proposedSolution: request.proposedSolution,
    researchObject: request.researchObject,
    researchPermitStatus: request.researchPermitStatus,
    studentJustification: request.studentJustification,
    lecturer: personOf(request.lecturer),
    redirectTarget: personOf(request.redirectTarget),
    supervisor: personOf(effective),
    lecturerApprovalNote: request.lecturerApprovalNote,
    lecturerOverquotaReason: request.lecturerOverquotaReason,
    lecturerRespondedAt: request.lecturerRespondedAt,
    rejectionReason: request.rejectionReason,
    forwardedToKadepAt: request.forwardedToKadepAt,
    forwardedBy: request.forwardedByLecturer ? personOf(request.forwardedByLecturer.user) : null,
    kadepNotes: request.kadepNotes,
    reviewedAt: request.reviewedAt,
    reviewer: request.reviewer ?? null,
    withdrawnAt: request.withdrawnAt,
    withdrawCount: request.withdrawCount,
    acceptedOverNormal: request.acceptedOverNormal,
    thesis: request.thesis ?? null,
    withdrawAvailableAt: withdrawAvailableAt(request),
  };
}

const toDto = (request, operationalId) => mapRequest(request, operationalId);

async function requireOperationalYear() {
  const year = await resolveOperationalAcademicYear();
  if (!year) throw new BadRequestError("Tidak ada tahun ajaran aktif.");
  return year;
}

async function audit(tx, { actorUserId, action, request, oldStatus, newStatus, reason = null, metadata = null }) {
  await repo.createAuditLog(
    {
      userId: actorUserId ?? null,
      action,
      entity: ENTITY_TYPES.THESIS_SUPERVISOR_REQUEST,
      entityId: request.id,
      changes: {
        oldValues: oldStatus ? { status: oldStatus } : null,
        newValues: newStatus ? { status: newStatus } : null,
        metadata: {
          studentId: request.studentId,
          lecturerId: request.lecturerId ?? null,
          thesisId: request.thesisId ?? null,
          route: request.route,
          reason,
          ...(metadata ?? {}),
        },
      },
    },
    tx,
  );
}

async function notify(userIds, payload) {
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await createNotificationEventForUsers(ids, payload, { push: true });
  } catch (error) {
    console.error("[supervisor-request] notifikasi gagal dikirim:", error?.message ?? error);
  }
}

// ── Student ───────────────────────────────────────────────────────────────────────────

/**
 * Whether the student may send a request now, and why not (R1). The flags come from SIA for the
 * operational semester (plan 10.6).
 */
export async function getSubmissionState(studentId, { client = prisma } = {}) {
  const year = await resolveOperationalAcademicYear(client);
  const [flags, activeRequest, openThesis, latestRequest] = await Promise.all([
    year ? getStudentPeriodFlags(studentId, year.id, { client }) : null,
    repo.findActiveRequestByStudent(studentId, client),
    repo.findOpenThesisByStudent(studentId, client),
    client.thesisSupervisorRequest.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } }),
  ]);
  const eligible = flags?.eligibleResearchMethod ?? null;
  const hasSupervisor = (openThesis?.thesisSupervisors?.length ?? 0) > 0;

  let blockedReason = null;
  if (!year) blockedReason = "Tidak ada tahun ajaran aktif.";
  else if (eligible === null) blockedReason = "Data SIA semester ini belum menandai Anda mengambil Metode Penelitian.";
  else if (eligible === false) blockedReason = "Menurut data SIA, Anda tidak mengambil Metode Penelitian semester ini.";
  else if (activeRequest) blockedReason = "Anda masih memiliki pengajuan pembimbing yang sedang diproses.";
  else if (hasSupervisor) blockedReason = "Anda sudah memiliki dosen pembimbing.";

  return {
    academicYear: year ? { id: year.id, semester: year.semester, year: year.year, label: formatAcademicYearLabel(year) } : null,
    eligibleResearchMethod: eligible,
    eligibilitySource: flags?.eligibilitySource ?? null,
    eligibilityCapturedAt: flags?.eligibilityCapturedAt ?? null,
    canSubmit: blockedReason === null,
    blockedReason,
    revisionRequested: latestRequest?.status === STATUS.REVISION_REQUESTED,
    activeRequestId: activeRequest?.id ?? null,
  };
}

async function requireStudent(userId) {
  const student = await prisma.student.findUnique({ where: { id: userId }, select: { id: true } });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan.");
  return student;
}

/** The student's requests (newest first) and draft. */
export async function getStudentRequests(userId) {
  const student = await requireStudent(userId);
  const [requests, draft, state] = await Promise.all([
    repo.findRequestsByStudent(student.id),
    repo.findDraftByStudent(student.id),
    getSubmissionState(student.id),
  ]);
  const operationalId = state.academicYear?.id ?? null;
  return {
    submission: state,
    requests: requests.map((request) => toDto(request, operationalId)),
    activeRequest: toDto(requests.find((request) => request.id === state.activeRequestId) ?? null, operationalId),
    draft: draft
      ? {
        ...Object.fromEntries(DRAFT_FIELDS.map((field) => [field, draft[field] ?? null])),
        topic: draft.topic ?? null,
        lecturer: personOf(draft.lecturer),
        lastSubmittedAt: draft.lastSubmittedAt,
        updatedAt: draft.updatedAt,
      }
      : null,
  };
}

function draftPatch(data) {
  const patch = {};
  for (const field of DRAFT_FIELDS) {
    if (data[field] !== undefined) patch[field] = clean(data[field]);
  }
  return patch;
}

async function assertTopicUsable(topicId, client = prisma) {
  const topic = await repo.findTopicWithGroup(topicId, client);
  if (!topic) throw new NotFoundError("Topik tidak ditemukan.");
  if (!topic.scienceGroupId) {
    throw new BadRequestError("Topik penelitian belum terhubung ke KBK. Minta Sekretaris Departemen memperbarui master topik.");
  }
  return topic;
}

/** R8: the draft can be saved while the student may submit; topic and lecturer must exist. */
export async function saveDraft(userId, data) {
  const student = await requireStudent(userId);
  const state = await getSubmissionState(student.id);
  if (!state.canSubmit) throw new ForbiddenError(state.blockedReason);
  const patch = draftPatch(data);
  if (Object.keys(patch).length === 0) throw new BadRequestError("Tidak ada perubahan draf yang dikirim.");
  if (patch.topicId) await assertTopicUsable(patch.topicId);
  if (patch.lecturerId && !(await repo.findLecturer(patch.lecturerId))) throw new NotFoundError("Dosen pembimbing tidak ditemukan.");
  await repo.upsertDraft(student.id, patch);
  return (await getStudentRequests(userId)).draft;
}

/**
 * R1–R7: send a request. With a lecturer it waits for that lecturer (direct, or over the quota
 * when the lecturer is already at the hard limit, which needs the student's justification);
 * without one it goes to the Head of Department (department route).
 */
export async function submitRequest(userId, data) {
  const student = await requireStudent(userId);
  const year = await requireOperationalYear();

  const request = await prisma.$transaction(async (tx) => {
    await repo.lockStudent(tx, student.id);
    const state = await getSubmissionState(student.id, { client: tx });
    if (!state.canSubmit) throw new ForbiddenError(state.blockedReason);

    await repo.upsertDraft(student.id, draftPatch(data), tx);
    const draft = await repo.findDraftByStudent(student.id, tx);
    for (const [field, message] of REQUIRED_FIELDS) {
      if (!clean(draft[field])) throw new BadRequestError(message);
    }
    const topic = await assertTopicUsable(draft.topicId, tx);
    const proposedTitle = assertTitleIsSpecific(draft.proposedTitle, await repo.findAllTopicsWithGroup(tx));
    const justification = clean(draft.studentJustification);

    let route = ROUTE.DEPARTMENT;
    let status = STATUS.PENDING_KADEP;
    let lecturerLoad = null;
    if (draft.lecturerId) {
      const lecturer = await repo.findLecturer(draft.lecturerId, tx);
      if (!lecturer) throw new NotFoundError("Dosen pembimbing tidak ditemukan.");
      if (!lecturer.acceptingRequests) throw new BadRequestError("Dosen yang Anda pilih sedang tidak menerima pengajuan pembimbing.");
      lecturerLoad = (await getLecturerLoads([lecturer.id], year.id, { client: tx })).get(lecturer.id);
      route = lecturerLoad.level === SUPERVISION_LOAD_LEVEL.FULL ? ROUTE.OVER_QUOTA : ROUTE.DIRECT;
      status = STATUS.PENDING;
      if (route === ROUTE.OVER_QUOTA && (!justification || justification.length < MIN_STUDENT_JUSTIFICATION_LENGTH)) {
        throw new BadRequestError(
          `Dosen ini sudah mencapai batas bimbingan. Tulis alasan akademik memilih dosen ini, minimal ${MIN_STUDENT_JUSTIFICATION_LENGTH} karakter.`,
        );
      }
    }

    // A revision request is replaced by the new submission (it is closed, not deleted).
    await tx.thesisSupervisorRequest.updateMany({
      where: { studentId: student.id, status: STATUS.REVISION_REQUESTED },
      data: { status: STATUS.CLOSED },
    });

    const created = await repo.createRequest(
      {
        studentId: student.id,
        lecturerId: draft.lecturerId ?? null,
        academicYearId: year.id,
        topicId: topic.id,
        proposedTitle,
        backgroundSummary: clean(draft.backgroundSummary),
        problemStatement: clean(draft.problemStatement),
        proposedSolution: clean(draft.proposedSolution),
        researchObject: clean(draft.researchObject),
        researchPermitStatus: draft.researchPermitStatus,
        studentJustification: justification,
        status,
        route,
      },
      tx,
    );
    await repo.upsertDraft(student.id, { lastSubmittedAt: created.createdAt }, tx);
    await audit(tx, {
      actorUserId: userId,
      action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_CREATED,
      request: created,
      newStatus: status,
      reason: justification,
      metadata: lecturerLoad ? { lecturerLoad: lecturerLoad.activeCount, hardLimit: lecturerLoad.hardLimit } : null,
    });
    return created;
  });

  // R15: the lecturer, or the Head of Department for the department route.
  const studentName = request.student?.user?.fullName ?? "Mahasiswa";
  if (request.lecturerId) {
    const overQuota = request.route === ROUTE.OVER_QUOTA;
    await notify([request.lecturerId], {
      title: overQuota ? "Permohonan Pembimbing di Atas Kuota" : "Permohonan Pembimbing Baru",
      message: `${studentName} mengajukan Anda sebagai pembimbing untuk judul "${request.proposedTitle}".`,
      type: "supervisor_request_submitted",
      data: { requestId: request.id, route: ROUTES.lecturer },
    });
  } else {
    await notify(await repo.findActiveUserIdsByRole(ROLES.KETUA_DEPARTEMEN), {
      title: "Pengajuan Pembimbing Lewat Departemen",
      message: `${studentName} meminta departemen menetapkan pembimbing untuk judul "${request.proposedTitle}".`,
      type: "supervisor_request_submitted_to_kadep",
      data: { requestId: request.id, route: ROUTES.kadepDepartment },
    });
  }
  return toDto(request, year.id);
}

/**
 * R9: a waiting request can be pulled back 72 hours after it was sent ("Tarik"); an accepted
 * request can be cancelled at any time before Penetapan Pembimbing and before proposal work
 * started ("Batal"), which ends the supervisor relation.
 */
export async function withdrawRequest(requestId, userId) {
  const student = await requireStudent(userId);
  const existing = await repo.findRequestById(requestId);
  if (!existing) throw new NotFoundError("Pengajuan tidak ditemukan.");
  if (existing.studentId !== student.id) throw new ForbiddenError("Bukan pengajuan Anda.");

  const result = await prisma.$transaction(async (tx) => {
    await repo.lockRequest(tx, requestId);
    const request = await repo.findRequestById(requestId, tx);
    const oldStatus = request.status;

    if (WITHDRAWABLE_STATUSES.includes(oldStatus)) {
      const hours = hoursSince(request.createdAt);
      if (hours < WITHDRAW_LOCK_HOURS) {
        const remaining = Math.ceil(WITHDRAW_LOCK_HOURS - hours);
        throw new BadRequestError(`Pengajuan belum bisa ditarik. Tunggu ${remaining} jam lagi untuk menghormati waktu tinjauan dosen.`);
      }
      const updated = await repo.updateRequest(
        requestId,
        { status: STATUS.WITHDRAWN, withdrawnAt: new Date(), withdrawCount: { increment: 1 } },
        tx,
      );
      await audit(tx, { actorUserId: userId, action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_WITHDRAWN, request, oldStatus, newStatus: STATUS.WITHDRAWN });
      return updated;
    }

    if (ACCEPTED_STATUSES.includes(oldStatus)) {
      if (request.thesis?.supervisorAssignedAt) {
        throw new BadRequestError("Pembimbing sudah ditetapkan. Pergantian pembimbing dilakukan lewat Pengajuan Perubahan Tugas Akhir.");
      }
      if (request.thesisId && (await repo.hasProposalActivity(request.thesisId, tx))) {
        throw new BadRequestError("Proses proposal sudah dimulai (bimbingan atau penilaian), sehingga pengajuan tidak dapat dibatalkan.");
      }
      const updated = await repo.updateRequest(
        requestId,
        { status: STATUS.CANCELLED, withdrawnAt: new Date(), withdrawCount: { increment: 1 } },
        tx,
      );
      if (request.thesisId) {
        await repo.releaseSupervisor(request.thesisId, request.redirectedTo ?? request.lecturerId, tx);
      }
      await audit(tx, { actorUserId: userId, action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_CANCELLED, request, oldStatus, newStatus: STATUS.CANCELLED });
      return updated;
    }

    if (oldStatus === STATUS.ASSIGNED) {
      throw new BadRequestError("Pembimbing sudah ditetapkan. Pergantian pembimbing dilakukan lewat Pengajuan Perubahan Tugas Akhir.");
    }
    throw new BadRequestError("Status pengajuan ini tidak dapat ditarik atau dibatalkan.");
  });

  const operational = await resolveOperationalAcademicYear();
  return toDto(result, operational?.id ?? null);
}

/** R14: the student, the lecturer, the redirect target, or Kadep/Sekdep/Admin. */
export async function getRequestDetail(requestId, userId) {
  const request = await repo.findRequestById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const isParty = [request.studentId, request.lecturerId, request.redirectedTo].includes(userId);
  if (!isParty) {
    const privileged = await repo.userHasAnyActiveRole(userId, [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]);
    if (!privileged) throw new ForbiddenError("Anda tidak memiliki akses ke detail pengajuan ini.");
  }
  const operational = await resolveOperationalAcademicYear();
  return toDto(request, operational?.id ?? null);
}

// ── Catalog ───────────────────────────────────────────────────────────────────────────

function lecturerCard(lecturer, load) {
  const topics = [...new Set(lecturer.thesisSupervisors.map((row) => row.thesis?.thesisTopic?.name).filter(Boolean))];
  return {
    lecturerId: lecturer.id,
    fullName: lecturer.user?.fullName ?? null,
    identityNumber: lecturer.user?.identityNumber ?? null,
    avatarUrl: lecturer.user?.avatarUrl ?? null,
    scienceGroup: lecturer.scienceGroup ?? null,
    acceptingRequests: lecturer.acceptingRequests !== false,
    activeCount: load.activeCount,
    softLimit: load.softLimit,
    hardLimit: load.hardLimit,
    level: load.level,
    supervisedTopics: topics,
  };
}

/** Lecturer catalog with the load indicator (only while the student may submit, as before). */
export async function getCatalog(userId) {
  const student = await requireStudent(userId);
  const state = await getSubmissionState(student.id);
  if (!state.canSubmit) throw new ForbiddenError(state.blockedReason);
  const lecturers = await repo.findSupervisingLecturers();
  const loads = await getLecturerLoads(lecturers.map((l) => l.id), state.academicYear.id);
  return lecturers.map((lecturer) => lecturerCard(lecturer, loads.get(lecturer.id)));
}

// ── Lecturer ──────────────────────────────────────────────────────────────────────────

/** R16: waiting requests (with their period), the lecturer's load, and the history. */
export async function getLecturerInbox(userId) {
  const year = await requireOperationalYear();
  const [waiting, history, loads, lecturer] = await Promise.all([
    repo.findWaitingForLecturer(userId),
    repo.findLecturerHistory(userId),
    getLecturerLoads([userId], year.id),
    repo.findLecturer(userId),
  ]);
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    load: { ...loads.get(userId), acceptingRequests: lecturer?.acceptingRequests !== false },
    waiting: waiting.map((request) => toDto(request, year.id)),
    history: history.map((request) => toDto(request, year.id)),
  };
}

/**
 * Tugas Akhir > Permohonan (Paket E5, 3.1): the lecturer's approval inbox in one table, all
 * periods. Two kinds of rows: the "Pengajuan Pembimbing" sent or redirected to this lecturer,
 * and the "Perubahan TA" requests with a step of this lecturer (previous supervisor, new
 * supervisor, or Pembimbing 1 for a title). "Semua" by default, sorted on the server by
 * `LECTURER_INBOX_PRIORITY` (what waits for the viewer first, newest first inside a group);
 * the Jenis (`LECTURER_INBOX_JENIS`) and Status filters and the search by name, NIM or title
 * narrow it. `counts.waiting`
 * is what waits for the viewer, of both kinds (the sidebar badge).
 */
export async function listLecturerInbox(userId, { kind = null, status = null, search = "", page = 1, pageSize = 10 } = {}) {
  const year = await requireOperationalYear();
  const window = pageWindow({ page, pageSize });
  const keyword = String(search ?? "").trim();
  const changeWhere = await lecturerStepFilters(userId);
  const visible = { OR: [{ lecturerId: userId }, { redirectedTo: userId }] };
  const requestSearch = keyword
    ? {
      OR: [
        { proposedTitle: { contains: keyword } },
        { student: { user: { fullName: { contains: keyword } } } },
        { student: { user: { identityNumber: { contains: keyword } } } },
      ],
    }
    : {};
  const changeSearch = changeRequestSearchWhere(keyword);
  // Paket E6: Jenis is Pengajuan Pembimbing or one kind of change; an unknown value is no filter.
  const jenis = LECTURER_INBOX_JENIS[kind] ?? null;
  const changeTypeWhere = jenis?.requestType ? { requestType: jenis.requestType } : {};
  const wanted = (inboxKind, member) => (!jenis || jenis.kind === inboxKind) && (!status || status === member);

  const levels = [...new Set(Object.values(LECTURER_INBOX_PRIORITY).flatMap((map) => Object.values(map)))].sort((a, b) => a - b);
  const groups = levels.flatMap((level) => {
    const membersOf = (inboxKind) =>
      Object.entries(LECTURER_INBOX_PRIORITY[inboxKind])
        .filter(([member, priority]) => priority === level && wanted(inboxKind, member))
        .map(([member]) => member);
    const requestStatuses = membersOf(KIND.SUPERVISOR_REQUEST);
    const changeStatuses = membersOf(KIND.CHANGE_REQUEST);
    if (requestStatuses.length === 0 && changeStatuses.length === 0) return [];
    return [{
      key: `level-${level}`,
      where: {
        request: requestStatuses.length > 0 ? { AND: [visible, { status: { in: requestStatuses } }, requestSearch] } : null,
        change: changeStatuses.length > 0 ? { AND: [{ OR: changeStatuses.map((member) => changeWhere[member]) }, changeSearch, changeTypeWhere] } : null,
      },
    }];
  });

  const [paged, waitingRequests, waitingChanges] = await Promise.all([
    pageAcrossGroups(groups, window, { count: countInboxGroup, find: findInboxGroup }),
    repo.countRequests({ lecturerId: userId, status: { in: WAITING_LECTURER_STATUSES } }),
    changeRepo.countWhere(changeWhere[CHANGE_REQUEST_VIEW_STATUS.AWAITING_ME]),
  ]);
  const data = await Promise.all(
    paged.rows.map(async ({ row }) =>
      row.kind === KIND.SUPERVISOR_REQUEST
        ? { kind: row.kind, id: row.value.id, viewStatus: row.value.status, createdAt: row.value.createdAt, supervisorRequest: toDto(row.value, year.id) }
        : (async () => {
          const changeRequest = await toLecturerStepRow(row.value, userId);
          return { kind: row.kind, id: row.value.id, viewStatus: changeRequest.viewStatus, createdAt: row.value.createdAt, changeRequest };
        })(),
    ),
  );
  return {
    data,
    meta: pageMeta(window, paged.total),
    counts: { waiting: waitingRequests + waitingChanges, waitingRequests, waitingChanges },
  };
}

const INBOX_ORDER = Object.freeze([{ createdAt: "desc" }, { id: "desc" }]);

async function countInboxGroup(where) {
  const [requests, changes] = await Promise.all([
    where.request ? repo.countRequests(where.request) : 0,
    where.change ? changeRepo.countWhere(where.change) : 0,
  ]);
  return requests + changes;
}

/**
 * One window of a group holding both kinds, newest first: each kind is read up to the end of
 * the window in its own order, then the two are merged.
 */
async function findInboxGroup(where, _orderBy, { skip, take }) {
  const both = where.request && where.change;
  const part = both ? { skip: 0, take: skip + take } : { skip, take };
  const [requests, changes] = await Promise.all([
    where.request ? repo.findRequestPage(where.request, INBOX_ORDER, part) : [],
    where.change ? changeRepo.findPage(where.change, INBOX_ORDER, part).then((result) => result.rows) : [],
  ]);
  const rows = [
    ...requests.map((value) => ({ kind: KIND.SUPERVISOR_REQUEST, value })),
    ...changes.map((value) => ({ kind: KIND.CHANGE_REQUEST, value })),
  ];
  if (!both) return rows;
  rows.sort((a, b) => new Date(b.value.createdAt) - new Date(a.value.createdAt) || String(b.value.id).localeCompare(String(a.value.id)));
  return rows.slice(skip, skip + take);
}

async function loadRequestForLecturer(tx, requestId, userId) {
  await repo.lockRequest(tx, requestId);
  const request = await repo.findRequestById(requestId, tx);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan.");
  if (request.lecturerId !== userId) throw new ForbiddenError("Pengajuan ini bukan untuk Anda.");
  return request;
}

/** R11: only a pending request can be marked as being reviewed. */
export async function markUnderReview(requestId, userId) {
  const updated = await prisma.$transaction(async (tx) => {
    const request = await loadRequestForLecturer(tx, requestId, userId);
    if (request.status !== STATUS.PENDING) {
      throw new BadRequestError("Hanya pengajuan yang menunggu yang bisa ditandai sedang ditinjau.");
    }
    const row = await repo.updateRequest(requestId, { status: STATUS.UNDER_REVIEW }, tx);
    await audit(tx, { actorUserId: userId, action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_REVIEWED, request, oldStatus: request.status, newStatus: STATUS.UNDER_REVIEW });
    return row;
  });
  return toDto(updated, updated.academicYearId);
}

/**
 * Accept inside a transaction: the thesis is born in the proposal phase (or the student's open
 * thesis without supervisor is reused) with the lecturer as Pembimbing 1 (K3: counted at once).
 */
async function acceptInTx(tx, request, { lecturerId, status, actorUserId, action, data = {} }) {
  const conflict = await repo.findActiveRequestByStudent(request.studentId, tx, request.id);
  if (conflict) throw new BadRequestError("Mahasiswa sudah memiliki pengajuan aktif lain. Selesaikan pengajuan itu terlebih dahulu.");

  const open = await repo.findOpenThesisByStudent(request.studentId, tx);
  if (open && open.thesisSupervisors.length > 0) {
    throw new BadRequestError("Mahasiswa ini sudah memiliki tugas akhir dengan pembimbing.");
  }
  const thesisData = {
    title: request.proposedTitle,
    thesisTopicId: request.topicId,
    academicYearId: request.academicYearId,
  };
  const thesis = open
    ? await tx.thesis.update({ where: { id: open.id }, data: thesisData })
    : await tx.thesis.create({
      data: { ...thesisData, studentId: request.studentId, status: THESIS_STATUS.PROPOSAL, statusChangedAt: new Date() },
    });
  await createSupervisorAssignments(tx, thesis.id, [{ lecturerId, supervisorRole: "pembimbing_1" }], { requireP1: true });

  const updated = await repo.updateRequest(request.id, { status, thesisId: thesis.id, ...data }, tx);
  await audit(tx, {
    actorUserId,
    action,
    request: updated,
    oldStatus: request.status,
    newStatus: status,
    reason: data.kadepNotes ?? data.lecturerApprovalNote ?? null,
    metadata: { assignedLecturerId: lecturerId, acceptedOverNormal: updated.acceptedOverNormal },
  });
  return updated;
}

/**
 * R10: accept or reject. Below the hard limit the request is accepted; at or over it, the
 * acceptance is forwarded to the Head of Department with both justifications.
 */
export async function respondAsLecturer(requestId, userId, { action, approvalNote, lecturerOverquotaReason, rejectionReason }) {
  const year = await requireOperationalYear();
  const limits = await getApplicableLimits(year.id);

  const updated = await prisma.$transaction(async (tx) => {
    const request = await loadRequestForLecturer(tx, requestId, userId);
    if (!WAITING_LECTURER_STATUSES.includes(request.status)) {
      throw new BadRequestError("Pengajuan ini sudah diputuskan. Muat ulang halaman.");
    }

    if (action === "reject") {
      const reason = clean(rejectionReason);
      if (!reason || reason.length < MIN_REJECTION_REASON_LENGTH) {
        throw new BadRequestError(`Alasan penolakan wajib diisi (minimal ${MIN_REJECTION_REASON_LENGTH} karakter).`);
      }
      const row = await repo.updateRequest(
        requestId,
        { status: STATUS.REJECTED_BY_LECTURER, rejectionReason: reason, lecturerRespondedAt: new Date() },
        tx,
      );
      await audit(tx, { actorUserId: userId, action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_REJECTED, request, oldStatus: request.status, newStatus: row.status, reason });
      return row;
    }

    await repo.lockStudent(tx, request.studentId);
    const load = (await getLecturerLoads([userId], year.id, { client: tx })).get(userId);
    if (load.activeCount < limits.hardLimit) {
      return acceptInTx(tx, request, {
        lecturerId: userId,
        status: STATUS.ACCEPTED,
        actorUserId: userId,
        action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_ACCEPTED,
        data: { lecturerRespondedAt: new Date(), lecturerApprovalNote: clean(approvalNote) },
      });
    }

    const justification = clean(request.studentJustification);
    if (!justification || justification.length < MIN_STUDENT_JUSTIFICATION_LENGTH) {
      throw new BadRequestError(
        `Anda sudah mencapai batas bimbingan, dan pengajuan ini tidak memuat alasan mahasiswa minimal ${MIN_STUDENT_JUSTIFICATION_LENGTH} karakter. Minta mahasiswa mengajukan ulang dengan alasannya.`,
      );
    }
    const reason = clean(lecturerOverquotaReason ?? approvalNote);
    if (!reason || reason.length < MIN_LECTURER_OVERQUOTA_REASON_LENGTH) {
      throw new BadRequestError(
        `Anda sudah mencapai batas bimbingan. Tulis pertimbangan menerima mahasiswa ini (misal proyeksi kelulusan), minimal ${MIN_LECTURER_OVERQUOTA_REASON_LENGTH} karakter.`,
      );
    }
    const now = new Date();
    const row = await repo.updateRequest(
      requestId,
      {
        status: STATUS.PENDING_KADEP,
        route: ROUTE.OVER_QUOTA,
        lecturerRespondedAt: now,
        lecturerApprovalNote: reason,
        lecturerOverquotaReason: reason,
        forwardedToKadepAt: now,
        forwardedByLecturerId: userId,
      },
      tx,
    );
    await audit(tx, {
      actorUserId: userId,
      action: AUDIT_ACTIONS.SUPERVISOR_REQUEST_FORWARDED_TO_KADEP,
      request,
      oldStatus: request.status,
      newStatus: STATUS.PENDING_KADEP,
      reason,
      metadata: { lecturerLoad: load.activeCount, hardLimit: limits.hardLimit },
    });
    return row;
  });

  await notifyAfterDecision(updated, "lecturer");
  return toDto(updated, year.id);
}

async function notifyAfterDecision(request, actor) {
  const studentUserId = request.studentId;
  const supervisorName = request.redirectTarget?.user?.fullName ?? request.lecturer?.user?.fullName ?? "dosen pembimbing";
  const studentName = request.student?.user?.fullName ?? "Mahasiswa";
  switch (request.status) {
    case STATUS.ACCEPTED:
    case STATUS.REDIRECTED:
      await notify([studentUserId], {
        title: "Pengajuan Pembimbing Disetujui",
        message:
          request.status === STATUS.REDIRECTED
            ? `Ketua Departemen menetapkan ${supervisorName} sebagai pembimbing Anda. Bimbingan proposal dimulai setelah Penetapan Pembimbing.`
            : `${actor === "kadep" ? "Ketua Departemen" : supervisorName} menyetujui pengajuan pembimbing Anda. Bimbingan proposal dimulai setelah Penetapan Pembimbing.`,
        type: "supervisor_request_accepted",
        data: { requestId: request.id, thesisId: request.thesisId, route: ROUTES.student },
      });
      if (actor === "kadep") {
        await notify([request.redirectedTo ?? request.lecturerId], {
          title: "Mahasiswa Bimbingan Baru",
          message: `Ketua Departemen menetapkan Anda sebagai pembimbing ${studentName}.`,
          type: "supervisor_request_assigned_by_kadep",
          data: { requestId: request.id, route: ROUTES.lecturer },
        });
      }
      return;
    case STATUS.PENDING_KADEP:
      await notify([studentUserId], {
        title: "Pengajuan Diteruskan ke Ketua Departemen",
        message: `${supervisorName} bersedia membimbing Anda, tetapi sudah mencapai batas bimbingan. Pengajuan diteruskan ke Ketua Departemen.`,
        type: "supervisor_request_forwarded",
        data: { requestId: request.id, route: ROUTES.student },
      });
      await notify(await repo.findActiveUserIdsByRole(ROLES.KETUA_DEPARTEMEN), {
        title: "Pengajuan di Atas Kuota",
        message: `${supervisorName} meneruskan pengajuan ${studentName} yang melewati batas bimbingan.`,
        type: "supervisor_request_forwarded_to_kadep",
        data: { requestId: request.id, route: ROUTES.kadepOverQuota },
      });
      return;
    case STATUS.REJECTED_BY_LECTURER:
    case STATUS.REJECTED_BY_KADEP: {
      const byKadep = request.status === STATUS.REJECTED_BY_KADEP;
      const reason = byKadep ? request.kadepNotes : request.rejectionReason;
      await notify([studentUserId], {
        title: byKadep ? "Pengajuan Pembimbing Ditolak Ketua Departemen" : "Pengajuan Pembimbing Ditolak Dosen",
        message: `${byKadep ? "Ketua Departemen" : supervisorName} menolak pengajuan Anda.${reason ? ` Alasan: ${reason}` : ""} Draf Anda tersimpan untuk diajukan ulang.`,
        type: "supervisor_request_rejected",
        data: { requestId: request.id, route: ROUTES.student },
      });
      return;
    }
    case STATUS.REVISION_REQUESTED:
      await notify([studentUserId], {
        title: "Pengajuan Pembimbing Perlu Revisi",
        message: `Ketua Departemen meminta revisi pengajuan Anda. Catatan: ${request.kadepNotes}`,
        type: "supervisor_request_revision_requested",
        data: { requestId: request.id, route: ROUTES.student },
      });
      return;
    default:
  }
}

// ── Head of Department ────────────────────────────────────────────────────────────────

/** Department route and over-quota route queues, with the load preview (R16). */
export async function getKadepQueue() {
  const year = await requireOperationalYear();
  const [department, overQuota, history] = await Promise.all([
    repo.findWaitingForKadep(ROUTE.DEPARTMENT),
    repo.findWaitingForKadep(ROUTE.OVER_QUOTA),
    repo.findKadepHistory(),
  ]);
  const lecturerIds = overQuota.map((r) => r.lecturerId).filter(Boolean);
  const loads = lecturerIds.length ? await getLecturerLoads(lecturerIds, year.id) : new Map();
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    department: department.map((request) => toDto(request, year.id)),
    overQuota: overQuota.map((request) => {
      const load = loads.get(request.lecturerId);
      return {
        ...toDto(request, year.id),
        lecturerLoad: load
          ? { ...load, projectedCount: load.activeCount + 1, overBy: Math.max(0, load.activeCount + 1 - load.hardLimit) }
          : null,
      };
    }),
    history: history.map((request) => toDto(request, year.id)),
  };
}

async function candidateLoads(year) {
  const lecturers = await repo.findSupervisingLecturers({ acceptingOnly: true });
  const loads = await getLecturerLoads(lecturers.map((l) => l.id), year.id);
  return { lecturers, loads };
}

function scoreCandidate(card, lecturer, topicId) {
  const remaining = Math.max(0, card.hardLimit - card.activeCount);
  const sameTopic = lecturer.thesisSupervisors.filter((row) => row.thesis?.thesisTopicId === topicId).length;
  return { ...card, remaining, sameTopicCount: sameTopic, score: remaining * 3 + sameTopic * 2 + Math.max(0, 10 - card.activeCount) };
}

/** R13: up to three lecturers of the same KBK that are not full, by score. */
export async function getRecommendations(requestId) {
  const request = await repo.findRequestById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const scienceGroupId = request.topic?.scienceGroupId ?? null;
  if (!scienceGroupId) {
    return { alternatives: [], message: "KBK topik belum dipetakan. Minta Sekretaris Departemen menghubungkan topik ini ke KBK." };
  }
  const year = await requireOperationalYear();
  const { lecturers, loads } = await candidateLoads(year);
  const alternatives = lecturers
    .filter((l) => l.scienceGroup?.id === scienceGroupId && l.id !== request.lecturerId)
    .map((l) => scoreCandidate(lecturerCard(l, loads.get(l.id)), l, request.topicId))
    .filter((card) => card.level !== SUPERVISION_LOAD_LEVEL.FULL)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECOMMENDATION_LIMIT);
  return { alternatives };
}

/** R13: every lecturer who accepts requests (any KBK, full ones too), by name. */
export async function getAssignableLecturers(requestId) {
  const request = await repo.findRequestById(requestId);
  if (!request) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const year = await requireOperationalYear();
  const { lecturers, loads } = await candidateLoads(year);
  return {
    lecturers: lecturers
      .filter((l) => l.id !== request.lecturerId)
      .map((l) => scoreCandidate(lecturerCard(l, loads.get(l.id)), l, request.topicId)),
  };
}

function assertDualJustification(request) {
  if (request.route !== ROUTE.OVER_QUOTA) return;
  const student = clean(request.studentJustification);
  if (!student || student.length < MIN_STUDENT_JUSTIFICATION_LENGTH) {
    throw new BadRequestError(`Pengajuan di atas kuota wajib memuat alasan mahasiswa minimal ${MIN_STUDENT_JUSTIFICATION_LENGTH} karakter.`);
  }
  const lecturer = clean(request.lecturerOverquotaReason);
  if (!lecturer || lecturer.length < MIN_LECTURER_OVERQUOTA_REASON_LENGTH) {
    throw new BadRequestError(`Pengajuan di atas kuota wajib memuat pertimbangan dosen minimal ${MIN_LECTURER_OVERQUOTA_REASON_LENGTH} karakter.`);
  }
}

/**
 * R12. approve: the chosen lecturer (over quota) or the lecturer Kadep picks (department route);
 * redirect: another lecturer, who may be full; request_revision and reject: department route
 * only. An over-quota request cannot be rejected.
 */
export async function decideAsKadep(requestId, userId, { action, targetLecturerId, notes }) {
  const year = await requireOperationalYear();
  const limits = await getApplicableLimits(year.id);
  const cleanNotes = clean(notes);
  const target = clean(targetLecturerId);

  const updated = await prisma.$transaction(async (tx) => {
    await repo.lockRequest(tx, requestId);
    const request = await repo.findRequestById(requestId, tx);
    if (!request) throw new NotFoundError("Pengajuan tidak ditemukan.");
    if (!WAITING_KADEP_STATUSES.includes(request.status)) {
      throw new BadRequestError("Pengajuan ini tidak sedang menunggu Ketua Departemen. Muat ulang halaman.");
    }
    const isDepartment = request.route === ROUTE.DEPARTMENT;
    const now = new Date();
    const decided = { reviewedBy: userId, reviewedAt: now, kadepNotes: cleanNotes };

    if (action === "reject" || action === "request_revision") {
      if (!isDepartment) {
        throw new BadRequestError("Pengajuan di atas kuota tidak dapat ditolak. Setujui dosen pengaju atau alihkan ke dosen lain.");
      }
      if (action === "request_revision" && (!cleanNotes || cleanNotes.length < MIN_KADEP_REVISION_NOTES_LENGTH)) {
        throw new BadRequestError(`Catatan revisi wajib diisi minimal ${MIN_KADEP_REVISION_NOTES_LENGTH} karakter.`);
      }
      const status = action === "reject" ? STATUS.REJECTED_BY_KADEP : STATUS.REVISION_REQUESTED;
      const row = await repo.updateRequest(requestId, { status, ...decided }, tx);
      await audit(tx, {
        actorUserId: userId,
        action: action === "reject" ? AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REJECTED : AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REVISION_REQUESTED,
        request,
        oldStatus: request.status,
        newStatus: status,
        reason: cleanNotes,
      });
      return row;
    }

    if (action !== "approve" && action !== "redirect") {
      throw new BadRequestError("Keputusan harus setujui, alihkan, minta revisi, atau tolak.");
    }
    await repo.lockStudent(tx, request.studentId);
    assertDualJustification(request);

    let lecturerId;
    if (action === "approve") {
      lecturerId = isDepartment ? target : request.lecturerId;
      if (!lecturerId) {
        throw new BadRequestError("Pengajuan lewat departemen disetujui dengan memilih dosen pembimbing terlebih dahulu.");
      }
    } else {
      if (!target) throw new BadRequestError("Pilih dosen tujuan pengalihan.");
      if (target === request.lecturerId) throw new BadRequestError("Dosen tujuan sama dengan dosen yang dipilih mahasiswa. Gunakan Setujui.");
      lecturerId = target;
    }
    const lecturer = await repo.findLecturer(lecturerId, tx);
    if (!lecturer) throw new NotFoundError("Dosen tujuan tidak ditemukan.");
    if (lecturerId !== request.lecturerId && lecturer.acceptingRequests === false) {
      throw new BadRequestError("Dosen tujuan sedang tidak menerima pengajuan pembimbing.");
    }
    const load = (await getLecturerLoads([lecturerId], year.id, { client: tx })).get(lecturerId);
    const overNormal = request.route === ROUTE.OVER_QUOTA && action === "approve"
      ? true
      : classifyLoad(load.activeCount, limits) === SUPERVISION_LOAD_LEVEL.FULL;

    const isRedirect = action === "redirect";
    return acceptInTx(tx, request, {
      lecturerId,
      status: isRedirect ? STATUS.REDIRECTED : STATUS.ACCEPTED,
      actorUserId: userId,
      action: isRedirect ? AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_REDIRECTED : AUDIT_ACTIONS.SUPERVISOR_REQUEST_KADEP_APPROVED,
      data: {
        ...decided,
        redirectedTo: isRedirect || isDepartment ? lecturerId : null,
        acceptedOverNormal: overNormal,
      },
    });
  });

  await notifyAfterDecision(updated, "kadep");
  return toDto(updated, year.id);
}
