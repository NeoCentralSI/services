import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRevisionRepo, mockCoreRepo, mockPrisma } = vi.hoisted(() => ({
  mockRevisionRepo: {
    findRevisionsByDefenceId: vi.fn(),
    findRevisionById: vi.fn(),
    findExaminerByIdAndDefence: vi.fn(),
    createRevision: vi.fn(),
    updateRevision: vi.fn(),
    approveRevision: vi.fn(),
    unapproveRevision: vi.fn(),
    deleteRevision: vi.fn(),
  },
  mockCoreRepo: {
    findDefenceBasicById: vi.fn(),
    findDefenceSupervisorRole: vi.fn(),
    updateDefence: vi.fn(),
  },
  mockPrisma: {
    userHasRole: { findFirst: vi.fn() },
    lecturer: { findMany: vi.fn() },
    thesisDefenceExaminer: { findMany: vi.fn() },
    thesisDefenceRevision: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../../repositories/thesis-defence/revision.repository.js", () => mockRevisionRepo);
vi.mock("../../../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));

import {
  getRevisions,
  initiateRevisionItems,
  updateRevision,
  finalizeRevisions,
} from "../../../../services/thesis-defence/revision.service.js";

// ── helpers ────────────────────────────────────────────────────

const makeDefence = (overrides = {}) => ({
  id: "def-1",
  status: "passed_with_revision",
  revisionFinalizedAt: null,
  revisionFinalizedBy: null,
  thesis: {
    studentId: "stu-1",
    student: { user: { id: "user-stu-1", fullName: "Test Student" } },
    thesisSupervisors: [
      { id: "sup-rel-1", lecturerId: "lec-sup-1", lecturer: { user: { id: "user-sup-1", fullName: "Supervisor 1" } } },
    ],
  },
  ...overrides,
});

const makeRevision = (overrides = {}) => ({
  id: "rev-1",
  description: "Perbaiki bab 3",
  revisionAction: "Sudah diperbaiki",
  studentSubmittedAt: null,
  supervisorApprovedAt: null,
  defenceExaminer: { id: "ex-1", thesisDefenceId: "def-1", lecturerId: "lec-1", order: 1 },
  supervisor: null,
  ...overrides,
});

// ── tests ──────────────────────────────────────────────────────

describe("Thesis Defence Revision Service", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getRevisions (lazy-init)", () => {
    it("auto-generates items from examiner notes if none exist", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockPrisma.userHasRole.findFirst.mockResolvedValue({ id: "role-1" });
      mockRevisionRepo.findRevisionsByDefenceId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeRevision()]);
      mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValue([{ id: "ex-1", revisionNotes: "Fix this" }]);
      mockPrisma.thesisDefenceRevision.findFirst.mockResolvedValue(null);
      mockPrisma.lecturer.findMany.mockResolvedValue([]);

      const result = await getRevisions("def-1", { id: "user-1", studentId: "other" });

      expect(mockRevisionRepo.createRevision).toHaveBeenCalled();
      expect(result.revisions).toHaveLength(1);
    });

    it("denies access if user is not authorized", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockPrisma.userHasRole.findFirst.mockResolvedValue(null);
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);

      await expect(getRevisions("def-1", { id: "user-x", studentId: "wrong" }))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    it("rejects when defence status is not passed_with_revision", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence({ status: "passed" }));
      mockPrisma.userHasRole.findFirst.mockResolvedValue(null);
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);

      await expect(getRevisions("def-1", { id: "user-1", studentId: "stu-1" }))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("updateRevision (notifications)", () => {
    it("notifies supervisors when student submits perbaikan", async () => {
      const revision = makeRevision();
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
      mockRevisionRepo.findRevisionById.mockResolvedValue(revision);
      mockRevisionRepo.updateRevision.mockResolvedValue({ ...revision, studentSubmittedAt: new Date() });

      await updateRevision("def-1", "rev-1", { action: "submit" }, { studentId: "stu-1" });

      const { createNotificationsForUsers } = await import("../../../../services/notification.service.js");
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["user-sup-1"],
        expect.objectContaining({ title: "Pengajuan Perbaikan Revisi Sidang" })
      );
    });

    it("notifies student when supervisor approves", async () => {
      const revision = makeRevision({ studentSubmittedAt: new Date() });
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({
        thesis: { thesisSupervisors: [{ id: "sup-id" }] },
      });
      mockRevisionRepo.findRevisionById.mockResolvedValue(revision);
      mockRevisionRepo.approveRevision.mockResolvedValue({ ...revision, supervisorApprovedAt: new Date() });

      await updateRevision("def-1", "rev-1", { action: "approve" }, { lecturerId: "lec-sup-1" });

      const { createNotificationsForUsers } = await import("../../../../services/notification.service.js");
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["user-stu-1"],
        expect.objectContaining({ title: "Revisi Sidang Disetujui" })
      );
    });

    it("blocks updates if revision is already finalized", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence({ revisionFinalizedAt: new Date() }));
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
      mockRevisionRepo.findRevisionById.mockResolvedValue(makeRevision());

      await expect(updateRevision("def-1", "rev-1", { action: "save_action" }, { studentId: "stu-1" }))
        .rejects.toMatchObject({ statusCode: 400, message: /difinalisasi/ });
    });
  });

  describe("finalizeRevisions", () => {
    it("blocks if there are submitted but unapproved items", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({
        thesis: { thesisSupervisors: [{ id: "sup-id" }] },
      });
      mockRevisionRepo.findRevisionsByDefenceId.mockResolvedValue([
        makeRevision({ studentSubmittedAt: new Date(), supervisorApprovedAt: new Date() }),
        makeRevision({ id: "rev-2", studentSubmittedAt: new Date(), supervisorApprovedAt: null }),
      ]);

      await expect(finalizeRevisions("def-1", "lec-sup-1"))
        .rejects.toMatchObject({ statusCode: 400, message: /belum disetujui/ });
    });

    it("allows finalization if all submitted items are approved, and notifies student", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue(makeDefence());
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({
        thesis: { thesisSupervisors: [{ id: "sup-id" }] },
      });
      mockRevisionRepo.findRevisionsByDefenceId.mockResolvedValue([
        makeRevision({ studentSubmittedAt: new Date(), supervisorApprovedAt: new Date() }),
      ]);
      mockCoreRepo.updateDefence.mockResolvedValue({
        id: "def-1",
        revisionFinalizedAt: new Date(),
        revisionFinalizedBy: "sup-id",
      });

      const result = await finalizeRevisions("def-1", "lec-sup-1");
      expect(result.defenceId).toBe("def-1");

      const { createNotificationsForUsers } = await import("../../../../services/notification.service.js");
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["user-stu-1"],
        expect.objectContaining({ title: "Revisi Sidang Selesai" })
      );
    });
  });

  describe("initiateRevisionItems", () => {
    it("creates items from examiner notes, skipping duplicates", async () => {
      mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValue([
        { id: "ex-1", revisionNotes: "Fix A" },
        { id: "ex-2", revisionNotes: "Fix B" },
      ]);
      mockPrisma.thesisDefenceRevision.findFirst
        .mockResolvedValueOnce({ id: "existing" })
        .mockResolvedValueOnce(null);

      await initiateRevisionItems("def-1");

      expect(mockRevisionRepo.createRevision).toHaveBeenCalledTimes(1);
      expect(mockRevisionRepo.createRevision).toHaveBeenCalledWith(
        expect.objectContaining({ defenceExaminerId: "ex-2", description: "Fix B" })
      );
    });

    it("does nothing if no examiners have revision notes", async () => {
      mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValue([]);
      await initiateRevisionItems("def-1");
      expect(mockRevisionRepo.createRevision).not.toHaveBeenCalled();
    });
  });
});