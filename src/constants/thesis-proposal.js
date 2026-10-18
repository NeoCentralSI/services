/**
 * Thesis proposal domain (Paket P): Pengajuan Pembimbing and Penetapan Pembimbing.
 * Values of `ThesisSupervisorRequestStatus` and `SupervisorRequestRoute`; labels for users are
 * in `thesisLabels.js`.
 */
export const SUPERVISOR_REQUEST_STATUS = Object.freeze({
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  PENDING_KADEP: "pending_kadep",
  REVISION_REQUESTED: "revision_requested",
  ACCEPTED: "accepted",
  ASSIGNED: "assigned",
  REJECTED_BY_LECTURER: "rejected_by_lecturer",
  REJECTED_BY_KADEP: "rejected_by_kadep",
  REDIRECTED: "redirected",
  WITHDRAWN: "withdrawn",
  CANCELLED: "cancelled",
  CLOSED: "closed",
});

const S = SUPERVISOR_REQUEST_STATUS;

/** Waiting for the chosen lecturer. */
export const WAITING_LECTURER_STATUSES = Object.freeze([S.PENDING, S.UNDER_REVIEW]);
/** Waiting for the Head of Department (department route, or over the hard limit). */
export const WAITING_KADEP_STATUSES = Object.freeze([S.PENDING_KADEP]);
/** Accepted (by the lecturer or the Head of Department), waiting for Penetapan Pembimbing. */
export const ACCEPTED_STATUSES = Object.freeze([S.ACCEPTED, S.REDIRECTED]);
/** A student has at most one request in these statuses (rule kept from the old module). */
export const ACTIVE_REQUEST_STATUSES = Object.freeze([
  ...WAITING_LECTURER_STATUSES,
  ...WAITING_KADEP_STATUSES,
  ...ACCEPTED_STATUSES,
  S.ASSIGNED,
]);
/**
 * Paket E5: order of the "Pengajuan Pembimbing" rows of Tugas Akhir > Permohonan: what waits
 * for the lecturer, then what waits for the Head of Department (or the student's revision),
 * then the accepted ones, then the closed ones.
 */
export const SUPERVISOR_REQUEST_STATUS_PRIORITY = Object.freeze({
  [S.PENDING]: 0,
  [S.UNDER_REVIEW]: 0,
  [S.PENDING_KADEP]: 1,
  [S.REVISION_REQUESTED]: 1,
  [S.ACCEPTED]: 2,
  [S.ASSIGNED]: 2,
  [S.REDIRECTED]: 2,
  [S.REJECTED_BY_LECTURER]: 3,
  [S.REJECTED_BY_KADEP]: 3,
  [S.WITHDRAWN]: 3,
  [S.CANCELLED]: 3,
  [S.CLOSED]: 3,
});

/** Paket E5 (3.1): the two kinds of rows of Tugas Akhir > Permohonan (order in `lecturer-inbox.js`). */
// Paket P9 (4): the Pembimbing 2 requests of the proposal phase are a third kind of row.
export const LECTURER_INBOX_KIND = Object.freeze({
  SUPERVISOR_REQUEST: "supervisor_request",
  CHANGE_REQUEST: "change_request",
  SUPERVISOR2_REQUEST: "supervisor2_request",
});

/** The student may pull back a request in these statuses, after the lock period. */
export const WITHDRAWABLE_STATUSES = Object.freeze([...WAITING_LECTURER_STATUSES, ...WAITING_KADEP_STATUSES]);

export const SUPERVISOR_REQUEST_ROUTE = Object.freeze({
  DIRECT: "direct",
  OVER_QUOTA: "over_quota",
  DEPARTMENT: "department",
});

/** Rules kept from the old module (Ilham). */
export const WITHDRAW_LOCK_HOURS = 72;
export const MIN_TITLE_LENGTH = 12;
export const MIN_STUDENT_JUSTIFICATION_LENGTH = 20;
export const MIN_LECTURER_OVERQUOTA_REASON_LENGTH = 10;
export const MIN_REJECTION_REASON_LENGTH = 5;
export const MIN_KADEP_REVISION_NOTES_LENGTH = 10;
export const RECOMMENDATION_LIMIT = 3;

/** `thesis_supervisor_assignment_batches.status`. */
export const ASSIGNMENT_BATCH_STATUS = Object.freeze({ CURRENT: "current", SUPERSEDED: "superseded" });

/** Title printed when a thesis has no title yet. */
export const UNTITLED_THESIS = "Judul belum ditentukan";
