/**
 * State machine `ThesisAdvisorRequest`.
 *
 * Diagram alur status (canonical, untuk SIMPTA aktif):
 *
 *   pending  ──(dosen mark review)──▶ under_review
 *      │                                    │
 *      │                                    ├──(dosen accept) ──▶ booking_approved ──▶ active_official
 *      │                                    └──(dosen reject) ──▶ rejected_by_dosen ◄──── closed (mahasiswa cabut/tutup)
 *      │
 *      └──(kuota merah / KaDep route)──▶ pending_kadep
 *                                            │
 *                                            ├──(KaDep approve) ──▶ booking_approved ──▶ active_official
 *                                            ├──(KaDep request revisi TA-02) ──▶ revision_requested
 *                                            └──(KaDep reject) ──▶ rejected_by_kadep
 *
 *   active_official adalah status terminal positif sebelum TA-04 mengubahnya
 *   menjadi "ACTIVE_OFFICIAL" pada thesis (lihat `metopen.service.reviewTitleReport`).
 *
 *   canceled  : mahasiswa tarik diri sebelum dosen merespon
 *   closed    : ditutup final oleh sistem (mis. ditolak permanen dan tidak revisi-able)
 *
 * --- LEGACY (jangan dipakai untuk write baru) ---
 * `escalated`, `approved`, `rejected`, `override_approved`, `redirected`,
 * `withdrawn`, `assigned` adalah enum lama dari fase awal SIMPTA (sebelum
 * pemecahan rejected_by_dosen vs rejected_by_kadep dan booking_approved
 * vs active_official). Tetap dipertahankan sebagai value enum agar query
 * histori lama tetap jalan; helper `ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES`
 * memetakan mereka ke kelas semantik canonical.
 *
 * Aturan saat menambah/mengubah status:
 * 1. Tambahkan ke enum di Prisma schema (`ThesisAdvisorRequestStatus`) terlebih dulu.
 * 2. Update himpunan derivat di file ini (`*_STATUSES`).
 * 3. Update `ADVISOR_REQUEST_STATUS_LABELS` agar UI tidak menampilkan raw enum.
 * 4. Audit semua `case`/`includes` di service layer (mudah miss).
 */
export const ADVISOR_REQUEST_STATUS = {
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  PENDING_KADEP: "pending_kadep",
  BOOKING_APPROVED: "booking_approved",
  ACTIVE_OFFICIAL: "active_official",
  REVISION_REQUESTED: "revision_requested",
  REJECTED_BY_DOSEN: "rejected_by_dosen",
  REJECTED_BY_KADEP: "rejected_by_kadep",
  CANCELED: "canceled",
  CLOSED: "closed",
  // --- Legacy: do not use for new writes; kept for backward compatibility. ---
  ESCALATED: "escalated",
  APPROVED: "approved",
  REJECTED: "rejected",
  OVERRIDE_APPROVED: "override_approved",
  REDIRECTED: "redirected",
  WITHDRAWN: "withdrawn",
  ASSIGNED: "assigned",
};

export const ADVISOR_REQUEST_PENDING_REVIEW_STATUSES = [
  ADVISOR_REQUEST_STATUS.PENDING,
  ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
];

export const ADVISOR_REQUEST_PENDING_KADEP_STATUSES = [
  ADVISOR_REQUEST_STATUS.PENDING_KADEP,
  ADVISOR_REQUEST_STATUS.ESCALATED,
];

export const ADVISOR_REQUEST_BOOKING_STATUSES = [
  ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
];

export const ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES = [
  ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
];

export const ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES = [
  ADVISOR_REQUEST_STATUS.APPROVED,
  ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED,
  ADVISOR_REQUEST_STATUS.REDIRECTED,
  ADVISOR_REQUEST_STATUS.ASSIGNED,
];

export const ADVISOR_REQUEST_BLOCKING_STATUSES = [
  ...ADVISOR_REQUEST_PENDING_REVIEW_STATUSES,
  ...ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  ...ADVISOR_REQUEST_BOOKING_STATUSES,
  ...ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES,
  ...ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
];

export const ADVISOR_REQUEST_HISTORY_RESPONDED_STATUSES = [
  ADVISOR_REQUEST_STATUS.REVISION_REQUESTED,
  ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN,
  ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP,
  ADVISOR_REQUEST_STATUS.CANCELED,
  ADVISOR_REQUEST_STATUS.CLOSED,
  ADVISOR_REQUEST_STATUS.REJECTED,
  ADVISOR_REQUEST_STATUS.WITHDRAWN,
  ...ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  ...ADVISOR_REQUEST_BOOKING_STATUSES,
  ...ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES,
  ...ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
];

export const ADVISOR_REQUEST_STATUS_LABELS = {
  [ADVISOR_REQUEST_STATUS.PENDING]: "Menunggu Respon",
  [ADVISOR_REQUEST_STATUS.UNDER_REVIEW]: "Sedang Ditinjau",
  [ADVISOR_REQUEST_STATUS.PENDING_KADEP]: "Menunggu Validasi KaDep",
  [ADVISOR_REQUEST_STATUS.BOOKING_APPROVED]: "Booking Disetujui",
  [ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL]: "Aktif Resmi",
  [ADVISOR_REQUEST_STATUS.REVISION_REQUESTED]: "Perlu Revisi",
  [ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN]: "Ditolak Dosen",
  [ADVISOR_REQUEST_STATUS.REJECTED_BY_KADEP]: "Ditolak KaDep",
  [ADVISOR_REQUEST_STATUS.CANCELED]: "Dibatalkan",
  [ADVISOR_REQUEST_STATUS.CLOSED]: "Ditutup",
  [ADVISOR_REQUEST_STATUS.ESCALATED]: "Eskalasi Legacy",
  [ADVISOR_REQUEST_STATUS.APPROVED]: "Approved Legacy",
  [ADVISOR_REQUEST_STATUS.REJECTED]: "Rejected Legacy",
  [ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED]: "Override Legacy",
  [ADVISOR_REQUEST_STATUS.REDIRECTED]: "Redirected Legacy",
  [ADVISOR_REQUEST_STATUS.WITHDRAWN]: "Withdrawn Legacy",
  [ADVISOR_REQUEST_STATUS.ASSIGNED]: "Assigned Legacy",
};

export function isAdvisorRequestBlocking(status) {
  return ADVISOR_REQUEST_BLOCKING_STATUSES.includes(status);
}

export function isAdvisorRequestPendingKadep(status) {
  return ADVISOR_REQUEST_PENDING_KADEP_STATUSES.includes(status);
}

export function isAdvisorRequestLegacyBookingOrActive(status) {
  return ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES.includes(status);
}

export default ADVISOR_REQUEST_STATUS;
