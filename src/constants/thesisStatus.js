/**
 * Thesis status name constants — sesuai data di tabel thesis_statuses.
 * Null thesisStatusId pada Thesis berarti status "Aktif" (post-proposal approval).
 * JANGAN hardcode nama status di tempat lain, selalu import dari sini.
 */
export const THESIS_STATUS = {
  DIAJUKAN: "Diajukan",
  BIMBINGAN: "Bimbingan",
  DIBATALKAN: "Dibatalkan",
  GAGAL: "Gagal",
  SELESAI: "Selesai",
  LULUS: "Lulus",
  DROP_OUT: "Drop Out",
};

export const CLOSED_THESIS_STATUSES = [
  THESIS_STATUS.DIBATALKAN,
  THESIS_STATUS.GAGAL,
  THESIS_STATUS.SELESAI,
  THESIS_STATUS.LULUS,
  THESIS_STATUS.DROP_OUT,
];

export default THESIS_STATUS;
