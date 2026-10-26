/**
 * A thesis sent back to `proposal` by an approved guidance evaluation stays visible to
 * its supervisors: in "Mahasiswa Bimbingan" (filters Aktif and Semua) and in the detail.
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

const REPEATING = {
  status: "proposal",
  thesisGuidanceEvaluations: { some: { status: "approved", recommendation: "revise_proposal" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.thesisSupervisors.findMany.mockResolvedValue([]);
  prismaMock.thesisSupervisors.findFirst.mockResolvedValue(null);
});

describe("findMyStudents", () => {
  const thesisWhere = () => prismaMock.thesisSupervisors.findMany.mock.calls[0][0].where.thesis;

  it("filter Aktif: running theses plus theses that repeat their proposal", async () => {
    await repo.findMyStudents("lec-1", undefined, { filter: "active" });
    expect(thesisWhere()).toEqual({ OR: [{ status: { in: ["research"] } }, REPEATING] });
  });

  it("filter Semua also includes them", async () => {
    await repo.findMyStudents("lec-1", undefined, { filter: "all" });
    expect(thesisWhere().OR[1]).toEqual(REPEATING);
  });

  it.each(["completed", "failed"])("filter %s stays a plain status filter", async (filter) => {
    await repo.findMyStudents("lec-1", undefined, { filter });
    expect(thesisWhere()).toEqual({ status: { in: [filter] } });
  });
});

describe("findThesisDetailForLecturer", () => {
  it("lets a supervisor open any thesis they supervise, proposal phase included", async () => {
    await repo.findThesisDetailForLecturer("thesis-1", "lec-1");
    const where = prismaMock.thesisSupervisors.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ thesisId: "thesis-1", lecturerId: "lec-1" });
    expect(prismaMock.thesis.findUnique).not.toHaveBeenCalled();
  });
});
