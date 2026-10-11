/**
 * Pengajuan Perubahan Tugas Akhir (formulir TA-05, keputusan K8).
 *
 * One engine for every change made while a thesis is in `research`, before the results
 * seminar is registered: a new title, a replaced Pembimbing 1 or 2, an added Pembimbing 2,
 * and the supervisor's "Alihkan Mahasiswa" (several requests sharing a `batchId`).
 *
 * Approval chain:
 *   title only             Pembimbing 1 -> Ketua Departemen (Pembimbing 2 is informed)
 *   replace a supervisor   previous supervisor -> new supervisor -> Ketua Departemen
 *   add Pembimbing 2       Pembimbing 1 -> new supervisor -> Ketua Departemen
 *   title and supervisor   same chain as the supervisor change
 *
 * A step that belongs to the requester is approved on submission. A rejection at any step
 * closes the request. The requester may cancel until the Ketua Departemen decides. The
 * Ketua Departemen may decide before the lecturer steps are done, with a reason. The change
 * is applied to the thesis only when the Ketua Departemen approves, in one transaction.
 */
import { randomUUID } from "crypto";
import prisma from "../config/prisma.js";
import * as repo from "../repositories/thesis-change-request.repository.js";
import { ROLES } from "../constants/roles.js";
import { THESIS_STATUS } from "../constants/thesisStatus.js";
import {
  THESIS_STATUS_LABELS,
  SUPERVISOR_POSITION_LABELS,
  CHANGE_REQUEST_TYPE_LABELS,
} from "../constants/thesisLabels.js";
import {
  CHANGE_APPROVAL_ROLE,
  CHANGE_REQUEST_STATUS,
  CHANGE_REQUEST_TYPE,
  KADEP_STEP,
  SEMINAR_STATUSES_BLOCKING_CHANGE,
  SUPERVISOR_POSITION,
  SYSTEM_CANCEL_REASON_SUPERVISOR_CHANGED,
} from "../constants/thesis-change-request.js";
import { GUIDANCE_ACTOR, GUIDANCE_STATUS, SLOT_HOLDING_GUIDANCE_STATUSES } from "../constants/guidanceStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { createNotificationsForUsers } from "./notification.service.js";
import { sendFcmToUsers } from "./push.service.js";
import { getCanonicalSupervisorRoles } from "../utils/supervisorIntegrity.js";
import { syncQuotaCount } from "../utils/quotaSync.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";

/** Quota used when a lecturer has no quota row for the active academic year. */
const DEFAULT_QUOTA_MAX = 10;

const POSITION_ROLE_NAME = Object.freeze({
  [SUPERVISOR_POSITION.P1]: ROLES.PEMBIMBING_1,
  [SUPERVISOR_POSITION.P2]: ROLES.PEMBIMBING_2,
});

const positionOfRoleName = (roleName) =>
  Object.keys(POSITION_ROLE_NAME).find((position) => POSITION_ROLE_NAME[position] === roleName) ?? null;

const changesTitle = (type) => type === CHANGE_REQUEST_TYPE.TITLE || type === CHANGE_REQUEST_TYPE.BOTH;
const changesSupervisor = (type) => type === CHANGE_REQUEST_TYPE.SUPERVISOR || type === CHANGE_REQUEST_TYPE.BOTH;

const person = (user) => (user ? { id: user.id, name: user.fullName ?? null, identityNumber: user.identityNumber ?? null } : null);

// ── Rules ────────────────────────────────────────────────────────────────────────────

/** Active supervisor relation at a position, or null when the position is empty. */
function supervisorAt(thesis, position) {
  return (thesis?.thesisSupervisors ?? []).find((s) => s.role?.name === POSITION_ROLE_NAME[position]) ?? null;
}

/**
 * Why a change request cannot be made for this thesis, or null when it can. The same check
 * decides the disabled state of "Ajukan Perubahan" and is run again on submission (K14).
 */
export function getChangeBlockReason(thesis, { hasOpenRequest = false } = {}) {
  if (!thesis) return "Belum ada tugas akhir.";
  if (thesis.status !== THESIS_STATUS.RESEARCH) {
    return `Pengajuan perubahan hanya untuk tugas akhir berstatus "${THESIS_STATUS_LABELS.research}". Status saat ini: "${THESIS_STATUS_LABELS[thesis.status] ?? "-"}".`;
  }
  const seminarBlocks = (thesis.thesisSeminars ?? []).some((seminar) =>
    SEMINAR_STATUSES_BLOCKING_CHANGE.includes(seminar.status),
  );
  if (seminarBlocks) {
    return "Pengajuan perubahan hanya dapat dibuat sampai sebelum pendaftaran seminar hasil. Tugas akhir ini sudah terdaftar atau lulus seminar hasil.";
  }
  if (hasOpenRequest) {
    return "Masih ada pengajuan perubahan yang berjalan. Tunggu keputusannya atau batalkan lebih dulu.";
  }
  return null;
}

