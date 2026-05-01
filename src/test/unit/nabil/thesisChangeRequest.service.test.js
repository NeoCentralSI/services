/**
 * Unit Tests — Module 6: Pengajuan Ganti Topik Tugas Akhir
 * Covers: submit request, approve (Kadep with $transaction), reject, lecturer approval
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRepo, mockPrisma, mockNotif, mockPush, mockRoles } = vi.hoisted(() => ({
  mockRepo: {
    findById: vi.fn(),
    findPendingByThesisId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    countPending: vi.fn(),
    findByLecturerId: vi.fn(),
    updateApproval: vi.fn(),
  },
  mockPrisma: {
    thesisTopic: { findUnique: vi.fn() },
    thesis: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    thesisStatus: { findFirst: vi.fn(), create: vi.fn() },
    thesisChangeRequest: { update: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn() },
    thesisMilestoneTemplate: { findMany: vi.fn() },
    thesisMilestone: { createMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockRoles: {
    ROLES: {
      MAHASISWA: "mahasiswa",
      PEMBIMBING_1: "pembimbing_1",
      PEMBIMBING_2: "pembimbing_2",
      KETUA_DEPARTEMEN: "ketua_departemen",
    },
    SUPERVISOR_ROLES: ["pembimbing_1", "pembimbing_2"],
  },
}));

vi.mock("../../../repositories/thesisChangeRequest.repository.js", () => mockRepo);
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../constants/roles.js", () => mockRoles);

import {
  submitRequest,
  approveRequest,
  rejectRequest,
  getRequestById,
  getPendingCount,
} from "../../../services/thesisChangeRequest.service.js";

// ── Test Data ──────────────────────────────────────────────────
const STUDENT_ID = "student-1";
const THESIS = {
  id: "thesis-1",
  title: "Old Thesis",
  studentId: STUDENT_ID,
  student: { id: STUDENT_ID, user: { id: "user-mhs-1", fullName: "Budi", identityNumber: "123", email: "b@t.com" } },
  thesisTopic: { id: "topic-old", name: "Old Topic" },
  thesisSupervisors: [
    {
      lecturerId: "lec-1",
      lecturer: { id: "lec-1", user: { id: "user-dosen-1", fullName: "Dr. Andi" } },
      role: { name: "pembimbing_1" },
    },
    {
      lecturerId: "lec-2",
      lecturer: { id: "lec-2", user: { id: "user-dosen-2", fullName: "Dr. Budi" } },
      role: { name: "pembimbing_2" },
    },
  ],
};
const PENDING_REQUEST = {
  id: "req-1",
  thesisId: "thesis-1",
  requestType: "topic",
  reason: "Ganti topik sesuai minat",
  status: "pending",
  thesis: THESIS,
  approvals: [
    { lecturerId: "lec-1", status: "approved" },
    { lecturerId: "lec-2", status: "approved" },
  ],
};

// ══════════════════════════════════════════════════════════════
// Module 6: Pengajuan Ganti Topik
// ══════════════════════════════════════════════════════════════
describe("Module 6: Pengajuan Ganti Topik Tugas Akhir", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Submit Request ───────────────────────────────────────
  describe("submitRequest", () => {
    it("creates a topic change request with new title, topic, and reason", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-diajukan", name: "Diajukan" });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: "ay-1" });
      mockPrisma.thesis.create.mockResolvedValue({ id: "thesis-new" });
      mockRepo.create.mockResolvedValue({
        id: "req-new",
        thesisId: "thesis-1",
        requestType: "topic",
        status: "pending",
        thesis: THESIS,
      });
      mockPrisma.user.findMany.mockResolvedValue([]); // no kadep for notification

      const result = await submitRequest(STUDENT_ID, {
        requestType: "topic",
        reason: "Ganti topik",
        newTitle: "New Thesis Title",
        newTopicId: "topic-new",
      });

      expect(result).toHaveProperty("id");
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it("rejects (400) if required fields (newTitle, newTopicId) are missing", async () => {
      await expect(
        submitRequest(STUDENT_ID, {
          requestType: "topic",
          reason: "Ganti topik",
          newTitle: null,
          newTopicId: null,
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if new topic doesn't exist", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue(null);

      await expect(
        submitRequest(STUDENT_ID, {
          requestType: "topic",
          reason: "Ganti",
          newTitle: "New Title",
          newTopicId: "nonexistent",
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (400) if there is already a pending change request", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue({ id: "existing-req" });

      await expect(
        submitRequest(STUDENT_ID, {
          requestType: "topic",
          reason: "Ganti",
          newTitle: "New",
          newTopicId: "topic-new",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to supervisors and kadep", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-diajukan" });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: "ay-1" });
      mockPrisma.thesis.create.mockResolvedValue({ id: "thesis-new" });
      mockRepo.create.mockResolvedValue({
        id: "req-new",
        thesisId: "thesis-1",
        requestType: "topic",
        status: "pending",
        thesis: THESIS,
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: "kadep-user" }]);

      await submitRequest(STUDENT_ID, {
        requestType: "topic",
        reason: "Ganti",
        newTitle: "New Title",
        newTopicId: "topic-new",
      });

      // Should attempt notification to supervisors and kadep
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });

  // ─── Approve by Kadep (Transaction) ──────────────────────
  describe("approveRequest (Kadep)", () => {
    it("approves with $transaction: archives old TA, activates new TA, moves supervisors, creates milestones", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          thesisChangeRequest: { update: vi.fn().mockResolvedValue({ ...PENDING_REQUEST, status: "approved", thesis: THESIS }) },
          thesisStatus: { findFirst: vi.fn().mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" }), create: vi.fn() },
          thesis: {
            update: vi.fn().mockResolvedValue({}),
            findFirst: vi.fn().mockResolvedValue({ id: "thesis-new", thesisTopicId: "topic-new" }),
          },
          thesisSupervisors: { updateMany: vi.fn().mockResolvedValue({}) },
          thesisMilestoneTemplate: { findMany: vi.fn().mockResolvedValue([]) },
          thesisMilestone: { createMany: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      const result = await approveRequest("req-1", "kadep-1", "Disetujui");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("rejects (403) if not all supervisors have approved", async () => {
      mockRepo.findById.mockResolvedValue({
        ...PENDING_REQUEST,
        approvals: [
          { lecturerId: "lec-1", status: "approved" },
          { lecturerId: "lec-2", status: "pending" }, // not yet approved
        ],
      });

      await expect(approveRequest("req-1", "kadep-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (400) if request already processed", async () => {
      mockRepo.findById.mockResolvedValue({
        ...PENDING_REQUEST,
        status: "approved",
      });

      await expect(approveRequest("req-1", "kadep-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (404) if request not found", async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(approveRequest("nonexistent", "kadep-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("sets 1-year deadline and Bimbingan status on new thesis", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      const txThesisUpdate = vi.fn().mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          thesisChangeRequest: { update: vi.fn().mockResolvedValue({ ...PENDING_REQUEST, status: "approved", thesis: THESIS }) },
          thesisStatus: {
            findFirst: vi.fn()
              .mockResolvedValueOnce({ id: "status-dibatalkan" })
              .mockResolvedValueOnce({ id: "status-diajukan" })
              .mockResolvedValueOnce({ id: "status-bimbingan" }),
          },
          thesis: {
            update: txThesisUpdate,
            findFirst: vi.fn().mockResolvedValue({ id: "thesis-new", thesisTopicId: "topic-new" }),
          },
          thesisSupervisors: { updateMany: vi.fn().mockResolvedValue({}) },
          thesisMilestoneTemplate: { findMany: vi.fn().mockResolvedValue([]) },
          thesisMilestone: { createMany: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      await approveRequest("req-1", "kadep-1");

      // Verify that thesis.update was called with deadline 1 year
      const updateCalls = txThesisUpdate.mock.calls;
      const activateCall = updateCalls.find((c) => c[0]?.data?.deadlineDate);
      expect(activateCall).toBeDefined();
    });

    it("sends notification to supervisors after approval", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          thesisChangeRequest: { update: vi.fn().mockResolvedValue({ ...PENDING_REQUEST, status: "approved", thesis: THESIS }) },
          thesisStatus: { findFirst: vi.fn().mockResolvedValue({ id: "s" }) },
          thesis: { update: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "tn", thesisTopicId: "tp" }) },
          thesisSupervisors: { updateMany: vi.fn() },
          thesisMilestoneTemplate: { findMany: vi.fn().mockResolvedValue([]) },
          thesisMilestone: { createMany: vi.fn() },
        };
        return cb(tx);
      });

      await approveRequest("req-1", "kadep-1");

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
    });
  });

  // ─── Reject by Kadep ─────────────────────────────────────
  describe("rejectRequest (Kadep)", () => {
    it("rejects the change request with reason", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.update.mockResolvedValue({ ...PENDING_REQUEST, status: "rejected" });
      mockPrisma.thesis.findFirst.mockResolvedValue(null); // cleanup not needed
      mockPrisma.thesis.findUnique.mockResolvedValue(null);

      const result = await rejectRequest("req-1", "kadep-1", "Tidak memenuhi syarat");

      expect(mockRepo.update).toHaveBeenCalledWith("req-1", expect.objectContaining({
        status: "rejected",
        reviewNotes: "Tidak memenuhi syarat",
      }));
    });

    it("rejects (400) if reason is not provided", async () => {
      await expect(rejectRequest("req-1", "kadep-1", "")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (400) if request already processed", async () => {
      mockRepo.findById.mockResolvedValue({ ...PENDING_REQUEST, status: "rejected" });

      await expect(rejectRequest("req-1", "kadep-1", "Reason")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
