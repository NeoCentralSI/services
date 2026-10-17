/**
 * Lanjutan Paket E7: once the seminar revision is finalized, its items cannot be edited,
 * submitted, approved, or added to; the supervisor undoes the finalization first. The revision
 * lookup now carries the finalization, so the guard in updateRevision applies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { seminarCore, seminarRevisions, mockPrisma } = vi.hoisted(() => ({
  seminarCore: { findSeminarBasicById: vi.fn(), findSeminarSupervisorRole: vi.fn() },
  seminarRevisions: { findRevisionById: vi.fn(), updateRevision: vi.fn(), approveRevision: vi.fn(), unapproveRevision: vi.fn(), createRevision: vi.fn() },
  mockPrisma: { thesisSeminarExaminer: { findFirst: vi.fn() }, thesisSeminarRevision: { findUnique: vi.fn() } },
}));

vi.mock("../../repositories/thesis-seminar/thesis-seminar.repository.js", () => seminarCore);
vi.mock("../../repositories/thesis-seminar/revision.repository.js", () => seminarRevisions);
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn(async () => ({ count: 1 })) }));

const service = await import("../../services/thesis-seminar/revision.service.js");
const realRepo = await vi.importActual("../../repositories/thesis-seminar/revision.repository.js");

const FINALIZED = "Revisi sudah difinalisasi dan tidak dapat diubah.";
const STUDENT = { id: "user-stu", studentId: "stu-1" };
const SUPERVISOR = { id: "user-p1", lecturerId: "lec-p1" };

/** A revision item as `findRevisionById` returns it, with the seminar's finalization. */
const item = (finalizedAt, overrides = {}) => ({
  id: "rev-1", description: "Perbaiki bab pembahasan", revisionAction: null, studentSubmittedAt: null, supervisorApprovedAt: null,
  seminarExaminer: {
    thesisSeminarId: "sem-1", order: 1,
    seminar: {
      id: "sem-1", status: "passed_with_revision",
      revisionFinalizedAt: finalizedAt, revisionFinalizedBy: finalizedAt ? "membership-p1" : null,
      thesis: { studentId: "stu-1", student: { user: { id: "user-stu" } }, thesisSupervisors: [] },
    },
  },
  ...overrides,
});
const seminarRow = (finalizedBy) => ({ id: "sem-1", status: "passed_with_revision", revisionFinalizedBy: finalizedBy, thesis: { studentId: "stu-1" } });

beforeEach(() => {
  vi.clearAllMocks();
  seminarCore.findSeminarSupervisorRole.mockResolvedValue({ id: "membership-p1" });
  seminarRevisions.updateRevision.mockImplementation(async (id, data) => ({ id, ...data }));
  seminarRevisions.approveRevision.mockResolvedValue({ id: "rev-1", supervisorApprovedAt: new Date() });
  seminarRevisions.createRevision.mockImplementation(async (data) => ({ id: "rev-new", ...data }));
  mockPrisma.thesisSeminarExaminer.findFirst.mockResolvedValue({ id: "ex-1" });
});

describe("findRevisionById carries the seminar's finalization", () => {
  it("selects revisionFinalizedAt and revisionFinalizedBy of the seminar", async () => {
    mockPrisma.thesisSeminarRevision.findUnique.mockResolvedValue(null);
    await realRepo.findRevisionById("rev-1");
    const { seminar } = mockPrisma.thesisSeminarRevision.findUnique.mock.calls[0][0].include.seminarExaminer.select;
    expect(seminar.select).toMatchObject({ revisionFinalizedAt: true, revisionFinalizedBy: true });
  });
});

describe("after the finalization", () => {
  const finalizedAt = new Date("2026-10-12T02:00:00.000Z");

  it.each([
    ["ubah (save_action)", STUDENT, { action: "save_action", revisionAction: "Sudah diperbaiki" }, {}],
    ["ajukan (submit)", STUDENT, { action: "submit" }, { revisionAction: "Sudah diperbaiki" }],
    ["setujui (approve)", SUPERVISOR, { action: "approve" }, { revisionAction: "Sudah diperbaiki", studentSubmittedAt: new Date() }],
  ])("%s is refused", async (_label, user, body, overrides) => {
    seminarRevisions.findRevisionById.mockResolvedValue(item(finalizedAt, overrides));
    await expect(service.updateRevision("sem-1", "rev-1", body, user)).rejects.toMatchObject({ message: FINALIZED, statusCode: 400 });
    expect(seminarRevisions.updateRevision).not.toHaveBeenCalled();
    expect(seminarRevisions.approveRevision).not.toHaveBeenCalled();
  });

  it("tambah item is refused with the same reason", async () => {
    seminarCore.findSeminarBasicById.mockResolvedValue(seminarRow("membership-p1"));
    await expect(service.createRevision("sem-1", { seminarExaminerId: "ex-1", description: "Item baru" }, "stu-1")).rejects.toMatchObject({ message: FINALIZED, statusCode: 400 });
    expect(seminarRevisions.createRevision).not.toHaveBeenCalled();
  });
});

describe("before the finalization (or after it is undone)", () => {
  it("ubah is allowed", async () => {
    seminarRevisions.findRevisionById.mockResolvedValue(item(null));
    await expect(service.updateRevision("sem-1", "rev-1", { action: "save_action", revisionAction: "Sudah diperbaiki" }, STUDENT)).resolves.toMatchObject({ id: "rev-1", revisionAction: "Sudah diperbaiki" });
  });

  it("ajukan is allowed", async () => {
    seminarRevisions.findRevisionById.mockResolvedValue(item(null, { revisionAction: "Sudah diperbaiki" }));
    await expect(service.updateRevision("sem-1", "rev-1", { action: "submit" }, STUDENT)).resolves.toMatchObject({ id: "rev-1" });
    expect(seminarRevisions.updateRevision).toHaveBeenCalledWith("rev-1", { studentSubmittedAt: expect.any(Date) });
  });

  it("setujui is allowed", async () => {
    seminarRevisions.findRevisionById.mockResolvedValue(item(null, { revisionAction: "Sudah diperbaiki", studentSubmittedAt: new Date() }));
    await expect(service.updateRevision("sem-1", "rev-1", { action: "approve" }, SUPERVISOR)).resolves.toMatchObject({ id: "rev-1" });
    expect(seminarRevisions.approveRevision).toHaveBeenCalledWith("rev-1", "membership-p1");
  });

  it("tambah item is allowed", async () => {
    seminarCore.findSeminarBasicById.mockResolvedValue(seminarRow(null));
    await expect(service.createRevision("sem-1", { seminarExaminerId: "ex-1", description: "Item baru" }, "stu-1")).resolves.toMatchObject({ id: "rev-new", description: "Item baru" });
  });
});
