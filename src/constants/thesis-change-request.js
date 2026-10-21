/**
 * Values of the thesis change request engine (Pengajuan Perubahan Tugas Akhir). Labels are
 * in `thesisLabels.js`.
 */
export const CHANGE_REQUEST_TYPE = Object.freeze({ TITLE: "title", SUPERVISOR: "supervisor", BOTH: "both" });

export const CHANGE_REQUEST_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

/**
 * A seminar or defence that is registered and whose result is not finalized
 * yet (a held event stays `scheduled` until its result is finalized; "ongoing" is only derived
 * for display). A title-only change is blocked while either is in process; before, between
 * and after them it is allowed as long as the thesis is in research.
 */
export const EVENT_STATUSES_IN_PROCESS = Object.freeze(["registered", "verified", "examiner_assigned", "scheduled"]);

/**
 * The status a row shows, which depends on the viewer for an open request, and the
 * default order of each table: what waits for the viewer first, then what runs, then the
 * closed ones (newest first inside a group).
 * - Tugas Akhir > Perubahan (Ketua Departemen): "Menunggu Keputusan Anda" (every lecturer step
 *   approved) → "Sedang Berjalan" (a lecturer step is open) → Disetujui → Ditolak / Dibatalkan.
 * - Tugas Akhir > Permohonan, jenis Perubahan TA (a lecturer's own steps): "Menunggu Persetujuan
 *   Anda" → "Sedang Berjalan" → Disetujui → Ditolak / Dibatalkan.
 */
export const CHANGE_REQUEST_VIEW_STATUS = Object.freeze({
  AWAITING_DECISION: "awaiting_decision",
  AWAITING_ME: "awaiting_me",
  IN_PROGRESS: "in_progress",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

export const CHANGE_REQUEST_STATUS_PRIORITY = Object.freeze({
  awaiting_decision: 0,
  in_progress: 1,
  approved: 2,
  rejected: 3,
  cancelled: 3,
});

export const CHANGE_REQUEST_LECTURER_STATUS_PRIORITY = Object.freeze({
  awaiting_me: 0,
  in_progress: 1,
  approved: 2,
  rejected: 3,
  cancelled: 3,
});

/** Kind filter of the Perubahan table: a request of an "Alihkan Mahasiswa" batch is "transfer". */
export const CHANGE_REQUEST_KIND = Object.freeze({ TITLE: "title", SUPERVISOR: "supervisor", BOTH: "both", TRANSFER: "transfer" });

/** Supervisor position a request changes (`ThesisSupervisorPosition`). */
export const SUPERVISOR_POSITION = Object.freeze({ P1: "pembimbing_1", P2: "pembimbing_2" });

/** Role of a lecturer in an approval step (`ThesisChangeApprovalRole`). */
export const CHANGE_APPROVAL_ROLE = Object.freeze({
  MAIN_SUPERVISOR: "main_supervisor",
  PREVIOUS_SUPERVISOR: "previous_supervisor",
  NEW_SUPERVISOR: "new_supervisor",
});

/** Key of the final step in API responses; it is not an approval row. */
export const KADEP_STEP = "kadep";

/**
 * Seminar statuses that close the change window (until before seminar registration).
 * A failed or cancelled seminar opens it again.
 */
/**
 * A supervisor change (also "Judul & Pembimbing" and
 * "Alihkan") is possible only before the seminar registration, so these seminar statuses
 * block it. A title-only change follows `EVENT_STATUSES_IN_PROCESS` instead.
 */
export const SEMINAR_STATUSES_BLOCKING_CHANGE = Object.freeze([
  "registered",
  "verified",
  "examiner_assigned",
  "scheduled",
  "passed",
  "passed_with_revision",
]);

export const SYSTEM_CANCEL_REASON_SUPERVISOR_CHANGED =
  "Dibatalkan otomatis: pembimbing diganti melalui Pengajuan Perubahan Tugas Akhir.";
