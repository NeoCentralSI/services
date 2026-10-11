/**
 * Thesis lifecycle rules (K15 transitions, K21 data master).
 *
 * One place that decides:
 * - which status transitions are allowed;
 * - "one open thesis per student" (proposal / research / on_leave);
 * - what a status change writes: `failed` needs a termination reason and, in the same
 *   transaction, releases every active supervisor relation and cancels open guidance
 *   sessions; `on_leave` remembers the previous status and the start date; leaving
 *   `on_leave` only goes back to that previous status; `statusChangedAt` is always set;
 *   leaving `on_leave` adds the days spent on leave to `totalLeaveDays`;
 * - the audit log entry of every status change.
 *
 * Callers pass a Prisma transaction client (`tx`) so the change is atomic.
 */
import {
  THESIS_STATUS,
  OPEN_THESIS_STATUSES,
  THESIS_TERMINATION_REASON,
} from "../constants/thesisStatus.js";
import { THESIS_STATUS_LABELS, THESIS_TERMINATION_REASON_LABELS } from "../constants/thesisLabels.js";
import { GUIDANCE_STATUS, GUIDANCE_ACTOR, OPEN_GUIDANCE_STATUSES } from "../constants/guidanceStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { syncQuotaCount } from "../utils/quotaSync.js";
import { wholeDaysBetween } from "../helpers/thesis-progress.helper.js";

/** K15: allowed status transitions. `on_leave` may only return to `statusBeforeLeave`. */
export const THESIS_STATUS_TRANSITIONS = Object.freeze({
  [THESIS_STATUS.PROPOSAL]: [THESIS_STATUS.RESEARCH, THESIS_STATUS.ON_LEAVE, THESIS_STATUS.FAILED],
  [THESIS_STATUS.RESEARCH]: [THESIS_STATUS.ON_LEAVE, THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED],
  [THESIS_STATUS.ON_LEAVE]: [THESIS_STATUS.PROPOSAL, THESIS_STATUS.RESEARCH, THESIS_STATUS.FAILED],
  [THESIS_STATUS.COMPLETED]: [],
  [THESIS_STATUS.FAILED]: [],
});

/** Statuses a thesis may be created with through the data master. */
export const CREATABLE_THESIS_STATUSES = Object.freeze([
  THESIS_STATUS.PROPOSAL,
  THESIS_STATUS.RESEARCH,
  THESIS_STATUS.COMPLETED,
  THESIS_STATUS.FAILED,
]);

/** Reason text written on guidance sessions cancelled by a thesis termination. */
export const SYSTEM_CANCEL_REASON = "Dibatalkan otomatis: tugas akhir dihentikan (status Gagal).";
/** Reason text written on guidance sessions cancelled when a thesis repeats its proposal. */
export const REPEAT_PROPOSAL_CANCEL_REASON = "Dibatalkan otomatis: mengulang proposal berdasarkan evaluasi bimbingan.";

const label = (status) => THESIS_STATUS_LABELS[status] ?? status;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/** Validates a termination reason value (enum value or its Indonesian label). */
export function parseTerminationReason(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const values = Object.values(THESIS_TERMINATION_REASON);
  if (values.includes(text)) return text;
  const byLabel = Object.entries(THESIS_TERMINATION_REASON_LABELS).find(
    ([, l]) => l.toLowerCase() === text.toLowerCase(),
  );
  return byLabel ? byLabel[0] : null;
}

/**
 * K21: rejects a change that would give a student two open theses.
 * @param {object} tx Prisma client/transaction
 */
export async function assertSingleOpenThesis(tx, studentId, { excludeThesisId = null } = {}) {
  const open = await tx.thesis.findFirst({
    where: {
      studentId,
      status: { in: OPEN_THESIS_STATUSES },
      ...(excludeThesisId ? { id: { not: excludeThesisId } } : {}),
    },
    select: { id: true, title: true, status: true },
  });
  if (open) {
    throw badRequest(
      `Mahasiswa masih memiliki tugas akhir berstatus "${label(open.status)}". Satu mahasiswa hanya boleh memiliki satu tugas akhir yang belum selesai; ubah atau selesaikan tugas akhir tersebut lebih dulu.`,
    );
  }
}

