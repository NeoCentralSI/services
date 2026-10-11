/**
 * Thesis progress indicators, derived when read and never stored (Paket E, E3):
 *
 * - activity level, from the date of the last activity;
 * - supervision clock, from `startDate` minus the time spent on leave.
 *
 * This file is the single source for both. Callers select the columns in
 * `THESIS_PROGRESS_SELECT` and call `summarizeThesisProgress`.
 */
import { THESIS_STATUS, THESIS_PHASE } from "../constants/thesisStatus.js";
import { THESIS_ACTIVITY_LABELS } from "../constants/thesisLabels.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTIVITY_LEVEL = Object.freeze({ ACTIVE: "active", SLOW: "slow", AT_RISK: "at_risk" });
/** Whole days without activity from which a research thesis is "slow" / "at risk". */
export const SLOW_FROM_DAYS = 60;
export const AT_RISK_AFTER_DAYS = 120;

export const EVALUATION_DUE = Object.freeze({
  SIX_MONTH: "six_month",
  EXTENSION_FOLLOW_UP: "extension_follow_up",
  ONE_YEAR: "one_year",
});

/**
 * Columns and relations the helpers read. Spread into a Prisma `select`, or use the
 * scalar part (`THESIS_CLOCK_COLUMNS`) when the query already selects the relations.
 */
