/**
 * Thesis lifecycle rules (status transitions and the data master).
 *
 * One place that decides:
 * - which status transitions are allowed;
 * - "one open thesis per student" (proposal / research);
 * - what a status change writes: `failed` needs a termination reason and, in the same
 *   transaction, releases every active supervisor relation, cancels open guidance
 *   sessions and closes pending change requests; `statusChangedAt` is always set;
 * - what a student status change does to the open thesis (`applyStudentStatusChange`):
 *   leave pauses it, returning to active resumes it, withdrawing or dropping out ends it;
 * - the audit log entry of every status change.
 *
 * Callers pass a Prisma transaction client (`tx`) so the change is atomic.
 */
import {
  THESIS_STATUS,
  OPEN_THESIS_STATUSES,
  THESIS_TERMINATION_REASON,
  STUDENT_STATUS,
} from "../constants/thesisStatus.js";
import {
  THESIS_STATUS_LABELS,
  THESIS_TERMINATION_REASON_LABELS,
  STUDENT_STATUS_LABELS,
} from "../constants/thesisLabels.js";
import { GUIDANCE_STATUS, GUIDANCE_ACTOR, OPEN_GUIDANCE_STATUSES } from "../constants/guidanceStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { wholeDaysBetween } from "../helpers/thesis-progress.helper.js";
import prisma from "../config/prisma.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";

