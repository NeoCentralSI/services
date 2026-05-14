import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/metopen.repository.js", () => ({
  findStudentThesis: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  default: {
    student: { findUnique: vi.fn() },
    researchMethodScore: { findFirst: vi.fn() },
    thesis: { findUnique: vi.fn(), update: vi.fn() },
    thesisParticipant: { count: vi.fn() },
    thesisMilestone: { findMany: vi.fn() },
  },
}));

const repo = await import("../../repositories/metopen.repository.js");
const prisma = (await import("../../config/prisma.js")).default;
const {
  checkEligibility,
  checkSeminarEligibility,
  submitTitleReport,
} = await import("../metopen.service.js");

describe("checkSeminarEligibility — canonical SIMPTA gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      takingThesisCourse: true,
    });
  });

  function setupThesis(overrides = {}) {
    const thesis = {
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul",
      proposalStatus: "accepted",
      finalProposalVersionId: "proposal-version-1",
      thesisStatus: { name: "Bimbingan" },
      ...overrides,
    };
    repo.findStudentThesis.mockResolvedValue(thesis);
    prisma.thesis.findUnique.mockResolvedValue(thesis);
    prisma.thesisParticipant.count.mockResolvedValue(1);
    prisma.thesisMilestone.findMany.mockResolvedValue([]);
    prisma.thesis.update.mockResolvedValue(thesis);
  }

  function setupAllPass() {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: 20,
      finalScore: 80,
      isFinalized: true,
    });
  }

  it("passes when metopen is passed and proposal is accepted", async () => {
    setupAllPass();

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(true);
    expect(result.scenario).toBe("A");
    expect(result.canContinueThesis).toBe(true);
    expect(result.seminarLocked).toBe(false);
    expect(result.requirements.metopelPassed).toBe(true);
    expect(result.requirements.proposalAccepted).toBe(true);
  });

  it("keeps seminar locked but allows thesis to continue when proposal is accepted and metopen is not passed", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 50,
      isFinalized: true,
    });

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.scenario).toBe("B");
    expect(result.canContinueThesis).toBe(true);
    expect(result.seminarLocked).toBe(true);
    expect(result.requirements.metopelPassed).toBe(false);
    expect(result.reason).toContain("Metopel belum lulus");
  });

  it("keeps seminar locked when proposal is not yet accepted", async () => {
    setupThesis({ proposalStatus: "submitted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 75,
      isFinalized: true,
    });

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.scenario).toBe("C");
    expect(result.canContinueThesis).toBe(true);
    expect(result.seminarLocked).toBe(true);
    expect(result.requirements.proposalAccepted).toBe(false);
    expect(result.reason).toContain("belum disahkan");
  });

  it("computes metopen pass from supervisor + lecturer score when finalScore is not persisted yet but isFinalized is true", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 55,
      lecturerScore: 15,
      finalScore: null,
      isFinalized: true,
    });

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(true);
    expect(result.requirements.metopelScore).toBe(70);
    expect(result.requirements.metopelPassed).toBe(true);
  });

  it("keeps seminar locked when scores exist but isFinalized is false (grades not yet locked)", async () => {
    setupThesis({ proposalStatus: "accepted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: 20,
      finalScore: 80,
      isFinalized: false,
    });

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.metopelPassed).toBe(false);
    expect(result.requirements.metopelScore).toBe(80);
    expect(result.seminarLocked).toBe(true);
  });

  it("keeps seminar locked when proposal is rejected", async () => {
    setupThesis({ proposalStatus: "rejected" });
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      finalScore: 80,
      isFinalized: true,
    });

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.proposalAccepted).toBe(false);
    expect(result.seminarLocked).toBe(true);
  });

  it("reports both missing requirements when score and approval are both absent", async () => {
    setupThesis({ proposalStatus: "submitted" });
    prisma.researchMethodScore.findFirst.mockResolvedValue(null);

    const result = await checkSeminarEligibility("user-1");

    expect(result.eligible).toBe(false);
    expect(result.requirements.metopelPassed).toBe(false);
    expect(result.requirements.proposalAccepted).toBe(false);
    expect(result.seminarLocked).toBe(true);
    expect(result.reason).toContain("penilaian Metopel");
  });

  it("keeps Metopen active until title approval is actually accepted", async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      eligibleMetopen: true,
      metopenEligibilitySource: "sia",
      metopenEligibilityUpdatedAt: "2026-04-23T10:00:00.000Z",
      thesis: [
        {
          id: "thesis-1",
          proposalStatus: "submitted",
          thesisStatus: { name: "Bimbingan" },
        },
      ],
    });

    const result = await checkEligibility("user-1");

    expect(result.canAccess).toBe(true);
    expect(result.readOnly).toBe(false);
    expect(result.canSubmit).toBe(true);
    expect(result.source).toBe("sia");
  });

  it("marks Metopen as archive only after TA-04 approval has been accepted", async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      eligibleMetopen: true,
      metopenEligibilitySource: "sia",
      metopenEligibilityUpdatedAt: "2026-04-23T10:00:00.000Z",
      thesis: [
        {
          id: "thesis-1",
          proposalStatus: "accepted",
          thesisStatus: { name: "Bimbingan" },
        },
      ],
    });

    const result = await checkEligibility("user-1");

    expect(result.canAccess).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(result.readOnly).toBe(true);
  });

  it("does not let stale legacy milestones block KaDep queue submission when TA-03 scores already exist", async () => {
    repo.findStudentThesis.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      finalProposalVersionId: "proposal-version-1",
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      finalProposalVersionId: "proposal-version-1",
    });
    prisma.thesisParticipant.count.mockResolvedValue(1);
    prisma.thesisMilestone.findMany.mockResolvedValue([
      { id: "legacy-task-1", status: "in_progress", title: "Task publish kelas lama" },
    ]);
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: 20,
      finalScore: 80,
      isFinalized: true,
    });

    const result = await submitTitleReport("user-1");

    expect(result.proposalStatus).toBe("submitted");
    expect(prisma.thesis.update).toHaveBeenCalledWith({
      where: { id: "thesis-1" },
      data: {
        proposalStatus: "submitted",
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
      },
    });
  });

  it("blocks KaDep queue when proposal final has not been submitted yet", async () => {
    repo.findStudentThesis.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      finalProposalVersionId: null,
    });
    prisma.thesisParticipant.count.mockResolvedValue(1);
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: 20,
      finalScore: 80,
      isFinalized: true,
    });

    await expect(submitTitleReport("user-1")).rejects.toThrow("submit proposal final");
  });

  it("blocks KaDep queue until SIA confirms the student is taking the thesis course", async () => {
    repo.findStudentThesis.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul SIMPTA",
      proposalStatus: null,
      finalProposalVersionId: "proposal-version-1",
    });
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      takingThesisCourse: false,
    });
    prisma.thesisParticipant.count.mockResolvedValue(1);
    prisma.researchMethodScore.findFirst.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: 20,
      finalScore: 80,
      isFinalized: true,
    });

    await expect(submitTitleReport("user-1")).rejects.toThrow("mata kuliah Tugas Akhir");
  });
});
