/**
 * Paket E4 (1.1): a supervisor replaced through a change request no longer sees the student
 * under "Aktif"; history filters keep the relations that were active when the thesis closed;
 * "Semua" shows ended relations read-only ("Tidak lagi membimbing").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    thesisSupervisors: { findMany: vi.fn(), findFirst: vi.fn() },
    thesis: { findUnique: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));

const repo = await import("../../repositories/thesisGuidance/lecturer.guidance.repository.js");

const DAY = 24 * 60 * 60 * 1000;
const CLOSED_AT = new Date("2026-09-01T03:00:00Z");

const thesis = (id, overrides = {}) => ({
  id,
  title: `TA ${id}`,
  status: "research",
  startDate: new Date("2026-01-01T00:00:00Z"),
  statusChangedAt: null,
  terminatedAt: null,
  totalLeaveDays: 0,
  student: { id: `stu-${id}`, user: { id: `stu-${id}`, fullName: `Mahasiswa ${id}`, email: null, identityNumber: id } },
  thesisMilestones: [],
  thesisGuidances: [],
  thesisSeminars: [],
  thesisGuidanceEvaluations: [],
  ...overrides,
});
const relation = (thesisRow, status, overrides = {}) => ({
  id: `rel-${thesisRow.id}-${status}`,
  thesisId: thesisRow.id,
  status,
  updatedAt: new Date("2026-03-01T00:00:00Z"),
  role: { id: "r1", name: "Pembimbing 1" },
  thesis: thesisRow,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.thesisSupervisors.findMany.mockResolvedValue([]);
});

describe("supervisorRelationState", () => {
  const failed = thesis("f", { status: "failed", terminatedAt: CLOSED_AT, statusChangedAt: CLOSED_AT });

  it("active relation is active, whatever the thesis status", () => {
    expect(repo.supervisorRelationState({ status: "active" }, thesis("a"))).toBe("active");
    expect(repo.supervisorRelationState({ status: "active" }, thesis("c", { status: "completed" }))).toBe("active");
  });

  it("released with the closing of a failed thesis counts as supervising when it ended", () => {
    expect(repo.supervisorRelationState({ status: "released", updatedAt: new Date(CLOSED_AT.getTime() + 15) }, failed)).toBe("closed");
  });

  it("released long before the closing (replaced) has ended", () => {
    expect(repo.supervisorRelationState({ status: "released", updatedAt: new Date(CLOSED_AT.getTime() - 30 * DAY) }, failed)).toBe("ended");
  });

  it("released on a running thesis has ended; terminated rows always ended", () => {
    expect(repo.supervisorRelationState({ status: "released", updatedAt: new Date() }, thesis("r"))).toBe("ended");
    expect(repo.supervisorRelationState({ status: "terminated" }, failed)).toBe("ended");
  });
});

describe("findMyStudents (1.1)", () => {
  const where = () => prismaMock.thesisSupervisors.findMany.mock.calls[0][0].where;

  it.each(["active", "proposal"])("filter %s reads active relations only", async (filter) => {
    await repo.findMyStudents("lec-1", undefined, { filter });
    expect(where().status).toBe("active");
  });

  it.each(["completed", "failed", "all"])("filter %s also reads released relations", async (filter) => {
    await repo.findMyStudents("lec-1", undefined, { filter });
    expect(where().status).toEqual({ in: ["active", "released"] });
  });

  it("Gagal keeps the relation released at closing and drops the supervisor replaced earlier", async () => {
    const atClose = thesis("f1", { status: "failed", terminatedAt: CLOSED_AT, statusChangedAt: CLOSED_AT });
    const replacedBefore = thesis("f2", { status: "failed", terminatedAt: CLOSED_AT, statusChangedAt: CLOSED_AT });
    prismaMock.thesisSupervisors.findMany.mockResolvedValue([
      relation(atClose, "released", { updatedAt: new Date(CLOSED_AT.getTime() + 20) }),
      relation(replacedBefore, "released", { updatedAt: new Date(CLOSED_AT.getTime() - 40 * DAY) }),
    ]);
    const rows = await repo.findMyStudents("lec-1", undefined, { filter: "failed" });
    expect(rows.map((r) => r.thesisId)).toEqual(["f1"]);
    expect(rows[0].noLongerSupervising).toBe(false);
  });

  it("Semua shows a replaced supervisor's student, marked read-only", async () => {
    const running = thesis("t1");
    prismaMock.thesisSupervisors.findMany.mockResolvedValue([relation(running, "released", { updatedAt: new Date() })]);
    const rows = await repo.findMyStudents("lec-1", undefined, { filter: "all" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ thesisId: "t1", supervisorStatus: "released", noLongerSupervising: true });
  });

  it("a released row returned for Aktif is never shown (defence in depth)", async () => {
    prismaMock.thesisSupervisors.findMany.mockResolvedValue([relation(thesis("t2"), "released", { updatedAt: new Date() })]);
    expect(await repo.findMyStudents("lec-1", undefined, { filter: "active" })).toEqual([]);
  });

  it("one row per thesis, the active relation first (e.g. P2 released, now P1)", async () => {
    const running = thesis("t3");
    prismaMock.thesisSupervisors.findMany.mockResolvedValue([
      relation(running, "released", { updatedAt: new Date(), role: { id: "r2", name: "Pembimbing 2" } }),
      relation(running, "active"),
    ]);
    const rows = await repo.findMyStudents("lec-1", undefined, { filter: "all" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "Pembimbing 1", supervisorStatus: "active", noLongerSupervising: false });
  });
});
