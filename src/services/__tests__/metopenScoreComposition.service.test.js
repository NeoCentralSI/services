import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  default: {
    metopenScoreComposition: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    academicYear: {
      findUnique: vi.fn(),
    },
    researchMethodScore: {
      count: vi.fn(),
    },
    metopenAssessmentCriteria: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock("../../repositories/advisorQuota.repository.js", () => ({
  findActiveAcademicYear: vi.fn(),
}));

import prisma from "../../config/prisma.js";
import * as compositionService from "../metopenScoreComposition.service.js";

describe("metopenScoreComposition.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("capForRole maps supervisor → ta03aCap and default → ta03bCap", () => {
    const composition = { ta03aCap: 50, ta03bCap: 50 };
    expect(compositionService.capForRole("supervisor", composition)).toBe(50);
    expect(compositionService.capForRole("default", composition)).toBe(50);
  });

  it("getCompositionForAcademicYear returns isLocked when finalized scores exist", async () => {
    prisma.academicYear.findUnique.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
      isActive: true,
    });
    prisma.metopenScoreComposition.findUnique.mockResolvedValue({
      id: "c-1",
      academicYearId: "ay-1",
      ta03aCap: 75,
      ta03bCap: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.researchMethodScore.count.mockResolvedValue(2);

    const result = await compositionService.getCompositionForAcademicYear("ay-1");
    expect(result.ta03aCap).toBe(75);
    expect(result.ta03bCap).toBe(25);
    expect(result.isLocked).toBe(true);
    expect(result.finalizedScoreCount).toBe(2);
  });

  it("updateCompositionForAcademicYear rejects when sum !== 100", async () => {
    prisma.academicYear.findUnique.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
      isActive: true,
    });
    prisma.researchMethodScore.count.mockResolvedValue(0);

    await expect(
      compositionService.updateCompositionForAcademicYear("ay-1", {
        ta03aCap: 60,
        ta03bCap: 30,
      }),
    ).rejects.toThrow(/harus tepat 100/);
  });

  it("updateCompositionForAcademicYear rejects when finalized scores exist", async () => {
    prisma.academicYear.findUnique.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
      isActive: true,
    });
    prisma.researchMethodScore.count.mockResolvedValue(1);

    await expect(
      compositionService.updateCompositionForAcademicYear("ay-1", {
        ta03aCap: 50,
        ta03bCap: 50,
      }),
    ).rejects.toThrow(/sudah ada 1 nilai TA-03 yang final/);
  });

  it("updateCompositionForAcademicYear rejects when criteria total exceeds new cap", async () => {
    prisma.academicYear.findUnique.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
      isActive: true,
    });
    prisma.researchMethodScore.count.mockResolvedValue(0);
    prisma.metopenAssessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 60 } }) // supervisor for AY
      .mockResolvedValueOnce({ _sum: { maxScore: 20 } }); // default for AY

    await expect(
      compositionService.updateCompositionForAcademicYear("ay-1", {
        ta03aCap: 50,
        ta03bCap: 50,
      }),
    ).rejects.toThrow(/batas TA-03A menjadi 50/);
  });

  it("updateCompositionForAcademicYear upserts when valid", async () => {
    prisma.academicYear.findUnique.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
      isActive: false,
    });
    prisma.researchMethodScore.count.mockResolvedValue(0);
    prisma.metopenAssessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 40 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 40 } });
    prisma.metopenScoreComposition.upsert.mockResolvedValue({
      id: "c-1",
      academicYearId: "ay-1",
      ta03aCap: 50,
      ta03bCap: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await compositionService.updateCompositionForAcademicYear("ay-1", {
      ta03aCap: 50,
      ta03bCap: 50,
    });
    expect(result.ta03aCap).toBe(50);
    expect(result.ta03bCap).toBe(50);
    expect(result.isLocked).toBe(false);
  });
});
