/**
 * K45: one SIA contract (`GET /students`), one normalization, and the sync rules: the period
 * rule for semester flags, flags the Admin set stay, student status through
 * applyStudentStatusChange, and one failed student never stops the others.
 */
import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, lifecycle, eligibility, academicYear } = vi.hoisted(() => ({
  prisma: {
    student: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  lifecycle: { applyStudentStatusChange: vi.fn(), announceStudentStatusChange: vi.fn() },
  eligibility: { applySiaEnrollments: vi.fn() },
  academicYear: { resolveOperationalAcademicYear: vi.fn() },
}));
vi.mock("../../../config/prisma.js", () => ({ default: prisma }));
vi.mock("../../../services/thesisLifecycle.service.js", () => lifecycle);
vi.mock("../../../services/research-method/eligibility.service.js", () => eligibility);
vi.mock("../../../helpers/academicYear.helper.js", () => academicYear);
vi.mock("../../../services/sia.store.js", () => ({ saveStudents: vi.fn(), saveSyncStatus: vi.fn(), cleanupObsoleteStudents: vi.fn() }));

const { normalizeSiaStudent, normalizeSiaResponse, normalizeGpa } = await import("../../../services/sia.normalize.js");
const { applyAcademicRecords, syncPeriodFlags } = await import("../../../services/sia.sync.job.js");

const fixture = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../fixtures/sia-students.json"), "utf-8"));

const record = (over = {}) => ({
  nim: "2211520001",
  name: "Mahasiswa Satu",
  enrollmentYear: 2022,
  studentStatus: "aktif",
  currentSemester: 7,
  sksCompleted: 132,
  gpa: 3.456,
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: false,
  researchMethodCompleted: true,
  currentCourses: [{ code: "IF5001", name: "Tugas Akhir", credits: 6 }],
  cplScores: [{ cplCode: "cpl-01", score: 80, inputAt: "2026-10-01T00:00:00.000Z" }],
  ...over,
});

describe("normalization (sia.normalize.js)", () => {
  it("maps status, GPA with two decimals, and keeps the academic fields", () => {
    const n = normalizeSiaStudent(record());
    expect(n).toMatchObject({ nim: "2211520001", studentStatus: "active", gpa: 3.46, sksCompleted: 132, enrollmentYear: 2022, kknCompleted: false });
    expect(normalizeSiaStudent(record({ studentStatus: "cuti" })).studentStatus).toBe("bss");
    expect(normalizeSiaStudent(record({ studentStatus: "drop_out" })).studentStatus).toBe("dropout");
    expect(normalizeSiaStudent(record({ studentStatus: "lulus" })).studentStatus).toBe("lulus");
    expect(normalizeSiaStudent(record({ studentStatus: "mengundurkan_diri" })).studentStatus).toBe("mengundurkan_diri");
    expect(normalizeSiaStudent(record({ studentStatus: "x" })).studentStatus).toBeNull();
    expect(normalizeGpa(4.5)).toBeNull();
    expect(normalizeGpa("")).toBeNull();
  });

  it("decides the semester flags from the course codes, with the name as fallback", () => {
    expect(normalizeSiaStudent(record()).takesThesis).toBe(true);
    expect(normalizeSiaStudent(record()).takesResearchMethod).toBe(false);
    const byCode = normalizeSiaStudent(record({ currentCourses: [{ code: "if4001", name: "MK 1", credits: 3 }] }));
    expect(byCode).toMatchObject({ takesResearchMethod: true, takesThesis: false });
    const byName = normalizeSiaStudent(record({ currentCourses: [{ code: "XX9", name: "Metodologi Penelitian", credits: 3 }, { code: "YY9", name: "Skripsi", credits: 6 }] }));
    expect(byName).toMatchObject({ takesResearchMethod: true, takesThesis: true });
    // No course list: nothing is known about the flags.
    expect(normalizeSiaStudent(record({ currentCourses: undefined }))).toMatchObject({ takesResearchMethod: null, takesThesis: null });
  });

  it("reads CPL rows as cplCode (or the earlier code), the description optional", () => {
    const n = normalizeSiaStudent(record({ cplScores: [{ cplCode: "cpl-01", score: 80, inputAt: "x" }, { code: "CPL-02", description: " Deskripsi ", score: 70, inputAt: "y" }] }));
    expect(n.cplScores).toEqual([
      { code: "CPL-01", description: null, score: 80, inputAt: "x" },
      { code: "CPL-02", description: "Deskripsi", score: 70, inputAt: "y" },
    ]);
  });

  it("reads the fixture, the same shape as dummy-SIA", () => {
    const { period, students } = normalizeSiaResponse(fixture);
    expect(period).toEqual({ academicYear: "2026/2027", semester: "ganjil" });
    expect(students.length).toBe(fixture.data.length);
    expect(students.every((s) => s.nim && s.gpa !== null && s.studentStatus)).toBe(true);
  });
});

describe("sync rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.student.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn) => fn({}));
    lifecycle.applyStudentStatusChange.mockResolvedValue({ changed: true, effect: "paused", recipients: ["u"] });
    eligibility.applySiaEnrollments.mockResolvedValue({ created: 1, updated: 0, keptAdmin: 1 });
    academicYear.resolveOperationalAcademicYear.mockResolvedValue({ id: "ay-1", year: "2026/2027", semester: "ganjil" });
  });

  it("writes the semester flags only when SIA's period is NeoCentral's running semester", async () => {
    const records = [normalizeSiaStudent(record())];
    const same = await syncPeriodFlags({ academicYear: "2026/2027", semester: "ganjil" }, records, new Date());
    expect(eligibility.applySiaEnrollments).toHaveBeenCalledWith("ay-1", [{ nim: "2211520001", takesResearchMethod: false, takesThesis: true }], expect.anything());
    // The Admin's flag is kept by applySiaEnrollments (K36) and counted.
    expect(same).toMatchObject({ created: 1, keptAdmin: 1, skipped: 0 });

    eligibility.applySiaEnrollments.mockClear();
    const other = await syncPeriodFlags({ academicYear: "2025/2026", semester: "genap" }, records, new Date());
    expect(eligibility.applySiaEnrollments).not.toHaveBeenCalled();
    expect(other).toMatchObject({ skipped: 1 });
    expect(other.mismatch).toMatch(/2025\/2026 genap.*2026\/2027 ganjil/);
  });

  it("applies Cuti and Drop Out through applyStudentStatusChange (K40), source sia", async () => {
    const records = [normalizeSiaStudent(record({ nim: "a", studentStatus: "cuti" })), normalizeSiaStudent(record({ nim: "b", studentStatus: "drop_out" }))];
    const userOf = new Map([
      ["a", { id: "ua", student: { status: "active", gpa: 3.0 } }],
      ["b", { id: "ub", student: { status: "active", gpa: 3.0 } }],
    ]);
    const result = await applyAcademicRecords(records, userOf);
    expect(lifecycle.applyStudentStatusChange).toHaveBeenCalledWith({}, "ua", "bss", { source: "sia" });
    expect(lifecycle.applyStudentStatusChange).toHaveBeenCalledWith({}, "ub", "dropout", { source: "sia" });
    expect(lifecycle.announceStudentStatusChange).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ statusChanged: 2, gpaChanged: 2, updated: 2, failed: 0 });
  });

  it("writes SKS, flags and GPA; an unchanged status is not reapplied", async () => {
    const userOf = new Map([["2211520001", { id: "u1", student: { status: "active", gpa: 3.46 } }]]);
    const result = await applyAcademicRecords([normalizeSiaStudent(record())], userOf);
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ sksCompleted: 132, gpa: 3.46, kknCompleted: false, researchMethodCompleted: true, enrollmentYear: 2022 }),
    });
    expect(lifecycle.applyStudentStatusChange).not.toHaveBeenCalled();
    expect(result).toMatchObject({ gpaChanged: 0, statusChanged: 0 });
  });

  it("one failed student does not stop the others", async () => {
    prisma.student.update.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
    const records = [normalizeSiaStudent(record({ nim: "a" })), normalizeSiaStudent(record({ nim: "b" }))];
    const userOf = new Map([
      ["a", { id: "ua", student: { status: "active", gpa: null } }],
      ["b", { id: "ub", student: { status: "active", gpa: null } }],
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await applyAcademicRecords(records, userOf);
    expect(result).toMatchObject({ failed: 1, updated: 1 });
    expect(prisma.student.update).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
