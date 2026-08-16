import { describe, expect, it } from "vitest";
import {
  ALL_PERIODS_LABEL,
  aggregateKbkLoads,
  periodLabelFromAcademicYear,
  uniqueThesisCountFromLoads,
} from "../../utils/loadScope.util.js";

describe("loadScope.util", () => {
  it("labels a missing academic year as all periods", () => {
    expect(periodLabelFromAcademicYear(null)).toBe(ALL_PERIODS_LABEL);
  });

  it("counts unique theses across lecturers without double-counting", () => {
    const count = uniqueThesisCountFromLoads([
      { students: [{ thesisId: "t1" }, { thesisId: "t2" }] },
      { students: [{ thesisId: "t1" }, { thesisId: null }] },
    ]);
    expect(count).toBe(2);
  });

  it("aggregates KBK load from already computed lecturer rows and flags mean ± 1 SD", () => {
    const result = aggregateKbkLoads([
      {
        lecturerId: "a",
        fullName: "A",
        scienceGroupId: "rpl",
        scienceGroup: "RPL",
        currentCount: 10,
        activeCount: 7,
        bookingCount: 3,
        isFull: true,
      },
      {
        lecturerId: "b",
        fullName: "B",
        scienceGroupId: "rpl",
        scienceGroup: "RPL",
        currentCount: 2,
        activeCount: 1,
        bookingCount: 1,
        isNearLimit: true,
      },
      {
        lecturerId: "c",
        fullName: "C",
        scienceGroupId: "si",
        scienceGroup: "SI",
        currentCount: 2,
        activeCount: 2,
        bookingCount: 0,
      },
      {
        lecturerId: "d",
        fullName: "D",
        scienceGroupId: null,
        scienceGroup: null,
        currentCount: 2,
        activeCount: 0,
        bookingCount: 2,
      },
    ]);

    expect(result.overall.lecturerCount).toBe(4);
    expect(result.overall.totalLoad).toBe(16);
    expect(result.overall.averageLoad).toBe(4);
    expect(result.overall.fullCount).toBe(1);
    expect(result.overall.nearLimitCount).toBe(1);
    expect(result.overall.availableCount).toBe(2);
    expect(result.groups).toHaveLength(3);

    const rpl = result.groups.find((group) => group.scienceGroupId === "rpl");
    expect(rpl.lecturerCount).toBe(2);
    expect(rpl.totalLoad).toBe(12);
    expect(rpl.activeCount).toBe(8);
    expect(rpl.bookingCount).toBe(4);
    expect(rpl.aboveAverage.map((row) => row.lecturerId)).toEqual(["a"]);
    expect(rpl.belowAverage).toEqual([]);
  });

  it("does not flag outliers when every lecturer has the same load", () => {
    const result = aggregateKbkLoads([
      { lecturerId: "a", fullName: "A", scienceGroup: "RPL", currentCount: 3 },
      { lecturerId: "b", fullName: "B", scienceGroup: "SI", currentCount: 3 },
    ]);
    expect(result.overall.stdDev).toBe(0);
    expect(result.groups.every((group) => group.aboveAverage.length === 0)).toBe(true);
    expect(result.groups.every((group) => group.belowAverage.length === 0)).toBe(true);
  });
});
