/**
 * Rules of the Seminar Hasil and Sidang monitoring tabs, for one seminar or
 * defence row at a time: the summary cards, "Jadwal Mendatang" and "Perlu Perhatian".
 * Pure; the thresholds and labels are in constants/thesis-event-monitoring.js.
 */
import { THESIS_STATUS } from "../constants/thesisStatus.js";
import {
  ATTENTION_REASON,
  ATTENTION_REASON_LABELS,
  ATTENTION_THRESHOLD_DAYS,
  EVENT_KIND,
  EVENT_STATUS,
  EVENT_STATUS_GROUPS,
  INACTIVE_REGISTRATION_STATUSES,
} from "../constants/thesis-event-monitoring.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Today's calendar date in WIB, as the seminar and defence modules store a date
 * (`@db.Date`): midnight UTC of that calendar day.
 */
export function todayWib(now = new Date()) {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
}

/** Whole days from `since` to `until`; null without a date. */
function wholeDaysBetween(since, until) {
  if (since == null) return null;
  return Math.floor((until.getTime() - new Date(since).getTime()) / DAY_MS);
}

/**
 * "Siap Mendaftar" as a Prisma `where` of `Thesis`: a running thesis whose active
 * supervisors (at least one) have all approved readiness for the seminar or the defence,
 * and that has no registration that still stands.
 */
export function buildReadyToRegisterWhere(kind) {
  const isDefence = kind === EVENT_KIND.DEFENCE;
  const readyFlag = isDefence ? "defenceReady" : "seminarReady";
  const registrations = isDefence ? "thesisDefences" : "thesisSeminars";
  return {
    status: THESIS_STATUS.RESEARCH,
    AND: [
      { thesisSupervisors: { every: { OR: [{ status: { not: "active" } }, { [readyFlag]: true }] } } },
      { thesisSupervisors: { some: { status: "active", [readyFlag]: true } } },
    ],
    [registrations]: { none: { status: { notIn: INACTIVE_REGISTRATION_STATUSES } } },
  };
}

/** Lulus dengan revisi whose revision has not been finalised. */
export function isRevisionPending(event) {
  return event.status === EVENT_STATUS.PASSED_WITH_REVISION && !event.revisionFinalizedAt;
}

/** Average final score of the events that passed and have a score; null when there is none. */
export function getAverageFinalScore(events) {
  const scores = events
    .filter((event) => EVENT_STATUS_GROUPS.passed.includes(event.status) && event.finalScore != null)
    .map((event) => event.finalScore);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
}

/** Numbers of the summary cards. `revisionPending` is a part of `passed`. */
export function summarizeEvents(events) {
  const countOf = (group) => events.filter((event) => EVENT_STATUS_GROUPS[group].includes(event.status)).length;
  return {
    total: events.length,
    inProcess: countOf("inProcess"),
    scheduled: countOf("scheduled"),
    passed: countOf("passed"),
    revisionPending: events.filter(isRevisionPending).length,
    notPassed: countOf("notPassed"),
  };
}

/** "Jadwal Mendatang": scheduled and held today (WIB) or later. */
export function isUpcomingEvent(event, now = new Date()) {
  if (event.status !== EVENT_STATUS.SCHEDULED || !event.date) return false;
  return new Date(event.date).getTime() >= todayWib(now).getTime();
}

/** Nearest first: by day, then by the time of day. An event without a time comes last on its day. */
export function compareBySchedule(a, b) {
  const day = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (day !== 0) return day;
  const time = (event) => (event.startTime ? new Date(event.startTime).getTime() : Number.POSITIVE_INFINITY);
  return time(a) - time(b);
}

/**
 * Why a seminar or defence needs attention, or null. `days` is how long it has waited in
 * whole days and `since` the date the wait is counted from. One reason at most applies,
 * because each rule belongs to a different status.
 */
export function resolveEventAttention(event, now = new Date()) {
  let reason = null;
  let since = null;
  let days = null;

  if (event.status === EVENT_STATUS.REGISTERED) {
    reason = ATTENTION_REASON.DOCUMENT_VERIFICATION;
    since = event.registeredAt ?? event.createdAt ?? null;
    days = wholeDaysBetween(since, now);
  } else if (event.status === EVENT_STATUS.VERIFIED || event.status === EVENT_STATUS.EXAMINER_ASSIGNED) {
    reason = ATTENTION_REASON.SCHEDULING;
    since = event.verifiedAt ?? event.registeredAt ?? event.createdAt ?? null;
    days = wholeDaysBetween(since, now);
  } else if (event.status === EVENT_STATUS.SCHEDULED && !event.resultFinalizedAt) {
    // Counted in calendar days: the day it was held against today in WIB.
    reason = ATTENTION_REASON.RESULT_FINALIZATION;
    since = event.date ?? null;
    days = wholeDaysBetween(since, todayWib(now));
  } else if (isRevisionPending(event)) {
    reason = ATTENTION_REASON.REVISION;
    since = event.resultFinalizedAt ?? event.date ?? null;
    days = wholeDaysBetween(since, now);
  }

  if (reason === null || days === null || days <= ATTENTION_THRESHOLD_DAYS[reason]) return null;
  return { reason, reasonLabel: ATTENTION_REASON_LABELS[reason], since: new Date(since), days };
}
