import { describe, expect, it } from "vitest";
import {
  ATTENTION_REASON,
  ATTENTION_REASON_LABELS,
  ATTENTION_THRESHOLD_DAYS,
  EVENT_STATUS_GROUPS,
} from "../../constants/thesis-event-monitoring.js";
import {
  buildReadyToRegisterWhere,
  compareBySchedule,
  getAverageFinalScore,
  isRevisionPending,
  isUpcomingEvent,
  resolveEventAttention,
  summarizeEvents,
  todayWib,
} from "../thesis-event-monitoring.helper.js";
import { matches } from "../../test/unit/nabil/helpers/fakePrisma.js";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// Tuesday 13 October 2026, 15.00 WIB.
const NOW = new Date("2026-10-13T08:00:00.000Z");
const before = (ms) => new Date(NOW.getTime() - ms);
/** A calendar date as the seminar and defence modules store it: midnight UTC. */
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const event = (status, overrides = {}) => ({
  id: `${status}-1`,
  status,
  date: null,
  startTime: null,
  registeredAt: null,
  verifiedAt: null,
  resultFinalizedAt: null,
  revisionFinalizedAt: null,
  finalScore: null,
  createdAt: before(90 * DAY),
  ...overrides,
});

describe("status groups of the summary cards", () => {
  it("puts every status of the enum in exactly one card", () => {
    const all = Object.values(EVENT_STATUS_GROUPS).flat();
    expect([...all].sort()).toEqual(
      ["cancelled", "examiner_assigned", "failed", "passed", "passed_with_revision", "registered", "scheduled", "verified"],
    );
    expect(new Set(all).size).toBe(all.length);
    expect(EVENT_STATUS_GROUPS).toEqual({
      inProcess: ["registered", "verified", "examiner_assigned"],
      scheduled: ["scheduled"],
      passed: ["passed", "passed_with_revision"],
      notPassed: ["failed", "cancelled"],
    });
  });

  it("counts the events per card, with the unfinished revisions as a part of Lulus", () => {
    const events = [
      event("registered"),
      event("verified"),
      event("examiner_assigned"),
      event("scheduled"),
      event("scheduled"),
      event("passed"),
      event("passed_with_revision"),
      event("passed_with_revision", { revisionFinalizedAt: before(DAY) }),
      event("failed"),
      event("cancelled"),
    ];

    expect(summarizeEvents(events)).toEqual({
      total: 10,
      inProcess: 3,
      scheduled: 2,
      passed: 3,
      revisionPending: 1,
      notPassed: 2,
    });
    expect(summarizeEvents([])).toEqual({ total: 0, inProcess: 0, scheduled: 0, passed: 0, revisionPending: 0, notPassed: 0 });
  });

  it("calls a revision pending only for lulus dengan revisi without a finalisation date", () => {
    expect(isRevisionPending(event("passed_with_revision"))).toBe(true);
    expect(isRevisionPending(event("passed_with_revision", { revisionFinalizedAt: NOW }))).toBe(false);
    expect(isRevisionPending(event("passed"))).toBe(false);
    expect(isRevisionPending(event("scheduled"))).toBe(false);
  });
});

describe("average final score", () => {
  it("averages the events that passed and have a score", () => {
    const events = [
      event("passed", { finalScore: 84 }),
      event("passed_with_revision", { finalScore: 78.5 }),
      event("passed", { finalScore: null }), // passed, not scored yet
      event("failed", { finalScore: 40 }), // did not pass
      event("scheduled", { finalScore: 90 }),
    ];
    expect(getAverageFinalScore(events)).toBe(81.25);
  });

  it("rounds to two decimals and is null when nothing qualifies", () => {
    expect(getAverageFinalScore([event("passed", { finalScore: 80 }), event("passed", { finalScore: 81 }), event("passed", { finalScore: 81 })])).toBe(80.67);
    expect(getAverageFinalScore([event("failed", { finalScore: 40 })])).toBeNull();
    expect(getAverageFinalScore([])).toBeNull();
  });
});

