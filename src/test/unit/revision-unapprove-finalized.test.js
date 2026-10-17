/**
 * Lanjutan Paket E7: once the revision of a defence or a seminar is finalized, a supervisor can
 * no longer withdraw the approval of one of its items; the finalization is undone first. A
 * finalized defence revision is what makes the thesis Selesai (K28).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { defenceCore, defenceRevisions, seminarCore, seminarRevisions } = vi.hoisted(() => ({
  defenceCore: { findDefenceBasicById: vi.fn(), findDefenceSupervisorRole: vi.fn(), updateDefence: vi.fn() },
  defenceRevisions: { findRevisionById: vi.fn(), unapproveRevision: vi.fn() },
  seminarCore: { findSeminarBasicById: vi.fn(), findSeminarSupervisorRole: vi.fn() },
  seminarRevisions: { findRevisionById: vi.fn(), unapproveRevision: vi.fn() },
}));

vi.mock("../../repositories/thesis-defence/thesis-defence.repository.js", () => defenceCore);
vi.mock("../../repositories/thesis-defence/revision.repository.js", () => defenceRevisions);
vi.mock("../../repositories/thesis-seminar/thesis-seminar.repository.js", () => seminarCore);
vi.mock("../../repositories/thesis-seminar/revision.repository.js", () => seminarRevisions);
vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn(async () => ({ count: 1 })) }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn(async () => ({})) }));

const defence = await import("../../services/thesis-defence/revision.service.js");
const seminar = await import("../../services/thesis-seminar/revision.service.js");

const MESSAGE = "Revisi sudah difinalkan. Batalkan finalisasi lebih dulu.";
const SUPERVISOR = { id: "user-p1", lecturerId: "lec-p1" };
const approvedItem = (link) => ({ id: "rev-1", supervisorApprovedAt: new Date("2026-10-10"), studentSubmittedAt: new Date("2026-10-09"), ...link });

beforeEach(() => {
  vi.clearAllMocks();
  defenceCore.findDefenceSupervisorRole.mockResolvedValue({ id: "membership-p1" });
  seminarCore.findSeminarSupervisorRole.mockResolvedValue({ id: "membership-p1" });
  defenceRevisions.unapproveRevision.mockResolvedValue({ id: "rev-1" });
  seminarRevisions.unapproveRevision.mockResolvedValue({ id: "rev-1" });
});

describe("sidang: membatalkan persetujuan item revisi", () => {
  const defenceRow = (revisionFinalizedAt) => ({
    id: "def-1", thesisId: "t1", status: "passed_with_revision", registeredAt: new Date("2026-09-01"),
    revisionFinalizedAt, revisionFinalizedBy: revisionFinalizedAt ? "membership-p1" : null, thesis: { studentId: "stu-1" },
  });
  beforeEach(() => defenceRevisions.findRevisionById.mockResolvedValue(approvedItem({ defenceExaminer: { thesisDefenceId: "def-1" } })));

  it("is refused after the finalization, with the reason; the approval stays", async () => {
    defenceCore.findDefenceBasicById.mockResolvedValue(defenceRow(new Date("2026-10-12")));
    await expect(defence.updateRevision("def-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).rejects.toMatchObject({ message: MESSAGE, statusCode: 400 });
    expect(defenceRevisions.unapproveRevision).not.toHaveBeenCalled();
    expect(defence.REVISION_FINALIZED_UNAPPROVE_MESSAGE).toBe(MESSAGE);
  });

  it("is allowed before the finalization (and after it is undone)", async () => {
    defenceCore.findDefenceBasicById.mockResolvedValue(defenceRow(null));
    await expect(defence.updateRevision("def-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).resolves.toEqual({ id: "rev-1", supervisorApprovedAt: null });
    expect(defenceRevisions.unapproveRevision).toHaveBeenCalledWith("rev-1");
  });

  it("someone who is not the supervisor still gets 403 first", async () => {
    defenceCore.findDefenceBasicById.mockResolvedValue(defenceRow(new Date("2026-10-12")));
    defenceCore.findDefenceSupervisorRole.mockResolvedValue(null);
    await expect(defence.updateRevision("def-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("seminar hasil: membatalkan persetujuan item revisi", () => {
  beforeEach(() => seminarRevisions.findRevisionById.mockResolvedValue(approvedItem({
    seminarExaminer: { thesisSeminarId: "sem-1", seminar: { id: "sem-1", status: "passed_with_revision", thesis: { studentId: "stu-1" } } },
  })));

  it("is refused after the finalization, with the same reason", async () => {
    seminarCore.findSeminarBasicById.mockResolvedValue({ id: "sem-1", revisionFinalizedBy: "membership-p1" });
    await expect(seminar.updateRevision("sem-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).rejects.toMatchObject({ message: MESSAGE, statusCode: 400 });
    expect(seminarRevisions.unapproveRevision).not.toHaveBeenCalled();
    expect(seminar.REVISION_FINALIZED_UNAPPROVE_MESSAGE).toBe(MESSAGE);
  });

  it("is allowed before the finalization", async () => {
    seminarCore.findSeminarBasicById.mockResolvedValue({ id: "sem-1", revisionFinalizedBy: null });
    await expect(seminar.updateRevision("sem-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).resolves.toEqual({ id: "rev-1", supervisorApprovedAt: null });
  });

  it("someone who is not the supervisor still gets 403 first", async () => {
    seminarCore.findSeminarBasicById.mockResolvedValue({ id: "sem-1", revisionFinalizedBy: "membership-p1" });
    seminarCore.findSeminarSupervisorRole.mockResolvedValue(null);
    await expect(seminar.updateRevision("sem-1", "rev-1", { action: "unapprove" }, SUPERVISOR)).rejects.toMatchObject({ statusCode: 403 });
  });
});
