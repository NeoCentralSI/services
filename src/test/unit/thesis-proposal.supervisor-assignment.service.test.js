/** Penetapan Pembimbing per periode: batch, versions and access to the PDF. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, prismaMock, tx, notify, requestRepo, helper, fileHelper, audit } = vi.hoisted(() => {
  const tx = {
    thesisSupervisorAssignmentBatch: { updateMany: vi.fn(), create: vi.fn() },
    thesisSupervisorRequest: { updateMany: vi.fn() },
    thesis: { updateMany: vi.fn() },
    officialGeneratedDocument: { updateMany: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    repo: {
      findCohortTheses: vi.fn(),
      findCurrentBatch: vi.fn(),
      findBatches: vi.fn(),
      findBatchById: vi.fn(),
      findLatestBatchOfThesis: vi.fn(),
      findActiveUserByRole: vi.fn(async () => ({ id: "kadep", fullName: "Kadep", identityNumber: "1" })),
    },
    prismaMock: {
      academicYear: { findUnique: vi.fn() },
      thesisSupervisorAssignmentBatch: { count: vi.fn(async () => 0) },
      thesisSupervisorRequest: { groupBy: vi.fn() },
      notification: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn) => fn(tx)),
    },
    notify: { createNotificationEventForUsers: vi.fn() },
    requestRepo: { findActiveUserIdsByRole: vi.fn(async () => ["kadep"]), userHasAnyActiveRole: vi.fn() },
    helper: { renderAssignmentPdf: vi.fn(async () => Buffer.from("%PDF")) },
    fileHelper: {
      assignmentBatchDir: (id) => `uploads/thesis-proposal/supervisor-assignments/${id}`,
      storeFile: vi.fn(async () => ({ filePath: "uploads/x.pdf", fileName: "x.pdf", mimeType: "application/pdf", fileSize: 4, fileHash: "h" })),
      removeFile: vi.fn(),
    },
    audit: { logAudit: vi.fn() },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-proposal/supervisor-assignment.repository.js", () => repo);
vi.mock("../../repositories/thesis-proposal/supervisor-request.repository.js", () => requestRepo);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../helpers/thesis-proposal-file.helper.js", () => fileHelper);
vi.mock("../../helpers/supervisor-assignment.helper.js", async (importOriginal) => ({ ...(await importOriginal()), ...helper }));
vi.mock("../../services/auditLog.service.js", () => ({
  ...audit,
  AUDIT_ACTIONS: { SUPERVISOR_ASSIGNMENT_ISSUED: "SUPERVISOR_ASSIGNMENT_ISSUED" },
  ENTITY_TYPES: { SUPERVISOR_ASSIGNMENT_BATCH: "SUPERVISOR_ASSIGNMENT_BATCH" },
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-1", semester: "ganjil", year: "2026/2027", isActive: true })),
  formatAcademicYearLabel: () => "2026/2027 Ganjil",
}));

const service = await import("../../services/thesis-proposal/supervisor-assignment.service.js");
const { buildAssignmentCohort } = await import("../../helpers/supervisor-assignment.helper.js");
const { runSupervisorAssignmentReminderJob } = await import("../../jobs/supervisor-assignment-reminder.job.js");

const thesis = (id, nim, overrides = {}) => ({
  id,
  title: `Judul ${id}`,
  status: "proposal",
  supervisorAssignedAt: null,
  requestId: `req-${id}`,
  requestStatus: "accepted",
  student: { id: `stu-${id}`, user: { id: `stu-${id}`, fullName: `Mahasiswa ${id}`, identityNumber: nim } },
  thesisSupervisors: [{ status: "active", lecturerId: "lec-1", role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "AINA, M.Eng" } } }],
  ...overrides,
});

const batchOf = (theses, overrides = {}) => ({
  id: "batch-1",
  version: 1,
  status: "current",
  academicYearId: "ay-1",
  cohortHash: buildAssignmentCohort(theses).cohortHash,
  members: theses.map((t) => ({ thesisId: t.id })),
  filePath: "uploads/thesis-proposal/supervisor-assignments/batch-1/x.pdf",
  fileName: "x.pdf",
  mimeType: "application/pdf",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findBatches.mockResolvedValue([]);
  repo.findCurrentBatch.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
});

describe("overview", () => {
  it("marks theses not yet in the current batch and says the batch must be issued again", async () => {
    const a = thesis("a", "2211528001", { supervisorAssignedAt: new Date("2026-09-01"), requestStatus: "assigned" });
    const b = thesis("b", "2211528002");
    repo.findCohortTheses.mockResolvedValue([a, b]);
    repo.findCurrentBatch.mockResolvedValue(batchOf([a]));

    const overview = await service.getAssignmentOverview();
    expect(overview.upToDate).toBe(false);
    expect(overview.needsIssue).toBe(true);
    expect(overview.newCount).toBe(1);
    expect(overview.entries.map((e) => [e.thesisId, e.inCurrentBatch])).toEqual([["a", true], ["b", false]]);
    expect(overview.entries[0].supervisors).toEqual([{ lecturerId: "lec-1", fullName: "AINA, M.Eng", role: "Pembimbing 1" }]);
  });

  it("a title change on a member makes the batch out of date (same members, other hash)", async () => {
    const a = thesis("a", "2211528001");
    repo.findCurrentBatch.mockResolvedValue(batchOf([a]));
    repo.findCohortTheses.mockResolvedValue([{ ...a, title: "Judul baru" }]);
    const overview = await service.getAssignmentOverview();
    expect(overview.upToDate).toBe(false);
    expect(overview.newCount).toBe(0);
  });
});

describe("issue", () => {
  it("refuses an empty cohort", async () => {
    repo.findCohortTheses.mockResolvedValue([]);
    await expect(service.issueAssignment(null, "kadep")).rejects.toThrow(/Tidak ada mahasiswa/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("an unchanged cohort issues nothing new", async () => {
    const a = thesis("a", "2211528001");
    repo.findCohortTheses.mockResolvedValue([a]);
    repo.findCurrentBatch.mockResolvedValue(batchOf([a]));
    const result = await service.issueAssignment(null, "kadep");
    expect(result.alreadyIssued).toBe(true);
    expect(helper.renderAssignmentPdf).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("a changed cohort makes the next version, supersedes the old one and assigns only the new theses", async () => {
    const a = thesis("a", "2211528001", { supervisorAssignedAt: new Date("2026-09-01"), requestStatus: "assigned" });
    const b = thesis("b", "2211528002");
    repo.findCohortTheses.mockResolvedValue([a, b]);
    repo.findCurrentBatch.mockResolvedValue(batchOf([a]));

    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-1", semester: "ganjil", year: "2026/2027" });
    const result = await service.issueAssignment("ay-1", "kadep");

    expect(result.alreadyIssued).toBe(false);
    expect(result.newlyAssigned).toBe(1);
    expect(tx.thesisSupervisorAssignmentBatch.updateMany).toHaveBeenCalledWith({
      where: { academicYearId: "ay-1", status: "current" },
      data: { status: "superseded" },
    });
    const created = tx.thesisSupervisorAssignmentBatch.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ version: 2, status: "current", generatedByUserId: "kadep", filePath: "uploads/x.pdf" });
    expect(created.members.create).toEqual([{ thesisId: "a" }, { thesisId: "b" }]);
    expect(tx.thesisSupervisorRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["req-a", "req-b"] }, status: { in: ["accepted", "redirected"] } },
      data: { status: "assigned" },
    });
    expect(tx.thesis.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["b"] } }, data: { supervisorAssignedAt: expect.any(Date) } });
    // The issued version is an official document (QR); the previous one of the period is superseded.
    expect(helper.renderAssignmentPdf.mock.calls[0][0].verification).toMatchObject({ qrPng: expect.any(Buffer), url: expect.stringMatching(/\/verify\/document\/[0-9a-f]{64}$/) });
    expect(tx.officialGeneratedDocument.updateMany).toHaveBeenCalledWith({
      where: { documentKind: "supervisor_assignment", sourceId: "ay-1", status: "current" },
      data: { status: "superseded", supersededAt: expect.any(Date) },
    });
    expect(tx.officialGeneratedDocument.create.mock.calls[0][0].data).toMatchObject({ documentKind: "supervisor_assignment", sourceId: "ay-1", version: 2, status: "current", filePath: "uploads/x.pdf" });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["stu-a", "stu-b"],
      expect.objectContaining({ type: "supervisor_assignment_issued", data: expect.objectContaining({ route: "/tugas-akhir/proposal" }) }),
      { push: true },
    );
  });

  it("a preview is rendered without QR and is never recorded as an official document", async () => {
    repo.findCohortTheses.mockResolvedValue([thesis("a", "2211528001")]);
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-1", semester: "ganjil", year: "2026/2027" });
    const { fileName } = await service.previewAssignmentPdf("ay-1");
    expect(fileName).toMatch(/^Pratinjau-/);
    expect(helper.renderAssignmentPdf.mock.calls[0][0]).toMatchObject({ preview: true });
    expect(helper.renderAssignmentPdf.mock.calls[0][0].verification).toBeUndefined();
    expect(tx.officialGeneratedDocument.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("removes the stored PDF when the transaction fails", async () => {
    repo.findCohortTheses.mockResolvedValue([thesis("a", "2211528001")]);
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db down"));
    await expect(service.issueAssignment(null, "kadep")).rejects.toThrow("db down");
    expect(fileHelper.removeFile).toHaveBeenCalledWith("uploads/x.pdf");
  });
});

describe("batch file access", () => {
  it("Sekdep gets only the current batch of a complete period", async () => {
    const a = thesis("a", "2211528001");
    const b = thesis("b", "2211528002");
    repo.findBatchById.mockResolvedValue(batchOf([a]));
    repo.findCurrentBatch.mockResolvedValue(batchOf([a]));
    repo.findCohortTheses.mockResolvedValue([a, b]);
    requestRepo.userHasAnyActiveRole.mockImplementation(async (_id, roles) => roles.includes("Sekretaris Departemen"));
    await expect(service.getBatchFile("batch-1", "sekdep")).rejects.toThrow(/belum diperbarui/);

    requestRepo.userHasAnyActiveRole.mockResolvedValue(false);
    await expect(service.getBatchFile("batch-1", "student")).rejects.toThrow(/tidak memiliki akses/);
  });
});

describe("download of an issued version", () => {
  it("returns the stored official file itself (same bytes, same QR), and refuses a file that no longer matches its hash", async () => {
    const { mkdtemp, writeFile } = await import("fs/promises");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { createHash } = await import("crypto");
    const dir = await mkdtemp(join(tmpdir(), "assignment-"));
    const filePath = join(dir, "v1.pdf");
    const bytes = Buffer.from("%PDF-1.7 issued");
    await writeFile(filePath, bytes);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    requestRepo.userHasAnyActiveRole.mockResolvedValue(true);
    repo.findBatchById.mockResolvedValue({ id: "batch-1", academicYearId: "ay-1", status: "superseded", filePath, fileName: "v1.pdf", mimeType: "application/pdf", fileHash });

    const first = await service.getBatchFile("batch-1", "kadep");
    const second = await service.getBatchFile("batch-1", "kadep");
    expect(first.buffer.equals(bytes) && second.buffer.equals(bytes)).toBe(true);
    expect(helper.renderAssignmentPdf).not.toHaveBeenCalled();

    await writeFile(filePath, Buffer.from("%PDF-1.7 changed"));
    await expect(service.getBatchFile("batch-1", "kadep")).rejects.toThrow(/tidak sesuai dengan versi yang diterbitkan/);
  });
});

describe("assignment reminder job", () => {
  it("reminds the Head of Department once a day per waiting period", async () => {
    prismaMock.thesisSupervisorRequest.groupBy.mockResolvedValue([
      { academicYearId: "ay-1", _count: { _all: 2 } },
      { academicYearId: null, _count: { _all: 1 } },
    ]);
    prismaMock.notification.findFirst.mockResolvedValueOnce(null);
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-1" });
    await expect(runSupervisorAssignmentReminderJob()).resolves.toEqual({ total: 1, reminded: 1, skipped: 0 });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["kadep"],
      expect.objectContaining({ type: "supervisor_assignment_reminder", message: expect.stringMatching(/^2 mahasiswa/) }),
      { push: true },
    );

    prismaMock.notification.findFirst.mockResolvedValueOnce({ id: "n" });
    await expect(runSupervisorAssignmentReminderJob()).resolves.toEqual({ total: 1, reminded: 0, skipped: 1 });
  });
});
