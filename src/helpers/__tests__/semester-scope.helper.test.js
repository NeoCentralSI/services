import { describe, expect, it } from "vitest";
import {
  buildEventInSemesterWhere,
  buildEventSemesterWhere,
  buildThesisRunningInSemesterWhere,
  buildThesisSemesterWhere,
  getEventReferenceDate,
  getSemesterRange,
  getThesisEndedAt,
  getThesisStartedAt,
  isDateInSemester,
  isEventInSemester,
  isThesisRunningInSemester,
} from "../semester-scope.helper.js";
import { matches } from "../../test/unit/nabil/helpers/fakePrisma.js";

const at = (iso) => new Date(iso);

// Ganjil 2026/2027 and the semester before it, as the master seeder stores them.
const CURRENT = { id: "ay-current", startDate: at("2026-08-01T00:00:00.000Z"), endDate: at("2027-01-31T00:00:00.000Z") };
const PREVIOUS = { id: "ay-previous", startDate: at("2026-02-01T00:00:00.000Z"), endDate: at("2026-07-31T00:00:00.000Z") };

const thesis = (overrides = {}) => ({
  status: "research",
  startDate: null,
  statusChangedAt: null,
  createdAt: at("2026-03-01T00:00:00.000Z"),
  updatedAt: at("2026-03-01T00:00:00.000Z"),
  ...overrides,
});

/** The predicate and the Prisma `where` must give the same answer for every row. */
function runsIn(row, academicYear) {
  const range = getSemesterRange(academicYear);
  const byPredicate = isThesisRunningInSemester(row, range);
  const byWhere = matches(row, buildThesisRunningInSemesterWhere(range));
  expect(byWhere).toBe(byPredicate);
  return byPredicate;
}

describe("getSemesterRange", () => {
  it("returns the start and end of a semester", () => {
    expect(getSemesterRange(CURRENT)).toEqual({ start: CURRENT.startDate, end: CURRENT.endDate });
  });

  it("is null when the academic year is missing or has no dates", () => {
    expect(getSemesterRange(null)).toBeNull();
    expect(getSemesterRange({ id: "ay", startDate: null, endDate: null })).toBeNull();
    expect(getSemesterRange({ id: "ay", startDate: CURRENT.startDate, endDate: null })).toBeNull();
  });
});

describe("isDateInSemester", () => {
  const range = getSemesterRange(CURRENT);

  it("includes both ends and nothing outside them", () => {
    expect(isDateInSemester(CURRENT.startDate, range)).toBe(true);
    expect(isDateInSemester(CURRENT.endDate, range)).toBe(true);
    expect(isDateInSemester(at("2026-07-31T23:59:59.999Z"), range)).toBe(false);
    expect(isDateInSemester(at("2027-01-31T00:00:00.001Z"), range)).toBe(false);
    expect(isDateInSemester(null, range)).toBe(false);
  });
});

describe("thesis start and end", () => {
  it("starts at startDate, else statusChangedAt, else createdAt", () => {
    const createdAt = at("2026-01-01T00:00:00.000Z");
    const statusChangedAt = at("2026-02-01T00:00:00.000Z");
    const startDate = at("2026-03-01T00:00:00.000Z");
    expect(getThesisStartedAt({ startDate, statusChangedAt, createdAt })).toBe(startDate);
    expect(getThesisStartedAt({ startDate: null, statusChangedAt, createdAt })).toBe(statusChangedAt);
    expect(getThesisStartedAt({ startDate: null, statusChangedAt: null, createdAt })).toBe(createdAt);
  });

  it("only a closed thesis has an end date", () => {
    const statusChangedAt = at("2026-09-01T00:00:00.000Z");
    const updatedAt = at("2026-09-05T00:00:00.000Z");
    for (const status of ["proposal", "research"]) {
      expect(getThesisEndedAt({ status, statusChangedAt, updatedAt })).toBeNull();
    }
    expect(getThesisEndedAt({ status: "completed", statusChangedAt, updatedAt })).toBe(statusChangedAt);
    expect(getThesisEndedAt({ status: "failed", statusChangedAt, updatedAt })).toBe(statusChangedAt);
    expect(getThesisEndedAt({ status: "failed", statusChangedAt: null, updatedAt })).toBe(updatedAt);
  });
});