/** Role of the user on a thesis: `student`, a supervisor position, or null. */
function viewerRoleOn(thesis, userId) {
  if (!thesis || !userId) return null;
  if (thesis.student?.user?.id === userId || thesis.studentId === userId) return "student";
  const relation = (thesis.thesisSupervisors ?? []).find((s) => s.lecturerId === userId);
  return relation ? positionOfRoleName(relation.role?.name) : null;
}

/**
 * Validates the content of a request against the thesis and returns the columns to store
 * plus the approval steps.
 */
async function buildRequestPlan(client, thesis, requesterUserId, input) {
  const type = input.requestType;
  const data = { requestType: type };
  const steps = [];
  const p1 = supervisorAt(thesis, SUPERVISOR_POSITION.P1);

  if (changesTitle(type)) {
    const newTitle = String(input.newTitle ?? "").trim();
    if (!newTitle) throw new BadRequestError("Judul baru wajib diisi.");
    const sameTopic = !input.newTopicId || input.newTopicId === thesis.thesisTopicId;
    if (newTitle === String(thesis.title ?? "").trim() && sameTopic) {
      throw new BadRequestError("Judul baru sama dengan judul saat ini.");
    }
    if (input.newTopicId) {
      const topic = await client.thesisTopic.findUnique({ where: { id: input.newTopicId }, select: { id: true } });
      if (!topic) throw new BadRequestError("Topik tugas akhir tidak ditemukan.");
    }
    data.previousTitle = thesis.title ?? null;
    data.newTitle = newTitle;
    data.newTopicId = input.newTopicId || null;
  }

  if (changesSupervisor(type)) {
    const position = input.supervisorRole;
    if (!POSITION_ROLE_NAME[position]) throw new BadRequestError("Posisi pembimbing yang diubah wajib dipilih.");
    if (!input.newSupervisorId) throw new BadRequestError("Pembimbing baru wajib dipilih.");
    const positionLabel = SUPERVISOR_POSITION_LABELS[position];
    const current = supervisorAt(thesis, position);

    if (!current && position === SUPERVISOR_POSITION.P1) {
      throw new BadRequestError("Tugas akhir ini belum memiliki Pembimbing 1. Hubungi Admin untuk mengisinya melalui Data Master Tugas Akhir.");
    }
    if (current?.lecturerId === input.newSupervisorId) {
      throw new BadRequestError(`Dosen tersebut sudah menjadi ${positionLabel} tugas akhir ini.`);
    }
    if (position === SUPERVISOR_POSITION.P2 && p1?.lecturerId === input.newSupervisorId) {
      throw new BadRequestError("Pembimbing 1 tidak dapat dipindahkan menjadi Pembimbing 2. Ganti Pembimbing 1 lebih dulu.");
    }
    const lecturer = await client.lecturer.findUnique({ where: { id: input.newSupervisorId }, select: { id: true } });
    if (!lecturer) throw new BadRequestError("Dosen yang dipilih tidak ditemukan.");
    if (!(await repo.userHasActiveRole(input.newSupervisorId, POSITION_ROLE_NAME[position], client))) {
      throw new BadRequestError(`Dosen yang dipilih tidak memiliki peran ${positionLabel}.`);
    }

    data.supervisorRole = position;
    data.replacedSupervisorLecturerId = current?.lecturerId ?? null;
    data.newSupervisorId = input.newSupervisorId;

    if (!current && !p1) {
      throw new BadRequestError("Tugas akhir ini belum memiliki Pembimbing 1. Hubungi Admin untuk mengisinya melalui Data Master Tugas Akhir.");
    }
    // Replace: previous supervisor first. Add (empty Pembimbing 2): Pembimbing 1 first.
    steps.push(
      current
        ? { role: CHANGE_APPROVAL_ROLE.PREVIOUS_SUPERVISOR, lecturerId: current.lecturerId }
        : { role: CHANGE_APPROVAL_ROLE.MAIN_SUPERVISOR, lecturerId: p1.lecturerId },
    );
    steps.push({ role: CHANGE_APPROVAL_ROLE.NEW_SUPERVISOR, lecturerId: input.newSupervisorId });
  } else {
    if (!p1) {
      throw new BadRequestError("Tugas akhir ini belum memiliki Pembimbing 1. Hubungi Admin untuk mengisinya melalui Data Master Tugas Akhir.");
    }
    steps.push({ role: CHANGE_APPROVAL_ROLE.MAIN_SUPERVISOR, lecturerId: p1.lecturerId });
  }

  const now = new Date();
  return {
    data,
    // A step that belongs to the requester is approved on submission.
    approvals: steps.map((step, index) => ({
      ...step,
      stepOrder: index + 1,
      ...(step.lecturerId === requesterUserId
        ? { status: "approved", decidedAt: now, notes: "Disetujui otomatis: langkah milik pengaju." }
        : {}),
    })),
  };
}

