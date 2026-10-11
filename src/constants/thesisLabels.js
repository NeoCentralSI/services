/**
 * Label bahasa Indonesia untuk nilai enum TA (§2.2b Paket A) — satu sumber untuk semua
 * teks yang dibaca pengguna: notifikasi, email, PDF/ekspor laporan, dan pesan error.
 * Respons API cukup mengirim nilai enum; frontend memberi label lewat
 * `app/frontend/src/lib/thesisLabels.ts`, yang isinya harus sama persis dengan file ini.
 */

/** `ThesisLifecycleStatus` */
export const THESIS_STATUS_LABELS = Object.freeze({
  proposal: "Proposal",
  research: "Penelitian",
  on_leave: "Berhenti Studi Sementara (BSS)",
  completed: "Selesai",
  failed: "Gagal",
});

/** `ThesisPhase` */
export const THESIS_PHASE_LABELS = Object.freeze({
  proposal: "Proposal",
  research: "Tugas Akhir",
});

/** `ThesisTerminationReason` */
export const THESIS_TERMINATION_REASON_LABELS = Object.freeze({
  supervision_evaluation: "Dihentikan melalui evaluasi bimbingan",
  withdrawn: "Mengundurkan diri",
  dropped_out: "Drop out",
  other: "Lainnya",
});

/** `ThesisRating` */
export const THESIS_RATING_LABELS = Object.freeze({
  ONGOING: "Lancar",
  SLOW: "Lambat",
  AT_RISK: "Berisiko",
  FAILED: "Gagal (lama)",
  CANCELLED: "Dibatalkan (lama)",
});

/** `GuidanceStatus` (sesi bimbingan, K19). `rescheduled` adalah data lama yang
 * diperlakukan sama dengan `accepted`, jadi labelnya sama. */
export const GUIDANCE_STATUS_LABELS = Object.freeze({
  requested: "Menunggu Persetujuan",
  accepted: "Terjadwal",
  rescheduled: "Terjadwal",
  rejected: "Ditolak",
  summary_pending: "Menunggu Persetujuan Ringkasan",
  summary_rejected: "Ringkasan Perlu Diperbaiki",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  deleted: "Dihapus",
});

/** `GuidanceActor` (pihak yang membatalkan sesi). */
export const GUIDANCE_ACTOR_LABELS = Object.freeze({
  student: "Mahasiswa",
  lecturer: "Dosen",
  system: "Sistem",
});

/** `MilestoneStatus` (K20). */
export const MILESTONE_STATUS_LABELS = Object.freeze({
  not_started: "Belum Dimulai",
  in_progress: "Sedang Dikerjakan",
  pending_review: "Menunggu Review",
  revision_needed: "Perlu Revisi",
  completed: "Selesai",
  deleted: "Dihapus",
});

const labelOf = (labels) => (value) => (value ? labels[value] ?? String(value) : "-");

export const getThesisStatusLabel = labelOf(THESIS_STATUS_LABELS);
export const getThesisPhaseLabel = labelOf(THESIS_PHASE_LABELS);
export const getThesisTerminationReasonLabel = labelOf(THESIS_TERMINATION_REASON_LABELS);
export const getThesisRatingLabel = labelOf(THESIS_RATING_LABELS);
export const getGuidanceStatusLabel = labelOf(GUIDANCE_STATUS_LABELS);
export const getGuidanceActorLabel = labelOf(GUIDANCE_ACTOR_LABELS);
export const getMilestoneStatusLabel = labelOf(MILESTONE_STATUS_LABELS);
