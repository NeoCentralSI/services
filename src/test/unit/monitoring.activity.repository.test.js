/**
 * E3 — the activity level is derived, so the monitoring repository filters by level after
 * reading the running theses instead of filtering a stored column.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    thesis: { findMany: vi.fn() },
    academicYear: { findUnique: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../helpers/guidanceFile.helper.js", () => ({ findLatestThesisReport: vi.fn() }));

const repo = await import("../../repositories/thesisGuidance/monitoring.repository.js");

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);

const thesis = (id, daysWithoutActivity, extra = {}) => ({
  id,
  title: `TA ${id}`,
  status: "research",
  startDate: daysAgo(350),
  statusChangedAt: daysAgo(350),
  totalLeaveDays: 0,
  createdAt: daysAgo(350),
  // Editing the row is not activity; the last completed session is.
  updatedAt: daysAgo(0),
  thesisGuidances: [{ status: "completed", approvedDate: daysAgo(daysWithoutActivity), completedAt: daysAgo(daysWithoutActivity) }],
  thesisMilestones: [],
  thesisSeminars: [],
  student: { user: { fullName: `Mahasiswa ${id}`, identityNumber: id, email: `${id}@x.test` } },
  thesisSupervisors: [{ lecturer: { user: { fullName: "Dosen" } }, role: { name: "Pembimbing 1" } }],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.thesis.findMany.mockResolvedValue([
    thesis("A", 10),
    thesis("B", 70),
    thesis("C", 100),
    thesis("D", 130),
    thesis("E", 300),
  ]);
});

describe("monitoring repository — derived activity level", () => {
  it("reads running theses without any rating filter", async () => {
    await repo.getActivityDistribution();
    const args = prismaMock.thesis.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "research" });
    expect(JSON.stringify(args)).not.toMatch(/rating|deadlineDate/);
  });

  it("counts theses per level in the fixed order Lancar, Lambat, Berisiko", async () => {
    expect(await repo.getActivityDistribution()).toEqual([
      { id: "active", name: "Lancar", value: "active", count: 1 },
      { id: "slow", name: "Lambat", value: "slow", count: 2 },
      { id: "at_risk", name: "Berisiko", value: "at_risk", count: 2 },
    ]);
  });

  it("lists students of one level, longest without activity first, limited", async () => {
    const atRisk = await repo.getAtRiskStudents(10);
    expect(atRisk.map((row) => [row.thesisId, row.daysSinceActivity, row.activityLevel])).toEqual([
      ["E", 300, "at_risk"],
      ["D", 130, "at_risk"],
    ]);
    expect(atRisk[0]).toMatchObject({
      student: { name: "Mahasiswa E", nim: "E" },
      supervisors: [{ name: "Dosen", role: "Pembimbing 1" }],
    });
    expect(atRisk[0].supervisionClock.evaluationDue).toBe("six_month");

    expect((await repo.getSlowStudents(1)).map((row) => row.thesisId)).toEqual(["C"]);
  });

  it("report: filters by activity level after reading, and attaches the progress summary", async () => {
    const all = await repo.getThesesForReport({});
    expect(all).toHaveLength(5);
    expect(all[0].progress).toMatchObject({ activityLevel: "active", daysSinceActivity: 10 });

    const filtered = await repo.getThesesForReport({ activityLevels: ["slow"] });
    expect(filtered.map((t) => t.id)).toEqual(["B", "C"]);
    for (const call of prismaMock.thesis.findMany.mock.calls) {
      expect(JSON.stringify(call[0].where)).not.toMatch(/rating/);
    }
  });
});
