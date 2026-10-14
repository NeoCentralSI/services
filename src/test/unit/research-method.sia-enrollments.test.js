import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SIA only reads (Paket P, plan 10.6): per-semester flags come from `GET /enrollments` and are
 * written with source `sia`; SIA is the authority for the students it lists.
 */
const { env } = vi.hoisted(() => ({
  env: { SIA_MOCK: false, SIA_BASE_URL: "http://sia.test/", SIA_API_TOKEN: "token", SIA_FETCH_TIMEOUT: 1000 },
}));
vi.mock("../../config/env.js", () => ({ ENV: env }));
vi.mock("../../config/prisma.js", () => ({ default: {} }));

const { applySiaEnrollments } = await import("../../services/research-method/eligibility.service.js");
const { fetchSemesterEnrollments } = await import("../../services/sia.client.js");

const CAPTURED = new Date("2026-10-14T00:00:00.000Z");

function clientWith({ users = [], existing = [] } = {}) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    studentAcademicYearSnapshot: {
      findMany: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("applySiaEnrollments", () => {
  it("overwrites both flags with source sia, counts new and existing rows and unknown NIMs", async () => {
    const client = clientWith({
      users: [{ id: "s1", identityNumber: "2211528001" }, { id: "s2", identityNumber: "2211528002" }],
      existing: [{ studentId: "s1" }],
    });
    const result = await applySiaEnrollments(
      "ay-1",
      [
        { nim: "2211528001", takesResearchMethod: true, takesThesis: false },
        { nim: "2211528002", takesResearchMethod: false, takesThesis: true },
        { nim: "9999999999", takesResearchMethod: true, takesThesis: false },
        { nim: "2211528003" },
      ],
      { capturedAt: CAPTURED, client },
    );

    expect(result).toEqual({ fetched: 4, created: 1, updated: 1, unknownStudents: 1 });
    expect(client.user.findMany.mock.calls[0][0].where.identityNumber.in).toEqual(["2211528001", "2211528002", "9999999999"]);
    const first = client.studentAcademicYearSnapshot.upsert.mock.calls[0][0];
    expect(first.where).toEqual({ studentId_academicYearId: { studentId: "s1", academicYearId: "ay-1" } });
    expect(first.update).toMatchObject({
      eligibleResearchMethod: true,
      eligibilitySource: "sia",
      takingThesisCourse: false,
      thesisCourseSource: "sia",
      capturedAt: CAPTURED,
    });
    expect(client.studentAcademicYearSnapshot.upsert).toHaveBeenCalledTimes(2);
  });

  it("leaves a flag SIA does not report untouched", async () => {
    const client = clientWith({ users: [{ id: "s1", identityNumber: "2211528001" }] });
    await applySiaEnrollments("ay-1", [{ nim: "2211528001", takesThesis: true }], { capturedAt: CAPTURED, client });
    const { update } = client.studentAcademicYearSnapshot.upsert.mock.calls[0][0];
    expect(update).toMatchObject({ takingThesisCourse: true, thesisCourseSource: "sia" });
    expect(update).not.toHaveProperty("eligibleResearchMethod");
  });

  it("does not query anything for an empty or unusable answer", async () => {
    const client = clientWith();
    expect(await applySiaEnrollments("ay-1", [{ nim: "" }, null], { client })).toEqual({ fetched: 2, created: 0, updated: 0, unknownStudents: 0 });
    expect(client.user.findMany).not.toHaveBeenCalled();
  });
});

describe("fetchSemesterEnrollments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.SIA_MOCK = false;
  });

  it("reads GET /enrollments for the period with the API token", async () => {
    const rows = [{ nim: "2211528001", takesResearchMethod: true, takesThesis: false }];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: rows }), { status: 200 }));
    expect(await fetchSemesterEnrollments({ academicYear: "2026/2027", semester: "ganjil" }, 1)).toEqual(rows);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://sia.test/enrollments?academicYear=2026%2F2027&semester=ganjil");
    expect(init.headers["x-api-token"]).toBe("token");
  });

  it("fails on an error status or a body without data, so the sync can report it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Periode tidak dikenal", { status: 404 }));
    await expect(fetchSemesterEnrollments({ academicYear: "2030/2031", semester: "ganjil" }, 1)).rejects.toThrow(/404/);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    await expect(fetchSemesterEnrollments({ academicYear: "2026/2027", semester: "ganjil" }, 1)).rejects.toThrow(/missing data/);
  });
});