describe("a thesis running in a semester", () => {
  it("includes a thesis that started last semester and is still running", () => {
    const row = thesis({ startDate: at("2026-03-10T00:00:00.000Z"), statusChangedAt: at("2026-03-10T00:00:00.000Z") });
    expect(runsIn(row, CURRENT)).toBe(true);
    // It ran in the semester it started in as well.
    expect(runsIn(row, PREVIOUS)).toBe(true);
  });

  it("excludes a thesis that finished before the semester started", () => {
    const row = thesis({
      status: "completed",
      startDate: at("2025-09-01T00:00:00.000Z"),
      statusChangedAt: at("2026-07-15T00:00:00.000Z"),
    });
    expect(runsIn(row, CURRENT)).toBe(false);
    expect(runsIn(row, PREVIOUS)).toBe(true);
  });

  it("includes a thesis that finished or was stopped in the middle of the semester", () => {
    for (const status of ["completed", "failed"]) {
      const row = thesis({ status, startDate: at("2026-03-10T00:00:00.000Z"), statusChangedAt: at("2026-10-01T00:00:00.000Z") });
      expect(runsIn(row, CURRENT)).toBe(true);
    }
  });

  it("excludes a thesis that starts after the semester ended", () => {
    const row = thesis({ startDate: at("2027-02-10T00:00:00.000Z"), statusChangedAt: at("2027-02-10T00:00:00.000Z"), createdAt: at("2027-02-10T00:00:00.000Z") });
    expect(runsIn(row, CURRENT)).toBe(false);
    // Nor does a thesis of this semester count for the one before it.
    expect(runsIn(thesis({ startDate: at("2026-08-13T00:00:00.000Z") }), PREVIOUS)).toBe(false);
  });

  it("has no margin: the ends of the semester are the limits", () => {
    expect(runsIn(thesis({ startDate: CURRENT.endDate }), CURRENT)).toBe(true);
    expect(runsIn(thesis({ startDate: at("2027-01-31T00:00:00.001Z") }), CURRENT)).toBe(false);
    // 20 days before the semester starts is the previous semester, not this one...
    const earlyStart = thesis({ status: "completed", startDate: at("2026-07-12T00:00:00.000Z"), statusChangedAt: at("2026-07-20T00:00:00.000Z") });
    expect(runsIn(earlyStart, CURRENT)).toBe(false);
    // ...and a thesis that ended on the first instant of the semester still ran in it.
    const closedOnFirstDay = thesis({ status: "completed", startDate: at("2026-03-01T00:00:00.000Z"), statusChangedAt: CURRENT.startDate });
    expect(runsIn(closedOnFirstDay, CURRENT)).toBe(true);
    const closedJustBefore = thesis({ status: "completed", startDate: at("2026-03-01T00:00:00.000Z"), statusChangedAt: at("2026-07-31T23:59:59.999Z") });
    expect(runsIn(closedJustBefore, CURRENT)).toBe(false);
  });

  it("uses statusChangedAt, then createdAt, when the thesis has no startDate", () => {
    const early = at("2026-05-01T00:00:00.000Z");
    const late = at("2027-03-01T00:00:00.000Z");
    expect(runsIn(thesis({ statusChangedAt: early, createdAt: late }), CURRENT)).toBe(true);
    expect(runsIn(thesis({ statusChangedAt: late, createdAt: early }), CURRENT)).toBe(false);
    expect(runsIn(thesis({ createdAt: early }), CURRENT)).toBe(true);
    expect(runsIn(thesis({ createdAt: late }), CURRENT)).toBe(false);
  });

  it("keeps a thesis paused by a leave as running, whenever the leave started", () => {
    const row = thesis({
      status: "research",
      leaveStartedAt: at("2026-06-01T00:00:00.000Z"),
      startDate: at("2025-09-01T00:00:00.000Z"),
      // The status last changed before this semester, but the thesis has not ended.
      statusChangedAt: at("2026-06-01T00:00:00.000Z"),
    });
    expect(runsIn(row, CURRENT)).toBe(true);
    expect(runsIn(row, PREVIOUS)).toBe(true);
  });

  it("falls back to updatedAt for a closed thesis without statusChangedAt", () => {
    const base = { status: "failed", startDate: at("2025-09-01T00:00:00.000Z"), statusChangedAt: null };
    expect(runsIn(thesis({ ...base, updatedAt: at("2026-09-01T00:00:00.000Z") }), CURRENT)).toBe(true);
    expect(runsIn(thesis({ ...base, updatedAt: at("2026-05-01T00:00:00.000Z") }), CURRENT)).toBe(false);
  });
});

