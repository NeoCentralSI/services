import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/metopen.repository.js", () => ({
  findStudentThesis: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  default: {
    researchMethodScore: { findFirst: vi.fn() },
    thesisGuidance: { count: vi.fn() },
    thesisSeminarAudience: { count: vi.fn() },
  },
}));

const repo = await import("../../repositories/metopen.repository.js");
const prisma = (await import("../../config/prisma.js")).default;
const { checkSeminarEligibility } = await import("../metopen.service.js");

describe("checkSeminarEligibility — 4-gate enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupThesis(overrides = {}) {
    repo.findStudentThesis.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      proposalStatus: "accepted",
      thesisStatus: { name: "Bimbingan" },
      ...overrides,
    });
  }

  function setupAllPass() {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 75,
      isFinalized: true,
    });
    prisma.thesisGuidance.count.mockResolvedValue(10);
    prisma.thesisSeminarAudience.count.mockResolvedValue(9);
  }

  it("passes when all 4 gates are met", async () => {
    setupAllPass();

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(true);
    expect(result.requirements.metopelPassed).toBe(true);
    expect(result.requirements.proposalAccepted).toBe(true);
    expect(result.requirements.guidanceMet).toBe(true);
    expect(result.requirements.audienceMet).toBe(true);
  });

  it("fails when guidance count is below 8", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 75,
      isFinalized: true,
    });
    prisma.thesisGuidance.count.mockResolvedValue(5);
    prisma.thesisSeminarAudience.count.mockResolvedValue(10);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.guidanceMet).toBe(false);
    expect(result.requirements.guidanceCompleted).toBe(5);
    expect(result.reason).toContain("8 sesi bimbingan");
  });

  it("fails when audience attendance is below 8", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 75,
      isFinalized: true,
    });
    prisma.thesisGuidance.count.mockResolvedValue(10);
    prisma.thesisSeminarAudience.count.mockResolvedValue(3);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.audienceMet).toBe(false);
    expect(result.requirements.audienceAttended).toBe(3);
    expect(result.reason).toContain("8 kehadiran audiens");
  });

  it("fails when Metopel score is below threshold", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 50,
      isFinalized: true,
    });
    prisma.thesisGuidance.count.mockResolvedValue(10);
    prisma.thesisSeminarAudience.count.mockResolvedValue(10);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.metopelPassed).toBe(false);
    expect(result.reason).toContain("Lulus Metopel");
  });

  it("fails when proposal not accepted", async () => {
    setupThesis({ proposalStatus: "submitted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 75,
      isFinalized: true,
    });
    prisma.thesisGuidance.count.mockResolvedValue(10);
    prisma.thesisSeminarAudience.count.mockResolvedValue(10);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.proposalAccepted).toBe(false);
    expect(result.reason).toContain("Proposal di-ACC");
  });

  it("reports all missing requirements at once", async () => {
    setupThesis({ proposalStatus: "submitted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue(null);
    prisma.thesisGuidance.count.mockResolvedValue(2);
    prisma.thesisSeminarAudience.count.mockResolvedValue(1);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Lulus Metopel");
    expect(result.reason).toContain("Proposal di-ACC");
    expect(result.reason).toContain("8 sesi bimbingan");
    expect(result.reason).toContain("8 kehadiran audiens");
  });
});
