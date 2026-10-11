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
 * Seminar statuses that close the change window (K8: until before seminar registration).
 * A failed or cancelled seminar opens it again.
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
