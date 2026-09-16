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
    document: { findUnique: vi.fn() },
    thesisTopic: { findUnique: vi.fn() },
    thesis: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    thesisStatus: { findFirst: vi.fn(), create: vi.fn() },
    thesisChangeRequest: { update: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn() },
    thesisMilestoneTemplate: { findMany: vi.fn() },
    thesisMilestone: { createMany: vi.fn(), updateMany: vi.fn() },
    thesisGuidance: { updateMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
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
    supervisorRoleDisplayName: (name) => name,
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
const SUPPORTING_DOC_ID = "550e8400-e29b-41d4-a716-446655440099";
const THESIS = {
  id: "thesis-1",
  title: "Old Thesis",
  studentId: STUDENT_ID,
  rating: "ONGOING",
  student: { id: STUDENT_ID, user: { id: "user-mhs-1", fullName: "Budi", identityNumber: "123", email: "b@t.com" } },
  thesisStatus: { id: "status-bimbingan", name: "Bimbingan" },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.findUnique.mockResolvedValue({
      id: SUPPORTING_DOC_ID,
      userId: STUDENT_ID,
    });
  });

  // ─── Submit Request ───────────────────────────────────────
  describe("submitRequest", () => {
    it("creates a topic change request and persists newTitle, newTopicId, supportingDocumentId", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue({
        id: "req-new",
        thesisId: "thesis-1",
        requestType: "topic",
        status: "pending",
        newTitle: "New Thesis Title",
        newTopicId: "topic-new",
        supportingDocumentId: SUPPORTING_DOC_ID,
        thesis: THESIS,
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await submitRequest(STUDENT_ID, {
        requestType: "topic",
        reason: "Ganti topik",
        supportingDocumentId: SUPPORTING_DOC_ID,
        newTitle: "New Thesis Title",
        newTopicId: "topic-new",
      });

      expect(result).toHaveProperty("id");
      expect(mockPrisma.thesis.create).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        thesisId: "thesis-1",
        requestType: "topic",
        reason: "Ganti topik",
        newTitle: "New Thesis Title",
        newTopicId: "topic-new",
        supportingDocumentId: SUPPORTING_DOC_ID,
      }));
      expect(mockPrisma.thesis.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          student: { id: STUDENT_ID },
        }),
      }));
    });

    it("rejects (404) if new topic doesn't exist", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
      mockPrisma.thesisTopic.findUnique.mockResolvedValue(null);

      await expect(
        submitRequest(STUDENT_ID, {
          requestType: "topic",
          reason: "Ganti",
          supportingDocumentId: SUPPORTING_DOC_ID,
          newTitle: "New Title",
          newTopicId: "nonexistent",
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (404) if supporting document doesn't exist", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.document.findUnique.mockResolvedValue(null);

      await expect(
        submitRequest(STUDENT_ID, {
          requestType: "topic",
          reason: "Ganti",
          supportingDocumentId: SUPPORTING_DOC_ID,
          newTitle: "New Title",
          newTopicId: "topic-new",
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
          supportingDocumentId: SUPPORTING_DOC_ID,
          newTitle: "New",
          newTopicId: "topic-new",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to current supervisors", async () => {
      mockPrisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-new", name: "ML" });
      mockPrisma.thesis.findFirst.mockResolvedValue(THESIS);
      mockRepo.findPendingByThesisId.mockResolvedValue(null);
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
        supportingDocumentId: SUPPORTING_DOC_ID,
        newTitle: "New Title",
        newTopicId: "topic-new",
      });

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledWith(
        ["user-dosen-1", "user-dosen-2"],
        expect.objectContaining({ type: "THESIS_CHANGE_REQUEST" })
      );
    });
  });

  // ─── Approve by Kadep (archive old thesis) ────────────────
  describe("approveRequest (Kadep)", () => {
    it("archives the old thesis as Dibatalkan and soft-deletes guidances/milestones", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.update.mockResolvedValue({ ...PENDING_REQUEST, status: "approved" });
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-dibatalkan", name: "Dibatalkan" });
      mockPrisma.thesis.update.mockResolvedValue({});
      mockPrisma.thesisGuidance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.thesisMilestone.updateMany.mockResolvedValue({ count: 1 });

      const result = await approveRequest("req-1", "kadep-1", "Disetujui");

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.thesis.create).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith("req-1", expect.objectContaining({
        status: "approved",
        reviewedBy: "kadep-1",
        reviewNotes: "Disetujui",
      }));
      expect(mockPrisma.thesis.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "thesis-1" },
        data: expect.objectContaining({
          thesisStatusId: "status-dibatalkan",
          title: "Old Thesis (Dibatalkan)",
        }),
      }));
      expect(mockPrisma.thesisGuidance.updateMany).toHaveBeenCalledWith({
        where: { thesisId: "thesis-1" },
        data: { status: "deleted" },
      });
      expect(mockPrisma.thesisMilestone.updateMany).toHaveBeenCalledWith({
        where: { thesisId: "thesis-1" },
        data: { status: "deleted" },
      });
      expect(result.status).toBe("approved");
    });

    it("rejects (400) if not all supervisors have approved", async () => {
      mockRepo.findById.mockResolvedValue({
        ...PENDING_REQUEST,
        approvals: [
          { lecturerId: "lec-1", status: "approved" },
          { lecturerId: "lec-2", status: "pending" },
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

    it("does not activate a new thesis or move supervisors", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.update.mockResolvedValue({ ...PENDING_REQUEST, status: "approved" });
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-dibatalkan", name: "Dibatalkan" });
      mockPrisma.thesis.update.mockResolvedValue({});
      mockPrisma.thesisGuidance.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.thesisMilestone.updateMany.mockResolvedValue({ count: 0 });

      await approveRequest("req-1", "kadep-1");

      expect(mockPrisma.thesisSupervisors.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.thesis.create).not.toHaveBeenCalled();
      expect(mockPrisma.thesisMilestone.createMany).not.toHaveBeenCalled();
    });

    it("sends notification to student after approval", async () => {
      mockRepo.findById.mockResolvedValue(PENDING_REQUEST);
      mockRepo.update.mockResolvedValue({ ...PENDING_REQUEST, status: "approved", thesis: THESIS });
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-dibatalkan", name: "Dibatalkan" });
      mockPrisma.thesis.update.mockResolvedValue({});
      mockPrisma.thesisGuidance.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.thesisMilestone.updateMany.mockResolvedValue({ count: 0 });

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
