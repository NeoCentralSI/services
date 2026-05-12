import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockExaminerRepo, mockCoreRepo, mockPrisma, mockStatusUtil } = vi.hoisted(() => ({
  mockExaminerRepo: {
    findEligibleExaminers: vi.fn(),
    findActiveExaminersBySeminar: vi.fn(),
    findExaminerById: vi.fn(),
    updateExaminerAvailability: vi.fn(),
    findLatestExaminerBySeminarAndLecturer: vi.fn(),
    saveExaminerAssessment: vi.fn(),
    findActiveExaminersWithAssessments: vi.fn(),
    findSeminarAssessmentCpmks: vi.fn().mockResolvedValue([]),
  },
  mockCoreRepo: {
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    updateSeminar: vi.fn(),
    findUserIdsByRole: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
    findUserIdsByRoleName: vi.fn().mockResolvedValue([]),
  },
  mockPrisma: {
    user: { findUnique: vi.fn() },
    thesis: { findUnique: vi.fn() },
    thesisSeminar: { findMany: vi.fn() },
    lecturer: { findMany: vi.fn(), findUnique: vi.fn() },
    thesisSeminarExaminer: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    userHasRole: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
  },
  mockStatusUtil: { computeEffectiveStatus: vi.fn() },
}));

mockPrisma.$transaction = vi.fn(async (cb) => cb(mockPrisma));
vi.mock("../../../../repositories/thesis-seminar/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../utils/seminarStatus.util.js", () => mockStatusUtil);
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

import { 
  getEligibleExaminers, assignExaminers, respondExaminerAssignment,
  getExaminerAssessment, submitExaminerAssessment, finalizeSeminar, getFinalizationData
} from "../../../../services/thesis-seminar/examiner.service.js";

describe("Thesis Seminar Examiner Service (Full Suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusUtil.computeEffectiveStatus.mockImplementation((s) => s);
    mockPrisma.userHasRole.findMany.mockResolvedValue([]);
    mockExaminerRepo.findSeminarAssessmentCpmks.mockResolvedValue([]);
  });

  describe("Assignment Flow", () => {
    it("returns eligible examiners for a seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", thesisId: "t1" });
      mockExaminerRepo.findEligibleExaminers.mockResolvedValue([{ id: "l1", user: { fullName: "L1" } }]);
      mockPrisma.thesis.findUnique.mockResolvedValue({ studentId: "st1" });
      mockPrisma.thesisSeminar.findMany.mockResolvedValue([]);
      mockPrisma.lecturerAvailability = { findMany: vi.fn().mockResolvedValue([]) };
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([]);
      mockPrisma.thesisDefenceExaminer = { findMany: vi.fn().mockResolvedValue([]) };
      const res = await getEligibleExaminers("s1");
      expect(res).toHaveLength(1);
    });

    it("assigns examiners and notifies them", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", status: "verified", thesis: { student: { id: "u1" } } });
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([]); 
      mockPrisma.lecturer.findMany.mockResolvedValue([{ id: "l1", user: { id: "u1" } }]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", fullName: "S" });
      mockExaminerRepo.findActiveExaminersBySeminar.mockResolvedValue([{ id: "ex1", availabilityStatus: "pending" }]);
      await assignExaminers("s1", ["l1"], "admin1");
      expect(mockPrisma.thesisSeminarExaminer.createMany).toHaveBeenCalled();
    });

    it("handles examiner response to assignment", async () => {
      mockExaminerRepo.findExaminerById.mockResolvedValue({ id: "ex1", lecturerId: "l1", availabilityStatus: "pending" });
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "verified" });
      mockExaminerRepo.findActiveExaminersBySeminar.mockResolvedValue([{ id: "ex1", availabilityStatus: "available" }]);
      const res = await respondExaminerAssignment("s1", "ex1", { status: "available" }, "l1");
      expect(res.availabilityStatus).toBe("available");
    });
  });

  describe("Assessment Management", () => {
    it("returns assessment data for supervisor view", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1" });
      mockStatusUtil.computeEffectiveStatus.mockReturnValue("ongoing");
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ id: "sup1" });
      const res = await getExaminerAssessment("s1", { id: "u1", lecturerId: "l1" });
      expect(res.seminar).toBeDefined();
    });

    it("submits assessment successfully", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", thesis: { student: { user: { id: "u1" } } } });
      mockStatusUtil.computeEffectiveStatus.mockReturnValue("ongoing");
      mockExaminerRepo.findLatestExaminerBySeminarAndLecturer.mockResolvedValue({ id: "ex1", availabilityStatus: "available" });
      mockExaminerRepo.saveExaminerAssessment.mockResolvedValue({ id: "ex1", assessmentScore: 85 });
      const res = await submitExaminerAssessment("s1", { scores: [], revisionNotes: "G", isDraft: false }, "l1");
      expect(res.examinerId).toBe("ex1");
    });
  });

  describe("Finalization Workflow", () => {
    it("returns finalization data for supervisor", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1" });
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ id: "sup1" });
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([]);
      const res = await getFinalizationData("s1", { id: "u1", lecturerId: "l1" });
      expect(res.seminar).toBeDefined();
    });

    it("finalizes seminar with 'passed' result", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", status: "scheduled", thesisId: "t1", thesis: { student: { user: { id: "u1" } } } });
      mockStatusUtil.computeEffectiveStatus.mockReturnValue("ongoing");
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ id: "sup1" });
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
        { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 80 },
        { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 85 }
      ]);
      mockCoreRepo.updateSeminar.mockResolvedValue({ id: "s1", status: "passed" });
      const res = await finalizeSeminar("s1", "sup1", { targetStatus: "passed" });
      expect(res.status).toBe("passed");
    });
  });
});
