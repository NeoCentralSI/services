import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    researchMethodScore: { findFirst: vi.fn() },
    thesis: { findFirst: vi.fn() },
    thesisAdvisorRequest: { findFirst: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));

const {
  studentHasTakenMetopen,
  studentHasOfficialMetopenArchive,
} = await import("../metopenArchive.helper.js");

describe("metopenArchive.helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.researchMethodScore.findFirst.mockResolvedValue(null);
    prismaMock.thesis.findFirst.mockResolvedValue(null);
    prismaMock.thesisAdvisorRequest.findFirst.mockResolvedValue(null);
  });

  it("treats a released booking as history, not archive", async () => {
    prismaMock.thesisAdvisorRequest.findFirst.mockImplementation(async ({ where }) => {
      if (where?.status?.in) return { id: "request-released" };
      return null;
    });

    await expect(studentHasTakenMetopen("student-1")).resolves.toBe(true);
    await expect(studentHasOfficialMetopenArchive("student-1")).resolves.toBe(false);
  });

  it("archives only after official promotion", async () => {
    prismaMock.thesisAdvisorRequest.findFirst.mockImplementation(async ({ where }) => {
      if (where?.status === "active_official") return { id: "request-official" };
      return null;
    });

    await expect(studentHasOfficialMetopenArchive("student-1")).resolves.toBe(true);
  });
});
