import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  default: {
    lecturerSupervisionQuota: {
      findMany: vi.fn(),
    },
  },
}));

const advisorQuotaMock = {
  syncAllLecturerQuotaCurrentCounts: vi.fn(),
};

vi.mock("../../services/advisorQuota.service.js", () => advisorQuotaMock);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(),
}));

const prisma = (await import("../../config/prisma.js")).default;
const { resolveOperationalAcademicYear } = await import("../../helpers/academicYear.helper.js");
const { runQuotaCurrentCountSyncJob } = await import("../../jobs/quota-sync.job.js");

describe("runQuotaCurrentCountSyncJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op when no academic year has quota rows", async () => {
    resolveOperationalAcademicYear.mockResolvedValue(null);
    prisma.lecturerSupervisionQuota.findMany.mockResolvedValue([]);

    const result = await runQuotaCurrentCountSyncJob();

    expect(result).toEqual({ synced: false, reason: "no-academic-year", years: [] });
    expect(advisorQuotaMock.syncAllLecturerQuotaCurrentCounts).not.toHaveBeenCalled();
  });

  it("overwrites currentCount via existing syncAll, once per year, without increment", async () => {
    resolveOperationalAcademicYear.mockResolvedValue({ id: "ay-1" });
    prisma.lecturerSupervisionQuota.findMany.mockResolvedValue([
      { academicYearId: "ay-1" },
      { academicYearId: "ay-2" },
    ]);
    advisorQuotaMock.syncAllLecturerQuotaCurrentCounts
      .mockResolvedValueOnce([
        { lecturerId: "lec-1", drift: 0, currentCount: 2 },
        { lecturerId: "lec-2", drift: 3, currentCount: 3 },
      ])
      .mockResolvedValueOnce([{ lecturerId: "lec-3", drift: 0, currentCount: 1 }]);

    const result = await runQuotaCurrentCountSyncJob();

    expect(advisorQuotaMock.syncAllLecturerQuotaCurrentCounts).toHaveBeenCalledTimes(2);
    expect(advisorQuotaMock.syncAllLecturerQuotaCurrentCounts).toHaveBeenCalledWith("ay-1");
    expect(advisorQuotaMock.syncAllLecturerQuotaCurrentCounts).toHaveBeenCalledWith("ay-2");
    expect(result.synced).toBe(true);
    expect(result.years).toEqual([
      { academicYearId: "ay-1", recalculated: 2, repairedCount: 1 },
      { academicYearId: "ay-2", recalculated: 1, repairedCount: 0 },
    ]);
  });
});
