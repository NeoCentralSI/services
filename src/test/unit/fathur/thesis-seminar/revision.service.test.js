import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRevisionRepo, mockCoreRepo, mockPrisma } = vi.hoisted(() => ({
  mockRevisionRepo: {
    findRevisionsBySeminarId: vi.fn(),
    findRevisionById: vi.fn(),
    createRevision: vi.fn(),
    updateRevision: vi.fn(),
    approveRevision: vi.fn(),
    unapproveRevision: vi.fn(),
    deleteRevision: vi.fn(),
  },
  mockCoreRepo: {
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
    updateSeminar: vi.fn(),
  },
  mockPrisma: {
    userHasRole: { findFirst: vi.fn() },
    lecturer: { findMany: vi.fn() },
    thesisSeminarExaminer: { findMany: vi.fn(), findFirst: vi.fn() },
    thesisSeminarRevision: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../../repositories/thesis-seminar/revision.repository.js", () => mockRevisionRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));

import { 
  getRevisions, 
  initiateRevisionItems,
  updateRevision 
} from "../../../../services/thesis-seminar/revision.service.js";

describe("Thesis Seminar Revision Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRevisions (with lazy-init)", () => {
    it("auto-generates items if seminar is passed_with_revision and items are empty", async () => {
      const seminar = { id: "sem-1", status: "passed_with_revision", thesis: { studentId: "stu-1" } };
      mockCoreRepo.findSeminarById.mockResolvedValue(seminar);
      mockPrisma.userHasRole.findFirst.mockResolvedValue({ id: "role-1" }); // Admin access
      mockRevisionRepo.findRevisionsBySeminarId
        .mockResolvedValueOnce([]) // First call empty
        .mockResolvedValueOnce([{ id: "rev-1", description: "Note 1" }]); // Second call after init

      // Mocking initiateRevisionItems dependencies
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([{ id: "ex-1", revisionNotes: "Note 1" }]);
      mockPrisma.thesisSeminarRevision.findFirst.mockResolvedValue(null);

      const result = await getRevisions("sem-1", { id: "user-1", studentId: "stu-1" });

      expect(mockRevisionRepo.createRevision).toHaveBeenCalled();
      expect(result.revisions).toHaveLength(1);
    });

    it("denies access if user is not authorized", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1", thesis: { studentId: "other-stu" } });
      mockPrisma.userHasRole.findFirst.mockResolvedValue(null);
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue(null);

      await expect(getRevisions("sem-1", { id: "user-1", studentId: "my-stu" }))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("updateRevision (locks and notifications)", () => {
    const revision = { 
      id: "rev-1", 
      studentSubmittedAt: null, 
      revisionAction: "Done fixing the layout", // Added to pass validation
      seminarExaminer: { order: 1, thesisSeminarId: "sem-1", seminar: { revisionFinalizedAt: null, thesis: { studentId: "stu-1", thesisSupervisors: [{ lecturerId: "sup-1", lecturer: { user: { id: "sup-user-id" } } }] } } } 
    };

    it("notifies supervisor when student submits perbaikan", async () => {
      mockRevisionRepo.findRevisionById.mockResolvedValue(revision);
      mockRevisionRepo.updateRevision.mockResolvedValue({ ...revision, studentSubmittedAt: new Date() });

      await updateRevision("sem-1", "rev-1", { action: "submit" }, { studentId: "stu-1" });

      const { createNotificationsForUsers } = await import("../../../../services/notification.service.js");
      expect(createNotificationsForUsers).toHaveBeenCalledWith(["sup-user-id"], expect.objectContaining({
        title: "Pengajuan Perbaikan Revisi"
      }));
    });

    it("blocks updates if already finalized", async () => {
      const finalizedRevision = { 
        ...revision, 
        seminarExaminer: { ...revision.seminarExaminer, seminar: { ...revision.seminarExaminer.seminar, revisionFinalizedAt: new Date() } } 
      };
      mockRevisionRepo.findRevisionById.mockResolvedValue(finalizedRevision);

      await expect(updateRevision("sem-1", "rev-1", { action: "save_action" }, { studentId: "stu-1" }))
        .rejects.toMatchObject({ statusCode: 400, message: /difinalisasi/ });
    });
  });
});
