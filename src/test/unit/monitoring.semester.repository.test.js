/**
 * Paket E3 — the semester filter of the monitoring page means "theses that run in that
 * semester". Every thesis query of the repository takes the filter from
 * semester-scope.helper.js, including the progress report.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    thesis: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    thesisTopic: { findMany: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
    thesisGuidance: { findMany: vi.fn() },
    academicYear: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../helpers/guidanceFile.helper.js", () => ({ findLatestThesisReport: vi.fn() }));

const repo = await import("../../repositories/thesisGuidance/monitoring.repository.js");
const { buildThesisRunningInSemesterWhere, getSemesterRange } = await import("../../helpers/semester-scope.helper.js");

const SEMESTER = {
  id: "ay-current",
  semester: "ganjil",
  year: "2026/2027",
  startDate: new Date("2026-08-01T00:00:00.000Z"),
  endDate: new Date("2027-01-31T00:00:00.000Z"),
};
const RUNNING_IN_SEMESTER = buildThesisRunningInSemesterWhere(getSemesterRange(SEMESTER));

/** The thesis `where` each repository function sent, whatever model carries it. */
const QUERIES = [
  ["getThesesOverview", () => repo.getThesesOverview({ academicYear: SEMESTER.id }), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getStatusDistribution", () => repo.getStatusDistribution(SEMESTER.id), () => prismaMock.thesis.groupBy.mock.calls[0][0].where],
  ["getActivityDistribution", () => repo.getActivityDistribution(SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getProgressStatistics", () => repo.getProgressStatistics(SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getAtRiskStudents", () => repo.getAtRiskStudents(5, SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getEvaluationDueStudents", () => repo.getEvaluationDueStudents(50, SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getStudentsReadyForSeminar", () => repo.getStudentsReadyForSeminar(SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getSupervisorWorkloadRows", () => repo.getSupervisorWorkloadRows(SEMESTER.id), () => prismaMock.thesisSupervisors.findMany.mock.calls[0][0].where.thesis],
  ["getThesesForReport", () => repo.getThesesForReport({ academicYearId: SEMESTER.id }), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getTopicDistribution", () => repo.getTopicDistribution(SEMESTER.id), () => prismaMock.thesisTopic.findMany.mock.calls[0][0].include._count.select.thesis.where],
  ["getBatchDistribution", () => repo.getBatchDistribution(SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getProgressDistribution", () => repo.getProgressDistribution(SEMESTER.id), () => prismaMock.thesis.findMany.mock.calls[0][0].where],
  ["getGuidanceTrend", () => repo.getGuidanceTrend(SEMESTER.id), () => prismaMock.thesisGuidance.findMany.mock.calls[0][0].where.thesis],
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.thesis.findMany.mockResolvedValue([]);
  prismaMock.thesis.count.mockResolvedValue(0);
  prismaMock.thesis.groupBy.mockResolvedValue([]);
  prismaMock.thesisTopic.findMany.mockResolvedValue([]);
  prismaMock.thesisSupervisors.findMany.mockResolvedValue([]);
  prismaMock.thesisGuidance.findMany.mockResolvedValue([]);
  prismaMock.academicYear.findUnique.mockResolvedValue(SEMESTER);
});

describe("monitoring repository — semester scope", () => {
  it.each(QUERIES)("%s narrows its theses to the ones running in the semester", async (_name, run, whereOf) => {
    await run();

    expect(prismaMock.academicYear.findUnique).toHaveBeenCalledWith({ where: { id: SEMESTER.id } });
    const where = whereOf();
    // The filter of the function itself stays, and the semester rule is added beside it.
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toHaveProperty("status");
    expect(where.AND[1]).toEqual(RUNNING_IN_SEMESTER);
    // The old meaning ("started in the semester", 30 days early allowed) is gone.
    expect(JSON.stringify(where)).not.toContain('"startDate":{"gte"');
  });

  it("counts the overview with the same semester filter it lists with", async () => {
    await repo.getThesesOverview({ academicYear: SEMESTER.id, search: "andi", status: "research" });

    const listed = prismaMock.thesis.findMany.mock.calls[0][0].where;
    expect(prismaMock.thesis.count.mock.calls[0][0].where).toEqual(listed);
    expect(listed.AND[0]).toMatchObject({ status: { in: ["research"] } });
    expect(listed.AND[0].OR).toHaveLength(3);
  });

  it("keeps both readiness conditions of the seminar list next to the semester rule", async () => {
    await repo.getStudentsReadyForSeminar(SEMESTER.id);

    const where = prismaMock.thesis.findMany.mock.calls[0][0].where;
    expect(where.AND[0].AND).toHaveLength(2);
    expect(where.AND[1]).toEqual(RUNNING_IN_SEMESTER);
  });

  it("applies no semester filter for 'Semua Semester'", async () => {
    await repo.getActivityDistribution();
    await repo.getThesesForReport({ academicYearId: "all" });
    await repo.getThesesOverview({ academicYear: "all" });

    expect(prismaMock.academicYear.findUnique).not.toHaveBeenCalled();
    for (const call of prismaMock.thesis.findMany.mock.calls) {
      expect(call[0].where).not.toHaveProperty("AND");
    }
  });

  it("falls back to academicYearId when the semester has no dates", async () => {
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-x", startDate: null, endDate: null });

    await repo.getProgressDistribution("ay-x");

    expect(prismaMock.thesis.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ status: "research" }, { academicYearId: "ay-x" }],
    });
  });
});

describe("monitoring repository — guidance trend per semester", () => {
  const session = (approvedDate, requestedDate = "2026-01-01T00:00:00.000Z") => ({
    approvedDate: approvedDate ? new Date(approvedDate) : null,
    requestedDate: new Date(requestedDate),
  });

  beforeEach(() => {
    prismaMock.thesisGuidance.findMany.mockResolvedValue([
      session("2026-07-20T03:00:00.000Z"), // before the semester
      session("2026-08-01T00:00:00.000Z"), // first instant of the semester
      session("2026-09-14T03:00:00.000Z"),
      session("2026-09-28T03:00:00.000Z"),
      // No approved date: the requested date is the effective schedule.
      session(null, "2026-10-05T03:00:00.000Z"),
      // Requested inside the semester but moved outside it: the effective schedule counts.
      session("2027-02-10T03:00:00.000Z", "2026-10-06T03:00:00.000Z"),
    ]);
  });

  const total = (trend) => trend.reduce((sum, row) => sum + row.count, 0);

  it("counts only the sessions scheduled inside the chosen semester", async () => {
    const trend = await repo.getGuidanceTrend(SEMESTER.id);

    expect(total(trend)).toBe(4);
    expect(trend.map((row) => row.month)).toEqual([...trend.map((row) => row.month)].sort());
    expect(trend.every((row) => row.month >= "2026-07" && row.month <= "2027-01")).toBe(true);
    expect(trend.find((row) => row.month === "2026-09")?.count).toBe(2);
    expect(trend.find((row) => row.month === "2027-02")).toBeUndefined();
  });

  it("counts every session for 'Semua Semester'", async () => {
    expect(total(await repo.getGuidanceTrend())).toBe(6);
  });

  it("counts every session of the theses when the semester has no dates", async () => {
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-x", startDate: null, endDate: null });

    expect(total(await repo.getGuidanceTrend("ay-x"))).toBe(6);
    expect(prismaMock.thesisGuidance.findMany.mock.calls[0][0].where.thesis).toEqual({
      AND: [{ status: { in: ["research", "on_leave", "completed"] } }, { academicYearId: "ay-x" }],
    });
  });
});

describe("monitoring repository — semesters of the filter", () => {
  it("lists every semester that has started, not only those a thesis started in", async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([
      { ...SEMESTER, isActive: true },
      { id: "ay-previous", semester: "genap", year: "2025/2026", startDate: new Date("2026-02-01"), endDate: new Date("2026-07-31"), isActive: false },
    ]);

    const semesters = await repo.getAllAcademicYears();

    const { where } = prismaMock.academicYear.findMany.mock.calls[0][0];
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0].startDate.lte).toBeInstanceOf(Date);
    expect(where.OR).toContainEqual({ thesis: { some: {} } });
    expect(where.OR).toContainEqual({ isActive: true });
    expect(semesters.map((semester) => semester.id)).toEqual(["ay-current", "ay-previous"]);
  });
});