/** Throws 400 when `from -> to` is not an allowed K15 transition. */
export function assertStatusTransition(thesis, toStatus) {
  const from = thesis.status;
  if (from === toStatus) return;
  const allowed = THESIS_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(toStatus)) {
    const closed = allowed.length === 0;
    throw badRequest(
      closed
        ? `Tugas akhir berstatus "${label(from)}" tidak dapat diubah lagi.`
        : `Status tugas akhir tidak dapat diubah dari "${label(from)}" ke "${label(toStatus)}".`,
    );
  }
  if (from === THESIS_STATUS.ON_LEAVE && toStatus !== THESIS_STATUS.FAILED) {
    const back = thesis.statusBeforeLeave ?? THESIS_STATUS.RESEARCH;
    if (toStatus !== back) {
      throw badRequest(
        `Tugas akhir yang sedang "${label(THESIS_STATUS.ON_LEAVE)}" hanya dapat kembali ke status sebelumnya ("${label(back)}").`,
      );
    }
  }
}

/**
 * Columns written for a status change (not including side effects).
 * @returns {object} Prisma `data` for thesis.update/create
 */
export function statusChangeData(thesis, toStatus, { actorUserId = null, terminationReason, terminationNote, now = new Date() } = {}) {
  const data = { status: toStatus, statusChangedAt: now };
  if (toStatus === THESIS_STATUS.FAILED) {
    const reason = parseTerminationReason(terminationReason);
    if (!reason) {
      throw badRequest(
        `Alasan penghentian wajib diisi saat mengubah status menjadi "${label(THESIS_STATUS.FAILED)}" (${Object.values(THESIS_TERMINATION_REASON_LABELS).join(", ")}).`,
      );
    }
    data.terminationReason = reason;
    data.terminationNote = String(terminationNote ?? "").trim() || null;
    data.terminatedAt = now;
    data.terminatedByUserId = actorUserId;
  }
  // The supervision clock starts when a thesis enters research without a start date (a
  // thesis that repeated its proposal had it cleared).
  if (toStatus === THESIS_STATUS.RESEARCH && thesis?.status === THESIS_STATUS.PROPOSAL && !thesis.startDate) {
    data.startDate = now;
  }
  if (toStatus === THESIS_STATUS.ON_LEAVE) {
    data.statusBeforeLeave = thesis?.status ?? THESIS_STATUS.RESEARCH;
    data.leaveStartedAt = now;
  } else if (thesis?.status === THESIS_STATUS.ON_LEAVE) {
    data.statusBeforeLeave = null;
    data.leaveStartedAt = null;
    // The supervision clock does not count leave: remember how long this leave lasted.
    const leaveDays = wholeDaysBetween(thesis.leaveStartedAt, now) ?? 0;
    if (leaveDays > 0) data.totalLeaveDays = { increment: leaveDays };
  }
  return data;
}

/**
 * Side effects of a termination, in the caller's transaction:
 * active supervisor relations -> released; open guidance sessions -> cancelled (system).
 * @returns {{ releasedLecturerIds: string[], cancelledGuidances: number }}
 */
export async function applyTerminationSideEffects(tx, thesisId, { now = new Date() } = {}) {
  const active = await tx.thesisSupervisors.findMany({
    where: { thesisId, status: "active" },
    select: { id: true, lecturerId: true },
  });
  if (active.length > 0) {
    await tx.thesisSupervisors.updateMany({
      where: { id: { in: active.map((s) => s.id) } },
      data: { status: "released", activeRoleKey: null },
    });
  }
  const cancelled = await tx.thesisGuidance.updateMany({
    where: { thesisId, status: { in: OPEN_GUIDANCE_STATUSES } },
    data: {
      status: GUIDANCE_STATUS.CANCELLED,
      cancelReason: SYSTEM_CANCEL_REASON,
      cancelledAt: now,
      cancelledBy: GUIDANCE_ACTOR.SYSTEM,
    },
  });
  return { releasedLecturerIds: [...new Set(active.map((s) => s.lecturerId))], cancelledGuidances: cancelled.count ?? 0 };
}

