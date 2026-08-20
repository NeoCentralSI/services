import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  default: {
    academicYear: {
      findUnique: vi.fn().mockResolvedValue({
        id: "ay-1",
        year: "2025/2026",
        semester: "genap",
      }),
    },
  },
}));

const advisorQuotaMock = {
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
};

vi.mock("../../services/advisorQuota.service.js", () => advisorQuotaMock);
vi.mock("../../helpers/academicYear.helper.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveOperationalAcademicYear: vi.fn(),
  };
});

const { getQuotaMonitoring } = await import("../../services/quota.service.js");
const { QUOTA_LOAD_DEFINITION_LABEL } = await import("../../utils/loadScope.util.js");

describe("quota.service getQuotaMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    advisorQuotaMock.getLecturerQuotaSnapshots.mockResolvedValue([
      {
        lecturerId: "lec-1",
        fullName: "Dosen A",
        identityNumber: "1",
        scienceGroup: { id: "sg-1", name: "RPL" },
        quotaRecordId: "q-1",
        quotaMax: 10,
        quotaSoftLimit: 8,
        currentCount: 2,
        activeCount: 1,
        bookingCount: 1,
        pendingKadepCount: 0,
        normalAvailable: 8,
        overquotaAmount: 0,
        overquotaSahCount: 0,
        trafficLight: "green",
      },
    ]);
  });

  it("returns labeled quota rows without changing computed counts", async () => {
    const result = await getQuotaMonitoring("ay-1");

    expect(result.definitionLabel).toBe(QUOTA_LOAD_DEFINITION_LABEL);
    expect(result.periodLabel).toMatch(/Genap/);
    expect(result.lecturers).toHaveLength(1);
    expect(result.lecturers[0].currentCount).toBe(2);
    expect(result.kbkLoads.groups[0].totalLoad).toBe(2);
  });
});
