/** Proposal final per attempt and the proposal-phase gate. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, studentRepo, fileHelper, notify, repeat } = vi.hoisted(() => ({
  prismaMock: {
    student: { findUnique: vi.fn(async () => ({ id: "stu-1" })) },
    thesis: { findUnique: vi.fn() },
    researchMethodAssessment: { findMany: vi.fn(async () => []), upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
  studentRepo: { findStudentThesis: vi.fn() },
  fileHelper: {
    proposalFileDir: (t, a) => `uploads/thesis/${t}/proposal/${a}`,
    storeFile: vi.fn(async ({ relDir }) => ({ filePath: `${relDir}/1-p.pdf`, fileName: "p.pdf", mimeType: "application/pdf", fileSize: 9, fileHash: "h" })),
    removeFile: vi.fn(),
  },
  notify: { createNotificationEventForUsers: vi.fn() },
  repeat: { isRepeatingProposal: vi.fn(async () => false) },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-proposal/student-thesis.repository.js", () => studentRepo);
vi.mock("../../helpers/thesis-proposal-file.helper.js", () => fileHelper);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../repositories/thesis-guidance-evaluation.repository.js", () => repeat);
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn(),
  AUDIT_ACTIONS: { FINAL_PROPOSAL_SUBMITTED: "FINAL_PROPOSAL_SUBMITTED" },
  ENTITY_TYPES: { RESEARCH_METHOD_ASSESSMENT: "RESEARCH_METHOD_ASSESSMENT" },
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-2", semester: "ganjil", year: "2026/2027" })),
  formatAcademicYearLabel: (y) => `${y?.year ?? "-"} ${y?.semester === "genap" ? "Genap" : "Ganjil"}`,
}));

const service = await import("../../services/thesis-proposal/final-proposal.service.js");
const { getProposalPhaseAccess } = await import("../../helpers/thesis-phase-access.helper.js");
const { otherPhaseReason } = await import("../../services/thesisGuidance/milestone.service.js");

const thesis = (overrides = {}) => ({
  id: "t-1",
  title: "Sistem A",
  status: "proposal",
  supervisorAssignedAt: new Date("2026-09-01"),
  thesisSupervisors: [{ lecturerId: "lec-1", role: { name: "Pembimbing 1" } }],
  ...overrides,
});
const attempt = (overrides = {}) => ({
  id: "a-2",
  academicYearId: "ay-2",
  proposalFilePath: null,
  supervisorScore: null,
  coordinatorScore: null,
  isFinalized: false,
  academicYear: { id: "ay-2", semester: "ganjil", year: "2026/2027" },
  ...overrides,
});
const pdf = { buffer: Buffer.from("%PDF-1.7 isi"), originalname: "p.pdf", size: 12 };

beforeEach(() => {
  vi.clearAllMocks();
  repeat.isRepeatingProposal.mockResolvedValue(false);
  studentRepo.findStudentThesis.mockResolvedValue(thesis());
  prismaMock.researchMethodAssessment.upsert.mockResolvedValue(attempt());
  prismaMock.researchMethodAssessment.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.researchMethodAssessment.findUnique.mockResolvedValue(attempt({ proposalFilePath: "uploads/thesis/t-1/proposal/a-2/1-p.pdf" }));
});

describe("proposal-phase gate", () => {
  it("opens after Penetapan Pembimbing, never for a thesis repeating its proposal", async () => {
    await expect(getProposalPhaseAccess(thesis())).resolves.toEqual({ open: true, repeating: false });
    await expect(getProposalPhaseAccess(thesis({ supervisorAssignedAt: null }))).resolves.toEqual({ open: false, repeating: false });
    repeat.isRepeatingProposal.mockResolvedValue(true);
    await expect(getProposalPhaseAccess(thesis())).resolves.toEqual({ open: false, repeating: true });
    await expect(getProposalPhaseAccess(thesis({ status: "research" }))).resolves.toEqual({ open: false, repeating: false });
  });

  it("milestones of the other phase are read-only (10.7)", () => {
    expect(otherPhaseReason("proposal", "research")).toMatch(/Fase proposal sudah selesai/);
    expect(otherPhaseReason("proposal", "proposal")).toBeNull();
    expect(otherPhaseReason("research", "research")).toBeNull();
  });
});

describe("final proposal (10.3)", () => {
  it("is replaceable until a score is submitted on the attempt", () => {
    expect(service.lockReasonOf(attempt())).toBeNull();
    expect(service.lockReasonOf(attempt({ supervisorScore: 60 }))).toMatch(/sudah dimulai/);
    expect(service.lockReasonOf(attempt({ coordinatorScore: 20 }))).toMatch(/sudah dimulai/);
    expect(service.lockReasonOf(attempt({ isFinalized: true }))).toMatch(/sudah final/);
  });

  it("stores the file under the attempt of the running period and tells the supervisors", async () => {
    const result = await service.submitFinalProposal("stu-1", pdf);
    expect(prismaMock.researchMethodAssessment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { thesisId_academicYearId: { thesisId: "t-1", academicYearId: "ay-2" } },
    }));
    expect(fileHelper.storeFile).toHaveBeenCalledWith(expect.objectContaining({ relDir: "uploads/thesis/t-1/proposal/a-2" }));
    expect(prismaMock.researchMethodAssessment.updateMany.mock.calls[0][0].where).toEqual({
      id: "a-2", isFinalized: false, supervisorScore: null, coordinatorScore: null,
    });
    expect(result.replaced).toBe(false);
    expect(result.attempt.file.url).toBe("/uploads/thesis/t-1/proposal/a-2/1-p.pdf");
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["lec-1"], expect.objectContaining({ type: "final_proposal_submitted" }), { push: true });
  });

  it("replacing removes the earlier file of the same attempt", async () => {
    prismaMock.researchMethodAssessment.upsert.mockResolvedValue(attempt({ proposalFilePath: "uploads/thesis/t-1/proposal/a-2/0-lama.pdf" }));
    const result = await service.submitFinalProposal("stu-1", pdf);
    expect(result.replaced).toBe(true);
    expect(fileHelper.removeFile).toHaveBeenCalledWith("uploads/thesis/t-1/proposal/a-2/0-lama.pdf");
  });

  it("refuses non-PDF files, locked attempts, and a score sent meanwhile", async () => {
    await expect(service.submitFinalProposal("stu-1", { buffer: Buffer.from("PK\u0003\u0004"), originalname: "p.pdf" })).rejects.toThrow(/PDF yang valid/);
    prismaMock.researchMethodAssessment.upsert.mockResolvedValue(attempt({ supervisorScore: 60 }));
    await expect(service.submitFinalProposal("stu-1", pdf)).rejects.toThrow(/sudah dimulai/);
    expect(fileHelper.storeFile).not.toHaveBeenCalled();

    prismaMock.researchMethodAssessment.upsert.mockResolvedValue(attempt());
    prismaMock.researchMethodAssessment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submitFinalProposal("stu-1", pdf)).rejects.toThrow(/sudah dimulai/);
    expect(fileHelper.removeFile).toHaveBeenCalledWith("uploads/thesis/t-1/proposal/a-2/1-p.pdf");
  });

  it("needs the proposal phase, Penetapan Pembimbing and an active Pembimbing 1", async () => {
    studentRepo.findStudentThesis.mockResolvedValue(thesis({ supervisorAssignedAt: null }));
    await expect(service.submitFinalProposal("stu-1", pdf)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/Penetapan Pembimbing/) });
    studentRepo.findStudentThesis.mockResolvedValue(thesis({ status: "research" }));
    await expect(service.submitFinalProposal("stu-1", pdf)).rejects.toThrow(/tidak berada di fase proposal/);
    studentRepo.findStudentThesis.mockResolvedValue(thesis({ thesisSupervisors: [] }));
    await expect(service.submitFinalProposal("stu-1", pdf)).rejects.toThrow(/Pembimbing 1 aktif/);
  });

  it("state keeps earlier attempts apart from the running one", async () => {
    prismaMock.researchMethodAssessment.findMany.mockResolvedValue([
      attempt({ proposalFilePath: "uploads/thesis/t-1/proposal/a-2/1-p.pdf" }),
      attempt({ id: "a-1", academicYearId: "ay-1", proposalFilePath: "uploads/thesis/t-1/proposal/a-1/x.pdf", isFinalized: true, finalScore: 47, result: "failed", academicYear: { id: "ay-1", semester: "genap", year: "2025/2026" } }),
    ]);
    const state = await service.getFinalProposalState(thesis());
    expect(state.current.id).toBe("a-2");
    expect(state.canSubmit).toBe(true);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ id: "a-1", result: "failed", finalScore: 47 });
  });
});

it("rejects proposal files above 10 MB before storing anything", async () => {
  await expect(service.submitFinalProposal("stu-1", { ...pdf, size: 10 * 1024 * 1024 + 1 })).rejects.toThrow("Ukuran berkas maksimal 10 MB.");
  expect(fileHelper.storeFile).not.toHaveBeenCalled();
});