/** Allowed status transitions. Leave is not a thesis status: it follows the student status. */
export const THESIS_STATUS_TRANSITIONS = Object.freeze({
  [THESIS_STATUS.PROPOSAL]: [THESIS_STATUS.RESEARCH, THESIS_STATUS.FAILED],
  [THESIS_STATUS.RESEARCH]: [THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED],
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
/** Reason text written on change requests closed by a thesis termination. */
export const TERMINATION_CHANGE_REQUEST_NOTE = "Ditutup otomatis: tugas akhir dihentikan (status Gagal).";
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
 * Rejects a change that would give a student two open theses.
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

/** Throws 400 when `from -> to` is not an allowed status transition. */
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
  // A thesis that ends during a leave closes the leave too, so the clock stops at the
  // closing date without counting the leave.
  if (toStatus === THESIS_STATUS.FAILED || toStatus === THESIS_STATUS.COMPLETED) {
    Object.assign(data, endLeaveData(thesis, now));
  }
  return data;
}

/** Columns that close a running leave: its days go to `totalLeaveDays`. */
function endLeaveData(thesis, now) {
  if (!thesis?.leaveStartedAt) return {};
  const data = { leaveStartedAt: null };
  const leaveDays = wholeDaysBetween(thesis.leaveStartedAt, now) ?? 0;
  if (leaveDays > 0) data.totalLeaveDays = { increment: leaveDays };
  return data;
}

/**
 * Side effects of a termination, in the caller's transaction:
 * active supervisor relations -> released; open guidance sessions -> cancelled (system);
 * pending change requests -> cancelled.
 * @returns {{ releasedLecturerIds: string[], cancelledGuidances: number, cancelledChangeRequests: number }}
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
  const changeRequests = await tx.thesisChangeRequest.updateMany({
    where: { thesisId, status: "pending" },
    data: { status: "cancelled", decisionNotes: TERMINATION_CHANGE_REQUEST_NOTE, decidedAt: now, decidedByUserId: null },
  });
  return {
    releasedLecturerIds: [...new Set(active.map((s) => s.lecturerId))],
    cancelledGuidances: cancelled.count ?? 0,
    cancelledChangeRequests: changeRequests.count ?? 0,
  };
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

  let effects = { releasedLecturerIds: [], cancelledGuidances: 0, cancelledChangeRequests: 0 };
  if (toStatus === THESIS_STATUS.FAILED) {
    effects = await applyTerminationSideEffects(tx, thesis.id, { now });
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
        },
        metadata: {
          ...(options.source ? { source: options.source } : {}),
          releasedSupervisors: effects.releasedLecturerIds.length,
          cancelledGuidances: effects.cancelledGuidances,
          cancelledChangeRequests: effects.cancelledChangeRequests,
        },
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

// ── The student status drives leave and termination ──────────────────

/** Termination reason written when the student status ends the studies. */
const TERMINATION_BY_STUDENT_STATUS = Object.freeze({
  [STUDENT_STATUS.WITHDRAWN]: THESIS_TERMINATION_REASON.WITHDRAWN,
  [STUDENT_STATUS.DROPPED_OUT]: THESIS_TERMINATION_REASON.DROPPED_OUT,
});

/** Notes written on what the system closes when the student withdraws or drops out. */
export const STUDENT_STATUS_EVALUATION_NOTE = "Ditutup otomatis: mahasiswa berhenti studi.";

const studentStatusLabel = (status) => STUDENT_STATUS_LABELS[status] ?? status;

/**
 * Changes `students.student_status`, the only source of leave and of the end of studies, and
 * what follows for the open thesis (`proposal` / `research`), all in the caller's transaction:
 * - to leave (`bss`): the thesis is paused; `leaveStartedAt` marks the start, so the
 *   supervision clock stops;
 * - from leave back to active: the days on leave go to `totalLeaveDays` and the clock runs on;
 * - to withdrawn / dropped out: the thesis becomes `failed` (reason `withdrawn` /
 *   `dropped_out`), supervisors are released, open sessions cancelled, pending change requests
 *   and evaluations closed;
 * - to graduated: the thesis is left as it is.
 * Every caller (Admin, imports, DevTools, a future SIA sync) goes through this function. The
 * notifications are sent after the commit with `announceStudentStatusChange`.
 *
 * @returns {{ changed: boolean, fromStatus, toStatus, thesisId: string|null, effect: string|null, recipients: string[] }}
 */
export async function applyStudentStatusChange(tx, studentId, toStatus, { actorUserId = null, source = "admin", now = new Date() } = {}) {
  if (!Object.values(STUDENT_STATUS).includes(toStatus)) {
    throw badRequest(`Status mahasiswa tidak dikenal. Pilihan: ${Object.values(STUDENT_STATUS_LABELS).join(", ")}.`);
  }
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, status: true } });
  if (!student) {
    const err = new Error("Mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const fromStatus = student.status;
  const unchanged = { changed: false, fromStatus, toStatus, thesisId: null, effect: null, recipients: [] };
  if (fromStatus === toStatus) return unchanged;

  await tx.student.update({ where: { id: studentId }, data: { status: toStatus } });

  const thesis = await tx.thesis.findFirst({
    where: { studentId, status: { in: OPEN_THESIS_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      startDate: true,
      leaveStartedAt: true,
      student: { select: { user: { select: { id: true } } } },
      thesisSupervisors: { where: { status: "active" }, select: { lecturerId: true } },
    },
  });

  let effect = null;
  let thesisEffects = {};
  if (thesis) {
    if (toStatus === STUDENT_STATUS.ON_LEAVE) {
      if (!thesis.leaveStartedAt) {
        await tx.thesis.update({ where: { id: thesis.id }, data: { leaveStartedAt: now } });
      }
      effect = "paused";
    } else if (TERMINATION_BY_STUDENT_STATUS[toStatus]) {
      const result = await changeThesisStatus(tx, thesis, THESIS_STATUS.FAILED, {
        actorUserId,
        terminationReason: TERMINATION_BY_STUDENT_STATUS[toStatus],
        terminationNote: `Status mahasiswa diubah menjadi ${studentStatusLabel(toStatus)}.`,
        source: "student-status",
        now,
      });
      const evaluations = await tx.thesisGuidanceEvaluation.updateMany({
        where: { thesisId: thesis.id, status: "pending" },
        data: { status: "rejected", kadepNotes: STUDENT_STATUS_EVALUATION_NOTE, kadepApprovedAt: now, kadepApprovedBy: null },
      });
      thesisEffects = {
        releasedSupervisors: result.releasedLecturerIds?.length ?? 0,
        cancelledGuidances: result.cancelledGuidances ?? 0,
        cancelledChangeRequests: result.cancelledChangeRequests ?? 0,
        closedEvaluations: evaluations.count ?? 0,
      };
      effect = "terminated";
    } else if (thesis.leaveStartedAt) {
      // Back from leave (to active, or graduated during a leave): the clock runs on.
      await tx.thesis.update({ where: { id: thesis.id }, data: endLeaveData(thesis, now) });
      effect = "resumed";
    }
  }

  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: AUDIT_ACTIONS.STUDENT_STATUS_CHANGED,
      entity: ENTITY_TYPES.STUDENT,
      entityId: studentId,
      changes: {
        oldValues: { status: fromStatus },
        newValues: { status: toStatus },
        metadata: { source, thesisId: thesis?.id ?? null, thesisEffect: effect, ...thesisEffects },
      },
    },
  });

  const recipients = thesis && effect
    ? [...new Set([thesis.student?.user?.id, ...(thesis.thesisSupervisors ?? []).map((s) => s.lecturerId)].filter(Boolean))]
    : [];
  return { changed: true, fromStatus, toStatus, thesisId: thesis?.id ?? null, effect, recipients };
}