describe("Jadwal Mendatang", () => {
  it("takes today's calendar date in WIB", () => {
    expect(todayWib(NOW)).toEqual(day("2026-10-13"));
    // 23.30 WIB on the 13th and 00.30 WIB on the 14th are different days in WIB, the same day in UTC.
    expect(todayWib(new Date("2026-10-13T16:30:00.000Z"))).toEqual(day("2026-10-13"));
    expect(todayWib(new Date("2026-10-13T17:30:00.000Z"))).toEqual(day("2026-10-14"));
  });

  it("keeps scheduled events held today or later", () => {
    expect(isUpcomingEvent(event("scheduled", { date: day("2026-10-13") }), NOW)).toBe(true);
    expect(isUpcomingEvent(event("scheduled", { date: day("2026-10-20") }), NOW)).toBe(true);
    expect(isUpcomingEvent(event("scheduled", { date: day("2026-10-12") }), NOW)).toBe(false);
    // Other statuses are not upcoming, whatever their date.
    expect(isUpcomingEvent(event("examiner_assigned", { date: day("2026-10-20") }), NOW)).toBe(false);
    expect(isUpcomingEvent(event("passed", { date: day("2026-10-20") }), NOW)).toBe(false);
    expect(isUpcomingEvent(event("scheduled"), NOW)).toBe(false);
  });

  it("orders them by day, then by the time of day", () => {
    const events = [
      event("scheduled", { id: "c", date: day("2026-10-21"), startTime: time("09:00") }),
      event("scheduled", { id: "b", date: day("2026-10-20"), startTime: time("13:30") }),
      event("scheduled", { id: "untimed", date: day("2026-10-20") }),
      event("scheduled", { id: "a", date: day("2026-10-20"), startTime: time("09:00") }),
    ];
    expect([...events].sort(compareBySchedule).map((e) => e.id)).toEqual(["a", "b", "untimed", "c"]);
  });
});

describe("Perlu Perhatian", () => {
  it("has the four thresholds in one place", () => {
    expect(ATTENTION_THRESHOLD_DAYS).toEqual({
      document_verification: 7,
      scheduling: 14,
      result_finalization: 3,
      revision: 30,
    });
  });

  it("flags a registration that waits for document verification for more than 7 days", () => {
    const at = (elapsed) => resolveEventAttention(event("registered", { registeredAt: before(elapsed) }), NOW);

    expect(at(7 * DAY)).toBeNull(); // exactly 7 days: not yet
    expect(at(8 * DAY - MINUTE)).toBeNull(); // still the 7th whole day
    expect(at(8 * DAY)).toEqual({
      reason: ATTENTION_REASON.DOCUMENT_VERIFICATION,
      reasonLabel: "Menunggu verifikasi dokumen",
      since: before(8 * DAY),
      days: 8,
    });
    expect(at(20 * DAY).days).toBe(20);
  });

  it("flags a verified registration that is still unscheduled after more than 14 days", () => {
    for (const status of ["verified", "examiner_assigned"]) {
      const at = (elapsed) => resolveEventAttention(event(status, { registeredAt: before(60 * DAY), verifiedAt: before(elapsed) }), NOW);

      expect(at(14 * DAY)).toBeNull();
      expect(at(15 * DAY - MINUTE)).toBeNull();
      expect(at(15 * DAY)).toMatchObject({ reason: ATTENTION_REASON.SCHEDULING, reasonLabel: "Belum dijadwalkan", days: 15 });
    }
  });

  it("flags a scheduled event whose result is not final more than 3 days after it was held", () => {
    const at = (date, extra = {}) => resolveEventAttention(event("scheduled", { date: day(date), ...extra }), NOW);

    expect(at("2026-10-20")).toBeNull(); // still ahead
    expect(at("2026-10-13")).toBeNull(); // today
    expect(at("2026-10-10")).toBeNull(); // 3 days ago: not yet
    expect(at("2026-10-09")).toEqual({
      reason: ATTENTION_REASON.RESULT_FINALIZATION,
      reasonLabel: "Hasil belum difinalkan",
      since: day("2026-10-09"),
      days: 4,
    });
    // Calendar days in WIB: at 00.30 WIB on the 14th the event of the 10th is 4 days old.
    expect(resolveEventAttention(event("scheduled", { date: day("2026-10-10") }), new Date("2026-10-13T17:30:00.000Z"))).toMatchObject({ days: 4 });
    // A result that is already final is not waited for.
    expect(at("2026-10-01", { resultFinalizedAt: before(DAY) })).toBeNull();
  });

  it("flags lulus dengan revisi whose revision is not final more than 30 days after the result", () => {
    const at = (elapsed, extra = {}) =>
      resolveEventAttention(event("passed_with_revision", { resultFinalizedAt: before(elapsed), ...extra }), NOW);

    expect(at(30 * DAY)).toBeNull();
    expect(at(31 * DAY - MINUTE)).toBeNull();
    expect(at(31 * DAY)).toMatchObject({ reason: ATTENTION_REASON.REVISION, reasonLabel: "Revisi belum selesai", days: 31 });
    expect(at(90 * DAY, { revisionFinalizedAt: before(10 * DAY) })).toBeNull();
  });

  it("needs no attention for an event that is closed", () => {
    const old = { registeredAt: before(200 * DAY), verifiedAt: before(190 * DAY), date: day("2026-04-01"), resultFinalizedAt: before(180 * DAY) };
    for (const status of ["passed", "failed", "cancelled"]) {
      expect(resolveEventAttention(event(status, old), NOW)).toBeNull();
    }
  });

  it("falls back to the next date when the one of the rule is missing", () => {
    // No registeredAt: the creation date.
    expect(resolveEventAttention(event("registered", { createdAt: before(10 * DAY) }), NOW)).toMatchObject({ days: 10 });
    // No verifiedAt: the registration date.
    expect(resolveEventAttention(event("verified", { registeredAt: before(16 * DAY) }), NOW)).toMatchObject({ days: 16 });
    // No resultFinalizedAt: the day it was held.
    expect(resolveEventAttention(event("passed_with_revision", { date: day("2026-08-01") }), NOW)).toMatchObject({ reason: "revision" });
    // A scheduled event without a date cannot be late.
    expect(resolveEventAttention(event("scheduled"), NOW)).toBeNull();
  });

  it("has a label for every reason", () => {
    for (const reason of Object.values(ATTENTION_REASON)) {
      expect(ATTENTION_REASON_LABELS[reason]).toBeTruthy();
      expect(ATTENTION_THRESHOLD_DAYS[reason]).toBeGreaterThan(0);
    }
  });
});

