// Test untuk Canon §5.6 (FR-PRP-03): submit proposal final WAJIB lewat aksi
// eksplisit, bukan inferred. Validasi minimum:
// - Harus ada dokumen proposal terupload sebelumnya
// - Harus punya pembimbing aktif
// - Tidak bisa diulang setelah promosi aktif TA
// - Idempotent jika versi yang sama sudah pernah disubmit final

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: vi.fn(),
  getActiveThesisForStudent: vi.fn(),
}));

vi.mock("../../repositories/thesisGuidance/proposal.repository.js", () => ({
  findLatestProposalVersion: vi.fn(),
  getProposalSubmissionStatus: vi.fn(),
  countActiveSupervisors: vi.fn(),
  submitFinalProposalVersion: vi.fn(),
  findResearchMethodScoreProgress: vi.fn(),
}));

vi.mock("../../services/ta04Authorization.service.js", () => ({
  assertTa04GuidanceAuthorized: vi.fn(),
  getTa04GuidanceAuthorization: vi.fn(),
}));

vi.mock("../../services/metopenAttendance.service.js", () => ({
  reconcileAttendanceForThesis: vi.fn(),
}));

let studentRepo;
let proposalRepo;
let ta04Authorization;
let metopenAttendance;
let submitFinalProposal;
let getProposalSubmissionStatus;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  studentRepo = await import(
    "../../repositories/thesisGuidance/student.guidance.repository.js"
  );
  proposalRepo = await import(
    "../../repositories/thesisGuidance/proposal.repository.js"
  );
  ta04Authorization = await import(
    "../../services/ta04Authorization.service.js"
  );
  metopenAttendance = await import("../../services/metopenAttendance.service.js");
  ta04Authorization.getTa04GuidanceAuthorization.mockResolvedValue({
    hasBookedSupervisor: true,
    guidanceGateOpen: true,
    guidanceGateReason: null,
  });
  ta04Authorization.assertTa04GuidanceAuthorized.mockResolvedValue({
    guidanceGateOpen: true,
  });
  metopenAttendance.reconcileAttendanceForThesis.mockResolvedValue({
    status: "eligible",
    applied: null,
  });
  ({ submitFinalProposal, getProposalSubmissionStatus } = await import(
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

  it("rejects ketika proposal sudah promosi beban aktif (proposalStatus accepted)", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue({
      ...baseThesis,
      proposalStatus: "accepted",
    });

    await expect(submitFinalProposal(studentId)).rejects.toThrow(
      /sudah promosi ke beban aktif Tugas Akhir/i,
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
    proposalRepo.findResearchMethodScoreProgress.mockResolvedValue(null);
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
    expect(metopenAttendance.reconcileAttendanceForThesis).toHaveBeenCalledWith(
      "thesis-1",
      studentId,
    );
    expect(result.alreadySubmitted).toBe(false);
    expect(result.finalProposalVersion).toBeTruthy();
    expect(result.finalProposalVersion.id).toBe("version-2");
  });

  it("tidak memanggil reconcile pada re-submit idempotent", async () => {
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

    await submitFinalProposal(studentId);

    expect(metopenAttendance.reconcileAttendanceForThesis).not.toHaveBeenCalled();
  });

  // F-4.3: lock integritas — versi final tidak boleh ditukar saat penilaian TA-03 berjalan.
  it("rejects swap versi final saat penilaian TA-03 sudah dimulai", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue(baseThesis);
    proposalRepo.findLatestProposalVersion.mockResolvedValue(latestVersion);
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);
    proposalRepo.findResearchMethodScoreProgress.mockResolvedValue({
      supervisorScore: 60,
      lecturerScore: null,
      isFinalized: false,
    });

    await expect(submitFinalProposal(studentId)).rejects.toThrow(
      /Penilaian TA-03 sudah dimulai/i,
    );
    expect(proposalRepo.submitFinalProposalVersion).not.toHaveBeenCalled();
  });

  it("menampilkan alasan lock final saat penilaian TA-03 sudah selesai", async () => {
    studentRepo.getStudentByUserId.mockResolvedValue(baseStudent);
    studentRepo.getActiveThesisForStudent.mockResolvedValue(baseThesis);
    proposalRepo.findLatestProposalVersion.mockResolvedValue(latestVersion);
    proposalRepo.getProposalSubmissionStatus.mockResolvedValue({
      proposalStatus: null,
      finalProposalVersion: null,
    });
    proposalRepo.countActiveSupervisors.mockResolvedValue(1);
    proposalRepo.findResearchMethodScoreProgress.mockResolvedValue({
      supervisorScore: 70,
      lecturerScore: 20,
      finalScore: 90,
      isFinalized: true,
    });

    const result = await getProposalSubmissionStatus(studentId);

    expect(result.uploadLocked).toBe(true);
    expect(result.uploadLockedReason).toMatch(/TA-03 sudah final/i);
    expect(result.uploadLockedReason).not.toMatch(/sedang berlangsung/i);
  });
});
