/**
 * Status siklus hidup Tugas Akhir — nilai enum `ThesisLifecycleStatus`
 * pada kolom `thesis.status`. Kolom ini satu-satunya penanda fase TA.
 * JANGAN hardcode nilai status di tempat lain, selalu import dari sini.
 * Label bahasa Indonesia untuk teks yang dibaca pengguna ada di `thesisLabels.js`.
 */
import { THESIS_STATUS_LABELS } from "./thesisLabels.js";

export const THESIS_STATUS = {
  PROPOSAL: "proposal",
  RESEARCH: "research",
  COMPLETED: "completed",
  FAILED: "failed",
};

/** TA yang belum berakhir. */
export const OPEN_THESIS_STATUSES = [THESIS_STATUS.PROPOSAL, THESIS_STATUS.RESEARCH];

/**
 * "TA mahasiswa saat ini" for pages that must still find a finished thesis
 * (sidang, seminar hasil, riwayat bimbingan): the latest thesis that has not failed. A thesis
 * becomes Selesai automatically when its defence is passed, and its pages stay readable.
 */
export const CURRENT_THESIS_STATUSES = [
  THESIS_STATUS.PROPOSAL,
  THESIS_STATUS.RESEARCH,
  THESIS_STATUS.COMPLETED,
];

/**
 * TA yang sudah berakhir. Data Master dan jalur lain tidak dapat mengubahnya lagi; hanya
 * `reopenThesisFromDefence` yang mengembalikan TA Selesai ke Penelitian.
 */
export const CLOSED_THESIS_STATUSES = [THESIS_STATUS.COMPLETED, THESIS_STATUS.FAILED];

/** TA yang sudah melewati fase proposal, apa pun akhirnya (riwayat, arsip). */
export const POST_PROPOSAL_THESIS_STATUSES = [
  THESIS_STATUS.RESEARCH,
  THESIS_STATUS.COMPLETED,
  THESIS_STATUS.FAILED,
];

/**
 * Nilai enum `ThesisPhase` pada sesi bimbingan, milestone dan template.
 * Sengaja sama dengan nilai status, sehingga fase langsung mengikuti status TA.
 */
export const THESIS_PHASE = {
  PROPOSAL: "proposal",
  RESEARCH: "research",
};

/** Alasan penghentian TA (`ThesisTerminationReason`). */
export const THESIS_TERMINATION_REASON = {
  SUPERVISION_EVALUATION: "supervision_evaluation",
  WITHDRAWN: "withdrawn",
  DROPPED_OUT: "dropped_out",
  OTHER: "other",
};

/**
 * Fragmen `where` bersama untuk semua perhitungan fase TA: syarat minimal
 * bimbingan seminar, progres dan aktivitas, monitoring, kesiapan seminar dan sidang.
 * Dipakai pada model yang punya kolom `phase` (ThesisGuidance, ThesisMilestone).
 */
export const TA_PHASE = Object.freeze({ phase: THESIS_PHASE.RESEARCH });

/** Fase berjalan untuk tampilan (tidak melempar): TA yang sudah berakhir dibaca `research`. */
export function currentPhaseOf(status) {
  return status === THESIS_STATUS.PROPOSAL ? THESIS_PHASE.PROPOSAL : THESIS_PHASE.RESEARCH;
}

/**
 * Fase sesi/milestone baru ditetapkan server dari status TA.
 * `completed`, `failed`: sesi dan milestone baru tidak boleh dibuat. TA yang dijeda karena
 * cuti diperiksa terpisah (`isThesisOnLeave`).
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

/**
 * Status mahasiswa (`StudentStatus`, kolom `students.student_status`). Satu-satunya sumber
 * cuti dan berhenti studi; status TA mengikutinya lewat `applyStudentStatusChange`.
 */
export const STUDENT_STATUS = Object.freeze({
  ACTIVE: "active",
  ON_LEAVE: "bss",
  GRADUATED: "lulus",
  WITHDRAWN: "mengundurkan_diri",
  DROPPED_OUT: "dropout",
});

/**
 * TA dijeda karena mahasiswanya cuti: TA belum berakhir dan cutinya sedang berjalan.
 * Membaca `student.status` bila ikut dipilih; bila tidak, `leaveStartedAt`, yang diisi
 * dalam transaksi yang sama dengan perubahan status mahasiswa.
 */
export function isThesisOnLeave(thesis) {
  if (!thesis || !OPEN_THESIS_STATUSES.includes(thesis.status)) return false;
  const studentStatus = thesis.student?.status;
  if (studentStatus !== undefined) return studentStatus === STUDENT_STATUS.ON_LEAVE;
  return thesis.leaveStartedAt != null;
}

export default THESIS_STATUS;
