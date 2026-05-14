import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockExaminerRepo, mockCoreRepo, mockPrisma, mockStatusUtil } = vi.hoisted(() => ({
  mockExaminerRepo: {
    findEligibleExaminers: vi.fn(),
    findActiveExaminersByDefence: vi.fn(),
    findExaminerById: vi.fn(),
    updateExaminerAvailability: vi.fn(),
    findLatestExaminerByDefenceAndLecturer: vi.fn(),
    saveDefenceExaminerAssessment: vi.fn(),
    findActiveExaminersWithAssessments: vi.fn(),
    findDefenceAssessmentCpmks: vi.fn().mockResolvedValue([]),
  },
  mockCoreRepo: {
    findDefenceById: vi.fn(),
    findDefenceBasicById: vi.fn(),
    updateDefence: vi.fn(),
    updateDefenceStatus: vi.fn(),
    findUserIdsByRole: vi.fn().mockResolvedValue([]),
    findDefenceSupervisorRole: vi.fn(),
    findDefenceSupervisorAssessmentDetails: vi.fn().mockResolvedValue([]),
    saveDefenceSupervisorAssessment: vi.fn(),
    finalizeDefenceResult: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn() },
    thesisSeminar: { findFirst: vi.fn() },
    thesisDefenceExaminer: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    lecturer: { findMany: vi.fn(), findUnique: vi.fn() },
    lecturerAvailability: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSeminarExaminer: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSupervisors: { updateMany: vi.fn() },
  },
  mockStatusUtil: { computeEffectiveDefenceStatus: vi.fn() },
}));

mockPrisma.$transaction = vi.fn(async (cb) => cb(mockPrisma));
vi.mock("../../../../repositories/thesis-defence/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../utils/defenceStatus.util.js", () => mockStatusUtil);
vi.mock("../../../../utils/score.util.js", () => ({ mapScoreToGrade: vi.fn().mockReturnValue("A") }));
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

import {
  getEligibleExaminers,
  assignExaminers,
  respondExaminerAssignment,
  getAssessment,
  submitAssessment,
  finalizeDefence,
  getFinalizationData,
} from "../../../../services/thesis-defence/examiner.service.js";