export const THESIS_CLOCK_COLUMNS = Object.freeze({
  status: true,
  startDate: true,
  totalLeaveDays: true,
  leaveStartedAt: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const THESIS_PROGRESS_SELECT = Object.freeze({
  ...THESIS_CLOCK_COLUMNS,
  thesisGuidances: {
    where: { status: "completed", phase: THESIS_PHASE.RESEARCH },
    select: { approvedDate: true, completedAt: true },
  },
  thesisMilestones: {
    where: { phase: THESIS_PHASE.RESEARCH },
    select: { status: true, updatedAt: true, completedAt: true },
  },
  thesisSeminars: {
    orderBy: { updatedAt: "desc" },
    select: { status: true, updatedAt: true, revisionFinalizedAt: true },
  },
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const latest = (dates) => {
  const valid = dates.map(toDate).filter(Boolean);
  return valid.length ? new Date(Math.max(...valid.map((d) => d.getTime()))) : null;
};

/**
 * Date of the last thesis activity: the latest of the completed guidance sessions
 * (`approvedDate`, else `completedAt`), the completed milestones (`updatedAt`, else
 * `completedAt`), the seminars (`updatedAt`) and the thesis row itself (`updatedAt`).
 * Falls back to `createdAt`. Returns a Date, or null when nothing is known.
 */
export function getLastActivityAt(thesis) {
  if (!thesis) return null;
  const dates = [];
  for (const guidance of thesis.thesisGuidances || []) {
    // Queries that select every session carry `status`; only completed ones count.
    if (guidance.status === undefined || guidance.status === "completed") {
      dates.push(guidance.approvedDate || guidance.completedAt);
    }
  }
  for (const milestone of thesis.thesisMilestones || []) {
    // A query may already filter to completed milestones and omit `status`.
    if (milestone.status === undefined || milestone.status === "completed") {
      dates.push(milestone.updatedAt || milestone.completedAt);
    }
  }
  for (const seminar of thesis.thesisSeminars || []) {
    dates.push(seminar.updatedAt);
  }
  dates.push(thesis.updatedAt);
  return latest(dates) ?? toDate(thesis.createdAt);
}

/** Whole days between two dates, never negative. */
export function wholeDaysBetween(from, to) {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

/**
 * Activity level from the last activity date: `active` (< 60 days), `slow` (60-120 days),
 * `at_risk` (> 120 days). Null when the date is unknown. The level only has a meaning for
 * a thesis in `research`; use `getActivityLevel` to apply that.
 */
export function deriveActivityLevel(lastActivityAt, now = new Date()) {
  const days = wholeDaysBetween(lastActivityAt, now);
  if (days === null) return null;
  if (days > AT_RISK_AFTER_DAYS) return ACTIVITY_LEVEL.AT_RISK;
  if (days >= SLOW_FROM_DAYS) return ACTIVITY_LEVEL.SLOW;
  return ACTIVITY_LEVEL.ACTIVE;
}

/** Activity level of a thesis: only for status `research`, otherwise null. */
export function getActivityLevel(thesis, now = new Date()) {
  if (thesis?.status !== THESIS_STATUS.RESEARCH) return null;
  return deriveActivityLevel(getLastActivityAt(thesis), now);
}

export const getActivityLabel = (level) => (level ? THESIS_ACTIVITY_LABELS[level] ?? String(level) : "-");

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/** Whole calendar months from `start` to `end`, plus the remaining days. */
function calendarDiff(start, end) {
  if (end.getTime() <= start.getTime()) return { months: 0, days: 0 };
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (addMonths(start, months).getTime() > end.getTime()) months -= 1;
  const days = Math.floor((end.getTime() - addMonths(start, months).getTime()) / DAY_MS);
  return { months, days };
}

/** "7 bulan 12 hari", "12 hari", "7 bulan". Null in -> "-". */
export function formatSupervisionDuration(months, days) {
  if (months === null || months === undefined) return "-";
  const parts = [];
  if (months > 0) parts.push(`${months} bulan`);
  if (days > 0 || months === 0) parts.push(`${days} hari`);
  return parts.join(" ");
}

/**
 * Supervision clock of a thesis. It starts at `startDate`, does not count leave
 * (`totalLeaveDays` for finished leaves, and the running leave while the thesis is
 * `on_leave`), and stops when the thesis is closed.
 *
 * `evaluationDue` is set only for a thesis in `research`: `one_year` once twelve months
 * have run, `six_month` once six months have run.
 *
 * @param {object} thesis thesis with the `THESIS_CLOCK_COLUMNS`
 * @param {Array} evaluations guidance evaluations of the thesis (used from E5 on)
 * @param {Date} now
 */
export function getSupervisionClock(thesis, evaluations = [], now = new Date()) {
  const startedAt = toDate(thesis?.startDate);
  const empty = {
    startedAt: null,
    elapsedDays: null,
    elapsedMonths: null,
    elapsedLabel: "-",
    sixMonthAt: null,
    oneYearAt: null,
    extensionUntil: null,
    evaluationDue: null,
    isPaused: thesis?.status === THESIS_STATUS.ON_LEAVE,
  };
  if (!startedAt) return empty;

  const status = thesis.status;
  const isPaused = status === THESIS_STATUS.ON_LEAVE;
  const isClosed = status === THESIS_STATUS.COMPLETED || status === THESIS_STATUS.FAILED;
  const leaveStartedAt = toDate(thesis.leaveStartedAt);

  // Where the clock stands: now, the start of the running leave, or the closing date.
  let stoppedAt = now;
  if (isPaused && leaveStartedAt) stoppedAt = leaveStartedAt;
  else if (isClosed) stoppedAt = toDate(thesis.statusChangedAt) ?? now;

  const finishedLeaveDays = Math.max(0, Number(thesis.totalLeaveDays) || 0);
  const runningLeaveDays = isPaused && leaveStartedAt ? wholeDaysBetween(leaveStartedAt, now) : 0;

  // Time that counted: from the start to where the clock stands, minus finished leaves.
  const counted = addDays(stoppedAt, -finishedLeaveDays);
  const { months, days } = calendarDiff(startedAt, counted);
  const leaveShift = finishedLeaveDays + runningLeaveDays;
  const sixMonthAt = addDays(addMonths(startedAt, 6), leaveShift);
  const oneYearAt = addDays(addMonths(startedAt, 12), leaveShift);

  let evaluationDue = null;
  if (status === THESIS_STATUS.RESEARCH) {
    if (now.getTime() >= oneYearAt.getTime()) evaluationDue = EVALUATION_DUE.ONE_YEAR;
    else if (now.getTime() >= sixMonthAt.getTime()) evaluationDue = EVALUATION_DUE.SIX_MONTH;
  }

  return {
    startedAt,
    elapsedDays: wholeDaysBetween(startedAt, counted),
    elapsedMonths: months,
    elapsedLabel: formatSupervisionDuration(months, days),
    sixMonthAt,
    oneYearAt,
    extensionUntil: null,
    evaluationDue,
    isPaused,
  };
}

/**
 * The derived fields every thesis response carries in place of the old stored
 * `rating` / `deadlineDate`.
 */
export function summarizeThesisProgress(thesis, now = new Date()) {
  const lastActivityAt = getLastActivityAt(thesis);
  return {
    lastActivityAt,
    daysSinceActivity: wholeDaysBetween(lastActivityAt, now),
    activityLevel: thesis?.status === THESIS_STATUS.RESEARCH ? deriveActivityLevel(lastActivityAt, now) : null,
    supervisionClock: getSupervisionClock(thesis, thesis?.thesisGuidanceEvaluations ?? [], now),
  };
}
