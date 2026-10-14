/**
 * Status siklus hidup Tugas Akhir (K15) — nilai enum `ThesisLifecycleStatus`
 * pada kolom `thesis.status`. Kolom ini satu-satunya penanda fase TA.
 * JANGAN hardcode nilai status di tempat lain, selalu import dari sini.
 * Label bahasa Indonesia untuk teks yang dibaca pengguna ada di `thesisLabels.js`.
 */
import { THESIS_STATUS_LABELS } from "./thesisLabels.js";

export const THESIS_STATUS = {
  PROPOSAL: "proposal",
  RESEARCH: "research",
  ON_LEAVE: "on_leave",
  COMPLETED: "completed",
  FAILED: "failed",
};

/** TA yang belum berakhir. */
export const OPEN_THESIS_STATUSES = [
  THESIS_STATUS.PROPOSAL,
  THESIS_STATUS.RESEARCH,
  THESIS_STATUS.ON_LEAVE,
];

/** TA yang sudah berakhir; tidak bisa berubah lagi. */
export const CLOSED_THESIS_STATUSES = [THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED];

/** TA yang sudah melewati fase proposal, apa pun akhirnya (riwayat, arsip). */
export const POST_PROPOSAL_THESIS_STATUSES = [
  THESIS_STATUS.RESEARCH,
  THESIS_STATUS.ON_LEAVE,
  THESIS_STATUS.COMPLETED,
  THESIS_STATUS.FAILED,
];

/**
 * Nilai enum `ThesisPhase` pada sesi bimbingan, milestone dan template (K6/K18).
 * Sengaja sama dengan nilai status, sehingga fase langsung mengikuti status TA.
 */
export const THESIS_PHASE = {
  PROPOSAL: "proposal",
  RESEARCH: "research",
};

/** Alasan penghentian TA (`ThesisTerminationReason`); fiturnya belum dibuat. */
export const THESIS_TERMINATION_REASON = {
  SUPERVISION_EVALUATION: "supervision_evaluation",
  WITHDRAWN: "withdrawn",
  DROPPED_OUT: "dropped_out",
  OTHER: "other",
};

/**
 * Fragmen `where` bersama untuk semua perhitungan fase TA (K6/K7): syarat minimal
 * bimbingan seminar, progres dan aktivitas, monitoring, kesiapan seminar dan sidang.
 * Dipakai pada model yang punya kolom `phase` (ThesisGuidance, ThesisMilestone).
 */
export const TA_PHASE = Object.freeze({ phase: THESIS_PHASE.RESEARCH });

/** Fase berjalan untuk tampilan (tidak melempar): BSS dan TA yang sudah berakhir dibaca `research`. */
export function currentPhaseOf(status) {
  return status === THESIS_STATUS.PROPOSAL ? THESIS_PHASE.PROPOSAL : THESIS_PHASE.RESEARCH;
}

/**
 * Fase sesi/milestone baru ditetapkan server dari status TA (K6).
 * `on_leave`, `completed`, `failed`: sesi dan milestone baru tidak boleh dibuat.
 */
export function phaseForThesisStatus(status) {
  if (status === THESIS_STATUS.PROPOSAL) return THESIS_PHASE.PROPOSAL;
  if (status === THESIS_STATUS.RESEARCH) return THESIS_PHASE.RESEARCH;
  const err = new Error(
    `Tugas akhir berstatus "${THESIS_STATUS_LABELS[status] ?? "tidak dikenal"}" tidak dapat menerima sesi bimbingan atau milestone baru.`,
  );
  err.statusCode = 400;
  throw err;
}

export default THESIS_STATUS;