describe("Thesis Defence Examiner Service (Full Suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusUtil.computeEffectiveDefenceStatus.mockImplementation((s) => s);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([]);
    mockCoreRepo.findDefenceSupervisorAssessmentDetails.mockResolvedValue([]);
    mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValue([]);
  });

  describe("Assignment Flow", () => {
    it("returns eligible examiners — flags previous seminar examiners", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", thesisId: "t1" });
      mockExaminerRepo.findEligibleExaminers.mockResolvedValue([{ id: "l1", user: { fullName: "L1" } }]);
      mockPrisma.thesis.findUnique.mockResolvedValue({ studentId: "st1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue({
        examiners: [{ lecturerId: "l1" }],
      });

      const res = await getEligibleExaminers("d1");
      expect(res).toHaveLength(1);
      expect(res[0].isPreviousExaminer).toBe(true);
    });

    it("assigns examiners and notifies them and the student", async () => {
      mockCoreRepo.findDefenceById.mockResolvedValue({
        id: "d1", status: "verified",
        thesis: { studentId: "st1", student: { user: { fullName: "S" } } },
      });
      mockPrisma.thesisDefenceExaminer.findMany.mockResolvedValue([]);
      mockPrisma.lecturer.findMany.mockResolvedValue([{ id: "l1", user: { id: "u1" } }]);
      mockExaminerRepo.findActiveExaminersByDefence.mockResolvedValue([
        { id: "ex1", availabilityStatus: "pending" },
      ]);

      await assignExaminers("d1", ["l1"], "admin1");
      expect(mockPrisma.thesisDefenceExaminer.createMany).toHaveBeenCalled();
    });

    it("handles examiner available response and auto-transitions defence", async () => {
      mockExaminerRepo.findExaminerById.mockResolvedValue({
        id: "ex1", lecturerId: "l1", availabilityStatus: "pending", thesisDefenceId: "d1",
      });
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({
        id: "d1", status: "verified", thesisId: "t1",
        thesis: { student: { user: { fullName: "S" } } },
      });
      mockExaminerRepo.findActiveExaminersByDefence.mockResolvedValue([
        { id: "ex1", availabilityStatus: "available" },
      ]);
      mockPrisma.thesis.findUnique.mockResolvedValue({ studentId: "st1", thesisSupervisors: [] });
      mockPrisma.lecturer.findUnique.mockResolvedValue({ user: { fullName: "Penguji A" } });

      const res = await respondExaminerAssignment("d1", "ex1", { status: "available" }, "l1");
      expect(res.availabilityStatus).toBe("available");
      expect(res.defenceTransitioned).toBe(true);
      expect(mockCoreRepo.updateDefenceStatus).toHaveBeenCalledWith("d1", "examiner_assigned");
    });

    it("notifies Kadep when examiner declines", async () => {
      mockExaminerRepo.findExaminerById.mockResolvedValue({
        id: "ex1", lecturerId: "l1", availabilityStatus: "pending", thesisDefenceId: "d1",
      });
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({
        id: "d1", status: "verified", thesisId: "t1",
        thesis: { student: { user: { fullName: "S" } } },
      });
      mockExaminerRepo.findActiveExaminersByDefence.mockResolvedValue([
        { id: "ex1", availabilityStatus: "unavailable" },
        { id: "ex2", availabilityStatus: "pending" },
      ]);
      mockPrisma.thesis.findUnique.mockResolvedValue({ studentId: "st1", thesisSupervisors: [] });
      mockPrisma.lecturer.findUnique.mockResolvedValue({ user: { fullName: "Penguji A" } });
      mockCoreRepo.findUserIdsByRole.mockResolvedValue(["kadep1"]);

      const res = await respondExaminerAssignment("d1", "ex1", { status: "unavailable", unavailableReasons: "Ada acara lain" }, "l1");
      expect(res.availabilityStatus).toBe("unavailable");
      expect(res.defenceTransitioned).toBe(false);
    });
  });

  describe("Assessment Management", () => {
    it("returns assessment form for supervisor", async () => {
      mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", examiners: [] });
      mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
      mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue(null);

      const res = await getAssessment("d1", { id: "u1", lecturerId: "l1", roles: ["pembimbing 1"] });
      expect(res.defence).toBeDefined();
      expect(res.assessorRole).toBe("supervisor");
    });

    it("returns finalization data with computed final score", async () => {
      mockCoreRepo.findDefenceById.mockResolvedValue({
        id: "d1", status: "passed", examiners: [],
        supervisorScore: 20, supervisorAssessmentSubmittedAt: new Date(),
        thesis: { studentId: "st1", student: { user: { fullName: "S", identityNumber: "001" } }, title: "T" },
      });
      mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("passed");
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
        { id: "ex1", lecturerId: "l1", assessmentScore: 60, assessmentSubmittedAt: new Date(), thesisDefenceExaminerAssessmentDetails: [] },
        { id: "ex2", lecturerId: "l2", assessmentScore: 70, assessmentSubmittedAt: new Date(), thesisDefenceExaminerAssessmentDetails: [] },
      ]);

      const res = await getFinalizationData("d1", { id: "u1", lecturerId: "l1" });
      expect(res.defence).toBeDefined();
      expect(res.recommendationUnlocked).toBe(true);
      // examinerAvg = (60+70)/2 = 65, supervisorScore = 20 => computed = 85
      expect(res.defence.computedFinalScore).toBe(85);
    });

    it("finalizes defence with grade mapping", async () => {
      mockCoreRepo.findDefenceById.mockResolvedValue({
        id: "d1", status: "scheduled", thesisId: "t1",
        supervisorScore: 20,
        thesis: { id: "t1", studentId: "st1" },
      });
      mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "membership1", lecturerId: "sup1" });
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
        { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 60 },
        { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 70 },
      ]);
      mockCoreRepo.finalizeDefenceResult.mockResolvedValue({
        id: "d1", status: "passed", examinerAverageScore: 65,
        supervisorScore: 20, finalScore: 85, grade: "A", resultFinalizedAt: new Date(),
      });

      const res = await finalizeDefence("d1", { recommendRevision: false }, "sup1");
      expect(mockCoreRepo.finalizeDefenceResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "passed", finalScore: 85 })
      );
      expect(res.grade).toBe("A");
    });

    it("finalizes defence as failed when score is below 55", async () => {
      mockCoreRepo.findDefenceById.mockResolvedValue({
        id: "d1", status: "scheduled", thesisId: "t1",
        supervisorScore: 10,
        thesis: { id: "t1", studentId: "st1" },
      });
      mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
      mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "membership1", lecturerId: "sup1" });
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
        { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
        { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 24 },
      ]);
      // examinerAvg = (20+24)/2 = 22, supervisorScore = 10 => finalScore = 32 (Failed)
      mockCoreRepo.finalizeDefenceResult.mockResolvedValue({
        id: "d1", status: "failed", examinerAverageScore: 22,
        supervisorScore: 10, finalScore: 32, grade: "E", resultFinalizedAt: new Date(),
      });

      const res = await finalizeDefence("d1", { recommendRevision: false }, "sup1");
      expect(mockCoreRepo.finalizeDefenceResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", finalScore: 32 })
      );
      expect(res.status).toBe("failed");
    });
  });
});
