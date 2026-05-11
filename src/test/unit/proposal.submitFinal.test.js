// Test untuk Canon §5.6 (FR-PRP-03): submit proposal final WAJIB lewat aksi
// eksplisit, bukan inferred. Validasi minimum:
// - Harus ada dokumen proposal terupload sebelumnya
// - Harus punya pembimbing aktif
// - Tidak bisa diulang setelah TA-04 disahkan
// - Idempotent jika versi yang sama sudah pernah disubmit final

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: vi.fn(),
  getActiveThesisForStudent: vi.fn(),
}));

vi.mock("../../repositories/thesisGuidance/proposal.repository.js", () => ({
  findLatestProposalVersion: vi.fn(),
  countActiveSupervisors: vi.fn(),
  submitFinalProposalVersion: vi.fn(),
}));

let studentRepo;
let proposalRepo;
let submitFinalProposal;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  studentRepo = await import(
    "../../repositories/thesisGuidance/student.guidance.repository.js"
  );
  proposalRepo = await import(
    "../../repositories/thesisGuidance/proposal.repository.js"
  );
  ({ submitFinalProposal } = await import(
    "../../services/thesisGuidance/proposal.service.js"
  ));
});

describe("submitFinalProposal — Canon §5.6 explicit submit final", () => {
  const studentId = "user-1";
  const baseStudent = { id: studentId };
  const baseThesis = {
    id: "thesis-1",
    studentId,
    proposalStatus: null,
    finalProposalVersionId: null,
  };
  const latestVersion = {
    id: "version-2",
    version: 2,
    submittedAsFinalAt: null,
  };

  it("rejects ketika belum ada versi proposal yang diunggah", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue(baseThesis);
    proposalRepo.findLatestProposalVersion.mockResolvedValue(null);
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);

    await expect(submitFinalProposal(studentId)).rejects.toThrow(
      /Unggah dokumen proposal terlebih dahulu/i,
    );
    expect(proposalRepo.submitFinalProposalVersion).not.toHaveBeenCalled();
  });

  it("rejects ketika belum ada pembimbing aktif", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue(baseThesis);
    proposalRepo.findLatestProposalVersion.mockResolvedValue(latestVersion);
    proposalRepo.countActiveSupervisors.mockResolvedValue(0);

    await expect(submitFinalProposal(studentId)).rejects.toThrow(
      /Mahasiswa harus memiliki dosen pembimbing/i,
    );
    expect(proposalRepo.submitFinalProposalVersion).not.toHaveBeenCalled();
  });

  it("rejects ketika proposal sudah disahkan TA-04 (proposalStatus accepted)", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue({
      ...baseThesis,
      proposalStatus: "accepted",
    });

    await expect(submitFinalProposal(studentId)).rejects.toThrow(
      /Proposal sudah disahkan sebagai TA-04/i,
    );
    expect(proposalRepo.findLatestProposalVersion).not.toHaveBeenCalled();
  });

  it("idempotent saat versi yang sama sudah pernah disubmit final", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue({
      ...baseThesis,
      finalProposalVersionId: latestVersion.id,
    });
    proposalRepo.findLatestProposalVersion.mockResolvedValue({
      ...latestVersion,
      submittedAsFinalAt: new Date("2026-04-01"),
    });
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);

    const result = await submitFinalProposal(studentId);

    expect(result.alreadySubmitted).toBe(true);
    expect(proposalRepo.submitFinalProposalVersion).not.toHaveBeenCalled();
  });

  it("memanggil submitFinalProposalVersion saat semua prasyarat terpenuhi", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue(baseThesis);
    proposalRepo.findLatestProposalVersion.mockResolvedValue(latestVersion);
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);
    proposalRepo.submitFinalProposalVersion.mockResolvedValue({
      ...latestVersion,
      submittedAsFinalAt: new Date(),
    });

    const result = await submitFinalProposal(studentId);

    expect(proposalRepo.submitFinalProposalVersion).toHaveBeenCalledWith(
      "thesis-1",
      "version-2",
      studentId,
    );
    expect(result.alreadySubmitted).toBe(false);
    expect(result.finalProposalVersion).toBeTruthy();
    expect(result.finalProposalVersion.id).toBe("version-2");
  });
});
