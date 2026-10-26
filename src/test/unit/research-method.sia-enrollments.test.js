import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SIA only reads: per-semester flags come from the current courses of `GET /students` (K45)
 * and are written with source `sia`; SIA is the authority for the students it lists.
 */
const { env } = vi.hoisted(() => ({
  env: { SIA_MOCK: false, SIA_BASE_URL: "http://sia.test/", SIA_API_TOKEN: "token", SIA_FETCH_TIMEOUT: 1000 },
}));
vi.mock("../../config/env.js", () => ({ ENV: env }));
vi.mock("../../config/prisma.js", () => ({ default: {} }));

const { applySiaEnrollments, setAdminPeriodFlags, followSiaPeriodFlags } = await import("../../services/research-method/eligibility.service.js");
const { fetchAcademicRecords } = await import("../../services/sia.client.js");

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

    expect(result).toEqual({ fetched: 4, created: 1, updated: 1, unknownStudents: 1, keptAdmin: 0 });
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
    expect(await applySiaEnrollments("ay-1", [{ nim: "" }, null], { client })).toEqual({ fetched: 2, created: 0, updated: 0, unknownStudents: 0, keptAdmin: 0 });
    expect(client.user.findMany).not.toHaveBeenCalled();
  });
});

describe("fetchAcademicRecords", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.SIA_MOCK = false;
  });

  it("reads GET /students with the API token and returns period and records", async () => {
    const body = { success: true, period: { academicYear: "2026/2027", semester: "ganjil" }, count: 1, data: [{ nim: "2211528001" }] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    expect(await fetchAcademicRecords(1)).toEqual({ period: body.period, data: body.data });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://sia.test/students?page=1&pageSize=500");
    expect(init.headers["x-api-token"]).toBe("token");
  });

  it("follows the pages when SIA paginates", async () => {
    const page = (n, nims) => new Response(JSON.stringify({ period: { academicYear: "2026/2027", semester: "ganjil" }, data: nims.map((nim) => ({ nim })), pagination: { page: n, totalPages: 2 } }), { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(page(1, ["a", "b"])).mockResolvedValueOnce(page(2, ["c"]));
    expect((await fetchAcademicRecords(1)).data.map((r) => r.nim)).toEqual(["a", "b", "c"]);
    expect(fetchMock.mock.calls[1][0]).toBe("http://sia.test/students?page=2&pageSize=500");
  });

  it("fails on an error status or a body without data, so the sync can report it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(fetchAcademicRecords(1)).rejects.toThrow(/401/);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    await expect(fetchAcademicRecords(1)).rejects.toThrow(/missing data/);
  });

  it("in mock mode reads the fixture of the same shape as dummy-SIA", async () => {
    env.SIA_MOCK = true;
    const result = await fetchAcademicRecords(1);
    expect(result.period).toEqual({ academicYear: "2026/2027", semester: "ganjil" });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toHaveProperty("currentCourses");
    env.SIA_MOCK = false;
  });
});

