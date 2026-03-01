/**
 * Unit Tests — Module 21: Auto-Promote Pembimbing 2 → Pembimbing 1
 * Covers: requestSupervisor2, approve/reject, checkAndPromoteSupervisor, threshold logic
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRepo, mockStudentRepo, mockPrisma, mockPush, mockNotif, mockGlobalUtil, mockRoles } = vi.hoisted(() => ({
  mockRepo: {
    findAvailableSupervisor2Lecturers: vi.fn(),
    hasPembimbing2: vi.fn(),
    findPendingSupervisor2Request: vi.fn(),
    createSupervisor2Request: vi.fn(),
    findSupervisor2RequestById: vi.fn(),
    markSupervisor2RequestProcessed: vi.fn(),
    createThesisSupervisors: vi.fn(),
    findPendingSupervisor2RequestsForLecturer: vi.fn(),
    countCompletedAsSupervisor2: vi.fn(),
    hasPembimbing1Role: vi.fn(),
    addPembimbing1Role: vi.fn(),
  },
  mockStudentRepo: {
    getStudentByUserId: vi.fn(),
    getActiveThesisForStudent: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
    ThesisSupervisors: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockGlobalUtil: { toTitleCaseName: vi.fn((s) => s) },
  mockRoles: {
    ROLES: {
      MAHASISWA: "mahasiswa",
      PEMBIMBING_1: "pembimbing_1",
      PEMBIMBING_2: "pembimbing_2",
    },
  },
}));

vi.mock("../repositories/thesisGuidance/supervisor2.repository.js", () => mockRepo);
vi.mock("../repositories/thesisGuidance/student.guidance.repository.js", () => mockStudentRepo);
vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../utils/global.util.js", () => mockGlobalUtil);
vi.mock("../constants/roles.js", () => mockRoles);

import {
  getAvailableSupervisor2Service,
  requestSupervisor2Service,
  approveSupervisor2RequestService,
  rejectSupervisor2RequestService,
  cancelSupervisor2RequestService,
  checkAndPromoteSupervisor,
  checkPromotionForThesisSupervisors,
} from "../services/thesisGuidance/supervisor2.service.js";

// ── Test Data ──────────────────────────────────────────────────
const STUDENT = { id: "student-1", userId: "user-mhs-1" };
const THESIS = { id: "thesis-1", title: "AI Research", studentId: "student-1" };
const REQUEST_MSG = "thesis-1|student-1";
const PENDING_REQUEST = {
  id: "req-1",
  lecturerId: "lec-1",
  message: REQUEST_MSG,
  status: "pending",
};

// ══════════════════════════════════════════════════════════════
describe("Module 21: Auto-Promote & Supervisor 2 Management", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Get Available Supervisor 2 ───────────────────────────
  describe("getAvailableSupervisor2Service", () => {
    it("returns available Pembimbing 2 lecturers", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.hasPembimbing2.mockResolvedValue(false);
      mockRepo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: "lec-2", user: { fullName: "Dr. Andi" } },
      ]);

      const result = await getAvailableSupervisor2Service("user-mhs-1");

      expect(result).toHaveLength(1);
    });

    it("rejects (400) if student already has Pembimbing 2", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.hasPembimbing2.mockResolvedValue(true);

      await expect(getAvailableSupervisor2Service("user-mhs-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── Request Supervisor 2 ────────────────────────────────
  describe("requestSupervisor2Service", () => {
    it("creates request and sends notification to lecturer", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.hasPembimbing2.mockResolvedValue(false);
      mockRepo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockRepo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: "lec-2", userId: "user-lec-2" },
      ]);
      mockRepo.createSupervisor2Request.mockResolvedValue({ id: "req-new" });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-mhs-1", fullName: "Budi" });

      const result = await requestSupervisor2Service("user-mhs-1", { lecturerId: "lec-2" });

      expect(result).toHaveProperty("requestId");
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });

    it("rejects (400) if already has Pembimbing 2", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.hasPembimbing2.mockResolvedValue(true);

      await expect(
        requestSupervisor2Service("user-mhs-1", { lecturerId: "lec-2" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if pending request already exists", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.hasPembimbing2.mockResolvedValue(false);
      mockRepo.findPendingSupervisor2Request.mockResolvedValue({ id: "existing" });

      await expect(
        requestSupervisor2Service("user-mhs-1", { lecturerId: "lec-2" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Cancel Request ──────────────────────────────────────
  describe("cancelSupervisor2RequestService", () => {
    it("cancels pending request", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.findPendingSupervisor2Request.mockResolvedValue({ id: "req-1" });
      mockRepo.markSupervisor2RequestProcessed.mockResolvedValue({});

      const result = await cancelSupervisor2RequestService("user-mhs-1");

      expect(mockRepo.markSupervisor2RequestProcessed).toHaveBeenCalled();
    });

    it("throws 404 if no pending request", async () => {
      mockStudentRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockStudentRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.findPendingSupervisor2Request.mockResolvedValue(null);

      await expect(cancelSupervisor2RequestService("user-mhs-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── Approve Request ─────────────────────────────────────
  describe("approveSupervisor2RequestService", () => {
    it("approves request, creates ThesisSupervisors, sends notification to student", async () => {
      mockRepo.findSupervisor2RequestById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.hasPembimbing2.mockResolvedValue(false);
      mockRepo.markSupervisor2RequestProcessed.mockResolvedValue({});
      mockRepo.createThesisSupervisors.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-lec-1", fullName: "Dr. Andi" });

      const result = await approveSupervisor2RequestService("lec-1", "req-1");

      expect(mockRepo.createThesisSupervisors).toHaveBeenCalled();
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });

    it("throws 404 if request not found", async () => {
      mockRepo.findSupervisor2RequestById.mockResolvedValue(null);

      await expect(
        approveSupervisor2RequestService("lec-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (400) if student already has Pembimbing 2", async () => {
      mockRepo.findSupervisor2RequestById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.hasPembimbing2.mockResolvedValue(true);

      await expect(
        approveSupervisor2RequestService("lec-1", "req-1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Reject Request ──────────────────────────────────────
  describe("rejectSupervisor2RequestService", () => {
    it("rejects request and notifies student", async () => {
      mockRepo.findSupervisor2RequestById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.markSupervisor2RequestProcessed.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-lec-1", fullName: "Dr. Andi" });

      const result = await rejectSupervisor2RequestService("lec-1", "req-1", { reason: "Tidak tersedia" });

      expect(mockRepo.markSupervisor2RequestProcessed).toHaveBeenCalled();
    });

    it("throws 404 if request not found", async () => {
      mockRepo.findSupervisor2RequestById.mockResolvedValue(null);

      await expect(
        rejectSupervisor2RequestService("lec-1", "nonexistent", { reason: "X" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ─── Auto-Promote Logic ──────────────────────────────────
  describe("checkAndPromoteSupervisor", () => {
    it("promotes Pembimbing 2 to Pembimbing 1 when count >= 10", async () => {
      mockRepo.hasPembimbing1Role.mockResolvedValue(false);
      mockRepo.countCompletedAsSupervisor2.mockResolvedValue(12);
      mockRepo.addPembimbing1Role.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-lec", fullName: "Dr. Andi" });

      const result = await checkAndPromoteSupervisor("lec-1");

      expect(result).toHaveProperty("promoted", true);
      expect(mockRepo.addPembimbing1Role).toHaveBeenCalledWith("lec-1");
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });

    it("does not promote if already has Pembimbing 1 role", async () => {
      mockRepo.hasPembimbing1Role.mockResolvedValue(true);

      const result = await checkAndPromoteSupervisor("lec-1");

      expect(result).toHaveProperty("promoted", false);
      expect(result).toHaveProperty("reason", "already_has_role");
      expect(mockRepo.addPembimbing1Role).not.toHaveBeenCalled();
    });

    it("does not promote if count < 10 (below threshold)", async () => {
      mockRepo.hasPembimbing1Role.mockResolvedValue(false);
      mockRepo.countCompletedAsSupervisor2.mockResolvedValue(7);

      const result = await checkAndPromoteSupervisor("lec-1");

      expect(result).toHaveProperty("promoted", false);
      expect(result).toHaveProperty("reason", "below_threshold");
      expect(result).toHaveProperty("count", 7);
      expect(result).toHaveProperty("threshold", 10);
    });

    it("promotes at exactly 10 completed theses", async () => {
      mockRepo.hasPembimbing1Role.mockResolvedValue(false);
      mockRepo.countCompletedAsSupervisor2.mockResolvedValue(10);
      mockRepo.addPembimbing1Role.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-lec", fullName: "Dr. Andi" });

      const result = await checkAndPromoteSupervisor("lec-1");

      expect(result).toHaveProperty("promoted", true);
    });
  });

  // ─── Check Promotion for Thesis Supervisors ──────────────
  describe("checkPromotionForThesisSupervisors", () => {
    it("checks all Pembimbing 2 on a thesis for promotion", async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({ id: "role-p2" });
      mockPrisma.ThesisSupervisors.findMany.mockResolvedValue([
        { lecturerId: "lec-1", role: { name: "Pembimbing 2" } },
      ]);
      mockRepo.hasPembimbing1Role.mockResolvedValue(false);
      mockRepo.countCompletedAsSupervisor2.mockResolvedValue(10);
      mockRepo.addPembimbing1Role.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user-lec", fullName: "Dr. Andi" });

      const results = await checkPromotionForThesisSupervisors("thesis-1");

      expect(results).toBeInstanceOf(Array);
    });
  });
});
