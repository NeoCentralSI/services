/**
 * Paket E5 (3.1): the default order of Tugas Akhir > Permohonan, the lecturer's approval inbox.
 * One map per kind of row; equal numbers form one group (newest first inside it), so everything
 * that waits for the viewer comes first, then the rest by the order of each kind:
 * - Pengajuan Pembimbing: Menunggu Dosen / Sedang Ditinjau → Menunggu Kadep (or the student's
 *   revision) → Diterima / Ditetapkan / Dialihkan → Ditolak / Ditarik / Dibatalkan / Ditutup.
 * - Perubahan TA: Menunggu Persetujuan Anda → Sedang Berjalan → Disetujui → Ditolak / Dibatalkan.
 */
import { CHANGE_REQUEST_LECTURER_STATUS_PRIORITY } from "./thesis-change-request.js";
import { LECTURER_INBOX_KIND, SUPERVISOR_REQUEST_STATUS_PRIORITY } from "./thesis-proposal.js";

export const LECTURER_INBOX_PRIORITY = Object.freeze({
  [LECTURER_INBOX_KIND.SUPERVISOR_REQUEST]: SUPERVISOR_REQUEST_STATUS_PRIORITY,
  [LECTURER_INBOX_KIND.CHANGE_REQUEST]: CHANGE_REQUEST_LECTURER_STATUS_PRIORITY,
});
