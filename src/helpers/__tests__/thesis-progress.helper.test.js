import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVEL,
  EVALUATION_DUE,
  deriveActivityLevel,
  formatSupervisionDuration,
  getActivityLevel,
  getLastActivityAt,
  getSupervisionClock,
  resolveProgressWarning,
  summarizeThesisProgress,
  WARNING_SKIP_LABELS,
  WARNING_SKIP_REASON,
} from "../thesis-progress.helper.js";

const NOW = new Date("2026-10-11T05:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY);

describe("getLastActivityAt", () => {
  it("takes the latest date across completed guidance, completed milestones and seminars", () => {
    const thesis = {
      createdAt: daysAgo(400),
      startDate: daysAgo(300),
      statusChangedAt: daysAgo(300),
      thesisGuidances: [
        { status: "completed", approvedDate: daysAgo(50), completedAt: daysAgo(45) },
        { status: "requested", approvedDate: daysAgo(1), completedAt: null }, // not completed: ignored
        { completedAt: daysAgo(70) },
      ],
      thesisMilestones: [
        { status: "completed", completedAt: daysAgo(30), updatedAt: daysAgo(30) },
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

  it("editing the thesis row is not activity: updatedAt is not read", () => {
    const thesis = {
      status: "research",
      createdAt: daysAgo(400),
      startDate: daysAgo(300),
      statusChangedAt: daysAgo(300),
      thesisGuidances: [{ status: "completed", approvedDate: daysAgo(130) }],
    };
    const edited = { ...thesis, updatedAt: daysAgo(1) }; // e.g. an Admin edit in the data master
    expect(getLastActivityAt(edited)).toEqual(daysAgo(130));
    expect(getActivityLevel(thesis, NOW)).toBe(ACTIVITY_LEVEL.AT_RISK);
    expect(getActivityLevel(edited, NOW)).toBe(ACTIVITY_LEVEL.AT_RISK);
  });

  it("feedback on a completed milestone is not activity: completedAt wins over updatedAt", () => {
    const thesis = {
      status: "research",
      startDate: daysAgo(300),
      statusChangedAt: daysAgo(300),
      thesisMilestones: [{ status: "completed", completedAt: daysAgo(90), updatedAt: daysAgo(90) }],
    };
    const withFeedback = { ...thesis, thesisMilestones: [{ status: "completed", completedAt: daysAgo(90), updatedAt: daysAgo(2) }] };
    expect(getLastActivityAt(withFeedback)).toEqual(daysAgo(90));
    expect(getActivityLevel(thesis, NOW)).toBe(ACTIVITY_LEVEL.SLOW);
    expect(getActivityLevel(withFeedback, NOW)).toBe(ACTIVITY_LEVEL.SLOW);
  });

  it("a completed milestone without completedAt falls back to its updatedAt", () => {
    expect(getLastActivityAt({ thesisMilestones: [{ status: "completed", completedAt: null, updatedAt: daysAgo(20) }] })).toEqual(daysAgo(20));
  });

  it("without any activity the count starts at the later of startDate and statusChangedAt, then createdAt", () => {
    // Just entered research: not slow at once, whatever the age of the row.
    const entered = { status: "research", createdAt: daysAgo(400), startDate: daysAgo(3), statusChangedAt: daysAgo(3) };
    expect(getLastActivityAt(entered)).toEqual(daysAgo(3));
    expect(getActivityLevel(entered, NOW)).toBe(ACTIVITY_LEVEL.ACTIVE);
    expect(getLastActivityAt({ createdAt: daysAgo(400), startDate: daysAgo(200), statusChangedAt: null })).toEqual(daysAgo(200));
    expect(getLastActivityAt({ createdAt: daysAgo(400), startDate: null, statusChangedAt: null })).toEqual(daysAgo(400));
  });

  it("coming back from leave starts the count at the return date", () => {
    // Last session 150 days ago, then a leave; back in research 4 days ago.
    const returned = {
      status: "research",
      createdAt: daysAgo(400),
      startDate: daysAgo(300),
      statusChangedAt: daysAgo(4),
      totalLeaveDays: 100,
      thesisGuidances: [{ status: "completed", approvedDate: daysAgo(150) }],
    };
    expect(getLastActivityAt(returned)).toEqual(daysAgo(4));
    expect(getActivityLevel(returned, NOW)).toBe(ACTIVITY_LEVEL.ACTIVE);
    // With no new activity the count keeps running from the return date.
    const later = new Date(NOW.getTime() + 60 * DAY);
    expect(getActivityLevel(returned, later)).toBe(ACTIVITY_LEVEL.SLOW);
    // An activity after the return replaces it.
    const active = { ...returned, thesisGuidances: [...returned.thesisGuidances, { status: "completed", approvedDate: daysAgo(1) }] };
    expect(getLastActivityAt(active)).toEqual(daysAgo(1));
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
    const base = { startDate: daysAgo(200), statusChangedAt: daysAgo(200) };
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

describe("getSupervisionClock — evaluations already recorded (E5)", () => {
  const sevenMonths = new Date("2026-03-11T05:00:00.000Z");
  const thirteenMonths = new Date("2025-09-11T05:00:00.000Z");
  const thesis = (startDate, extra = {}) => ({ status: "research", startDate, totalLeaveDays: 0, ...extra });
  const evaluation = (extra = {}) => ({
    evaluationType: "six_month",
    isFollowUp: false,
    recommendation: "continue",
    status: "approved",
    extensionUntil: null,
    createdAt: daysAgo(20),
    ...extra,
  });
  const due = (t, evaluations) => getSupervisionClock(t, evaluations, NOW).evaluationDue;

  it("six months is no longer due once an evaluation is recorded, approved or still pending", () => {
    expect(due(thesis(sevenMonths), [])).toBe(EVALUATION_DUE.SIX_MONTH);
    expect(due(thesis(sevenMonths), [evaluation()])).toBeNull();
    expect(due(thesis(sevenMonths), [evaluation({ recommendation: "extend_1_month", status: "pending" })])).toBeNull();
  });

  it("a rejected evaluation does not count: the stage is due again", () => {
    expect(due(thesis(sevenMonths), [evaluation({ recommendation: "extend_1_month", status: "rejected" })])).toBe(EVALUATION_DUE.SIX_MONTH);
  });

  it("the extension runs for its month, then the follow-up is due until it is recorded", () => {
    const extend = (extensionUntil) => evaluation({ recommendation: "extend_1_month", extensionUntil, createdAt: daysAgo(40) });
    const running = getSupervisionClock(thesis(sevenMonths), [extend(new Date(NOW.getTime() + 5 * DAY))], NOW);
    expect(running.evaluationDue).toBeNull();
    expect(running.extensionUntil).toEqual(new Date(NOW.getTime() + 5 * DAY));

    const ended = [extend(daysAgo(1))];
    expect(due(thesis(sevenMonths), ended)).toBe(EVALUATION_DUE.EXTENSION_FOLLOW_UP);
    expect(due(thesis(sevenMonths), [...ended, evaluation({ isFollowUp: true, createdAt: daysAgo(0) })])).toBeNull();
    expect(due(thesis(sevenMonths), [...ended, evaluation({ isFollowUp: true, status: "rejected", createdAt: daysAgo(0) })])).toBe(
      EVALUATION_DUE.EXTENSION_FOLLOW_UP,
    );
  });

  it("one year is due at twelve months regardless of the six-month stage, until it is recorded", () => {
    expect(due(thesis(thirteenMonths), [])).toBe(EVALUATION_DUE.ONE_YEAR);
    expect(due(thesis(thirteenMonths), [evaluation({ createdAt: daysAgo(150) })])).toBe(EVALUATION_DUE.ONE_YEAR);
    expect(due(thesis(thirteenMonths), [evaluation({ evaluationType: "one_year" })])).toBeNull();
  });

  it("nothing is due after a passed results seminar", () => {
    for (const status of ["passed", "passed_with_revision"]) {
      expect(due(thesis(thirteenMonths, { thesisSeminars: [{ status }] }), [])).toBeNull();
    }
    expect(due(thesis(thirteenMonths, { thesisSeminars: [{ status: "failed" }] }), [])).toBe(EVALUATION_DUE.ONE_YEAR);
  });

  it("evaluations made before the clock started do not count (the thesis repeated its proposal)", () => {
    expect(due(thesis(sevenMonths), [evaluation({ createdAt: new Date("2025-06-01T00:00:00.000Z") })])).toBe(EVALUATION_DUE.SIX_MONTH);
  });

  it("summarizeThesisProgress reads the evaluations carried by the thesis", () => {
    const summary = summarizeThesisProgress({ ...thesis(sevenMonths), updatedAt: daysAgo(1), thesisGuidanceEvaluations: [evaluation()] }, NOW);
    expect(summary.supervisionClock.evaluationDue).toBeNull();
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
      {
        status: "research",
        startDate: daysAgo(400),
        statusChangedAt: daysAgo(400),
        totalLeaveDays: 0,
        updatedAt: daysAgo(1), // not an activity source
        createdAt: daysAgo(400),
        thesisGuidances: [{ status: "completed", approvedDate: daysAgo(130) }],
      },
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

describe("resolveProgressWarning", () => {
  const research = (daysIdle, overrides = {}) => ({ status: "research", startDate: daysAgo(daysIdle), createdAt: daysAgo(daysIdle), ...overrides });

  it("gives the level of the thesis itself: Lambat from 60 days, Berisiko after 120", () => {
    expect(resolveProgressWarning(research(60), NOW)).toEqual({ level: "slow", skipReason: null, daysSinceActivity: 60 });
    expect(resolveProgressWarning(research(120), NOW)).toEqual({ level: "slow", skipReason: null, daysSinceActivity: 120 });
    expect(resolveProgressWarning(research(121), NOW)).toEqual({ level: "at_risk", skipReason: null, daysSinceActivity: 121 });
  });

  it("gives no warning to a Lancar thesis", () => {
    expect(resolveProgressWarning(research(59), NOW)).toEqual({ level: null, skipReason: WARNING_SKIP_REASON.ACTIVE, daysSinceActivity: 59 });
    // Long since the start, but a session was completed last week.
    const thesis = research(300, { thesisGuidances: [{ approvedDate: daysAgo(7), completedAt: daysAgo(7) }] });
    expect(resolveProgressWarning(thesis, NOW)).toMatchObject({ level: null, skipReason: "active" });
  });

  it.each(["proposal", "on_leave", "completed", "failed"])("gives no warning to a thesis with status %s", (status) => {
    expect(resolveProgressWarning(research(300, { status }), NOW)).toMatchObject({ level: null, skipReason: "not_research" });
  });

  it("gives no warning when the activity cannot be derived", () => {
    expect(resolveProgressWarning({ status: "research" }, NOW)).toEqual({ level: null, skipReason: "active", daysSinceActivity: null });
    expect(resolveProgressWarning(null, NOW)).toMatchObject({ level: null, skipReason: "not_research" });
  });

  it("has a label for every reason", () => {
    expect(Object.keys(WARNING_SKIP_LABELS).sort()).toEqual(Object.values(WARNING_SKIP_REASON).sort());
  });
});