const STUDENT_STATUS_NOTICES = Object.freeze({
  paused: {
    title: "Tugas Akhir Dijeda",
    message: "Status mahasiswa menjadi Cuti. Tugas akhir dijeda: bimbingan dan milestone tidak dapat diubah, dan masa bimbingan berhenti.",
  },
  resumed: {
    title: "Tugas Akhir Dilanjutkan",
    message: "Status mahasiswa kembali Aktif. Tugas akhir dilanjutkan dan masa bimbingan berjalan lagi tanpa menghitung masa cuti.",
  },
  terminated: {
    title: "Tugas Akhir Dihentikan",
    message: "Tugas akhir dihentikan (status Gagal) karena mahasiswa berhenti studi. Relasi pembimbing dilepas dan sesi bimbingan yang terbuka dibatalkan.",
  },
});

/**
 * After the commit: tells the student and the supervisors what the student status change did
 * to the thesis. Never throws.
 */
export async function announceStudentStatusChange(result) {
  const notice = result?.effect ? STUDENT_STATUS_NOTICES[result.effect] : null;
  if (!notice || !result.recipients?.length) return;
  try {
    const { createNotificationsForUsers } = await import("./notification.service.js");
    await createNotificationsForUsers(result.recipients, {
      title: notice.title,
      message: notice.message,
      data: { thesisId: result.thesisId, type: "thesis_lifecycle" },
    });
  } catch (error) {
    console.error("[ThesisLifecycle] notification failed:", error?.message);
  }
}

// ── A passed defence ends the thesis ────────────────────────────────

/** Reason written on what the system closes when a thesis is finished by its defence. */
export const THESIS_COMPLETED_CANCEL_REASON = "Dibatalkan otomatis: tugas akhir selesai.";
/** Notes written on a guidance evaluation that still waited for the Ketua Departemen. */
export const THESIS_COMPLETED_EVALUATION_NOTE = "Ditutup otomatis: tugas akhir selesai.";

async function findThesisForDefenceLifecycle(tx, thesisId) {
  return tx.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      status: true,
      student: { select: { user: { select: { id: true } } } },
      thesisSupervisors: { where: { status: "active" }, select: { lecturerId: true } },
    },
  });
}

const recipientsOf = (thesis) =>
  [...new Set([thesis.student?.user?.id, ...(thesis.thesisSupervisors ?? []).map((s) => s.lecturerId)].filter(Boolean))];

/**
 * A thesis in research becomes Selesai when its defence is passed (without revision, or
 * once the revision is finalized). Called by the defence module inside the transaction of the
 * finalization. In the same transaction:
 * - `status = completed`, `statusChangedAt` (the supervision clock, activity and evaluations
 *   stop; supervision quotas only count open theses);
 * - the supervisor relations stay active, as history;
 * - open guidance sessions and pending change requests are cancelled by the system, and a
 *   guidance evaluation that waited for the Ketua Departemen is closed, all with
 *   THESIS_COMPLETED_CANCEL_REASON;
 * - an audit log entry.
 * A thesis that is not in research is left as it is (`changed: false`). The notifications are
 * sent after the commit with `announceThesisLifecycle`.
 */