/** What a requester may ask for on this thesis; throws 403 otherwise. */
function assertMaySubmit(thesis, userId, input) {
  const role = viewerRoleOn(thesis, userId);
  if (role === "student" || role === SUPERVISOR_POSITION.P1) return role;
  if (role === SUPERVISOR_POSITION.P2) {
    // Pembimbing 2 may only hand over their own position ("Alihkan Mahasiswa").
    const ownHandover = input.requestType === CHANGE_REQUEST_TYPE.SUPERVISOR && input.supervisorRole === SUPERVISOR_POSITION.P2;
    if (ownHandover) return role;
    throw new ForbiddenError("Pembimbing 2 hanya dapat mengalihkan posisinya sendiri. Perubahan lain diajukan oleh mahasiswa atau Pembimbing 1.");
  }
  throw new ForbiddenError("Hanya mahasiswa pemilik tugas akhir atau pembimbing aktifnya yang dapat mengajukan perubahan.");
}

// ── Response shape ───────────────────────────────────────────────────────────────────

const pendingStep = (request) => request.approvals.find((approval) => approval.status === "pending") ?? null;
const lecturerStepsDone = (request) => request.approvals.every((approval) => approval.status === "approved");

function toDto(request, { viewerUserId = null, load = undefined } = {}) {
  const isPending = request.status === CHANGE_REQUEST_STATUS.PENDING;
  const current = isPending ? pendingStep(request) : null;
  const steps = request.approvals.map((approval) => ({
    key: approval.role,
    lecturer: person(approval.lecturer?.user),
    status: approval.status,
    // Closed while this step was still open: decided directly, cancelled, or rejected earlier.
    skipped: !isPending && approval.status === "pending",
    notes: approval.notes ?? null,
    decidedAt: approval.decidedAt ?? null,
  }));
  // The final step is the Ketua Departemen's decision; it is not an approval row.
  const approved = request.status === CHANGE_REQUEST_STATUS.APPROVED;
  const decidedByKadep = approved || (request.status === CHANGE_REQUEST_STATUS.REJECTED && !rejectedByLecturer(request));
  steps.push({
    key: KADEP_STEP,
    lecturer: null,
    status: approved ? "approved" : decidedByKadep ? "rejected" : "pending",
    skipped: !isPending && !decidedByKadep,
    notes: decidedByKadep ? request.decisionNotes ?? null : null,
    decidedAt: decidedByKadep ? request.decidedAt ?? null : null,
  });

  const thesis = request.thesis;
  return {
    id: request.id,
    thesisId: request.thesisId,
    batchId: request.batchId ?? null,
    requestType: request.requestType,
    status: request.status,
    reason: request.reason,
    student: person(thesis?.student?.user),
    thesisTitle: thesis?.title ?? null,
    title: changesTitle(request.requestType)
      ? { previous: request.previousTitle ?? null, next: request.newTitle ?? null, newTopic: request.newTopic ?? null }
      : null,
    supervisor: changesSupervisor(request.requestType)
      ? {
        position: request.supervisorRole,
        replaced: person(request.replacedSupervisor?.user),
        next: person(request.newSupervisor?.user),
      }
      : null,
    requestedBy: person(request.requestedBy),
    requestedByStudent: !!request.requestedByUserId && request.requestedByUserId === thesis?.student?.user?.id,
    steps,
    currentStep: !isPending ? null : current ? current.role : KADEP_STEP,
    decision: request.decidedAt
      ? { by: person(request.decidedBy), notes: request.decisionNotes ?? null, at: request.decidedAt }
      : null,
    appliedAt: request.appliedAt ?? null,
    createdAt: request.createdAt,
    ...(load !== undefined ? { newSupervisorLoad: load } : {}),
    viewer: {
      canDecideAsLecturer: isPending && !!current && current.lecturerId === viewerUserId,
      canCancel: isPending && request.requestedByUserId === viewerUserId,
    },
  };
}

