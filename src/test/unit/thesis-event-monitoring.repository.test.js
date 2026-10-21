/**
 * The monitoring page reads the seminar and defence tables with its own queries:
 * `select` only, scoped to the semester, and nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WRITES = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];
const delegate = () => Object.fromEntries([["findMany", vi.fn().mockResolvedValue([])], ...WRITES.map((name) => [name, vi.fn()])]);

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {} }));
Object.assign(prismaMock, {
  thesis: delegate(),
  thesisSeminar: delegate(),
  thesisDefence: delegate(),
  academicYear: { findUnique: vi.fn() },
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../helpers/guidanceFile.helper.js", () => ({ findLatestThesisReport: vi.fn() }));

const repo = await import("../../repositories/thesisGuidance/thesis-event-monitoring.repository.js");
const { buildEventInSemesterWhere, buildThesisRunningInSemesterWhere, getSemesterRange } = await import("../../helpers/semester-scope.helper.js");
const { buildReadyToRegisterWhere } = await import("../../helpers/thesis-event-monitoring.helper.js");

const ACADEMIC_YEAR = {
  id: "ay-now",
  startDate: new Date("2026-08-01T00:00:00.000Z"),
  endDate: new Date("2027-01-31T00:00:00.000Z"),
};
const SEMESTER = { academicYearId: ACADEMIC_YEAR.id, academicYear: ACADEMIC_YEAR };
const RANGE = getSemesterRange(ACADEMIC_YEAR);

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [prismaMock.thesis, prismaMock.thesisSeminar, prismaMock.thesisDefence]) model.findMany.mockResolvedValue([]);
});

describe("findEvents", () => {
  it("reads the seminars whose reference date falls in the semester", async () => {
    await repo.findEvents("seminar", SEMESTER);

    expect(prismaMock.thesisDefence.findMany).not.toHaveBeenCalled();
    const args = prismaMock.thesisSeminar.findMany.mock.calls[0][0];
    expect(args.where).toEqual(buildEventInSemesterWhere(RANGE));
    expect(args.orderBy).toEqual([{ date: "desc" }, { createdAt: "desc" }]);
  });

  it("reads the defences with the same scope, plus the grade", async () => {
    await repo.findEvents("defence", SEMESTER);

    expect(prismaMock.thesisSeminar.findMany).not.toHaveBeenCalled();
    const args = prismaMock.thesisDefence.findMany.mock.calls[0][0];
    expect(args.where).toEqual(buildEventInSemesterWhere(RANGE));
    expect(args.select.grade).toBe(true);
  });

  it("does not ask the seminar table for a grade it does not have", async () => {
    await repo.findEvents("seminar", SEMESTER);

    expect(prismaMock.thesisSeminar.findMany.mock.calls[0][0].select).not.toHaveProperty("grade");
  });

  it("reads everything for 'Semua Semester'", async () => {
    await repo.findEvents("seminar", null);
    await repo.findEvents("defence", null);

    expect(prismaMock.thesisSeminar.findMany.mock.calls[0][0].where).toEqual({});
    expect(prismaMock.thesisDefence.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("falls back to the semester of the thesis when the semester has no dates", async () => {
    await repo.findEvents("seminar", { academicYearId: "ay-x", academicYear: { id: "ay-x", startDate: null, endDate: null } });

    expect(prismaMock.thesisSeminar.findMany.mock.calls[0][0].where).toEqual({ thesis: { academicYearId: "ay-x" } });
  });

  it("selects what the tab shows and never includes whole rows", async () => {
    await repo.findEvents("seminar", SEMESTER);

    const args = prismaMock.thesisSeminar.findMany.mock.calls[0][0];
    expect(args).not.toHaveProperty("include");
    expect(Object.keys(args.select).sort()).toEqual([
      "createdAt", "date", "endTime", "examiners", "finalScore", "id", "registeredAt", "resultFinalizedAt",
      "revisionFinalizedAt", "room", "startTime", "status", "thesis", "thesisId", "verifiedAt",
    ]);
    expect(JSON.stringify(args.select)).not.toMatch(/email|password|phoneNumber/);
  });
});

describe("findThesesReadyToRegister", () => {
  it("lists the ready theses that run in the semester", async () => {
    await repo.findThesesReadyToRegister("seminar", SEMESTER);

    const args = prismaMock.thesis.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      AND: [buildReadyToRegisterWhere("seminar"), buildThesisRunningInSemesterWhere(RANGE)],
    });
    expect(args).not.toHaveProperty("include");
    expect(args.select.thesisSupervisors.where).toEqual({ status: "active", role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } } });
  });

  it("uses the defence approval and the defence registrations for the defence", async () => {
    await repo.findThesesReadyToRegister("defence", null);

    const { where } = prismaMock.thesis.findMany.mock.calls[0][0];
    expect(where).toEqual(buildReadyToRegisterWhere("defence"));
    expect(where.thesisDefences).toEqual({ none: { status: { notIn: ["failed", "cancelled"] } } });
    expect(JSON.stringify(where)).toContain("defenceReady");
    expect(JSON.stringify(where)).not.toContain("seminarReady");
  });
});

describe("the monitoring queries are read-only", () => {
  it("never calls a write on the thesis, seminar or defence tables", async () => {
    for (const kind of ["seminar", "defence"]) {
      await repo.findEvents(kind, SEMESTER);
      await repo.findThesesReadyToRegister(kind, SEMESTER);
    }

    for (const model of [prismaMock.thesis, prismaMock.thesisSeminar, prismaMock.thesisDefence]) {
      for (const write of WRITES) expect(model[write]).not.toHaveBeenCalled();
    }
  });
});
