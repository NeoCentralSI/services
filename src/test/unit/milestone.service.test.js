/**
 * Unit Tests — Module 4: Milestone Management
 *              Module 12: Kelola Topik (via getTopics)
 *              Module 13: Kelola Template Milestone
 * Covers: create, bulk create, progress, submitForReview, validate, reorder, seminar readiness
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockMilestoneRepo, mockPrisma, mockRoles, mockPush, mockNotifRepo, mockLecturerRepo } = vi.hoisted(() => ({
  mockMilestoneRepo: {
    findById: vi.fn(),
    findByThesisId: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateProgress: vi.fn(),
    getMaxOrderIndex: vi.fn(),
    reorderMilestones: vi.fn(),
    validateMilestone: vi.fn(),
    findTemplateById: vi.fn(),
    getThesisProgress: vi.fn(),
    getThesisSeminarReadiness: vi.fn(),
    approveSeminarReadiness: vi.fn(),
    // Template functions
    findTemplates: vi.fn(),
    findTemplatesByTopicId: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    reorderTemplates: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn(), update: vi.fn() },
    thesisTopic: { findUnique: vi.fn() },
    thesisGuidance: { count: vi.fn() },
    thesisMilestone: { updateMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  },
  mockRoles: {
    ROLES: { MAHASISWA: "Mahasiswa", PEMBIMBING_1: "Pembimbing 1", PEMBIMBING_2: "Pembimbing 2" },
    isSupervisorRole: vi.fn((r) => {
      const n = String(r || "").trim().toLowerCase();
      return n === "pembimbing 1" || n === "pembimbing 2";
    }),
    isPembimbing1: vi.fn((r) => String(r || "").trim().toLowerCase() === "pembimbing 1"),
    isPembimbing2: vi.fn((r) => String(r || "").trim().toLowerCase() === "pembimbing 2"),
    normalize: vi.fn((r) => String(r || "").trim().toLowerCase()),
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotifRepo: { createNotification: vi.fn().mockResolvedValue({ id: "notif-1" }) },
  mockLecturerRepo: {
    getThesisStatusMap: vi.fn(),
    updateThesisStatusById: vi.fn(),
  },
}));

vi.mock("../../repositories/thesisGuidance/milestone.repository.js", () => mockMilestoneRepo);
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../constants/roles.js", () => mockRoles);
vi.mock("../../services/push.service.js", () => mockPush);
vi.mock("../../repositories/notification.repository.js", () => mockNotifRepo);
vi.mock("../../repositories/thesisGuidance/lecturer.guidance.repository.js", () => mockLecturerRepo);

import {
  createMilestone,
  createMilestoneBySupervisor,
  createMilestonesFromTemplates,
  updateMilestoneProgress,
  submitForReview,
  validateMilestone,
  reorderMilestones,
  getThesisSeminarReadiness,
  approveSeminarReadiness,
} from "../../services/thesisGuidance/milestone.service.js";

// ── Test Data ──────────────────────────────────────────────────
const STUDENT_USER_ID = "user-mhs-1";
const SUPERVISOR_USER_ID = "user-dosen-1";
const THESIS_WITH_STUDENT = {
  id: "thesis-1",
  title: "Sistem Monitoring TA",
  student: { userId: STUDENT_USER_ID, user: { id: STUDENT_USER_ID, fullName: "Budi", fcmToken: "fcm-1" } },
  thesisSupervisors: [
    {
      lecturerId: "lec-1",
      lecturer: {
        userId: SUPERVISOR_USER_ID,
        user: { id: SUPERVISOR_USER_ID, fullName: "Dr. Andi", fcmToken: "fcm-dosen" },
      },
      role: { name: "Pembimbing 1" },
    },
  ],
};
const MILESTONE_NOT_STARTED = {
  id: "ms-1",
  title: "Bab 1 Pendahuluan",
  status: "not_started",
  progressPercentage: 0,
  thesis: THESIS_WITH_STUDENT,
  thesisId: "thesis-1",
  orderIndex: 1,
};
const MILESTONE_IN_PROGRESS = {
  ...MILESTONE_NOT_STARTED,
  id: "ms-2",
  status: "in_progress",
  progressPercentage: 50,
};
const MILESTONE_COMPLETED = {
  ...MILESTONE_NOT_STARTED,
  id: "ms-3",
  status: "completed",
  progressPercentage: 100,
};
const MILESTONE_PENDING_REVIEW = {
  ...MILESTONE_NOT_STARTED,
  id: "ms-4",
  status: "pending_review",
  progressPercentage: 100,
};

// ── Helper to mock thesis access ───────────────────────────────
function mockThesisAccess(userId, isOwner = true) {
  mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
}

function mockMilestoneAccess(milestone) {
  mockMilestoneRepo.findById.mockResolvedValue(milestone);
  mockPrisma.thesis.findUnique.mockResolvedValue(milestone.thesis);
}

// ══════════════════════════════════════════════════════════════
// Module 4: Milestone Management
// ══════════════════════════════════════════════════════════════
describe("Module 4: Milestone Management", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Create custom milestone ─────────────────────────────
  describe("createMilestone (custom)", () => {
    it("creates a new custom milestone for thesis owner", async () => {
      mockThesisAccess(STUDENT_USER_ID);
      mockMilestoneRepo.getMaxOrderIndex.mockResolvedValue(2);
      mockMilestoneRepo.create.mockResolvedValue({
        id: "ms-new",
        title: "Bab Custom",
        status: "not_started",
        progressPercentage: 0,
        orderIndex: 3,
      });

      const result = await createMilestone("thesis-1", STUDENT_USER_ID, {
        title: "Bab Custom",
        description: "Custom milestone",
      });

      expect(result).toHaveProperty("id", "ms-new");
      expect(result).toHaveProperty("status", "not_started");
      expect(mockMilestoneRepo.create).toHaveBeenCalled();
    });

    it("rejects (403) if user is not the thesis owner", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue({
        ...THESIS_WITH_STUDENT,
        student: { userId: "other-user", user: { id: "other-user" } },
      });

      await expect(
        createMilestone("thesis-1", STUDENT_USER_ID, { title: "Test" })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ─── Bulk create from templates ──────────────────────────
  describe("createMilestonesFromTemplates (bulk)", () => {
    it("creates milestones from templates with auto-calculated deadlines", async () => {
      mockThesisAccess(STUDENT_USER_ID);
      mockMilestoneRepo.findByThesisId.mockResolvedValue([]); // no existing
      mockMilestoneRepo.findTemplateById.mockResolvedValue({
        id: "tmpl-1",
        title: "Pendahuluan",
        description: "Bab 1",
        orderIndex: 1,
        topicId: "topic-1",
      });
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-1", name: "Machine Learning" });
      mockPrisma.thesis.update.mockResolvedValue({});
      mockMilestoneRepo.createMany.mockResolvedValue([
        { id: "ms-new-1", title: "Pendahuluan", orderIndex: 1 },
      ]);
      mockMilestoneRepo.findByThesisId
        .mockResolvedValueOnce([]) // no existing check
        .mockResolvedValueOnce([{ id: "ms-new-1", title: "Pendahuluan", orderIndex: 1 }]); // after creation

      const result = await createMilestonesFromTemplates("thesis-1", STUDENT_USER_ID, ["tmpl-1"], "topic-1");

      expect(result.milestones).toHaveLength(1);
    });

    it("rejects (400) if thesis already has milestones", async () => {
      mockThesisAccess(STUDENT_USER_ID);
      mockMilestoneRepo.findByThesisId.mockResolvedValue([MILESTONE_NOT_STARTED]);

      await expect(
        createMilestonesFromTemplates("thesis-1", STUDENT_USER_ID, ["tmpl-1"])
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Update progress ─────────────────────────────────────
  describe("updateMilestoneProgress", () => {
    it("updates progress percentage from 0 to 50 and auto-starts milestone", async () => {
      mockMilestoneAccess(MILESTONE_NOT_STARTED);
      mockMilestoneRepo.updateProgress.mockResolvedValue({
        ...MILESTONE_NOT_STARTED,
        progressPercentage: 50,
        status: "in_progress",
      });
      mockMilestoneRepo.update.mockResolvedValue({
        ...MILESTONE_NOT_STARTED,
        status: "in_progress",
      });

      const result = await updateMilestoneProgress("ms-1", STUDENT_USER_ID, 50);

      expect(result.progressPercentage).toBe(50);
      expect(mockMilestoneRepo.updateProgress).toHaveBeenCalledWith("ms-1", 50);
    });

    it("sends notification to supervisors when progress reaches 100%", async () => {
      // First getMilestoneWithAccess: returns in-progress (50%)
      // Second getMilestoneWithAccess (inside 100% block): returns updated (100%)
      mockMilestoneRepo.findById
        .mockResolvedValueOnce(MILESTONE_IN_PROGRESS)
        .mockResolvedValueOnce({ ...MILESTONE_IN_PROGRESS, progressPercentage: 100 });
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockMilestoneRepo.updateProgress.mockResolvedValue({
        ...MILESTONE_IN_PROGRESS,
        progressPercentage: 100,
        title: "Bab 1 Pendahuluan",
      });

      await updateMilestoneProgress("ms-2", STUDENT_USER_ID, 100);

      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
    });

    it("rejects (400) if milestone is already completed", async () => {
      mockMilestoneAccess(MILESTONE_COMPLETED);

      await expect(
        updateMilestoneProgress("ms-3", STUDENT_USER_ID, 80)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if progress is out of range (negative)", async () => {
      mockMilestoneAccess(MILESTONE_IN_PROGRESS);

      await expect(
        updateMilestoneProgress("ms-2", STUDENT_USER_ID, -10)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (403) if user is not the thesis owner (supervisor can't edit)", async () => {
      mockMilestoneAccess({
        ...MILESTONE_IN_PROGRESS,
        thesis: {
          ...THESIS_WITH_STUDENT,
          student: { userId: "other-user", user: { id: "other-user" } },
        },
      });

      await expect(
        updateMilestoneProgress("ms-2", STUDENT_USER_ID, 80)
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ─── Submit for review ────────────────────────────────────
  describe("submitForReview", () => {
    it("sets milestone status to 'pending_review'", async () => {
      mockMilestoneAccess(MILESTONE_IN_PROGRESS);
      mockMilestoneRepo.update.mockResolvedValue({
        ...MILESTONE_IN_PROGRESS,
        status: "pending_review",
      });

      const result = await submitForReview("ms-2", STUDENT_USER_ID, "Ready to review");

      expect(result.status).toBe("pending_review");
      expect(mockMilestoneRepo.update).toHaveBeenCalledWith("ms-2", expect.objectContaining({
        status: "pending_review",
      }));
    });

    it("sends notification to supervisors for review", async () => {
      mockMilestoneAccess(MILESTONE_IN_PROGRESS);
      mockMilestoneRepo.update.mockResolvedValue({
        ...MILESTONE_IN_PROGRESS,
        status: "pending_review",
      });

      await submitForReview("ms-2", STUDENT_USER_ID);

      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
      expect(mockNotifRepo.createNotification).toHaveBeenCalled();
    });

    it("rejects (400) if milestone is already completed", async () => {
      mockMilestoneAccess(MILESTONE_COMPLETED);

      await expect(
        submitForReview("ms-3", STUDENT_USER_ID)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if milestone is already pending_review", async () => {
      mockMilestoneAccess(MILESTONE_PENDING_REVIEW);

      await expect(
        submitForReview("ms-4", STUDENT_USER_ID)
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Validate milestone (Dosen approve) ───────────────────
  describe("validateMilestone (Dosen approve)", () => {
    it("approves milestone as 'completed' by supervisor", async () => {
      mockMilestoneAccess(MILESTONE_PENDING_REVIEW);
      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockMilestoneRepo.validateMilestone.mockResolvedValue({
        ...MILESTONE_PENDING_REVIEW,
        status: "completed",
        validatedAt: new Date(),
      });

      const result = await validateMilestone("ms-4", SUPERVISOR_USER_ID, "Bagus");

      expect(result.status).toBe("completed");
      expect(mockMilestoneRepo.validateMilestone).toHaveBeenCalledWith("ms-4", SUPERVISOR_USER_ID, "Bagus");
    });

    it("rejects (400) if milestone is already completed", async () => {
      mockMilestoneAccess(MILESTONE_COMPLETED);
      mockRoles.isSupervisorRole.mockReturnValue(true);

      await expect(
        validateMilestone("ms-3", SUPERVISOR_USER_ID, "Done")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (403) if user is not a supervisor", async () => {
      mockMilestoneAccess(MILESTONE_PENDING_REVIEW);
      mockRoles.isSupervisorRole.mockReturnValue(false);

      await expect(
        validateMilestone("ms-4", STUDENT_USER_ID, "Notes")
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("allows Pembimbing 2 to validate milestone review", async () => {
      // Mock thesis with TWO supervisors: one is P1, one is P2 (current user)
      const thesisWithTwoSup = {
        ...THESIS_WITH_STUDENT,
        thesisSupervisors: [
          ...THESIS_WITH_STUDENT.thesisSupervisors,
          {
            lecturerId: "lec-2",
            lecturer: {
              userId: "pembimbing-2-id",
              user: { id: "pembimbing-2-id", fullName: "Dr. Budi", fcmToken: "fcm-2" },
            },
            role: { name: "Pembimbing 2" },
          }
        ]
      };
      mockMilestoneRepo.findById.mockResolvedValue(MILESTONE_PENDING_REVIEW);
      mockPrisma.thesis.findUnique.mockResolvedValue(thesisWithTwoSup);
      mockMilestoneRepo.validateMilestone.mockResolvedValue({
        ...MILESTONE_PENDING_REVIEW,
        status: "completed",
        validatedAt: new Date(),
      });

      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockRoles.isPembimbing1.mockImplementation((r) => r === "Pembimbing 1");
      mockRoles.isPembimbing2.mockImplementation((r) => r === "Pembimbing 2");

      const result = await validateMilestone("ms-4", "pembimbing-2-id", "Notes");

      expect(result.status).toBe("completed");
      expect(mockMilestoneRepo.validateMilestone).toHaveBeenCalledWith("ms-4", "pembimbing-2-id", "Notes");
    });
  });

  // ─── Reorder milestones ───────────────────────────────────
  describe("reorderMilestones", () => {
    it("reorders milestones without duplicate index", async () => {
      mockThesisAccess(STUDENT_USER_ID);
      mockMilestoneRepo.findByThesisId.mockResolvedValue([
        { id: "ms-1", orderIndex: 1 },
        { id: "ms-2", orderIndex: 2 },
      ]);
      mockMilestoneRepo.reorderMilestones.mockResolvedValue({});

      const result = await reorderMilestones("thesis-1", STUDENT_USER_ID, [
        { id: "ms-2", orderIndex: 1 },
        { id: "ms-1", orderIndex: 2 },
      ]);

      expect(result).toMatchObject({ success: true });
    });

    it("rejects (400) if milestone ID doesn't belong to thesis", async () => {
      mockThesisAccess(STUDENT_USER_ID);
      mockMilestoneRepo.findByThesisId.mockResolvedValue([{ id: "ms-1", orderIndex: 1 }]);

      await expect(
        reorderMilestones("thesis-1", STUDENT_USER_ID, [
          { id: "ms-unknown", orderIndex: 1 },
        ])
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Create milestone by supervisor (Dosen generate) ──────
  describe("createMilestoneBySupervisor", () => {
    it("supervisor can generate new milestone for student", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockMilestoneRepo.getMaxOrderIndex.mockResolvedValue(3);
      mockMilestoneRepo.create.mockResolvedValue({
        id: "ms-gen",
        title: "Milestone Tambahan",
        status: "not_started",
        orderIndex: 4,
      });

      const result = await createMilestoneBySupervisor("thesis-1", SUPERVISOR_USER_ID, {
        title: "Milestone Tambahan",
        description: "Dosen created",
      });

      expect(result).toHaveProperty("id", "ms-gen");
    });

    it("rejects (403) if user is not a supervisor", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockRoles.isSupervisorRole.mockReturnValue(false);

      await expect(
        createMilestoneBySupervisor("thesis-1", "random-user", { title: "X" })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ─── Seminar readiness check ──────────────────────────────
  describe("getThesisSeminarReadiness", () => {
    it("returns readiness info with milestone and guidance progress", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockMilestoneRepo.getThesisSeminarReadiness.mockResolvedValue({
        id: "thesis-1",
        title: "Sistem Monitoring TA",
        student: { user: { fullName: "Budi" } },
        thesisSupervisors: THESIS_WITH_STUDENT.thesisSupervisors,
      });
      mockMilestoneRepo.getThesisProgress.mockResolvedValue({
        total: 5,
        completed: 5,
        percentage: 100,
      });
      mockPrisma.thesisGuidance.count.mockResolvedValue(8);

      const result = await getThesisSeminarReadiness("thesis-1", STUDENT_USER_ID);

      expect(result).toHaveProperty("thesisId", "thesis-1");
      expect(result).toHaveProperty("milestoneProgress");
      expect(result).toHaveProperty("guidanceProgress");
    });
  });

  // ─── Seminar approval ─────────────────────────────────────
  describe("approveSeminarReadiness", () => {
    it("rejects (400) if total completed guidances < 8", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockMilestoneRepo.getThesisProgress.mockResolvedValue({ total: 5, completed: 5, isComplete: true });
      mockPrisma.thesisGuidance.count.mockResolvedValue(5); // < 8

      await expect(
        approveSeminarReadiness("thesis-1", SUPERVISOR_USER_ID)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if milestones not 100% complete", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockMilestoneRepo.getThesisProgress.mockResolvedValue({ total: 5, completed: 3, isComplete: false });
      mockPrisma.thesisGuidance.count.mockResolvedValue(10);

      await expect(
        approveSeminarReadiness("thesis-1", SUPERVISOR_USER_ID)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("approves when all requirements met (8+ guidance, 100% milestones)", async () => {
      mockPrisma.thesis.findUnique.mockResolvedValue(THESIS_WITH_STUDENT);
      mockRoles.isSupervisorRole.mockReturnValue(true);
      mockMilestoneRepo.getThesisProgress.mockResolvedValue({ total: 5, completed: 5, isComplete: true });
      mockPrisma.thesisGuidance.count.mockResolvedValue(10);
      mockMilestoneRepo.approveSeminarReadiness.mockResolvedValue({
        id: "thesis-1",
        title: "Sistem Monitoring TA",
        thesisSupervisors: THESIS_WITH_STUDENT.thesisSupervisors.map((s) => ({
          ...s,
          seminarReady: true,
        })),
      });
      mockLecturerRepo.getThesisStatusMap.mockResolvedValue(new Map([["acc seminar", "status-acc"]]));
      mockLecturerRepo.updateThesisStatusById.mockResolvedValue({});
      mockNotifRepo.createNotification.mockResolvedValue({});

      const result = await approveSeminarReadiness("thesis-1", SUPERVISOR_USER_ID);

      expect(result).toHaveProperty("success", true);
    });
  });
});