/** The Admin sets a flag by hand; the SIA sync keeps it until "Ikuti Data SIA". */
describe("flags set by the Admin", () => {
  it("the sync keeps a flag the Admin set and still writes the other one", async () => {
    const client = clientWith({
      users: [{ id: "s1", identityNumber: "2211528001" }],
      existing: [{ studentId: "s1", eligibilitySource: "admin", thesisCourseSource: "sia" }],
    });
    const result = await applySiaEnrollments("ay-1", [{ nim: "2211528001", takesResearchMethod: false, takesThesis: true }], { capturedAt: CAPTURED, client });
    expect(result).toMatchObject({ updated: 1, keptAdmin: 1 });
    const { update } = client.studentAcademicYearSnapshot.upsert.mock.calls[0][0];
    expect(update).not.toHaveProperty("eligibleResearchMethod");
    expect(update).toMatchObject({ takingThesisCourse: true, thesisCourseSource: "sia" });
  });

  it("the sync writes nothing for a student whose two flags are both the Admin's", async () => {
    const client = clientWith({
      users: [{ id: "s1", identityNumber: "2211528001" }],
      existing: [{ studentId: "s1", eligibilitySource: "admin", thesisCourseSource: "admin" }],
    });
    expect(await applySiaEnrollments("ay-1", [{ nim: "2211528001", takesResearchMethod: false, takesThesis: false }], { client })).toMatchObject({ updated: 0, keptAdmin: 2 });
    expect(client.studentAcademicYearSnapshot.upsert).not.toHaveBeenCalled();
  });

  const adminClient = (snapshot = null) => ({
    student: { findUnique: vi.fn().mockResolvedValue({ id: "s1", user: { identityNumber: "2211528001" } }) },
    academicYear: { findUnique: vi.fn().mockResolvedValue({ id: "ay-1", year: "2026/2027", semester: "ganjil" }) },
    studentAcademicYearSnapshot: {
      upsert: vi.fn(async ({ update }) => ({ id: "snap-1", ...update })),
      findUnique: vi.fn().mockResolvedValue(snapshot),
      update: vi.fn(async ({ data }) => ({ ...snapshot, ...data })),
    },
  });

  it("setAdminPeriodFlags writes source admin; a non-boolean value or nothing is refused", async () => {
    const client = adminClient();
    const row = await setAdminPeriodFlags("s1", "ay-1", { eligibleResearchMethod: true, takingThesisCourse: null }, { client, now: CAPTURED });
    expect(row).toMatchObject({ eligibleResearchMethod: true, eligibilitySource: "admin", takingThesisCourse: null, thesisCourseSource: null });
    await expect(setAdminPeriodFlags("s1", "ay-1", { eligibleResearchMethod: "ya" }, { client })).rejects.toMatchObject({ statusCode: 400 });
    await expect(setAdminPeriodFlags("s1", "ay-1", {}, { client })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("Ikuti Data SIA writes the SIA values with source sia when SIA lists the student", async () => {
    const client = adminClient({ id: "snap-1", eligibilitySource: "admin", thesisCourseSource: "admin" });
    const fetchEnrollments = vi.fn().mockResolvedValue([{ nim: "2211528001", takesResearchMethod: false, takesThesis: true }]);
    const result = await followSiaPeriodFlags("s1", "ay-1", { client, fetchEnrollments, now: CAPTURED, env: { SIA_BASE_URL: "http://sia.test" } });
    expect(fetchEnrollments).toHaveBeenCalledWith(expect.objectContaining({ year: "2026/2027", semester: "ganjil" }));
    expect(result.fromSia).toBe(true);
    expect(result.snapshot).toMatchObject({ eligibleResearchMethod: false, eligibilitySource: "sia", takingThesisCourse: true, thesisCourseSource: "sia" });
  });

  it("Ikuti Data SIA without SIA data keeps the values but hands them to the next sync", async () => {
    const client = adminClient({ id: "snap-1", eligibleResearchMethod: true, eligibilitySource: "admin", thesisCourseSource: "sia" });
    const result = await followSiaPeriodFlags("s1", "ay-1", { client, fetchEnrollments: vi.fn().mockRejectedValue(new Error("down")), env: { SIA_BASE_URL: "http://sia.test" } });
    expect(result.fromSia).toBe(false);
    expect(client.studentAcademicYearSnapshot.update).toHaveBeenCalledWith({ where: { id: "snap-1" }, data: { eligibilitySource: "sia" } });
    expect(result.snapshot).toMatchObject({ eligibleResearchMethod: true, eligibilitySource: "sia" });
  });

  it("Ikuti Data SIA is refused while SIA_BASE_URL is empty, and SIA is not read", async () => {
    const client = adminClient({ id: "snap-1", eligibilitySource: "admin" });
    const fetchEnrollments = vi.fn();
    for (const env of [{ SIA_BASE_URL: "" }, { SIA_BASE_URL: "   " }, {}]) {
      await expect(followSiaPeriodFlags("s1", "ay-1", { client, fetchEnrollments, env })).rejects.toMatchObject({ statusCode: 400, message: "Sinkronisasi SIA belum tersedia." });
    }
    expect(fetchEnrollments).not.toHaveBeenCalled();
    expect(client.studentAcademicYearSnapshot.update).not.toHaveBeenCalled();
  });
});

