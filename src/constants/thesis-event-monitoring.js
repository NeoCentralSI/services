/**
 * Monitoring of Seminar Hasil and Sidang (Paket E3): status groups of the summary cards,
 * the thresholds of "Perlu Perhatian" and the texts of its reasons. The monitoring page
 * only reads `thesis_seminars` and `thesis_defences`; the status values are those of the
 * `ThesisSeminarStatus` and `ThesisDefenceStatus` enums, which are identical.
 */
export const EVENT_KIND = Object.freeze({ SEMINAR: "seminar", DEFENCE: "defence" });

export const EVENT_STATUS = Object.freeze({
  REGISTERED: "registered",
  VERIFIED: "verified",
  EXAMINER_ASSIGNED: "examiner_assigned",
  SCHEDULED: "scheduled",
  PASSED: "passed",
  PASSED_WITH_REVISION: "passed_with_revision",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

/** Statuses counted by each summary card. "Revisi Belum Final" is a part of "Lulus". */
export const EVENT_STATUS_GROUPS = Object.freeze({
  inProcess: [EVENT_STATUS.REGISTERED, EVENT_STATUS.VERIFIED, EVENT_STATUS.EXAMINER_ASSIGNED],
  scheduled: [EVENT_STATUS.SCHEDULED],
  passed: [EVENT_STATUS.PASSED, EVENT_STATUS.PASSED_WITH_REVISION],
  notPassed: [EVENT_STATUS.FAILED, EVENT_STATUS.CANCELLED],
});

/** A registration that still stands: the seminar and defence modules allow one per thesis. */
export const INACTIVE_REGISTRATION_STATUSES = Object.freeze([EVENT_STATUS.FAILED, EVENT_STATUS.CANCELLED]);

export const ATTENTION_REASON = Object.freeze({
  DOCUMENT_VERIFICATION: "document_verification",
  SCHEDULING: "scheduling",
  RESULT_FINALIZATION: "result_finalization",
  REVISION: "revision",
});

/** An event needs attention once it has waited MORE than this many whole days. */
export const ATTENTION_THRESHOLD_DAYS = Object.freeze({
  [ATTENTION_REASON.DOCUMENT_VERIFICATION]: 7, // `registered`, since `registeredAt`
  [ATTENTION_REASON.SCHEDULING]: 14, // `verified` / `examiner_assigned`, since `verifiedAt`
  [ATTENTION_REASON.RESULT_FINALIZATION]: 3, // `scheduled`, since the day it was held
  [ATTENTION_REASON.REVISION]: 30, // `passed_with_revision`, since `resultFinalizedAt`
});

export const ATTENTION_REASON_LABELS = Object.freeze({
  [ATTENTION_REASON.DOCUMENT_VERIFICATION]: "Menunggu verifikasi dokumen",
  [ATTENTION_REASON.SCHEDULING]: "Belum dijadwalkan",
  [ATTENTION_REASON.RESULT_FINALIZATION]: "Hasil belum difinalkan",
  [ATTENTION_REASON.REVISION]: "Revisi belum selesai",
});

/** "Jadwal Mendatang" shows the nearest events only; the table has the rest. */
export const UPCOMING_LIMIT = 10;
