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
