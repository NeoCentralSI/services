import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────
const {
  mockExaminerRepo,
  mockCoreRepo,
  mockPrisma,
} = vi.hoisted(() => {
  const mockExaminerRepo = {
    findEligibleExaminers: vi.fn(),
    findActiveExaminersBySeminar: vi.fn(),
    findExaminerById: vi.fn(),
    updateExaminerAvailability: vi.fn(),
    findLatestExaminerBySeminarAndLecturer: vi.fn(),
    saveExaminerAssessment: vi.fn(),
    findActiveExaminersWithAssessments: vi.fn(),
    findSeminarAssessmentCpmks: vi.fn(),
  };
  const mockCoreRepo = {
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    updateSeminar: vi.fn(),
    findUserIdsByRole: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
  };
  const mockPrisma = {
    user: { findUnique: vi.fn() },
    thesis: { findUnique: vi.fn() },
    thesisSeminar: { findMany: vi.fn() },
    lecturer: { findMany: vi.fn(), findUnique: vi.fn() },
    thesisSeminarExaminer: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    userHasRole: { findMany: vi.fn() },
  };
  mockPrisma.$transaction = vi.fn(async (cb) => cb(mockPrisma));

  return { mockExaminerRepo, mockCoreRepo, mockPrisma };
});

vi.mock("../../../../repositories/thesis-seminar/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

// Mock dynamic imports for notification services
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));

import { 
  getEligibleExaminers, 
  assignExaminers, 
  respondExaminerAssignment,
  getExaminerAssessment
} from "../../../../services/thesis-seminar/examiner.service.js";

describe("Thesis Seminar Examiner Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEligibleExaminers", () => {
    it("returns list of eligible lecturers with workload info", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", thesisId: "thesis-1" });
      mockExaminerRepo.findEligibleExaminers.mockResolvedValue([
        { id: "lec-1", user: { fullName: "Lec 1", identityNumber: "123" }, scienceGroup: { name: "Group A" } }
      ]);
      mockPrisma.thesis.findUnique.mockResolvedValue({ studentId: "stu-1" });
      mockPrisma.thesisSeminar.findMany.mockResolvedValue([]);
      mockPrisma.lecturerAvailability = { findMany: vi.fn().mockResolvedValue([]) };
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([]);
      mockPrisma.thesisDefenceExaminer = { findMany: vi.fn().mockResolvedValue([]) };

      const result = await getEligibleExaminers("sem-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("fullName", "Lec 1");
      expect(result[0]).toHaveProperty("upcomingCount", 0);
    });
  });

  describe("assignExaminers", () => {
    it("assigns examiners and triggers notifications", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ 
        id: "sem-1", status: "verified", thesis: { student: { id: "stu-1" } } 
      });
      mockPrisma.thesisSeminarExaminer.findMany.mockResolvedValue([]); // currentAssignments
      mockPrisma.lecturer.findMany.mockResolvedValue([{ id: "lec-1", user: { id: "user-lec-1" } }]); // for notifications
      mockPrisma.user.findUnique.mockResolvedValue({ id: "stu-1", fullName: "Student Name" });
      mockExaminerRepo.findActiveExaminersBySeminar.mockResolvedValue([{ id: "ex-1", availabilityStatus: "pending" }]);

      const examinerIds = ["lec-1"];
      await assignExaminers("sem-1", examinerIds, "kadep-1");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.thesisSeminarExaminer.createMany).toHaveBeenCalled();
    });
  });

  describe("respondExaminerAssignment", () => {
    it("updates status and notifies if unavailable", async () => {
      mockExaminerRepo.findExaminerById.mockResolvedValue({ id: "ex-1", thesisSeminarId: "sem-1", lecturerId: "lec-1", availabilityStatus: "pending" });
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "verified", thesis: { student: { id: "stu-1" } } });
      mockExaminerRepo.findActiveExaminersBySeminar.mockResolvedValue([{ id: "ex-1", availabilityStatus: "unavailable" }]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: "stu-1", fullName: "Student Name" });
      mockPrisma.lecturer.findUnique.mockResolvedValue({ id: "lec-1", user: { fullName: "Lecturer Name" } });
      mockCoreRepo.findUserIdsByRole.mockResolvedValue(["kadep-user-id"]);

      const payload = { status: "unavailable", unavailableReasons: "Meeting" };
      const result = await respondExaminerAssignment("sem-1", "ex-1", payload, "lec-1");

      expect(result.availabilityStatus).toBe("unavailable");
      expect(mockExaminerRepo.updateExaminerAvailability).toHaveBeenCalledWith("ex-1", "unavailable", "Meeting");
    });
    });
  });

  describe("getExaminerAssessment", () => {
    const seminar = { 
      id: "sem-1", 
      status: "scheduled", 
      date: new Date(), 
      startTime: new Date(), 
      endTime: new Date(Date.now() + 3600000), // Ends in 1h
      examiners: [{ lecturerId: "lec-1" }] 
    };

    it("allows supervisor to access assessment during ongoing seminar", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue(seminar);
      mockPrisma.userHasRole.findMany.mockResolvedValue([]);
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ id: "sup-rel" });
      mockExaminerRepo.findSeminarAssessmentCpmks.mockResolvedValue([]);
      mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([]);

      const result = await getExaminerAssessment("sem-1", { lecturerId: "sup-1" });

      expect(result).toHaveProperty("seminar");
      expect(result.seminar.status).toBe("ongoing");
    });

    it("denies access for student during ongoing seminar", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue(seminar);
      mockPrisma.userHasRole.findMany.mockResolvedValue([]);
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue(null);

      await expect(getExaminerAssessment("sem-1", { studentId: "stu-1" }))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    it("allows student to access after finalization", async () => {
      const finalizedSeminar = { ...seminar, status: "passed", resultFinalizedAt: new Date(), thesis: { student: { id: "stu-1" } } };
      mockCoreRepo.findSeminarById.mockResolvedValue(finalizedSeminar);
      mockPrisma.userHasRole.findMany.mockResolvedValue([]);
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue(null);
      mockExaminerRepo.findSeminarAssessmentCpmks.mockResolvedValue([]);

      const result = await getExaminerAssessment("sem-1", { studentId: "stu-1" });
      expect(result).toHaveProperty("seminar");
    });
  });
});
