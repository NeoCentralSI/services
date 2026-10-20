/**
 * Penilaian Proposal and its result. Class attendance is the course's business, kept in SIA.
 */

/** Weight of both assessors together: the sum of criteria max scores may not exceed it. */
export const MAX_TOTAL_WEIGHT = 100;

/** Values of `ResearchMethodAssessmentResult`. */
export const RESEARCH_METHOD_RESULT = Object.freeze({ PASSED: "passed", FAILED: "failed" });

/** The two assessors of a Penilaian Proposal. */
export const ASSESSOR = Object.freeze({ SUPERVISOR: "supervisor", COORDINATOR: "coordinator" });

/** Assessors' labels in messages and exports. */
export const ASSESSOR_LABELS = Object.freeze({ supervisor: "pembimbing", coordinator: "koordinator" });

/** Minimum passing score when a period has none set (the old module's default). */
export const DEFAULT_MINIMUM_SCORE = 60;

/**
 * Locks of the semester's master data. Once the semester has a Penilaian Proposal detail (draft or
 * sent), its CPMK, criteria and rubrics cannot be deleted and the maximum scores and rubric ranges
 * cannot change; names and descriptions can. The minimum passing score locks once a result is final.
 */
export const LOCKED_DELETE_REASON = "Penilaian proposal semester ini sudah dimulai; CPMK, kriteria, dan rubrik tidak dapat dihapus.";
export const LOCKED_SCORE_REASON = "Penilaian proposal semester ini sudah dimulai; skor maksimum kriteria dan rentang rubrik tidak dapat diubah.";
export const LOCKED_MINIMUM_REASON = "Nilai minimum lulus terkunci karena sudah ada hasil penilaian final pada semester ini.";

/** The notification of a pass, to the student and both supervisors. */
export const PROPOSAL_PASSED_MESSAGE = "Proposal dinyatakan lulus; tugas akhir masuk fase Penelitian.";
