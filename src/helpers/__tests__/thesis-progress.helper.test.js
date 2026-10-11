import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVEL,
  EVALUATION_DUE,
  deriveActivityLevel,
  formatSupervisionDuration,
  getActivityLevel,
  getLastActivityAt,
  getSupervisionClock,
  summarizeThesisProgress,
} from "../thesis-progress.helper.js";

const NOW = new Date("2026-10-11T05:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);

describe("getLastActivityAt", () => {
  it("takes the latest date across completed guidance, completed milestones, seminars and the thesis row", () => {
    const thesis = {
      createdAt: daysAgo(400),
      updatedAt: daysAgo(90),
      thesisGuidances: [
        { status: "completed", approvedDate: daysAgo(50), completedAt: daysAgo(45) },
        { status: "requested", approvedDate: daysAgo(1), completedAt: null }, // not completed: ignored
        { completedAt: daysAgo(70) },
      ],
      thesisMilestones: [
        { status: "completed", updatedAt: daysAgo(30) },
        { status: "in_progress", updatedAt: daysAgo(2) }, // not completed: ignored
      ],
      thesisSeminars: [{ updatedAt: daysAgo(40) }],
    };
    expect(getLastActivityAt(thesis)).toEqual(daysAgo(30));
  });

  it("uses approvedDate before completedAt for a session, and falls back to createdAt", () => {
    expect(getLastActivityAt({ thesisGuidances: [{ approvedDate: daysAgo(10), completedAt: daysAgo(3) }] })).toEqual(daysAgo(10));
    expect(getLastActivityAt({ createdAt: daysAgo(5) })).toEqual(daysAgo(5));
    expect(getLastActivityAt({})).toBeNull();
    expect(getLastActivityAt(null)).toBeNull();
  });
});

describe("deriveActivityLevel", () => {
  it.each([
    [0, ACTIVITY_LEVEL.ACTIVE],
    [59, ACTIVITY_LEVEL.ACTIVE],
    [60, ACTIVITY_LEVEL.SLOW],
    [120, ACTIVITY_LEVEL.SLOW],
    [121, ACTIVITY_LEVEL.AT_RISK],
    [400, ACTIVITY_LEVEL.AT_RISK],
  ])("%i days without activity -> %s", (days, expected) => {
    expect(deriveActivityLevel(daysAgo(days), NOW)).toBe(expected);
  });

  it("counts whole days and returns null without a date", () => {
    expect(deriveActivityLevel(new Date(NOW.getTime() - 60 * DAY + 1000), NOW)).toBe(ACTIVITY_LEVEL.ACTIVE);
    expect(deriveActivityLevel(null, NOW)).toBeNull();
    expect(deriveActivityLevel("not-a-date", NOW)).toBeNull();
  });

  it("only applies to a thesis in research", () => {
    const base = { updatedAt: daysAgo(200) };
    expect(getActivityLevel({ ...base, status: "research" }, NOW)).toBe(ACTIVITY_LEVEL.AT_RISK);
    for (const status of ["proposal", "on_leave", "completed", "failed"]) {
      expect(getActivityLevel({ ...base, status }, NOW)).toBeNull();
    }
  });
});

describe("getSupervisionClock", () => {
  const research = (startDate, extra = {}) => ({ status: "research", startDate, totalLeaveDays: 0, ...extra });

  it("returns an empty clock without startDate", () => {
    expect(getSupervisionClock({ status: "research", startDate: null }, [], NOW)).toMatchObject({
      startedAt: null,
      elapsedDays: null,
      elapsedLabel: "-",
      sixMonthAt: null,
      oneYearAt: null,
      evaluationDue: null,
    });
  });

  it("counts calendar months from startDate", () => {
    const clock = getSupervisionClock(research(new Date("2026-02-28T05:00:00.000Z")), [], NOW);
    expect(clock.elapsedMonths).toBe(7);
    expect(clock.elapsedLabel).toBe("7 bulan 13 hari");
    expect(clock.sixMonthAt).toEqual(new Date("2026-08-28T05:00:00.000Z"));
    expect(clock.oneYearAt).toEqual(new Date("2027-02-28T05:00:00.000Z"));
    expect(clock.evaluationDue).toBe(EVALUATION_DUE.SIX_MONTH);
    expect(clock.isPaused).toBe(false);
  });

  it.each([
    ["one day before six months", "2026-04-12T05:00:00.000Z", null, "5 bulan 29 hari"],
    ["exactly six months", "2026-04-11T05:00:00.000Z", EVALUATION_DUE.SIX_MONTH, "6 bulan"],
    ["one day before one year", "2025-10-12T05:00:00.000Z", EVALUATION_DUE.SIX_MONTH, "11 bulan 29 hari"],
    ["exactly one year", "2025-10-11T05:00:00.000Z", EVALUATION_DUE.ONE_YEAR, "12 bulan"],
  ])("evaluation due at %s", (_label, startDate, due, label) => {
    const clock = getSupervisionClock(research(new Date(startDate)), [], NOW);
    expect(clock.evaluationDue).toBe(due);
    expect(clock.elapsedLabel).toBe(label);
  });

  it("does not count finished leaves: the due dates move by totalLeaveDays", () => {
    const startDate = new Date("2026-03-11T05:00:00.000Z"); // 7 months before NOW
    expect(getSupervisionClock(research(startDate), [], NOW).evaluationDue).toBe(EVALUATION_DUE.SIX_MONTH);

    const withLeave = getSupervisionClock(research(startDate, { totalLeaveDays: 45 }), [], NOW);
    expect(withLeave.evaluationDue).toBeNull();
    expect(withLeave.elapsedMonths).toBe(5);
    expect(withLeave.sixMonthAt).toEqual(new Date(new Date("2026-09-11T05:00:00.000Z").getTime() + 45 * DAY));
  });

  it("stops while on leave and resumes from the same point", () => {
    const startDate = new Date("2026-03-11T05:00:00.000Z");
    const leaveStartedAt = daysAgo(30);
    const onLeave = getSupervisionClock({ status: "on_leave", startDate, totalLeaveDays: 0, leaveStartedAt }, [], NOW);
    expect(onLeave.isPaused).toBe(true);
    expect(onLeave.evaluationDue).toBeNull();
    // Stopped at the start of the leave: 2026-03-11 -> 2026-09-11 is exactly six months.
    expect(onLeave.elapsedLabel).toBe("6 bulan");

    // Later during the same leave the elapsed time has not moved.
    const later = new Date(NOW.getTime() + 20 * DAY);
    expect(getSupervisionClock({ status: "on_leave", startDate, totalLeaveDays: 0, leaveStartedAt }, [], later).elapsedLabel).toBe("6 bulan");

    // Back in research with the 30 leave days recorded: same elapsed time, clock running again.
    const resumed = getSupervisionClock(research(startDate, { totalLeaveDays: 30 }), [], NOW);
    expect(resumed.isPaused).toBe(false);
    expect(resumed.elapsedLabel).toBe("6 bulan");
    expect(resumed.evaluationDue).toBe(EVALUATION_DUE.SIX_MONTH);
  });

  it("stops at the closing date of a finished thesis and never reports a due evaluation", () => {
    const clock = getSupervisionClock(
      { status: "completed", startDate: new Date("2025-01-11T05:00:00.000Z"), statusChangedAt: new Date("2026-01-11T05:00:00.000Z"), totalLeaveDays: 0 },
      [],
      NOW,
    );
    expect(clock.elapsedLabel).toBe("12 bulan");
    expect(clock.evaluationDue).toBeNull();
  });

  it("never reports a due evaluation for a proposal thesis", () => {
    expect(getSupervisionClock({ status: "proposal", startDate: daysAgo(500) }, [], NOW).evaluationDue).toBeNull();
  });
});

describe("formatSupervisionDuration", () => {
  it("formats months and days", () => {
    expect(formatSupervisionDuration(7, 12)).toBe("7 bulan 12 hari");
    expect(formatSupervisionDuration(0, 12)).toBe("12 hari");
    expect(formatSupervisionDuration(0, 0)).toBe("0 hari");
    expect(formatSupervisionDuration(3, 0)).toBe("3 bulan");
    expect(formatSupervisionDuration(null, null)).toBe("-");
  });
});

describe("summarizeThesisProgress", () => {
  it("returns the derived fields that replace rating and deadlineDate", () => {
    const summary = summarizeThesisProgress(
      { status: "research", startDate: daysAgo(400), totalLeaveDays: 0, updatedAt: daysAgo(130), createdAt: daysAgo(400) },
      NOW,
    );
    expect(summary).toMatchObject({
      lastActivityAt: daysAgo(130),
      daysSinceActivity: 130,
      activityLevel: ACTIVITY_LEVEL.AT_RISK,
    });
    expect(summary.supervisionClock.evaluationDue).toBe(EVALUATION_DUE.ONE_YEAR);
  });
});
