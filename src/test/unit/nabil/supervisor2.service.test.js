/**
 * Unit Tests — Pembimbing 2 (Co-Advisor) Request Service (FR-CHG-02)
 * Covers: requestSupervisor2, cancelRequest, approveRequest, rejectRequest
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockSupervisor2Repo, mockPrisma, mockNotif, mockPush } = vi.hoisted(() => ({
  mockSupervisor2Repo: {
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
  mockPrisma: {
    student: { findUnique: vi.fn() },
    thesis: { findFirst: vi.fn(), findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    thesisParticipant: {
      findMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    user: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    notification: { update: vi.fn().mockResolvedValue({}) },
    lecturerSupervisionQuota: { upsert: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../repositories/thesisGuidance/supervisor2.repository.js", () => mockSupervisor2Repo);
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../services/notification.service.js", () => mockNotif);
vi.mock("../../services/push.service.js", () => mockPush);

import {
  requestSupervisor2,
  cancelRequest,
  approveRequest,
  rejectRequest,
} from "../../services/thesisGuidance/supervisor2.service.js";

const STUDENT_ID = "student-1";
const LECTURER_ID = "lec-1";
const THESIS_WITH_PEMBIMBING1 = {
  id: "thesis-1",
  title: "AI Research",
  studentId: STUDENT_ID,
  thesisSupervisors: [
    { lecturerId: "lec-existing", role: { name: "Pembimbing 1" } },
  ],
};

describe("Pembimbing 2 Request Service (FR-CHG-02)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("requestSupervisor2", () => {
    it("creates request and sends notification to lecturer", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        id: STUDENT_ID,
        user: { fullName: "Budi" },
      });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS_WITH_PEMBIMBING1);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockPrisma.lecturer.findUnique.mockResolvedValue({
        id: LECTURER_ID,
        user: { fullName: "Dr. Andi" },
      });
      mockSupervisor2Repo.createSupervisor2Request.mockResolvedValue({ id: "req-new" });

      const result = await requestSupervisor2(STUDENT_ID, { lecturerId: LECTURER_ID });

      expect(result).toHaveProperty("requestId", "req-new");
      expect(result).toHaveProperty("status", "pending");
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledWith(
        [LECTURER_ID],
        expect.objectContaining({ type: "supervisor2_request" })
      );
    });

    it("rejects (400) if student already has Pembimbing 2", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({ id: STUDENT_ID, user: { fullName: "Budi" } });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS_WITH_PEMBIMBING1);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(true);

      await expect(
        requestSupervisor2(STUDENT_ID, { lecturerId: LECTURER_ID })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if pending request already exists", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({ id: STUDENT_ID, user: { fullName: "Budi" } });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS_WITH_PEMBIMBING1);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue({ id: "existing" });

      await expect(
        requestSupervisor2(STUDENT_ID, { lecturerId: LECTURER_ID })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if student not found", async () => {
      mockPrisma.student.findUnique.mockResolvedValue(null);

      await expect(
        requestSupervisor2(STUDENT_ID, { lecturerId: LECTURER_ID })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (400) if student has no Pembimbing 1", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({ id: STUDENT_ID, user: { fullName: "Budi" } });
      mockPrisma.thesis.findFirst.mockResolvedValue({
        ...THESIS_WITH_PEMBIMBING1,
        thesisSupervisors: [],
      });

      await expect(
        requestSupervisor2(STUDENT_ID, { lecturerId: LECTURER_ID })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("cancelRequest", () => {
    it("cancels pending request", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue({ id: "thesis-1" });
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue({ id: "req-1" });
      mockSupervisor2Repo.markSupervisor2RequestProcessed.mockResolvedValue({});

      const result = await cancelRequest(STUDENT_ID);

      expect(result).toHaveProperty("cancelled", true);
      expect(mockSupervisor2Repo.markSupervisor2RequestProcessed).toHaveBeenCalledWith("req-1");
    });

    it("throws 404 if no pending request", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue({ id: "thesis-1" });
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);

      await expect(cancelRequest(STUDENT_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("approveRequest", () => {
    it("approves request, creates ThesisSupervisors, sends notification", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue({
        id: "req-1",
        message: "thesis-1|student-1",
        status: "pending",
      });
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.createThesisSupervisors.mockResolvedValue({});
      mockSupervisor2Repo.markSupervisor2RequestProcessed.mockResolvedValue({});
      mockPrisma.userRole.findFirst.mockResolvedValue({ id: "role-p2", name: "Pembimbing 2" });
      mockPrisma.thesis.findUnique.mockResolvedValue({ academicYearId: "ay-1" });
      mockPrisma.lecturer.findUnique.mockResolvedValue({
        id: LECTURER_ID,
        user: { fullName: "Dr. Andi" },
      });

      const result = await approveRequest(LECTURER_ID, "req-1");

      expect(result).toHaveProperty("approved", true);
      expect(mockPrisma.thesisParticipant.create).toHaveBeenCalledWith({
        data: {
          thesisId: "thesis-1",
          lecturerId: LECTURER_ID,
          roleId: "role-p2",
        },
      });
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-1"],
        expect.objectContaining({ type: "supervisor2_approved" })
      );
    });

    it("throws 404 if request not found", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue(null);

      await expect(approveRequest(LECTURER_ID, "nonexistent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects (400) if student already has Pembimbing 2", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue({
        id: "req-1",
        message: "thesis-1|student-1",
        status: "pending",
      });
      mockPrisma.userRole.findFirst.mockResolvedValue({ id: "role-p2", name: "Pembimbing 2" });
      mockPrisma.thesis.findUnique.mockResolvedValue({ academicYearId: "ay-1" });
      mockPrisma.thesisParticipant.findFirst.mockResolvedValueOnce({
        id: "existing-p2",
        lecturer: { user: { fullName: "Pembimbing 2 Lama" } },
      });

      await expect(approveRequest(LECTURER_ID, "req-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe("rejectRequest", () => {
    it("rejects request and notifies student", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue({
        id: "req-1",
        message: "thesis-1|student-1",
        status: "pending",
      });
      mockSupervisor2Repo.markSupervisor2RequestProcessed.mockResolvedValue({});

      const result = await rejectRequest(LECTURER_ID, "req-1", "Tidak tersedia");

      expect(result).toHaveProperty("rejected", true);
      expect(mockSupervisor2Repo.markSupervisor2RequestProcessed).toHaveBeenCalledWith("req-1");
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-1"],
        expect.objectContaining({ type: "supervisor2_rejected" })
      );
    });

    it("throws 404 if request not found", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue(null);

      await expect(
        rejectRequest(LECTURER_ID, "nonexistent", "X")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
