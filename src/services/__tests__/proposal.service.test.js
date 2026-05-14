import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: vi.fn(),
  getActiveThesisForStudent: vi.fn(),
}));

vi.mock("../../repositories/thesisGuidance/proposal.repository.js", () => ({
  createDocument: vi.fn(),
  markPreviousNotLatest: vi.fn(),
  countVersions: vi.fn(),
  createProposalVersion: vi.fn(),
  createProposalVersionWithDocument: vi.fn(),
  updateThesisProposalDocumentId: vi.fn(),
  getProposalVersions: vi.fn(),
  findLatestProposalVersion: vi.fn(),
  countActiveSupervisors: vi.fn(),
  submitFinalProposalVersion: vi.fn(),
}));

const studentRepo = await import("../../repositories/thesisGuidance/student.guidance.repository.js");
const proposalRepo = await import("../../repositories/thesisGuidance/proposal.repository.js");
const {
  uploadProposalVersion,
  submitFinalProposal,
} = await import("../thesisGuidance/proposal.service.js");

describe("proposal.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studentRepo.getStudentByUserId.mockResolvedValue({ id: "student-1" });
    studentRepo.getActiveThesisForStudent.mockResolvedValue({
      id: "thesis-1",
      proposalStatus: null,
      finalProposalVersionId: null,
    });
  });

  it("stores proposal uploads as thesis proposal versions without creating milestone records", async () => {
    proposalRepo.createProposalVersionWithDocument.mockResolvedValue({
      id: "version-1",
      version: 1,
      description: "versi awal",
      submittedAsFinalAt: null,
      createdAt: "2026-04-23T10:00:00.000Z",
      document: {
        id: "doc-1",
        fileName: "proposal.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      },
    });

    const result = await uploadProposalVersion(
      "user-1",
      {
        originalname: "proposal.pdf",
        size: 1024,
        mimetype: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\n"),
      },
      "versi awal",
    );

    expect(proposalRepo.createProposalVersionWithDocument).toHaveBeenCalledWith({
      thesisId: "thesis-1",
      userId: "user-1",
      filePath: expect.stringContaining("uploads/thesis/thesis-1/proposal/"),
      fileName: "proposal.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      description: "versi awal",
    });
    expect(result.version).toBe(1);
    expect(result.url).toContain("/uploads/thesis/thesis-1/proposal/");
  });

  it("blocks final proposal submission when the student has no supervisor yet", async () => {
    proposalRepo.findLatestProposalVersion.mockResolvedValue({
      id: "version-2",
      version: 2,
      submittedAsFinalAt: null,
      isLatest: true,
      createdAt: "2026-04-23T10:00:00.000Z",
      document: {
        filePath: "uploads/thesis/thesis-1/proposal/proposal-v2.pdf",
        fileName: "proposal-v2.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
      },
    });
    proposalRepo.countActiveSupervisors.mockResolvedValue(0);

    await expect(submitFinalProposal("user-1")).rejects.toThrow("dosen pembimbing");
  });

  it("submits the latest proposal version as the active final proposal", async () => {
    proposalRepo.findLatestProposalVersion.mockResolvedValue({
      id: "version-3",
      version: 3,
      submittedAsFinalAt: null,
      isLatest: true,
      createdAt: "2026-04-23T10:00:00.000Z",
      document: {
        id: "doc-3",
        filePath: "uploads/thesis/thesis-1/proposal/proposal-v3.pdf",
        fileName: "proposal-v3.pdf",
        fileSize: 4096,
        mimeType: "application/pdf",
      },
    });
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);
    proposalRepo.submitFinalProposalVersion.mockResolvedValue({
      id: "version-3",
      version: 3,
      submittedAsFinalAt: "2026-04-23T10:10:00.000Z",
      createdAt: "2026-04-23T10:00:00.000Z",
      isLatest: true,
      description: null,
      document: {
        filePath: "uploads/thesis/thesis-1/proposal/proposal-v3.pdf",
        fileName: "proposal-v3.pdf",
        fileSize: 4096,
        mimeType: "application/pdf",
      },
    });

    const result = await submitFinalProposal("user-1");

    expect(proposalRepo.submitFinalProposalVersion).toHaveBeenCalledWith(
      "thesis-1",
      "version-3",
      "user-1",
    );
    expect(result.alreadySubmitted).toBe(false);
    expect(result.finalProposalVersion.version).toBe(3);
    expect(result.finalProposalVersion.submittedAsFinalAt).toBe("2026-04-23T10:10:00.000Z");
  });
});