describe("Siap Mendaftar", () => {
  const supervisor = (overrides = {}) => ({ status: "active", seminarReady: false, defenceReady: false, ...overrides });
  const thesis = (overrides = {}) => ({ status: "research", student: { status: "active" }, thesisSupervisors: [], thesisSeminars: [], thesisDefences: [], ...overrides });
  const ready = (kind, row) => matches(row, buildReadyToRegisterWhere(kind));

  it("needs every active supervisor to have approved, and at least one of them", () => {
    const both = [supervisor({ seminarReady: true }), supervisor({ seminarReady: true })];
    expect(ready("seminar", thesis({ thesisSupervisors: both }))).toBe(true);
    expect(ready("seminar", thesis({ thesisSupervisors: [supervisor({ seminarReady: true }), supervisor()] }))).toBe(false);
    expect(ready("seminar", thesis({ thesisSupervisors: [] }))).toBe(false);
    // A released supervisor does not hold the thesis back, and does not count as the approval either.
    expect(ready("seminar", thesis({ thesisSupervisors: [supervisor({ seminarReady: true }), supervisor({ status: "released" })] }))).toBe(true);
    expect(ready("seminar", thesis({ thesisSupervisors: [supervisor({ status: "released", seminarReady: true })] }))).toBe(false);
  });

  it("leaves out a thesis that already has a registration that still stands", () => {
    const approved = [supervisor({ seminarReady: true })];
    for (const status of ["registered", "verified", "examiner_assigned", "scheduled", "passed", "passed_with_revision"]) {
      expect(ready("seminar", thesis({ thesisSupervisors: approved, thesisSeminars: [{ status }] }))).toBe(false);
    }
    // After a failed or cancelled seminar the student may register again.
    for (const status of ["failed", "cancelled"]) {
      expect(ready("seminar", thesis({ thesisSupervisors: approved, thesisSeminars: [{ status }] }))).toBe(true);
    }
    expect(ready("seminar", thesis({ thesisSupervisors: approved, thesisSeminars: [{ status: "failed" }, { status: "registered" }] }))).toBe(false);
  });

  it("reads the defence approval and the defence registrations for the defence", () => {
    const seminarOnly = [supervisor({ seminarReady: true })];
    const defenceApproved = [supervisor({ seminarReady: true, defenceReady: true })];
    const passedSeminar = [{ status: "passed" }];

    expect(ready("defence", thesis({ thesisSupervisors: seminarOnly, thesisSeminars: passedSeminar }))).toBe(false);
    // The passed seminar is not a defence registration.
    expect(ready("defence", thesis({ thesisSupervisors: defenceApproved, thesisSeminars: passedSeminar }))).toBe(true);
    expect(ready("defence", thesis({ thesisSupervisors: defenceApproved, thesisSeminars: passedSeminar, thesisDefences: [{ status: "registered" }] }))).toBe(false);
    expect(ready("defence", thesis({ thesisSupervisors: defenceApproved, thesisDefences: [{ status: "cancelled" }] }))).toBe(true);
  });

  it("only lists theses in Penelitian", () => {
    const approved = [supervisor({ seminarReady: true })];
    for (const status of ["proposal", "completed", "failed"]) {
      expect(ready("seminar", thesis({ status, thesisSupervisors: approved }))).toBe(false);
    }
    // A student on leave is not ready to register.
    expect(ready("seminar", thesis({ student: { status: "bss" }, thesisSupervisors: approved }))).toBe(false);
  });
});