/** True when a lecturer's rejection closed the request. */
function rejectedByLecturer(request) {
  return request.approvals.some((approval) => approval.status === "rejected");
}

async function loadOf(lecturerId, client = prisma) {
  if (!lecturerId) return null;
  const { activeCount, quotaMax } = await repo.getSupervisorLoad(lecturerId, client);
  const max = quotaMax ?? DEFAULT_QUOTA_MAX;
  // Shown to the new supervisor and the Ketua Departemen. Being full does not block the
  // request: the Ketua Departemen decides.
  return { activeCount, quotaMax: max, isFull: activeCount >= max };
}

/** Adds the new supervisor's load for the people allowed to see it. */
async function toDtoFor(request, viewerUserId, { showLoad = false } = {}) {
  const seesLoad = showLoad || request.newSupervisorId === viewerUserId;
  const load = seesLoad && request.newSupervisorId ? await loadOf(request.newSupervisorId) : undefined;
  return toDto(request, { viewerUserId, load });
}

// ── Notifications ────────────────────────────────────────────────────────────────────

async function notify(userIds, title, message, data = {}) {
  const targets = [...new Set((userIds ?? []).filter(Boolean))];
  if (targets.length === 0) return;
  await createNotificationsForUsers(targets, { title, message });
  sendFcmToUsers(targets, { title, body: message, data: { type: "thesis_change_request", ...data } }).catch((error) =>
    console.error("[FCM] Error sending change request notification:", error?.message || error),
  );
}

async function findKadepUserIds() {
  return (await repo.findUsersWithRole(ROLES.KETUA_DEPARTEMEN)).map((user) => user.id);
}

function describe(request) {
  const student = request.thesis?.student?.user?.fullName ?? "mahasiswa";
  return `Pengajuan Perubahan Tugas Akhir (${CHANGE_REQUEST_TYPE_LABELS[request.requestType]}) untuk ${student}`;
}

/** Tells whoever acts next that the request is waiting for them. */
async function notifyNextActor(request) {
  const next = pendingStep(request);
  const data = { requestId: request.id, thesisId: request.thesisId };
  if (next) {
    await notify([next.lecturerId], "Pengajuan Perubahan Tugas Akhir", `${describe(request)} menunggu persetujuan Anda.`, data);
  } else {
    await notify(await findKadepUserIds(), "Pengajuan Perubahan Tugas Akhir", `${describe(request)} menunggu keputusan Ketua Departemen.`, data);
  }
}

/** Everyone a request concerns: student, requester, and the supervisors named in it. */
function partiesOf(request) {
  return [
    request.thesis?.student?.user?.id,
    request.requestedByUserId,
    request.replacedSupervisorLecturerId,
    request.newSupervisorId,
    ...(request.thesis?.thesisSupervisors ?? []).map((s) => s.lecturerId),
  ];
}

// ── Reading ──────────────────────────────────────────────────────────────────────────

/**
 * What a thesis page shows about change requests: whether one may be made (and why not),
 * the open request and the history. `thesisId` omitted = the caller's own thesis.
 */
