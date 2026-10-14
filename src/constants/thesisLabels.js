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

/**
 * Activity level of a research thesis, derived from the last activity date
 * (`helpers/thesis-progress.helper.js`). Not stored.
 */
export const THESIS_ACTIVITY_LABELS = Object.freeze({
  active: "Lancar",
  slow: "Lambat",
  at_risk: "Berisiko",
});

/** Supervision evaluation that is due, derived from the supervision clock. Not stored. */
export const EVALUATION_DUE_LABELS = Object.freeze({
  six_month: "Evaluasi 6 bulan jatuh tempo",
  extension_follow_up: "Tindak lanjut perpanjangan jatuh tempo",
  one_year: "Evaluasi 1 tahun jatuh tempo",
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

/** `ThesisChangeRequestType` (Pengajuan Perubahan Tugas Akhir, K10). */
export const CHANGE_REQUEST_TYPE_LABELS = Object.freeze({
  title: "Judul",
  supervisor: "Pembimbing",
  both: "Judul dan Pembimbing",
});

/** `ThesisChangeRequestStatus` */
export const CHANGE_REQUEST_STATUS_LABELS = Object.freeze({
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
});

/** Approval steps of a change request: `ThesisChangeApprovalRole` plus the final Kadep step. */
export const CHANGE_REQUEST_STEP_LABELS = Object.freeze({
  main_supervisor: "Pembimbing 1",
  previous_supervisor: "Pembimbing Sebelumnya",
  new_supervisor: "Pembimbing Baru",
  kadep: "Ketua Departemen",
});

/** `ThesisSupervisorPosition` */
export const SUPERVISOR_POSITION_LABELS = Object.freeze({
  pembimbing_1: "Pembimbing 1",
  pembimbing_2: "Pembimbing 2",
});

/** `GuidanceEvaluationType` (Evaluasi Bimbingan, formulir TA-17). */
export const GUIDANCE_EVALUATION_TYPE_LABELS = Object.freeze({
  six_month: "Evaluasi 6 Bulan",
  one_year: "Evaluasi 1 Tahun",
});

/** `GuidanceEvaluationRecommendation`: the supervisor's decision. */
export const GUIDANCE_EVALUATION_RECOMMENDATION_LABELS = Object.freeze({
  continue: "Lanjut Bimbingan",
  extend_1_month: "Peringatan dan Perpanjangan 1 Bulan",
  revise_proposal: "Mengulang Proposal",
  terminate_supervision: "Dihentikan",
});

/** `GuidanceEvaluationStatus` */
export const GUIDANCE_EVALUATION_STATUS_LABELS = Object.freeze({
  pending: "Menunggu Keputusan Ketua Departemen",
  approved: "Disetujui",
  rejected: "Ditolak",
});

/** The four supervisor observations of the evaluation form. */
export const GUIDANCE_EVALUATION_OBSERVATION_LABELS = Object.freeze({
  noGuidance: "Tidak melakukan bimbingan selama periode evaluasi",
  noProgress: "Tidak menunjukkan kemajuan berarti",
  noResponse: "Tidak merespons komunikasi pembimbing",
  noRevision: "Tidak menyerahkan revisi sesuai arahan",
});

/** `ThesisSupervisorRequestStatus` (Pengajuan Pembimbing, K10). */
export const SUPERVISOR_REQUEST_STATUS_LABELS = Object.freeze({
  pending: "Menunggu Dosen",
  under_review: "Sedang Ditinjau Dosen",
  pending_kadep: "Menunggu Ketua Departemen",
  revision_requested: "Perlu Revisi",
  accepted: "Disetujui, Menunggu Penetapan Pembimbing",
  assigned: "Pembimbing Ditetapkan",
  rejected_by_lecturer: "Ditolak Dosen",
  rejected_by_kadep: "Ditolak Ketua Departemen",
  redirected: "Dialihkan Ketua Departemen, Menunggu Penetapan Pembimbing",
  withdrawn: "Ditarik",
  cancelled: "Dibatalkan",
  closed: "Ditutup",
});

/** `SupervisorRequestRoute` */
export const SUPERVISOR_REQUEST_ROUTE_LABELS = Object.freeze({
  direct: "Pilih Dosen Sendiri",
  over_quota: "Pengajuan di Atas Kuota",
  department: "Ditetapkan Departemen",
});

/** Supervision load against the applicable limits (computed, plan 10.1). */
export const SUPERVISION_LOAD_LEVEL_LABELS = Object.freeze({
  available: "Tersedia",
  near_limit: "Mendekati Batas",
  full: "Penuh",
});

/** `ResearchMethodAssessmentResult` */
export const RESEARCH_METHOD_RESULT_LABELS = Object.freeze({
  passed: "Lulus",
  failed: "Tidak Lulus",
});

const labelOf = (labels) => (value) => (value ? labels[value] ?? String(value) : "-");

export const getThesisStatusLabel = labelOf(THESIS_STATUS_LABELS);
export const getThesisPhaseLabel = labelOf(THESIS_PHASE_LABELS);
export const getThesisTerminationReasonLabel = labelOf(THESIS_TERMINATION_REASON_LABELS);
export const getThesisActivityLabel = labelOf(THESIS_ACTIVITY_LABELS);
export const getEvaluationDueLabel = labelOf(EVALUATION_DUE_LABELS);
export const getGuidanceStatusLabel = labelOf(GUIDANCE_STATUS_LABELS);
export const getGuidanceActorLabel = labelOf(GUIDANCE_ACTOR_LABELS);
export const getMilestoneStatusLabel = labelOf(MILESTONE_STATUS_LABELS);
export const getChangeRequestTypeLabel = labelOf(CHANGE_REQUEST_TYPE_LABELS);
export const getChangeRequestStatusLabel = labelOf(CHANGE_REQUEST_STATUS_LABELS);
export const getChangeRequestStepLabel = labelOf(CHANGE_REQUEST_STEP_LABELS);
export const getSupervisorPositionLabel = labelOf(SUPERVISOR_POSITION_LABELS);
export const getGuidanceEvaluationTypeLabel = labelOf(GUIDANCE_EVALUATION_TYPE_LABELS);
export const getGuidanceEvaluationRecommendationLabel = labelOf(GUIDANCE_EVALUATION_RECOMMENDATION_LABELS);
export const getGuidanceEvaluationStatusLabel = labelOf(GUIDANCE_EVALUATION_STATUS_LABELS);
export const getSupervisorRequestStatusLabel = labelOf(SUPERVISOR_REQUEST_STATUS_LABELS);
export const getSupervisorRequestRouteLabel = labelOf(SUPERVISOR_REQUEST_ROUTE_LABELS);
export const getSupervisionLoadLevelLabel = labelOf(SUPERVISION_LOAD_LEVEL_LABELS);
export const getResearchMethodResultLabel = labelOf(RESEARCH_METHOD_RESULT_LABELS);
