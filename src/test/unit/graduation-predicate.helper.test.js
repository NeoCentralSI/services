import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({ default: {} }));
const { computeGraduationPredicate, countStudySemesters, formatStudyLength, summarize } = await import("../../helpers/graduation-predicate.helper.js");

describe("graduation predicate", () => {
  it.each([
    [3.51, 8, "Dengan Pujian"],
    [3.51, 9, "Sangat Memuaskan"],
    [3.5, 8, "Sangat Memuaskan"],
    [3.01, 8, "Sangat Memuaskan"],
    [3.0, 8, "Memuaskan"],
    [2.76, 12, "Memuaskan"],
    [2.75, 8, null],
    [null, 8, null],
  ])("IPK %s, %s semester → %s", (gpa, studySemesters, expected) => {
    expect(computeGraduationPredicate({ gpa, studySemesters })).toBe(expected);
  });

  it("an unknown study length never gives Dengan Pujian", () => {
    expect(computeGraduationPredicate({ gpa: 3.9, studySemesters: null })).toBe("Sangat Memuaskan");
  });
});

describe("study length", () => {
  it("counts from the Ganjil intake semester up to and including the end semester", () => {
    expect(countStudySemesters(2022, { year: "2022/2023", semester: "ganjil" })).toBe(1);
    expect(countStudySemesters(2022, { year: "2025/2026", semester: "genap" })).toBe(8);
    expect(countStudySemesters(2022, { year: "2026/2027", semester: "ganjil" })).toBe(9);
    expect(countStudySemesters(null, { year: "2026/2027", semester: "ganjil" })).toBeNull();
    expect(countStudySemesters(2022, null)).toBeNull();
  });

  it("formats the semesters as years and months", () => {
    expect(formatStudyLength(8)).toBe("8 semester (4 tahun)");
    expect(formatStudyLength(9)).toBe("9 semester (4 tahun 6 bulan)");
    expect(formatStudyLength(null)).toBe("-");
  });

  it("summarizes a student at a yudisium semester", () => {
    expect(summarize({ gpa: 3.7, enrollmentYear: 2022 }, { year: "2025/2026", semester: "genap" })).toEqual({ predicate: "Dengan Pujian", studySemesters: 8, studyLength: "8 semester (4 tahun)" });
  });
});