/**
 * Applies a validated status change to an existing thesis inside `tx`.
 * Returns the updated thesis and what the termination touched (if any).
 */
export async function changeThesisStatus(tx, thesis, toStatus, options = {}) {
  const { actorUserId = null, now = new Date() } = options;
  if (!toStatus || toStatus === thesis.status) return { thesis, changed: false };
  assertStatusTransition(thesis, toStatus);
  const fromStatus = thesis.status;
  const data = statusChangeData(thesis, toStatus, { ...options, now });
  const updated = await tx.thesis.update({ where: { id: thesis.id }, data });

  let effects = { releasedLecturerIds: [], cancelledGuidances: 0 };
  if (toStatus === THESIS_STATUS.FAILED) {
    effects = await applyTerminationSideEffects(tx, thesis.id, { now });
    const ayId = updated.academicYearId;
    if (ayId) {
      for (const lecturerId of effects.releasedLecturerIds) {
        await syncQuotaCount(tx, lecturerId, ayId);
      }
    }
  }

  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: AUDIT_ACTIONS.THESIS_STATUS_CHANGED,
      entity: ENTITY_TYPES.THESIS,
      entityId: thesis.id,
      changes: {
        oldValues: { status: fromStatus },
        newValues: {
          status: toStatus,
          terminationReason: data.terminationReason ?? null,
          terminationNote: data.terminationNote ?? null,
          statusBeforeLeave: data.statusBeforeLeave ?? null,
        },
        metadata: { releasedSupervisors: effects.releasedLecturerIds.length, cancelledGuidances: effects.cancelledGuidances },
      },
    },
  });

  return { thesis: updated, changed: true, ...effects };
}

/**
 * "Mengulang proposal": research -> proposal. This transition is not in
 * `THESIS_STATUS_TRANSITIONS` on purpose: the data master cannot make it; only an approved
 * guidance evaluation calls this function.
 *
 * Supervisors and the title stay. Open guidance sessions are cancelled by the system. The
 * start date is cleared (and the leave days with it), so the supervision clock starts again
 * when the thesis returns to research.
 * @returns {{ thesis: object, cancelledGuidances: number }}
 */
export async function returnThesisToProposal(tx, thesis, { actorUserId = null, evaluationId = null, now = new Date() } = {}) {
  if (thesis.status !== THESIS_STATUS.RESEARCH) {
    throw badRequest(
      `Hanya tugas akhir berstatus "${label(THESIS_STATUS.RESEARCH)}" yang dapat mengulang proposal. Status saat ini "${label(thesis.status)}".`,
    );
  }
  const updated = await tx.thesis.update({
    where: { id: thesis.id },
    data: { status: THESIS_STATUS.PROPOSAL, statusChangedAt: now, startDate: null, totalLeaveDays: 0 },
  });
  const cancelled = await tx.thesisGuidance.updateMany({
    where: { thesisId: thesis.id, status: { in: OPEN_GUIDANCE_STATUSES } },
    data: {
      status: GUIDANCE_STATUS.CANCELLED,
      cancelReason: REPEAT_PROPOSAL_CANCEL_REASON,
      cancelledAt: now,
      cancelledBy: GUIDANCE_ACTOR.SYSTEM,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: AUDIT_ACTIONS.THESIS_STATUS_CHANGED,
      entity: ENTITY_TYPES.THESIS,
      entityId: thesis.id,
      changes: {
        oldValues: { status: THESIS_STATUS.RESEARCH, startDate: thesis.startDate ?? null },
        newValues: { status: THESIS_STATUS.PROPOSAL, startDate: null },
        metadata: { source: "guidance-evaluation", evaluationId, cancelledGuidances: cancelled.count ?? 0 },
      },
    },
  });
  return { thesis: updated, cancelledGuidances: cancelled.count ?? 0 };
}