describe("buildThesisSemesterWhere", () => {
  it("filters by the dates of the semester", () => {
    expect(buildThesisSemesterWhere(CURRENT.id, CURRENT)).toEqual(buildThesisRunningInSemesterWhere(getSemesterRange(CURRENT)));
  });

  it("falls back to academicYearId when the semester has no dates or is unknown", () => {
    expect(buildThesisSemesterWhere("ay-1", { id: "ay-1", startDate: null, endDate: null })).toEqual({ academicYearId: "ay-1" });
    expect(buildThesisSemesterWhere("ay-missing", null)).toEqual({ academicYearId: "ay-missing" });
  });
});

describe("a seminar or defence of a semester", () => {
  const event = (overrides = {}) => ({
    status: "registered",
    date: null,
    registeredAt: null,
    createdAt: at("2026-09-01T03:00:00.000Z"),
    ...overrides,
  });

  /** The predicate and the Prisma `where` must give the same answer for every row. */
  function belongsTo(row, academicYear) {
    const range = getSemesterRange(academicYear);
    const byPredicate = isEventInSemester(row, range);
    expect(matches(row, buildEventInSemesterWhere(range))).toBe(byPredicate);
    return byPredicate;
  }

  it("is placed by the day it is held, then registeredAt, then createdAt", () => {
    const date = at("2026-10-20T00:00:00.000Z");
    const registeredAt = at("2026-09-25T02:00:00.000Z");
    const createdAt = at("2026-09-24T02:00:00.000Z");
    expect(getEventReferenceDate({ date, registeredAt, createdAt })).toBe(date);
    expect(getEventReferenceDate({ date: null, registeredAt, createdAt })).toBe(registeredAt);
    expect(getEventReferenceDate({ date: null, registeredAt: null, createdAt })).toBe(createdAt);
  });

  it("belongs to the semester its date falls in, both ends included", () => {
    expect(belongsTo(event({ status: "scheduled", date: at("2026-10-20T00:00:00.000Z") }), CURRENT)).toBe(true);
    expect(belongsTo(event({ status: "passed", date: CURRENT.startDate }), CURRENT)).toBe(true);
    expect(belongsTo(event({ status: "passed", date: CURRENT.endDate }), CURRENT)).toBe(true);
    expect(belongsTo(event({ status: "passed", date: at("2026-07-31T00:00:00.000Z") }), CURRENT)).toBe(false);
    expect(belongsTo(event({ status: "scheduled", date: at("2027-02-01T00:00:00.000Z") }), CURRENT)).toBe(false);
  });

  it("follows the schedule, not the registration, once it has a date", () => {
    // Registered last semester, held this semester.
    const row = event({ status: "passed", date: at("2026-08-10T00:00:00.000Z"), registeredAt: at("2026-07-20T02:00:00.000Z"), createdAt: at("2026-07-20T02:00:00.000Z") });
    expect(belongsTo(row, CURRENT)).toBe(true);
    expect(belongsTo(row, PREVIOUS)).toBe(false);
  });

  it("uses registeredAt while it has no schedule, and createdAt when that is missing too", () => {
    const registeredLastSemester = event({ registeredAt: at("2026-07-10T02:00:00.000Z"), createdAt: at("2026-08-05T02:00:00.000Z") });
    expect(belongsTo(registeredLastSemester, PREVIOUS)).toBe(true);
    expect(belongsTo(registeredLastSemester, CURRENT)).toBe(false);

    expect(belongsTo(event({ createdAt: at("2026-09-01T03:00:00.000Z") }), CURRENT)).toBe(true);
    expect(belongsTo(event({ createdAt: at("2026-05-01T03:00:00.000Z") }), CURRENT)).toBe(false);
  });

  it("falls back to the semester of the thesis when the semester has no dates", () => {
    expect(buildEventSemesterWhere(CURRENT.id, CURRENT)).toEqual(buildEventInSemesterWhere(getSemesterRange(CURRENT)));
    expect(buildEventSemesterWhere("ay-1", { id: "ay-1", startDate: null, endDate: null })).toEqual({ thesis: { academicYearId: "ay-1" } });
    expect(buildEventSemesterWhere("ay-missing", null)).toEqual({ thesis: { academicYearId: "ay-missing" } });
  });
});
