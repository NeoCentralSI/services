import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "../../constants/roles.js";

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

const supervisionQuotaMock = {
  getDefaultQuota: vi.fn(),
};

vi.mock("../../services/advisorQuota.service.js", () => advisorQuotaMock);
vi.mock("../../services/supervisionQuota.service.js", () => supervisionQuotaMock);
vi.mock("../../helpers/academicYear.helper.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveOperationalAcademicYear: vi.fn(),
  };
});

const {
  browseLecturerQuotas,
  canSeeFullSixQuotaFigures,
  getDefaultQuotaConfig,
} = await import("../../services/quota.service.js");

const snapshot = {
  lecturerId: "lec-1",
  fullName: "Dosen A",
  identityNumber: "1",
  email: "a@x",
  avatarUrl: null,
  scienceGroup: { id: "sg-1", name: "RPL" },
  quotaMax: 10,
  quotaSoftLimit: 8,
  currentCount: 4,
  activeCount: 3,
  bookingCount: 1,
  pendingKadepCount: 2,
  normalAvailable: 6,
  overquotaAmount: 0,
  overquotaSahCount: 1,
  trafficLight: "green",
  acceptingRequests: true,
};

describe("canSeeFullSixQuotaFigures", () => {
  it("treats internal callers as full-six so downstream sanitizers can pick fields", () => {
    expect(canSeeFullSixQuotaFigures({}, "lec-1")).toBe(true);
  });

  it("gives KaDep the complete six figures for any lecturer", () => {
    expect(
      canSeeFullSixQuotaFigures(
        { viewerUserId: "kadep-1", viewerRoles: [ROLES.KETUA_DEPARTEMEN] },
        "lec-1",
      ),
    ).toBe(true);
  });

  it("gives a dosen their own six figures", () => {
    expect(
      canSeeFullSixQuotaFigures(
        { viewerUserId: "lec-1", viewerRoles: [ROLES.PEMBIMBING_1] },
        "lec-1",
      ),
    ).toBe(true);
  });

  it("hides peer Booking/Pending KaDep/Overquota from a dosen (mahasiswa-level)", () => {
    expect(
      canSeeFullSixQuotaFigures(
        { viewerUserId: "lec-self", viewerRoles: [ROLES.PEMBIMBING_1] },
        "lec-1",
      ),
    ).toBe(false);
  });
});

describe("browseLecturerQuotas visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    advisorQuotaMock.getLecturerQuotaSnapshots.mockResolvedValue([snapshot]);
  });

  it("includes overquotaSahCount for internal callers", async () => {
    const [row] = await browseLecturerQuotas("ay-1");
    expect(row.bookingCount).toBe(1);
    expect(row.pendingKadepCount).toBe(2);
    expect(row.overquotaSahCount).toBe(1);
  });

  it("keeps six figures when a dosen browses themselves", async () => {
    const [row] = await browseLecturerQuotas("ay-1", {
      viewerUserId: "lec-1",
      viewerRoles: [ROLES.PEMBIMBING_1],
    });
    expect(row.bookingCount).toBe(1);
    expect(row.overquotaSahCount).toBe(1);
    expect(row.normalAvailable).toBe(6);
  });

  it("hides Booking, Pending KaDep, and Overquota when a dosen browses a peer", async () => {
    const [row] = await browseLecturerQuotas("ay-1", {
      viewerUserId: "lec-self",
      viewerRoles: [ROLES.PEMBIMBING_1],
    });
    expect(row.normalAvailable).toBe(6);
    expect(row.activeCount).toBe(3);
    expect(row.trafficLight).toBe("green");
    expect(row.bookingCount).toBeUndefined();
    expect(row.pendingKadepCount).toBeUndefined();
    expect(row.overquotaSahCount).toBeUndefined();
    expect(row.overquotaAmount).toBeUndefined();
  });
});

describe("getDefaultQuotaConfig", () => {
  it("delegates to supervisionQuota so Admin endpoints share the labeled payload", async () => {
    supervisionQuotaMock.getDefaultQuota.mockResolvedValue({
      academicYearId: "ay-1",
      quotaMax: 10,
      quotaSoftLimit: 8,
      isFallback: true,
      source: "hardcoded_fallback",
    });

    const result = await getDefaultQuotaConfig("ay-1");

    expect(supervisionQuotaMock.getDefaultQuota).toHaveBeenCalledWith("ay-1");
    expect(result.isFallback).toBe(true);
    expect(result.source).toBe("hardcoded_fallback");
    expect(result.quotaMax).toBe(10);
  });
});
