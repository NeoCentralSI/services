import { describe, expect, it } from "vitest";
import { resolveScoreCells, __test } from "../assessmentExport.service.js";

const { buildRowNote } = __test;
const columns = { columns: [{ key: "a", role: "supervisor" }, { key: "b", role: "default" }] };

describe("assessment export — period close vs auto-zero notes", () => {
  it("fills zeros and uses a distinct note for period-closed scores", () => {
    const score = { periodClosedAt: new Date(), attendanceAutoZeroedAt: null };
    expect(resolveScoreCells(score, columns)).toEqual([0, 0]);
    expect(buildRowNote({ attendancePercentage: 0.8, inAttendanceImport: true }, score)).toBe(
      "Tutup periode Metopel",
    );
  });

  it("keeps the attendance auto-zero note separate", () => {
    const score = { attendanceAutoZeroedAt: new Date(), periodClosedAt: null };
    expect(buildRowNote({ attendancePercentage: 0.5, inAttendanceImport: true }, score)).toContain(
      "Auto-zero presensi",
    );
  });
});
