import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "../../constants/roles.js";

const getLecturerQuotaSnapshot = vi.hoisted(() => vi.fn());

vi.mock("../advisorQuota.service.js", () => ({
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots: vi.fn(),
}));

vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-1" })),
}));

vi.mock("../../config/prisma.js", () => ({
  default: {
    lecturer: { findUnique: vi.fn(), update: vi.fn() },
    academicYear: { findUnique: vi.fn() },
  },
}));

const { checkQuotaAvailability } = await import("../quota.service.js");

function redSnapshot() {
  return {
    lecturerId: "lect-1",
    fullName: "Dr. Dosen",
    identityNumber: "19800101",
    email: "dosen@example.com",
    avatarUrl: null,
    scienceGroup: null,
    quotaMax: 8,
    quotaSoftLimit: 6,
    activeCount: 8,
    normalAvailable: 0,
    trafficLight: "red",
    acceptingRequests: true,
    currentCount: 10,
    bookingCount: 2,
    pendingKadepCount: 0,
    overquotaAmount: 2,
    overquotaSahCount: 0,
    quotaRecordId: "quota-1",
  };
}

describe("checkQuotaAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLecturerQuotaSnapshot.mockResolvedValue(redSnapshot());
  });

  it("does not hard-block a red quota while the lecturer still accepts requests", async () => {
    const result = await checkQuotaAvailability("lect-1", "ay-1");
    expect(result.allowed).toBe(true);
    expect(result.trafficLight).toBe("red");
    expect(result.currentCount).toBe(10);
    expect(result.reason).toMatch(/penuh/i);
  });

  it("blocks only when the lecturer closed intake", async () => {
    getLecturerQuotaSnapshot.mockResolvedValue({
      ...redSnapshot(),
      acceptingRequests: false,
    });
    const result = await checkQuotaAvailability("lect-1", "ay-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/menutup penerimaan/i);
  });

  it("omits currentCount for peer lecturers who cannot see the six figures", async () => {
    const result = await checkQuotaAvailability("lect-1", "ay-1", {
      viewerUserId: "peer-user",
      viewerRoles: [ROLES.PEMBIMBING_1],
    });
    expect(result.trafficLight).toBe("red");
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBeUndefined();
    expect(result.remaining).toBeUndefined();
  });

  it("keeps currentCount for KaDep", async () => {
    const result = await checkQuotaAvailability("lect-1", "ay-1", {
      viewerUserId: "kadep-user",
      viewerRoles: [ROLES.KETUA_DEPARTEMEN],
    });
    expect(result.currentCount).toBe(10);
    expect(result.remaining).toBe(0);
  });
});
