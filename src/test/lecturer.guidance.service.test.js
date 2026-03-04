/**
 * Unit Tests — Module 2 (Dosen): Approve/Reject Guidance
 *              Module 3 (Dosen): Approve Session Summary
 *              Module 8: Dashboard Dosen (My Students)
 *              Module 9: Transfer Mahasiswa Bimbingan
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockRepo, mockPush, mockNotif, mockCalendar, mockDateUtil, mockGlobalUtil, mockRoles } = vi.hoisted(() => ({
  mockPrisma: {
    thesisGuidance: { update: vi.fn() },
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    notification: { update: vi.fn() },
    thesis: { findUnique: vi.fn() },
    thesisSupervisors: { update: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  },
  mockRepo: {
    getLecturerByUserId: vi.fn(),
    findMyStudents: vi.fn(),
    findGuidanceRequests: vi.fn(),
    findGuidanceByIdForLecturer: vi.fn(),
    approveGuidanceById: vi.fn(),
    rejectGuidanceById: vi.fn(),
    getLecturerTheses: vi.fn(),
    findPendingGuidanceById: vi.fn(),
    approveSessionSummary: vi.fn(),
    findScheduledGuidances: vi.fn(),
    findEligibleTransferLecturers: vi.fn(),
    findSupervisorRecords: vi.fn(),
    transferSupervisor: vi.fn(),
    updateSupervisorRole: vi.fn(),
    getRoleIdByName: vi.fn(),
    lecturerHasRole: vi.fn(),
    createTransferNotification: vi.fn(),
    findPendingTransferNotifications: vi.fn(),
    findTransferNotificationById: vi.fn(),
    markNotificationRead: vi.fn(),
    createInfoNotification: vi.fn(),
    getThesisStatusMap: vi.fn(),
    updateThesisStatusById: vi.fn(),
    getStudentActiveThesis: vi.fn(),
    countGraduatedAsSupervisor2: vi.fn(),
    countTotalProgressComponents: vi.fn(),
    getValidatedCompletionsByThesis: vi.fn(),
    getAllProgressComponents: vi.fn(),
    getCompletionsForThesis: vi.fn(),
    upsertCompletionsValidated: vi.fn(),
    listGuidanceHistory: vi.fn(),
    findThesisDetailForLecturer: vi.fn(),
    findGuidancesPendingApproval: vi.fn(),
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockCalendar: {
    createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: "ev-1", studentEventId: "ev-2" }),
    deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  },
  mockDateUtil: { formatDateTimeJakarta: vi.fn().mockReturnValue("15 Jan 2026 10:00 WIB") },
  mockGlobalUtil: { toTitleCaseName: vi.fn((s) => s) },
  mockRoles: {
    ROLES: { MAHASISWA: "mahasiswa", PEMBIMBING_1: "pembimbing_1", PEMBIMBING_2: "pembimbing_2" },
    SUPERVISOR_ROLES: ["pembimbing_1", "pembimbing_2"],
    ROLE_CATEGORY: { STUDENT: "student", LECTURER: "lecturer" },
    isSupervisorRole: vi.fn((r) => r === "pembimbing_1" || r === "pembimbing_2"),
  },
}));

vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../repositories/thesisGuidance/lecturer.guidance.repository.js", () => mockRepo);
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../services/outlook-calendar.service.js", () => mockCalendar);
vi.mock("../utils/date.util.js", () => mockDateUtil);
vi.mock("../utils/global.util.js", () => mockGlobalUtil);
vi.mock("../constants/roles.js", () => mockRoles);

import {
  getMyStudentsService,
  rejectGuidanceService,
  approveGuidanceService,
  approveSessionSummaryService,
  requestStudentTransferService,
  approveTransferRequestService,
  rejectTransferRequestService,
  cancelGuidanceByLecturerService,
} from "../services/thesisGuidance/lecturer.guidance.service.js";

// ── Test Data ──────────────────────────────────────────────────
const LECTURER = { id: "lec-1", userId: "user-dosen-1", user: { id: "user-dosen-1", fullName: "Dr. Andi" } };
const GUIDANCE_REQUESTED = {
  id: "guid-1",
  status: "requested",
  requestedDate: new Date("2026-01-15T10:00:00Z"),
  supervisorId: "lec-1",
  thesis: {
    id: "thesis-1",
    student: { user: { id: "user-mhs-1", fullName: "Budi Santoso", fcmToken: "fcm-budi" } },
  },
  supervisor: { user: { id: "user-dosen-1", fullName: "Dr. Andi" } },
};
const GUIDANCE_ACCEPTED = { ...GUIDANCE_REQUESTED, id: "guid-2", status: "accepted" };
const GUIDANCE_SUMMARY_PENDING = {
  ...GUIDANCE_REQUESTED,
  id: "guid-3",
  status: "summary_pending",
  thesis: {
    ...GUIDANCE_REQUESTED.thesis,
    student: { user: { id: "user-mhs-1", fullName: "Budi Santoso" } },
  },
  supervisorCalendarEventId: "ev-sup",
  studentCalendarEventId: "ev-stu",
  thesisId: "thesis-1",
};

const TRANSFER_NOTIFICATION = {
  id: "notif-tx-1",
  userId: "lec-1",
  isRead: false,
  message: JSON.stringify({
    t: "TX",
    src: "lec-source",
    refs: [{ thesisId: "thesis-1", supId: "sup-rec-1" }],
    reason: "Pindah bidang",
  }),
};

// ══════════════════════════════════════════════════════════════
// Module 8: Dashboard Dosen (My Students)
// ══════════════════════════════════════════════════════════════
describe("Module 8: Dashboard Dosen (My Students)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getMyStudentsService", () => {
    it("returns list of supervised students with thesis progress data", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findMyStudents.mockResolvedValue([
        {
          thesisId: "thesis-1",
          thesis: {
            id: "thesis-1",
            title: "Sistem Monitoring",
            thesisStatus: { name: "Bimbingan" },
            thesisRating: "Ongoing",
            student: { userId: "user-mhs-1", user: { fullName: "Budi", email: "budi@test.com", identityNumber: "123" } },
            milestones: [{ status: "completed" }, { status: "in_progress" }],
            guidances: [{ status: "completed" }],
          },
          role: { name: "pembimbing_1" },
        },
      ]);

      const result = await getMyStudentsService("user-dosen-1", ["pembimbing_1"]);

      expect(result.count).toBe(1);
      expect(result.students).toHaveLength(1);
    });

    it("rejects (404) if lecturer profile not found", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(null);

      await expect(getMyStudentsService("user-unknown", [])).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Module 2 (Dosen): Approve/Reject Guidance
// ══════════════════════════════════════════════════════════════
describe("Module 2 (Dosen): Approve/Reject Guidance", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Approve ──────────────────────────────────────────────
  describe("approveGuidanceService", () => {
    it("approves guidance when status is 'requested'", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.approveGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED,
        status: "accepted",
        approvedDate: new Date(),
      });

      const result = await approveGuidanceService("user-dosen-1", "guid-1", { feedback: "OK" });

      expect(result).toHaveProperty("guidance");
      expect(mockRepo.approveGuidanceById).toHaveBeenCalledWith("guid-1", expect.objectContaining({ feedback: "OK" }));
    });

    it("rejects (400) if guidance status is not 'requested' (status guard)", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_ACCEPTED);

      await expect(
        approveGuidanceService("user-dosen-1", "guid-2", { feedback: "OK" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if guidance not found for lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(null);

      await expect(
        approveGuidanceService("user-dosen-1", "nonexistent", {})
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("sends notification to student after approval", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.approveGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED, status: "accepted", approvedDate: new Date(),
      });

      await approveGuidanceService("user-dosen-1", "guid-1", {});

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });

    it("creates calendar event on approval (non-fatal on failure)", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.approveGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED, status: "accepted", approvedDate: new Date(),
        studentNotes: "Bahas bab 3", duration: 60,
      });
      mockCalendar.createGuidanceCalendarEvent.mockRejectedValue(new Error("Calendar API down"));

      // Should NOT throw even if calendar fails
      const result = await approveGuidanceService("user-dosen-1", "guid-1", {});
      expect(result).toHaveProperty("guidance");
    });
  });

  // ─── Reject ──────────────────────────────────────────────
  describe("rejectGuidanceService", () => {
    it("rejects guidance when status is 'requested' with feedback", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.rejectGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED,
        status: "rejected",
        supervisorFeedback: "Jadwal tidak cocok",
      });

      const result = await rejectGuidanceService("user-dosen-1", "guid-1", { feedback: "Jadwal tidak cocok" });

      expect(result).toHaveProperty("guidance");
      expect(mockRepo.rejectGuidanceById).toHaveBeenCalledWith("guid-1", { feedback: "Jadwal tidak cocok" });
    });

    it("rejects (400) if guidance status is not 'requested' (prevents double-reject)", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue({
        ...GUIDANCE_REQUESTED,
        status: "rejected",
      });

      await expect(
        rejectGuidanceService("user-dosen-1", "guid-1", { feedback: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to student after rejection", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.rejectGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED, status: "rejected",
      });

      await rejectGuidanceService("user-dosen-1", "guid-1", { feedback: "Alasan" });

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });

  // ─── Cancel Accepted ──────────────────────────────────────
  describe("cancelGuidanceByLecturerService", () => {
    it("cancels guidance when status is 'accepted' with reason", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockPrisma.thesisGuidance.update.mockResolvedValue({});

      const result = await cancelGuidanceByLecturerService("user-dosen-1", "guid-2", { reason: "Dosen sakit" });

      expect(result).toMatchObject({ success: true, message: "Bimbingan berhasil dibatalkan" });
      expect(mockPrisma.thesisGuidance.update).toHaveBeenCalledWith({
        where: { id: "guid-2" },
        data: expect.objectContaining({
          status: "cancelled",
          rejectionReason: "Dosen sakit"
        })
      });
    });

    it("rejects (400) if guidance status is not 'accepted'", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      // It is requested
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_REQUESTED);

      await expect(
        cancelGuidanceByLecturerService("user-dosen-1", "guid-1", { reason: "tes" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if reason is not provided", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_ACCEPTED);

      await expect(
        cancelGuidanceByLecturerService("user-dosen-1", "guid-2", { reason: "  " })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to student after cancellation", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockPrisma.thesisGuidance.update.mockResolvedValue({});

      await cancelGuidanceByLecturerService("user-dosen-1", "guid-2", { reason: "Sakit" });

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Module 3 (Dosen): Approve Session Summary → completed
// ══════════════════════════════════════════════════════════════
describe("Module 3 (Dosen): Approve Session Summary", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("approveSessionSummaryService", () => {
    it("approves session summary and sets status to 'completed'", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findPendingGuidanceById.mockResolvedValue(GUIDANCE_SUMMARY_PENDING);
      mockRepo.approveSessionSummary.mockResolvedValue({
        id: "guid-3",
        status: "completed",
        completedAt: new Date(),
        thesis: { student: { user: { id: "user-mhs-1" } } },
        supervisor: { user: { id: "user-dosen-1" } },
        supervisorCalendarEventId: "ev-sup",
        studentCalendarEventId: "ev-stu",
        thesisId: "thesis-1",
      });

      const result = await approveSessionSummaryService("user-dosen-1", "guid-3");

      expect(result.guidance).toHaveProperty("status", "completed");
      expect(mockRepo.approveSessionSummary).toHaveBeenCalledWith("guid-3");
    });

    it("rejects (404) if guidance not found or not pending approval", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findPendingGuidanceById.mockResolvedValue(null);

      await expect(
        approveSessionSummaryService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("sends completion notification to student", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findPendingGuidanceById.mockResolvedValue(GUIDANCE_SUMMARY_PENDING);
      mockRepo.approveSessionSummary.mockResolvedValue({
        id: "guid-3", status: "completed", completedAt: new Date(),
        thesis: { student: { user: { id: "user-mhs-1" } } },
        supervisor: { user: { id: "user-dosen-1" } },
        supervisorCalendarEventId: null, studentCalendarEventId: null,
        thesisId: "thesis-1",
      });

      await approveSessionSummaryService("user-dosen-1", "guid-3");

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Module 9: Transfer Mahasiswa Bimbingan
// ══════════════════════════════════════════════════════════════
describe("Module 9: Transfer Mahasiswa Bimbingan", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("requestStudentTransferService", () => {
    it("sends transfer request with reason to target lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findSupervisorRecords.mockResolvedValue([
        { id: "sup-1", thesisId: "thesis-1", thesis: { student: { user: { fullName: "Budi" } } } },
      ]);
      mockRepo.lecturerHasRole.mockResolvedValue(true);
      mockRepo.createTransferNotification.mockResolvedValue({ id: "notif-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockRepo.createInfoNotification.mockResolvedValue({});

      const result = await requestStudentTransferService("user-dosen-1", {
        thesisIds: ["thesis-1"],
        targetLecturerId: "lec-target",
        reason: "Pindah bidang",
      });

      expect(result).toMatchObject({ studentCount: 1 });
      expect(mockRepo.createTransferNotification).toHaveBeenCalled();
    });

    it("rejects (400) if reason is missing", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findSupervisorRecords.mockResolvedValue([]);

      await expect(
        requestStudentTransferService("user-dosen-1", {
          thesisIds: ["thesis-1"],
          targetLecturerId: "lec-target",
          reason: "",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if target is self", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findSupervisorRecords.mockResolvedValue([
        { id: "sup-1", thesisId: "thesis-1", thesis: { student: { user: { fullName: "Budi" } } } },
      ]);
      mockRepo.lecturerHasRole.mockResolvedValue(true);

      await expect(
        requestStudentTransferService("user-dosen-1", {
          thesisIds: ["thesis-1"],
          targetLecturerId: "lec-1", // self
          reason: "Test",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification with [TRANSFER_REQUEST] tag to target lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findSupervisorRecords.mockResolvedValue([
        { id: "sup-1", thesisId: "thesis-1", thesis: { student: { user: { fullName: "Budi" } } } },
      ]);
      mockRepo.lecturerHasRole.mockResolvedValue(true);
      mockRepo.createTransferNotification.mockResolvedValue({ id: "notif-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockRepo.createInfoNotification.mockResolvedValue({});

      await requestStudentTransferService("user-dosen-1", {
        thesisIds: ["thesis-1"],
        targetLecturerId: "lec-target",
        reason: "Pindah bidang",
      });

      expect(mockRepo.createTransferNotification).toHaveBeenCalledWith(
        "lec-target",
        expect.stringContaining("\"t\":\"TX\"")
      );
    });
  });

  describe("approveTransferRequestService", () => {
    it("executes transfer using $transaction and preserves history", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue(TRANSFER_NOTIFICATION);
      mockRepo.getRoleIdByName.mockResolvedValue("role-p1");
      mockRepo.lecturerHasRole.mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockRepo.createInfoNotification.mockResolvedValue({});
      mockPrisma.thesis.findUnique.mockResolvedValue({
        student: { user: { id: "user-mhs-1", fullName: "Budi", fcmToken: "fcm-1" } },
      });
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          thesisSupervisors: {
            update: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue({}),
          },
          notification: { update: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      const result = await approveTransferRequestService("user-dosen-1", "notif-tx-1");

      expect(result).toHaveProperty("message");
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("rejects (400) if transfer request already processed", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue({
        ...TRANSFER_NOTIFICATION,
        isRead: true,
      });

      await expect(
        approveTransferRequestService("user-dosen-1", "notif-tx-1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if transfer request not found", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue(null);

      await expect(
        approveTransferRequestService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("sends notification to student after transfer approval", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue(TRANSFER_NOTIFICATION);
      mockRepo.getRoleIdByName.mockResolvedValue("role-p1");
      mockRepo.lecturerHasRole.mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockRepo.createInfoNotification.mockResolvedValue({});
      mockPrisma.thesis.findUnique.mockResolvedValue({
        student: { user: { id: "user-mhs-1", fullName: "Budi", fcmToken: "fcm-1" } },
      });
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          thesisSupervisors: {
            update: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue({}),
          },
          notification: { update: vi.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      await approveTransferRequestService("user-dosen-1", "notif-tx-1");

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });

  describe("rejectTransferRequestService", () => {
    it("rejects transfer request with reason and notifies source lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue(TRANSFER_NOTIFICATION);
      mockRepo.markNotificationRead.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockRepo.createInfoNotification.mockResolvedValue({});

      const result = await rejectTransferRequestService("user-dosen-1", "notif-tx-1", {
        reason: "Sudah banyak mahasiswa",
      });

      expect(result).toMatchObject({ message: "Transfer request ditolak" });
      expect(mockRepo.markNotificationRead).toHaveBeenCalledWith("notif-tx-1");
    });

    it("rejects (400) if already processed", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findTransferNotificationById.mockResolvedValue({
        ...TRANSFER_NOTIFICATION,
        isRead: true,
      });

      await expect(
        rejectTransferRequestService("user-dosen-1", "notif-tx-1", { reason: "test" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