export async function completeThesisFromDefence(tx, thesisId, { defenceId = null, actorUserId = null, now = new Date() } = {}) {
  const thesis = await findThesisForDefenceLifecycle(tx, thesisId);
  if (!thesis || thesis.status !== THESIS_STATUS.RESEARCH) {
    return { changed: false, kind: "completed", thesisId, recipients: [] };
  }
  await tx.thesis.update({ where: { id: thesisId }, data: { status: THESIS_STATUS.COMPLETED, statusChangedAt: now } });
  const guidances = await tx.thesisGuidance.updateMany({
    where: { thesisId, status: { in: OPEN_GUIDANCE_STATUSES } },
    data: { status: GUIDANCE_STATUS.CANCELLED, cancelReason: THESIS_COMPLETED_CANCEL_REASON, cancelledAt: now, cancelledBy: GUIDANCE_ACTOR.SYSTEM },
  });
  const changeRequests = await tx.thesisChangeRequest.updateMany({
    where: { thesisId, status: "pending" },
    data: { status: "cancelled", decisionNotes: THESIS_COMPLETED_CANCEL_REASON, decidedAt: now, decidedByUserId: null },
  });
  const evaluations = await tx.thesisGuidanceEvaluation.updateMany({
    where: { thesisId, status: "pending" },
    data: { status: "rejected", kadepNotes: THESIS_COMPLETED_EVALUATION_NOTE, kadepApprovedAt: now, kadepApprovedBy: null },
  });
  const effects = {
    cancelledGuidances: guidances.count ?? 0,
    cancelledChangeRequests: changeRequests.count ?? 0,
    closedEvaluations: evaluations.count ?? 0,
  };
  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: AUDIT_ACTIONS.THESIS_STATUS_CHANGED,
      entity: ENTITY_TYPES.THESIS,
      entityId: thesisId,
      changes: {
        oldValues: { status: THESIS_STATUS.RESEARCH },
        newValues: { status: THESIS_STATUS.COMPLETED },
        metadata: { source: "defence", defenceId, ...effects },
      },
    },
  });
  return { changed: true, kind: "completed", thesisId, recipients: recipientsOf(thesis), ...effects };
}

/**
 * The defence result that made the thesis Selesai was undone (the revision finalization
 * was cancelled, or the defence was cancelled): the thesis returns to research. What was closed
 * when it became Selesai is not restored. The only way back from Selesai, like
 * `returnThesisToProposal` for the evaluation; the data master cannot make it.
 */
export async function reopenThesisFromDefence(tx, thesisId, { defenceId = null, actorUserId = null, reason = null, now = new Date() } = {}) {
  const thesis = await findThesisForDefenceLifecycle(tx, thesisId);
  if (!thesis || thesis.status !== THESIS_STATUS.COMPLETED) {
    return { changed: false, kind: "reopened", thesisId, recipients: [] };
  }
  await tx.thesis.update({ where: { id: thesisId }, data: { status: THESIS_STATUS.RESEARCH, statusChangedAt: now } });
  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action: AUDIT_ACTIONS.THESIS_STATUS_CHANGED,
      entity: ENTITY_TYPES.THESIS,
      entityId: thesisId,
      changes: {
        oldValues: { status: THESIS_STATUS.COMPLETED },
        newValues: { status: THESIS_STATUS.RESEARCH },
        metadata: { source: "defence", defenceId, reason },
      },
    },
  });
  return { changed: true, kind: "reopened", thesisId, reason, recipients: recipientsOf(thesis) };
}

/**
 * After the commit: tells the student and the supervisors that the thesis is finished, or back
 * in research. Never throws (a failed notification does not undo the defence result).
 */
export async function announceThesisLifecycle(result) {
  if (!result?.changed || result.recipients.length === 0) return;
  const completed = result.kind === "completed";
  const title = completed ? "Tugas Akhir Selesai" : "Tugas Akhir Kembali Berstatus Penelitian";
  const message = completed
    ? "Tugas akhir dinyatakan selesai."
    : `Tugas akhir kembali berstatus Penelitian${result.reason ? `: ${result.reason}` : "."}`;
  try {
    const { createNotificationsForUsers } = await import("./notification.service.js");
    await createNotificationsForUsers(result.recipients, { title, message, data: { thesisId: result.thesisId, type: "thesis_lifecycle" } });
  } catch (error) {
    console.error("[ThesisLifecycle] notification failed:", error?.message);
  }
}

// ─── Student actions on a thesis ───────────────────────────────────────────────────────────

export const THESIS_ACTION_BLOCK = Object.freeze({
  ON_LEAVE: "on_leave",
  NOT_TAKING_THESIS: "not_taking_thesis",
  THESIS_COURSE_UNKNOWN: "thesis_course_unknown",
});

