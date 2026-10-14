/**
 * Research Method domain (Paket P): attendance, Penilaian Proposal and the result.
 */

/** Attendance below this share means the score is 0 (rule kept from the old module, `>=`). */
export const ATTENDANCE_THRESHOLD = 0.75;

/** At most this many attendance files per upload (merged by NIM). */
export const MAX_ATTENDANCE_FILES = 2;

/** Weight of both assessors together (K31): the sum of criteria max scores may not exceed it. */
export const MAX_TOTAL_WEIGHT = 100;

/** Values of `ResearchMethodAssessmentResult`. */
export const RESEARCH_METHOD_RESULT = Object.freeze({ PASSED: "passed", FAILED: "failed" });

/** Why an attempt was set to 0 (kept from the old module, without the form codes). */
export const ATTENDANCE_AUTO_ZERO_REASON =
  "Presensi Metode Penelitian kurang dari 75%; nilai pembimbing dan koordinator otomatis 0 tanpa penilaian proposal.";

/** The two assessors of a Penilaian Proposal (10.2). */
export const ASSESSOR = Object.freeze({ SUPERVISOR: "supervisor", COORDINATOR: "coordinator" });

/** Assessors' labels in messages and exports. */
export const ASSESSOR_LABELS = Object.freeze({ supervisor: "pembimbing", coordinator: "koordinator" });

/** Minimum passing score when a period has none set (the old module's default). */
export const DEFAULT_MINIMUM_SCORE = 60;
