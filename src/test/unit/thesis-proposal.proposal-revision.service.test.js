/**
 * Proposal revisi: the way back to research for a thesis repeating its
 * proposal after a guidance evaluation. Upload → Minta Revisi → upload again → Setujui.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, tx, studentRepo, evaluationRepo, fileHelper, notify, audit } = vi.hoisted(() => {
  const tx = {
    thesisProposalRevision: { updateMany: vi.fn(async () => ({ count: 1 })) },
    thesis: { update: vi.fn(async ({ data }) => ({ id: "t-1", status: data.status ?? "research", startDate: data.startDate ?? null })) },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    prismaMock: {
      student: { findUnique: vi.fn(async () => ({ id: "stu-1" })) },
      thesis: { findUnique: vi.fn() },
      userHasRole: { findFirst: vi.fn(async () => null) },
      thesisProposalRevision: { findMany: vi.fn(async () => []), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
      $transaction: vi.fn(async (fn) => fn(tx)),
    },
    studentRepo: { findStudentThesis: vi.fn() },
    evaluationRepo: { findRepeatProposalEvaluation: vi.fn(async () => null) },
    fileHelper: {
      proposalRevisionDir: (t, r) => `uploads/thesis/${t}/proposal/revisions/${r}`,
      storeFile: vi.fn(async ({ relDir }) => ({ filePath: `${relDir}/1-r.pdf`, fileName: "r.pdf", mimeType: "application/pdf", fileSize: 9, fileHash: "h" })),
      removeFile: vi.fn(),
    },
    notify: { createNotificationEventForUsers: vi.fn() },
    audit: { logAudit: vi.fn() },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-proposal/student-thesis.repository.js", () => studentRepo);
vi.mock("../../repositories/thesis-guidance-evaluation.repository.js", () => evaluationRepo);
vi.mock("../../helpers/thesis-proposal-file.helper.js", () => fileHelper);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../services/auditLog.service.js", async (importOriginal) => ({ ...(await importOriginal()), logAudit: audit.logAudit }));

const service = await import("../../services/thesis-proposal/proposal-revision.service.js");

const EVALUATION = { id: "ev-1", kadepApprovedAt: new Date("2026-10-01T03:00:00Z") };
const thesis = (overrides = {}) => ({
  id: "t-1",
  title: "Sistem A",
  status: "proposal",
  startDate: null,
  studentId: "stu-1",
  thesisSupervisors: [
    { lecturerId: "lec-1", role: { name: "Pembimbing 1" } },
    { lecturerId: "lec-2", role: { name: "Pembimbing 2" } },
  ],
  ...overrides,
});
const row = (overrides = {}) => ({
  id: "r-1",
  thesisId: "t-1",
  evaluationId: "ev-1",
  filePath: "uploads/thesis/t-1/proposal/revisions/r-1/1-r.pdf",
  fileName: "r.pdf",
  fileSize: 9,
  submittedAt: new Date("2026-10-02T03:00:00Z"),
  status: "submitted",
  reviewNotes: null,
  reviewedAt: null,
  reviewer: null,
  ...overrides,
});
const pdf = { buffer: Buffer.from("%PDF-1.7 isi"), originalname: "r.pdf", size: 12 };

beforeEach(() => {
  vi.clearAllMocks();
  evaluationRepo.findRepeatProposalEvaluation.mockResolvedValue(EVALUATION);
  studentRepo.findStudentThesis.mockResolvedValue(thesis());
  prismaMock.thesis.findUnique.mockResolvedValue(thesis());
  prismaMock.thesisProposalRevision.findMany.mockResolvedValue([]);
  prismaMock.thesisProposalRevision.findUnique.mockImplementation(async ({ where }) => row({ id: where.id }));
});

describe("only a thesis repeating its proposal", () => {
  it("a proposal thesis without an approved \"Mengulang Proposal\" evaluation can neither upload nor be reviewed", async () => {
    evaluationRepo.findRepeatProposalEvaluation.mockResolvedValue(null);
    const state = await service.getProposalRevisionState(thesis());
    expect(state).toMatchObject({ applicable: false, canSubmit: false, blockReason: service.NOT_REPEATING_REASON });
    await expect(service.submitProposalRevision("stu-1", pdf)).rejects.toMatchObject({ statusCode: 403, message: service.NOT_REPEATING_REASON });
    await expect(service.reviewProposalRevision("lec-1", "r-1", { action: "approve" })).rejects.toMatchObject({ statusCode: 403 });
    expect(fileHelper.storeFile).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("a research thesis is not asked for an evaluation at all", async () => {
    const state = await service.getProposalRevisionState(thesis({ status: "research" }));
    expect(state.applicable).toBe(false);
    expect(evaluationRepo.findRepeatProposalEvaluation).not.toHaveBeenCalled();
  });
});

describe("upload", () => {
  it("needs a valid PDF", async () => {
    await expect(service.submitProposalRevision("stu-1", { buffer: Buffer.from("bukan pdf"), originalname: "x.pdf" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("first upload creates a row in the cycle and notifies both supervisors", async () => {
    const result = await service.submitProposalRevision("stu-1", pdf);
    const data = prismaMock.thesisProposalRevision.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ thesisId: "t-1", evaluationId: "ev-1", fileName: "r.pdf", fileHash: "h" });
    expect(data.filePath).toBe(`uploads/thesis/t-1/proposal/revisions/${data.id}/1-r.pdf`);
    expect(result.replaced).toBe(false);
    expect(notify.createNotificationEventForUsers.mock.calls[0][0]).toEqual(["lec-1", "lec-2"]);
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PROPOSAL_REVISION_SUBMITTED" }));
  });

  it("an upload waiting for review is replaced in place; the old file is removed", async () => {
    prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row({ filePath: "old.pdf" })]);
    const result = await service.submitProposalRevision("stu-1", pdf);
    expect(result.replaced).toBe(true);
    expect(prismaMock.thesisProposalRevision.create).not.toHaveBeenCalled();
    expect(prismaMock.thesisProposalRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r-1", status: "submitted" } }));
    expect(fileHelper.removeFile).toHaveBeenCalledWith("old.pdf");
  });

  it("after \"Minta Revisi\" the next upload is a new row, so the notes stay in the history", async () => {
    prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row({ status: "revision_requested", reviewNotes: "Perjelas metodologi." })]);
    const state = await service.getProposalRevisionState(thesis());
    expect(state).toMatchObject({ applicable: true, canSubmit: true, replacesCurrent: false, current: { status: "revision_requested", reviewNotes: "Perjelas metodologi." } });
    await service.submitProposalRevision("stu-1", pdf);
    expect(prismaMock.thesisProposalRevision.create).toHaveBeenCalled();
  });

  it("needs an active Pembimbing 1", async () => {
    studentRepo.findStudentThesis.mockResolvedValue(thesis({ thesisSupervisors: [] }));
    await expect(service.submitProposalRevision("stu-1", pdf)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("a review sent meanwhile wins over a replacement; the stored file is removed", async () => {
    prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row()]);
    prismaMock.thesisProposalRevision.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.submitProposalRevision("stu-1", pdf)).rejects.toMatchObject({ statusCode: 400 });
    expect(fileHelper.removeFile).toHaveBeenCalledWith("uploads/thesis/t-1/proposal/revisions/r-1/1-r.pdf");
  });
});

describe("review by the Pembimbing 1", () => {
  beforeEach(() => prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row()]));

  it("only the active Pembimbing 1, never the Pembimbing 2", async () => {
    await expect(service.reviewProposalRevision("lec-2", "r-1", { action: "approve" })).rejects.toMatchObject({ statusCode: 403, message: "Hanya Pembimbing 1 yang meninjau proposal revisi." });
    const view = await service.getProposalRevisionForLecturer("lec-2", "t-1");
    expect(view).toMatchObject({ canReview: false, reviewBlockReason: "Hanya Pembimbing 1 yang meninjau proposal revisi." });
    expect((await service.getProposalRevisionForLecturer("lec-1", "t-1")).canReview).toBe(true);
  });

  it("someone who is neither supervisor nor Kadep/Sekdep/Admin cannot read it", async () => {
    await expect(service.getProposalRevisionForLecturer("lec-9", "t-1")).rejects.toMatchObject({ statusCode: 403 });
    prismaMock.userHasRole.findFirst.mockResolvedValueOnce({ userId: "kadep" });
    expect((await service.getProposalRevisionForLecturer("kadep", "t-1")).canReview).toBe(false);
  });

  it("\"Minta Revisi\" needs notes of at least 10 characters and notifies only the student", async () => {
    await expect(service.reviewProposalRevision("lec-1", "r-1", { action: "request_revision", notes: "kurang" })).rejects.toMatchObject({ statusCode: 400, message: "Catatan revisi wajib diisi minimal 10 karakter." });
    const result = await service.reviewProposalRevision("lec-1", "r-1", { action: "request_revision", notes: "  Perjelas metodologi penelitian.  " });
    expect(tx.thesisProposalRevision.updateMany).toHaveBeenCalledWith({
      where: { id: "r-1", status: "submitted" },
      data: expect.objectContaining({ status: "revision_requested", reviewNotes: "Perjelas metodologi penelitian.", reviewedBy: "lec-1" }),
    });
    expect(tx.thesis.update).not.toHaveBeenCalled();
    expect(result.thesis).toBeNull();
    expect(notify.createNotificationEventForUsers.mock.calls[0][0]).toEqual(["stu-1"]);
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PROPOSAL_REVISION_REVISION_REQUESTED" }));
  });

  it("\"Setujui\" returns the thesis to research with a new start date, notifies the student and Pembimbing 2, and audits", async () => {
    const before = Date.now();
    const result = await service.reviewProposalRevision("lec-1", "r-1", { action: "approve" });
    const update = tx.thesis.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "t-1" });
    expect(update.data).toMatchObject({ status: "research" });
    expect(update.data.startDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "THESIS_STATUS_CHANGED" }) }));
    expect(result.thesis).toMatchObject({ id: "t-1", status: "research" });
    expect(notify.createNotificationEventForUsers.mock.calls[0][0]).toEqual(["stu-1", "lec-2"]);
    expect(notify.createNotificationEventForUsers.mock.calls[0][1].title).toBe("Proposal Revisi Disetujui");
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "PROPOSAL_REVISION_APPROVED" }));
    // No Head of Department step.
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledTimes(1);
  });

  it("only the latest upload waiting for review can be decided", async () => {
    prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row({ status: "revision_requested" })]);
    await expect(service.reviewProposalRevision("lec-1", "r-1", { action: "approve" })).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.thesisProposalRevision.findMany.mockResolvedValue([row({ id: "r-2" }), row({ status: "revision_requested" })]);
    await expect(service.reviewProposalRevision("lec-1", "r-1", { action: "approve" })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("a decision already taken in parallel is refused inside the transaction", async () => {
    tx.thesisProposalRevision.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.reviewProposalRevision("lec-1", "r-1", { action: "approve" })).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.thesis.update).not.toHaveBeenCalled();
  });
});

it("rejects proposal files above 10 MB before storing anything", async () => {
  await expect(service.submitProposalRevision("stu-1", { ...pdf, size: 10 * 1024 * 1024 + 1 })).rejects.toThrow("Ukuran berkas maksimal 10 MB.");
  expect(fileHelper.storeFile).not.toHaveBeenCalled();
});