export const THESIS_ACTION_BLOCK_REASONS = Object.freeze({
  [THESIS_ACTION_BLOCK.ON_LEAVE]: "Anda sedang cuti. Tugas akhir dijeda selama cuti.",
  [THESIS_ACTION_BLOCK.NOT_TAKING_THESIS]:
    "Anda tidak tercatat mengambil mata kuliah Tugas Akhir semester ini. Hubungi Admin Departemen bila ini keliru.",
  // "Not known yet" blocks like the proposal shield (Pengajuan Pembimbing) does.
  [THESIS_ACTION_BLOCK.THESIS_COURSE_UNKNOWN]: "Data perkuliahan Anda semester ini belum tersedia. Hubungi Admin Departemen.",
});

/** The requirement row shown with the seminar and defence requirements. */
export const TAKING_THESIS_COURSE_LABEL = "Mengambil mata kuliah Tugas Akhir semester ini";

/**
 * Why the student may not act on their thesis now, or null. One rule for every student action
 * of the TA phase (guidance requests and reschedules, milestones, seminar and defence
 * registration, change requests):
 * - a student on leave (K40) cannot act on an open thesis;
 * - a thesis in research needs the student to take the Tugas Akhir course in the operational
 *   semester (K36 flag `taking_thesis_course`), or Metode Penelitian: a proposal that passed this
 *   semester starts research at once, without the TA course (K37). A student recorded as not
 *   taking the TA course is blocked; flags not known yet block too, like the proposal shield.
 * Metode Penelitian only opens guidance, milestones and change requests (K43): seminar and
 * defence registration pass `requireThesisCourse` and always need the TA course itself.
 * Proposal-phase theses are governed by Metode Penelitian and are not blocked by the TA course.
 * Reading, revisions of a held seminar or defence, yudisium, and lecturer or Admin actions are
 * never blocked.
 */
export async function getStudentThesisActionBlock(studentId, { thesis = null, client = prisma, requireThesisCourse = false } = {}) {
  const row = thesis?.status !== undefined && thesis?.studentStatus !== undefined
    ? thesis
    : await client.thesis.findFirst({
      where: { studentId, ...(thesis?.id ? { id: thesis.id } : { status: { in: OPEN_THESIS_STATUSES } }) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, student: { select: { status: true } } },
    });
  const studentStatus = row?.studentStatus ?? row?.student?.status ?? null;
  const flags = await currentSemesterCourseFlags(studentId, client);
  const takingThesisCourse = flags.takingThesisCourse;
  const result = (code) => ({ blocked: !!code, code, reason: code ? THESIS_ACTION_BLOCK_REASONS[code] : null, takingThesisCourse });
  if (!row || !OPEN_THESIS_STATUSES.includes(row.status)) return result(null);
  if (studentStatus === STUDENT_STATUS.ON_LEAVE) return result(THESIS_ACTION_BLOCK.ON_LEAVE);
  if (row.status !== THESIS_STATUS.RESEARCH) return result(null);
  if (takingThesisCourse === true) return result(null);
  if (!requireThesisCourse && flags.eligibleResearchMethod === true) return result(null);
  if (takingThesisCourse === false) return result(THESIS_ACTION_BLOCK.NOT_TAKING_THESIS);
  return result(THESIS_ACTION_BLOCK.THESIS_COURSE_UNKNOWN);
}

/** "Mengambil Tugas Akhir" and "Mengambil Metode Penelitian" of the operational semester (null when not known). */
export async function currentSemesterCourseFlags(studentId, client = prisma) {
  const year = await resolveOperationalAcademicYear(client);
  if (!year) return { takingThesisCourse: null, eligibleResearchMethod: null };
  const row = await client.studentAcademicYearSnapshot.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
    select: { takingThesisCourse: true, eligibleResearchMethod: true },
  });
  return { takingThesisCourse: row?.takingThesisCourse ?? null, eligibleResearchMethod: row?.eligibleResearchMethod ?? null };
}

/** Throws 403 with the reason when the student may not act on the thesis. */
export async function assertStudentThesisActionAllowed(studentId, options = {}) {
  const block = await getStudentThesisActionBlock(studentId, options);
  if (block.blocked) {
    const error = new Error(block.reason);
    error.statusCode = 403;
    error.code = block.code;
    throw error;
  }
  return block;
}
