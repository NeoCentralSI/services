/**
 * Status sesi bimbingan (enum `GuidanceStatus`) dan kelompoknya untuk siklus sesi bimbingan.
 * Label bahasa Indonesia ada di `thesisLabels.js` (`GUIDANCE_STATUS_LABELS`).
 */
export const GUIDANCE_STATUS = Object.freeze({
  REQUESTED: "requested",
  ACCEPTED: "accepted",
  /** Data lama, tidak ditulis lagi; diperlakukan sama dengan `accepted`. */
  RESCHEDULED: "rescheduled",
  REJECTED: "rejected",
  SUMMARY_PENDING: "summary_pending",
  SUMMARY_REJECTED: "summary_rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DELETED: "deleted",
});

/** Sesi terjadwal (sudah disetujui dosen). `rescheduled` lama ikut di sini. */
export const SCHEDULED_GUIDANCE_STATUSES = Object.freeze([GUIDANCE_STATUS.ACCEPTED, GUIDANCE_STATUS.RESCHEDULED]);

/** Sesi yang menempati slot jadwal dosen (dipakai cek bentrok). */
export const SLOT_HOLDING_GUIDANCE_STATUSES = Object.freeze([GUIDANCE_STATUS.REQUESTED, ...SCHEDULED_GUIDANCE_STATUSES]);

/** Sesi yang masih terbuka; dibatalkan sistem saat TA dihentikan. */
export const OPEN_GUIDANCE_STATUSES = Object.freeze([
  ...SLOT_HOLDING_GUIDANCE_STATUSES,
  GUIDANCE_STATUS.SUMMARY_PENDING,
  GUIDANCE_STATUS.SUMMARY_REJECTED,
]);

/** Sesi yang boleh diisi ringkasan oleh mahasiswa. */
export const SUMMARY_SUBMITTABLE_STATUSES = Object.freeze([...SCHEDULED_GUIDANCE_STATUSES, GUIDANCE_STATUS.SUMMARY_REJECTED]);

/**
 * Jadwal efektif sesi: `approvedDate` (waktu yang disepakati, diisi saat dosen
 * menyetujui atau menjadwal ulang) bila ada, selain itu `requestedDate` (usulan mahasiswa).
 */
export function getScheduledAt(guidance) {
  return guidance?.approvedDate ?? guidance?.requestedDate ?? null;
}

/** Pembanding untuk mengurutkan sesi menurut jadwal efektif ("asc" | "desc"). */
export function byScheduledAt(direction = "asc") {
  const sign = direction === "desc" ? -1 : 1;
  const time = (g) => {
    const d = getScheduledAt(g);
    return d ? new Date(d).getTime() : 0;
  };
  return (a, b) => sign * (time(a) - time(b)) || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/** Nama lama dari `getScheduledAt` (dipakai kode lama). */
export const effectiveGuidanceDate = getScheduledAt;

export const GUIDANCE_ACTOR = Object.freeze({ STUDENT: "student", LECTURER: "lecturer", SYSTEM: "system" });