export async function getThesisChangeContext(userId, thesisId = null) {
  const targetId = thesisId ?? (await repo.findStudentThesisId(userId));
  if (!targetId) {
    return { thesis: null, viewerRole: "student", canSubmit: false, blockReason: "Anda belum memiliki tugas akhir.", openRequest: null, history: [] };
  }
  const thesis = await repo.findThesisForChange(targetId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");

  const viewerRole = viewerRoleOn(thesis, userId);
  if (!viewerRole) throw new ForbiddenError("Anda tidak memiliki akses ke tugas akhir ini.");

  const requests = await repo.findByThesisId(thesis.id);
  const open = requests.find((request) => request.status === CHANGE_REQUEST_STATUS.PENDING) ?? null;
  const blockReason =
    getChangeBlockReason(thesis, { hasOpenRequest: !!open }) ??
    (viewerRole === SUPERVISOR_POSITION.P2
      ? "Perubahan diajukan oleh mahasiswa atau Pembimbing 1. Sebagai Pembimbing 2, Anda dapat mengalihkan posisi Anda lewat tombol Alihkan Mahasiswa."
      : null);

  return {
    thesis: {
      id: thesis.id,
      title: thesis.title,
      status: thesis.status,
      topic: thesis.thesisTopic ?? null,
      supervisors: thesis.thesisSupervisors.map((s) => ({
        lecturerId: s.lecturerId,
        name: s.lecturer?.user?.fullName ?? null,
        position: positionOfRoleName(s.role?.name),
      })),
    },
    viewerRole,
    canSubmit: !blockReason,
    blockReason,
    openRequest: open ? await toDtoFor(open, userId) : null,
    history: await Promise.all(
      requests.filter((request) => request.status !== CHANGE_REQUEST_STATUS.PENDING).map((request) => toDtoFor(request, userId)),
    ),
  };
}

/** Lecturers who may fill a supervisor position, for the request form. */
export async function getSupervisorOptions(position) {
  const positions = POSITION_ROLE_NAME[position] ? [position] : Object.keys(POSITION_ROLE_NAME);
  const byId = new Map();
  for (const key of positions) {
    for (const user of await repo.findUsersWithRole(POSITION_ROLE_NAME[key])) {
      const entry = byId.get(user.id) ?? { id: user.id, name: user.fullName, identityNumber: user.identityNumber, positions: [] };
      entry.positions.push(key);
      byId.set(user.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** A lecturer's queue: steps waiting for them, and every request they are part of. */
export async function listForLecturer(userId) {
  const requests = await repo.findForLecturer(userId);
  const rows = await Promise.all(requests.map((request) => toDtoFor(request, userId)));
  return {
    // Waiting for this lecturer's own step.
    awaitingMe: rows.filter((row) => row.viewer.canDecideAsLecturer),
    // Still running, waiting for someone else.
    inProgress: rows.filter((row) => row.status === CHANGE_REQUEST_STATUS.PENDING && !row.viewer.canDecideAsLecturer),
    history: rows.filter((row) => row.status !== CHANGE_REQUEST_STATUS.PENDING),
  };
}

/** Department queue (Ketua Departemen): pending requests or the closed ones. */
export async function listForDepartment(userId, { scope = "pending", search = "", page = 1, pageSize = 20 } = {}) {
  const safeScope = scope === "history" ? "history" : "pending";
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const { rows, total } = await repo.findForDepartment({ scope: safeScope, search: String(search || "").trim(), page: safePage, pageSize: safePageSize });
  return {
    data: await Promise.all(rows.map((request) => toDtoFor(request, userId, { showLoad: true }))),
    meta: { page: safePage, pageSize: safePageSize, total, totalPages: Math.max(Math.ceil(total / safePageSize), 1) },
  };
}

export function countPending() {
  return repo.countPending();
}

// ── Writing ──────────────────────────────────────────────────────────────────────────

async function createRequest(tx, thesis, requesterUserId, input, batchId = null) {
  const open = await repo.findOpenByThesisId(thesis.id, tx);
  const blockReason = getChangeBlockReason(thesis, { hasOpenRequest: !!open });
  if (blockReason) throw new BadRequestError(blockReason);

  const plan = await buildRequestPlan(tx, thesis, requesterUserId, input);
  const created = await tx.thesisChangeRequest.create({
    data: {
      thesisId: thesis.id,
      reason: String(input.reason).trim(),
      requestedByUserId: requesterUserId,
      batchId,
      ...plan.data,
      approvals: { create: plan.approvals },
    },
    select: { id: true },
  });
  await tx.auditLog.create({
    data: {
      userId: requesterUserId,
      action: AUDIT_ACTIONS.CHANGE_REQUEST_CREATED,
      entity: ENTITY_TYPES.THESIS_CHANGE_REQUEST,
      entityId: created.id,
      changes: { oldValues: null, newValues: { thesisId: thesis.id, batchId, ...plan.data }, metadata: null },
    },
  });
  return created.id;
}

async function announceCreated(requestId, requesterUserId) {
  const request = await repo.findById(requestId);
  await notifyNextActor(request);
  // Informed, not asked: the student (when a supervisor submits) and every active supervisor
  // who has no step in the chain, e.g. Pembimbing 2 for a title-only request.
  const approverIds = request.approvals.map((approval) => approval.lecturerId);
  const informed = [
    request.thesis?.student?.user?.id,
    ...(request.thesis?.thesisSupervisors ?? []).map((s) => s.lecturerId).filter((id) => !approverIds.includes(id)),
  ].filter((id) => id && id !== requesterUserId);
  await notify(informed, "Pengajuan Perubahan Tugas Akhir", `${describe(request)} telah diajukan.`, { requestId, thesisId: request.thesisId });
  return request;
}

/** Student or supervisor submits one change request. */
export async function submitRequest(userId, input) {
  const thesisId = input.thesisId ?? (await repo.findStudentThesisId(userId));
  if (!thesisId) throw new BadRequestError("Anda belum memiliki tugas akhir.");

  const requestId = await prisma.$transaction(async (tx) => {
    const thesis = await repo.findThesisForChange(thesisId, tx);
    if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");
    assertMaySubmit(thesis, userId, input);
    return createRequest(tx, thesis, userId, input);
  });

  return toDtoFor(await announceCreated(requestId, userId), userId);
}

/**
 * "Alihkan Mahasiswa": a supervisor hands over their own position on several theses to one
 * lecturer. One request per thesis, all with the same `batchId`. Nothing is created unless
 * every thesis passes the rules.
 */
export async function submitTransfer(userId, { thesisIds, newSupervisorId, reason }) {
  const ids = [...new Set(thesisIds ?? [])];
  if (ids.length === 0) throw new BadRequestError("Pilih minimal satu mahasiswa.");
  if (newSupervisorId === userId) throw new BadRequestError("Mahasiswa tidak dapat dialihkan kepada diri sendiri.");

  const batchId = randomUUID();
  const requestIds = await prisma.$transaction(async (tx) => {
    const problems = [];
    const created = [];
    for (const thesisId of ids) {
      const thesis = await repo.findThesisForChange(thesisId, tx);
      const name = thesis?.student?.user?.fullName ?? thesisId;
      const position = thesis ? viewerRoleOn(thesis, userId) : null;
      if (!thesis || !POSITION_ROLE_NAME[position]) {
        problems.push(`${name}: Anda bukan pembimbing aktif tugas akhir ini.`);
        continue;
      }
      try {
        created.push(
          await createRequest(
            tx,
            thesis,
            userId,
            { requestType: CHANGE_REQUEST_TYPE.SUPERVISOR, supervisorRole: position, newSupervisorId, reason },
            batchId,
          ),
        );
      } catch (error) {
        if (!error?.statusCode || error.statusCode >= 500) throw error;
        problems.push(`${name}: ${error.message}`);
      }
    }
    if (problems.length > 0) {
      throw new BadRequestError(`Pengalihan tidak dapat diajukan. ${problems.join(" ")}`);
    }
    return created;
  });

  const requests = [];
  for (const requestId of requestIds) {
    requests.push(await toDtoFor(await announceCreated(requestId, userId), userId));
  }
  return { batchId, requests };
}

async function loadPendingRequest(tx, requestId) {
  const request = await repo.findById(requestId, tx);
  if (!request) throw new NotFoundError("Pengajuan perubahan tidak ditemukan.");
  if (request.status !== CHANGE_REQUEST_STATUS.PENDING) {
    throw new BadRequestError("Pengajuan perubahan ini sudah ditutup.");
  }
  return request;
}

async function closeRequest(tx, request, status, userId, notes, now, action) {
  await tx.thesisChangeRequest.update({
    where: { id: request.id },
    data: { status, decidedByUserId: userId, decisionNotes: notes || null, decidedAt: now },
  });
  await tx.auditLog.create({
    data: {
      userId,
      action,
      entity: ENTITY_TYPES.THESIS_CHANGE_REQUEST,
      entityId: request.id,
      changes: { oldValues: { status: request.status }, newValues: { status, notes: notes || null }, metadata: null },
    },
  });
}

/** A lecturer approves or rejects their own step. A rejection closes the request. */
export async function decideAsLecturer(userId, requestId, { approve, notes }) {
  const reason = String(notes ?? "").trim();
  if (!approve && !reason) throw new BadRequestError("Alasan penolakan wajib diisi.");

  await prisma.$transaction(async (tx) => {
    const request = await loadPendingRequest(tx, requestId);
    const step = pendingStep(request);
    if (!step || step.lecturerId !== userId) {
      throw new ForbiddenError("Pengajuan ini tidak sedang menunggu persetujuan Anda.");
    }
    const now = new Date();
    await tx.thesisChangeRequestApproval.update({
      where: { id: step.id },
      data: { status: approve ? "approved" : "rejected", notes: reason || null, decidedAt: now },
    });
    if (approve) {
      await tx.auditLog.create({
        data: {
          userId,
          action: AUDIT_ACTIONS.CHANGE_REQUEST_REVIEWED,
          entity: ENTITY_TYPES.THESIS_CHANGE_REQUEST,
          entityId: request.id,
          changes: { oldValues: null, newValues: { step: step.role, status: "approved", notes: reason || null }, metadata: null },
        },
      });
    } else {
      await closeRequest(tx, request, CHANGE_REQUEST_STATUS.REJECTED, userId, reason, now, AUDIT_ACTIONS.CHANGE_REQUEST_REJECTED);
    }
  });

  const request = await repo.findById(requestId);
  const data = { requestId, thesisId: request.thesisId };
  if (approve) {
    await notifyNextActor(request);
    await notify([request.requestedByUserId], "Pengajuan Perubahan Tugas Akhir", `${describe(request)} disetujui pada satu langkah dan dilanjutkan ke langkah berikutnya.`, data);
  } else {
    await notify(
      partiesOf(request).filter((id) => id !== userId),
      "Pengajuan Perubahan Tugas Akhir Ditolak",
      `${describe(request)} ditolak. Alasan: ${reason}`,
      data,
    );
  }
  return toDtoFor(request, userId);
}

/** The requester withdraws a request that the Ketua Departemen has not decided. */
export async function cancelRequest(userId, requestId) {
  await prisma.$transaction(async (tx) => {
    const request = await loadPendingRequest(tx, requestId);
    if (request.requestedByUserId !== userId) {
      throw new ForbiddenError("Hanya pengaju yang dapat membatalkan pengajuan ini.");
    }
    await closeRequest(tx, request, CHANGE_REQUEST_STATUS.CANCELLED, userId, "Dibatalkan oleh pengaju.", new Date(), AUDIT_ACTIONS.CHANGE_REQUEST_CANCELLED);
  });

  const request = await repo.findById(requestId);
  await notify(
    [...request.approvals.map((approval) => approval.lecturerId), request.thesis?.student?.user?.id].filter((id) => id !== userId),
    "Pengajuan Perubahan Tugas Akhir Dibatalkan",
    `${describe(request)} dibatalkan oleh pengaju.`,
    { requestId, thesisId: request.thesisId },
  );
  return toDtoFor(request, userId);
}

/**
 * Applies an approved change to the thesis inside `tx`:
 * - title and topic are updated;
 * - the replaced supervisor relation becomes `released`, and so does the other relation of
 *   a lecturer who moves up (Pembimbing 2 becoming Pembimbing 1 leaves Pembimbing 2 empty);
 * - the new relation is created active with `seminarReady` / `defenceReady` false;
 * - open sessions (requested, scheduled) of a lecturer who no longer supervises the thesis
 *   are cancelled by the system with a reason; completed sessions still count;
 * - the supervision clock and the milestones are not touched.
 */
export async function applyApprovedChange(tx, request, now = new Date()) {
  const thesis = await repo.findThesisForChange(request.thesisId, tx);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");
  if (thesis.status !== THESIS_STATUS.RESEARCH) {
    throw new BadRequestError(`Perubahan tidak dapat diterapkan: tugas akhir berstatus "${THESIS_STATUS_LABELS[thesis.status] ?? "-"}".`);
  }

  const effects = { releasedLecturerIds: [], cancelledGuidances: 0 };

  if (changesTitle(request.requestType)) {
    await tx.thesis.update({
      where: { id: thesis.id },
      data: { title: request.newTitle, ...(request.newTopicId ? { thesisTopicId: request.newTopicId } : {}) },
    });
  }

  if (changesSupervisor(request.requestType)) {
    const roles = await getCanonicalSupervisorRoles(tx);
    const role = request.supervisorRole === SUPERVISOR_POSITION.P1 ? roles.pembimbing1 : roles.pembimbing2;
    const atPosition = thesis.thesisSupervisors.find((s) => s.roleId === role.id) ?? null;
    if ((atPosition?.lecturerId ?? null) !== (request.replacedSupervisorLecturerId ?? null)) {
      throw new BadRequestError("Susunan pembimbing sudah berubah sejak pengajuan dibuat. Tolak pengajuan ini dan minta pengajuan baru.");
    }
    // The new supervisor's other relation on this thesis ends: that position becomes empty.
    const otherRelation = thesis.thesisSupervisors.find((s) => s.lecturerId === request.newSupervisorId) ?? null;
    if (otherRelation && otherRelation.roleId === roles.pembimbing1.id) {
      throw new BadRequestError("Pembimbing 1 tidak dapat dipindahkan menjadi Pembimbing 2.");
    }

    const endedIds = [atPosition?.id, otherRelation?.id].filter(Boolean);
    if (endedIds.length > 0) {
      await tx.thesisSupervisors.updateMany({
        where: { id: { in: endedIds } },
        data: { status: "released", activeRoleKey: null },
      });
    }
    await tx.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: request.newSupervisorId,
        roleId: role.id,
        activeRoleKey: `${thesis.id}:${role.id}`,
        seminarReady: false,
        defenceReady: false,
      },
    });

    // Only a lecturer who no longer supervises this thesis loses their open sessions.
    effects.releasedLecturerIds = atPosition && atPosition.lecturerId !== request.newSupervisorId ? [atPosition.lecturerId] : [];
    if (effects.releasedLecturerIds.length > 0) {
      const cancelled = await tx.thesisGuidance.updateMany({
        where: {
          thesisId: thesis.id,
          supervisorId: { in: effects.releasedLecturerIds },
          status: { in: SLOT_HOLDING_GUIDANCE_STATUSES },
        },
        data: {
          status: GUIDANCE_STATUS.CANCELLED,
          cancelReason: SYSTEM_CANCEL_REASON_SUPERVISOR_CHANGED,
          cancelledAt: now,
          cancelledBy: GUIDANCE_ACTOR.SYSTEM,
        },
      });
      effects.cancelledGuidances = cancelled.count ?? 0;
    }
    if (thesis.academicYearId) {
      for (const lecturerId of new Set([...effects.releasedLecturerIds, request.newSupervisorId])) {
        await syncQuotaCount(tx, lecturerId, thesis.academicYearId);
      }
    }
  }

  await tx.thesisChangeRequest.update({ where: { id: request.id }, data: { appliedAt: now } });
  return effects;
}

async function decideInTransaction(tx, userId, requestId, { approve, notes }) {
  const request = await loadPendingRequest(tx, requestId);
  const reason = String(notes ?? "").trim();
  if (!approve && !reason) throw new BadRequestError("Alasan penolakan wajib diisi.");
  if (!lecturerStepsDone(request) && !reason) {
    throw new BadRequestError("Langkah persetujuan dosen belum selesai. Alasan wajib diisi untuk memutuskan langsung.");
  }
  const now = new Date();
  await closeRequest(
    tx,
    request,
    approve ? CHANGE_REQUEST_STATUS.APPROVED : CHANGE_REQUEST_STATUS.REJECTED,
    userId,
    reason,
    now,
    approve ? AUDIT_ACTIONS.CHANGE_REQUEST_APPROVED : AUDIT_ACTIONS.CHANGE_REQUEST_REJECTED,
  );
  return approve ? applyApprovedChange(tx, request, now) : null;
}

async function announceDecision(requestId, userId, approve) {
  const request = await repo.findById(requestId);
  await notify(
    partiesOf(request).filter((id) => id !== userId),
    approve ? "Pengajuan Perubahan Tugas Akhir Disetujui" : "Pengajuan Perubahan Tugas Akhir Ditolak",
    approve
      ? `${describe(request)} disetujui Ketua Departemen dan sudah diterapkan.`
      : `${describe(request)} ditolak Ketua Departemen. Alasan: ${request.decisionNotes ?? "-"}`,
    { requestId, thesisId: request.thesisId },
  );
  return request;
}

/** The Ketua Departemen approves (the change is applied) or rejects a request. */
export async function decideAsKadep(userId, requestId, decision) {
  await prisma.$transaction((tx) => decideInTransaction(tx, userId, requestId, decision));
  return toDtoFor(await announceDecision(requestId, userId, !!decision.approve), userId, { showLoad: true });
}

/**
 * The Ketua Departemen decides every pending request of a batch with one decision. Each
 * request is decided in its own transaction, so one that cannot be applied is reported and
 * does not block the others.
 */
export async function decideBatchAsKadep(userId, batchId, decision) {
  const pending = await repo.findPendingByBatchId(batchId);
  if (pending.length === 0) throw new NotFoundError("Tidak ada pengajuan yang menunggu keputusan pada kelompok ini.");

  const results = [];
  for (const request of pending) {
    const student = request.thesis?.student?.user?.fullName ?? null;
    try {
      await prisma.$transaction((tx) => decideInTransaction(tx, userId, request.id, decision));
      await announceDecision(request.id, userId, !!decision.approve);
      results.push({ requestId: request.id, student, success: true, message: null });
    } catch (error) {
      if (!error?.statusCode || error.statusCode >= 500) throw error;
      results.push({ requestId: request.id, student, success: false, message: error.message });
    }
  }
  return { batchId, decided: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length, results };
}
