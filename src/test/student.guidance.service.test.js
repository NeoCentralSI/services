/**
 * Unit Tests — Module 2: Request Guidance, Module 3: Guidance Session, Module 7: Riwayat Bimbingan
 * Covers: request, reschedule, cancel, session summary, completed history, export
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockRepo, mockPush, mockNotif, mockCalendar, mockDateUtil, mockGlobalUtil, mockRoles, mockAcademicYear } = vi.hoisted(() => ({
  mockPrisma: {
    thesisGuidance: { delete: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    thesisMilestone: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    document: { create: vi.fn() },
    thesis: { update: vi.fn(), findUnique: vi.fn() },
    thesisDocument: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockRepo: {
    getStudentByUserId: vi.fn(),
    getActiveThesisForStudent: vi.fn(),
    getSupervisorsForThesis: vi.fn(),
    listGuidancesForThesis: vi.fn(),
    getGuidanceByIdForStudent: vi.fn(),
    createGuidance: vi.fn(),
    updateGuidanceRequestedDate: vi.fn(),
    updateGuidanceById: vi.fn(),
    listGuidanceHistoryByStudent: vi.fn(),
    listMilestones: vi.fn(),
    listMilestoneTemplates: vi.fn(),
    createMilestonesDirectly: vi.fn(),
    submitSessionSummary: vi.fn(),
    getCompletedGuidanceHistory: vi.fn(),
    getGuidanceForExport: vi.fn(),
    getGuidancesNeedingSummary: vi.fn(),
    getThesisHistory: vi.fn(),
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockCalendar: { deleteCalendarEvent: vi.fn().mockResolvedValue(undefined) },
  mockDateUtil: { formatDateTimeJakarta: vi.fn().mockReturnValue("01 Jan 2026 10:00 WIB") },
  mockGlobalUtil: { toTitleCaseName: vi.fn((s) => s) },
  mockRoles: {
    ROLES: { MAHASISWA: "mahasiswa", PEMBIMBING_1: "pembimbing_1", PEMBIMBING_2: "pembimbing_2" },
    isSupervisorRole: vi.fn((r) => r === "pembimbing_1" || r === "pembimbing_2"),
    ROLE_CATEGORY: { STUDENT: "student", LECTURER: "lecturer" },
  },
  mockAcademicYear: { getActiveAcademicYear: vi.fn().mockResolvedValue({ id: "ay-1", semester: "Ganjil", year: 2025 }) },
}));

vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../repositories/thesisGuidance/student.guidance.repository.js", () => mockRepo);
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../services/outlook-calendar.service.js", () => mockCalendar);
vi.mock("../utils/date.util.js", () => mockDateUtil);
vi.mock("../utils/global.util.js", () => mockGlobalUtil);
vi.mock("../constants/roles.js", () => mockRoles);
vi.mock("../helpers/academicYear.helper.js", () => mockAcademicYear);

import {
  requestGuidanceService,
  rescheduleGuidanceService,
  cancelGuidanceService,
  submitSessionSummaryService,
  getCompletedGuidanceHistoryService,
  getGuidanceForExportService,
} from "../services/thesisGuidance/student.guidance.service.js";

// ── Test Data ──────────────────────────────────────────────────
const STUDENT = { id: "stu-1", userId: "user-1", user: { fullName: "Budi Santoso", email: "budi@test.com" } };
const THESIS = {
  id: "thesis-1",
  title: "Sistem Monitoring TA",
  startDate: new Date("2025-06-01"),
  thesisStatus: { name: "Bimbingan" },
};
const SUPERVISOR = {
  id: "sup-1",
  lecturerId: "lec-1",
  role: { name: "pembimbing_1" },
  lecturer: { id: "lec-1", userId: "user-dosen-1", user: { id: "user-dosen-1", fullName: "Dr. Andi", fcmToken: "fcm-1" } },
};
const GUIDANCE_REQUESTED = {
  id: "guid-1",
  status: "requested",
  requestedDate: new Date("2026-01-15T10:00:00Z"),
  supervisorId: "lec-1",
  thesisId: "thesis-1",
  thesis: THESIS,
  calendarEventId: "cal-1",
  studentCalendarEventId: "cal-2",
};
const GUIDANCE_ACCEPTED = {
  ...GUIDANCE_REQUESTED,
  id: "guid-2",
  status: "accepted",
  supervisor: { user: { id: "user-dosen-1", fullName: "Dr. Andi" } },
};
const GUIDANCE_COMPLETED = { ...GUIDANCE_REQUESTED, id: "guid-3", status: "completed", completedAt: new Date() };

// ── Helpers ────────────────────────────────────────────────────
function setupStudentAndThesis() {
  mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
  mockRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
  mockRepo.getSupervisorsForThesis.mockResolvedValue([SUPERVISOR]);
}

// ══════════════════════════════════════════════════════════════
// Module 2: Request Guidance
// ══════════════════════════════════════════════════════════════
describe("Module 2: Request Guidance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for prisma.user.findUnique (used for student name in notifications)
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", fullName: "Test Student" });
    // Default prisma mocks used directly by the service
    mockPrisma.thesisGuidance.findFirst.mockResolvedValue(null); // no pending request
    mockPrisma.thesis.findUnique.mockResolvedValue({ id: "thesis-1", thesisStatus: { name: "Bimbingan" } });
    mockPrisma.thesisMilestone.findMany.mockResolvedValue([]); // no milestones by default
  });

  describe("requestGuidanceService", () => {
    it("creates guidance request with status 'requested' and complete input", async () => {
      setupStudentAndThesis();
      mockRepo.listGuidancesForThesis.mockResolvedValue([]); // no pending requests
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]); // no schedule conflict
      mockRepo.createGuidance.mockResolvedValue({
        id: "guid-new",
        status: "requested",
        requestedDate: new Date("2026-01-20T10:00:00Z"),
        approvedDate: null,
        duration: 60,
        supervisorId: "lec-1",
        studentNotes: "Bahas Bab 3",
        supervisorFeedback: null,
      });

      const result = await requestGuidanceService(
        "user-1",
        "2026-01-20T10:00:00Z",
        "Bahas Bab 3",
        null, // no file
        "lec-1",
        { duration: 60 }
      );

      expect(result.guidance).toHaveProperty("id", "guid-new");
      expect(result.guidance).toHaveProperty("status", "requested");
      expect(mockRepo.createGuidance).toHaveBeenCalled();
    });

    it("rejects (400) if there is a schedule conflict at the same time", async () => {
      setupStudentAndThesis();
      mockRepo.listGuidancesForThesis.mockResolvedValue([]); // no pending
      // Simulate schedule conflict via ensureSupervisorAvailability
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([
        {
          id: "guid-existing",
          requestedDate: new Date("2026-01-20T10:00:00Z"),
          approvedDate: new Date("2026-01-20T10:00:00Z"),
          duration: 60,
          thesis: { student: { user: { fullName: "Other Student" } } },
        },
      ]);

      await expect(
        requestGuidanceService("user-1", "2026-01-20T10:00:00Z", "Test", null, "lec-1", { duration: 60 })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (404) if student profile not found", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(null);

      await expect(
        requestGuidanceService("user-unknown", "2026-01-20T10:00:00Z", "Test", null, "lec-1")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (404) if no active thesis found", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(null);

      await expect(
        requestGuidanceService("user-1", "2026-01-20T10:00:00Z", "Test", null, "lec-1")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (400) if there is already a pending guidance request", async () => {
      setupStudentAndThesis();
      mockPrisma.thesisGuidance.findFirst.mockResolvedValue(GUIDANCE_REQUESTED); // pending exists

      await expect(
        requestGuidanceService("user-1", "2026-01-20T10:00:00Z", "Test", null, "lec-1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends push notification and in-app notification to supervisor", async () => {
      setupStudentAndThesis();
      mockRepo.listGuidancesForThesis.mockResolvedValue([]);
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);
      mockRepo.createGuidance.mockResolvedValue({
        id: "guid-new", status: "requested", requestedDate: new Date(),
        approvedDate: null, duration: 60, supervisorId: "lec-1",
        studentNotes: "Test", supervisorFeedback: null,
      });

      await requestGuidanceService("user-1", "2026-01-20T10:00:00Z", "Test", null, "lec-1");

      // Notifications should be attempted (non-fatal)
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
    });
  });

  describe("rescheduleGuidanceService", () => {
    it("reschedules only when status is 'requested'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.getSupervisorsForThesis.mockResolvedValue([SUPERVISOR]);
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);
      mockRepo.updateGuidanceById.mockResolvedValue({
        ...GUIDANCE_REQUESTED,
        requestedDate: new Date("2026-01-25T14:00:00Z"),
      });

      const result = await rescheduleGuidanceService("user-1", "guid-1", "2026-01-25T14:00:00Z", "Ubah jadwal");

      expect(result.guidance).toHaveProperty("id", "guid-1");
      expect(mockRepo.updateGuidanceById).toHaveBeenCalled();
    });

    it("rejects (400) if guidance status is not 'requested'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);

      await expect(
        rescheduleGuidanceService("user-1", "guid-2", "2026-01-25T14:00:00Z", "Notes")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to supervisor after rescheduling", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_REQUESTED);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      mockRepo.getSupervisorsForThesis.mockResolvedValue([SUPERVISOR]);
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);
      mockRepo.updateGuidanceById.mockResolvedValue(GUIDANCE_REQUESTED);

      await rescheduleGuidanceService("user-1", "guid-1", "2026-01-25T14:00:00Z", "Ubah");

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });

  describe("cancelGuidanceService", () => {
    it("deletes guidance when status is 'requested'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_REQUESTED);
      mockPrisma.thesisGuidance.delete.mockResolvedValue({});

      const result = await cancelGuidanceService("user-1", "guid-1", "Berhalangan hadir");

      expect(result).toMatchObject({ success: true });
      expect(mockPrisma.thesisGuidance.delete).toHaveBeenCalledWith({
        where: { id: "guid-1" },
      });
    });

    it("updates guidance status to 'cancelled' with reason when status is 'accepted'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockPrisma.thesisGuidance.update.mockResolvedValue({});

      const result = await cancelGuidanceService("user-1", "guid-2", "Dosen berhalangan");

      expect(result).toMatchObject({ success: true, message: "Bimbingan berhasil dibatalkan" });
      expect(mockPrisma.thesisGuidance.update).toHaveBeenCalledWith({
        where: { id: "guid-2" },
        data: expect.objectContaining({
          status: "cancelled",
          rejectionReason: "Dosen berhalangan"
        })
      });
    });

    it("rejects (400) if student tries to cancel 'accepted' guidance without a reason", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);

      await expect(cancelGuidanceService("user-1", "guid-2", "   ")).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("Alasan pembatalan wajib diisi")
      });
    });

    it("rejects (400) if guidance status is neither 'requested' nor 'accepted' (e.g., 'completed')", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_COMPLETED);

      await expect(cancelGuidanceService("user-1", "guid-3", "reason")).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rejects (404) if guidance not found", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(null);

      await expect(cancelGuidanceService("user-1", "nonexistent", "reason")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("sends cancellation notification to supervisor", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue({
        ...GUIDANCE_REQUESTED,
        supervisor: SUPERVISOR.lecturer,
      });
      mockPrisma.thesisGuidance.delete.mockResolvedValue({});

      await cancelGuidanceService("user-1", "guid-1", "Sakit");

      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Module 3: Guidance Session
// ══════════════════════════════════════════════════════════════
describe("Module 3: Guidance Session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitSessionSummaryService", () => {
    it("submits summary when guidance status is 'accepted'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockRepo.getSupervisorsForThesis.mockResolvedValue([SUPERVISOR]);
      mockRepo.submitSessionSummary.mockResolvedValue({
        id: "guid-2",
        status: "summary_pending",
        sessionSummary: "Discussed chapter 3",
        actionItems: "Revisi bab 3",
        summarySubmittedAt: new Date(),
      });

      const result = await submitSessionSummaryService("user-1", "guid-2", {
        sessionSummary: "Discussed chapter 3",
        actionItems: "Revisi bab 3",
      });

      expect(result.guidance).toHaveProperty("sessionSummary", "Discussed chapter 3");
      expect(mockRepo.submitSessionSummary).toHaveBeenCalledWith("guid-2", {
        sessionSummary: "Discussed chapter 3",
        actionItems: "Revisi bab 3",
      });
    });

    it("rejects (400) if guidance status is not 'accepted'", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_REQUESTED);

      await expect(
        submitSessionSummaryService("user-1", "guid-1", {
          sessionSummary: "Test summary",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if sessionSummary is empty", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);

      await expect(
        submitSessionSummaryService("user-1", "guid-2", {
          sessionSummary: "   ",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("sends notification to supervisor after summary submission", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceByIdForStudent.mockResolvedValue(GUIDANCE_ACCEPTED);
      mockRepo.getSupervisorsForThesis.mockResolvedValue([SUPERVISOR]);
      mockRepo.submitSessionSummary.mockResolvedValue({
        id: "guid-2", status: "summary_pending", sessionSummary: "Test",
        actionItems: null, summarySubmittedAt: new Date(),
      });

      await submitSessionSummaryService("user-1", "guid-2", {
        sessionSummary: "Test summary",
      });

      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Module 7: Riwayat Bimbingan
// ══════════════════════════════════════════════════════════════
describe("Module 7: Riwayat Bimbingan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCompletedGuidanceHistoryService", () => {
    it("returns completed guidance sessions ordered by completedAt desc", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(THESIS);
      // Service uses prisma.thesisGuidance.findMany directly (not the repo)
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([
        {
          id: "guid-3",
          completedAt: new Date("2026-01-10"),
          approvedDate: new Date("2026-01-05"),
          duration: 60,
          studentNotes: "Bab 3",
          sessionSummary: "Summary bab 3",
          actionItems: "Revisi",
          supervisor: { user: { fullName: "Dr. Andi" } },
          milestone: { title: "Milestone 3" },
          thesis: { title: "Sistem Monitoring" },
        },
      ]);

      const result = await getCompletedGuidanceHistoryService("user-1");

      expect(result.guidances).toHaveLength(1);
      expect(result.guidances[0]).toHaveProperty("id", "guid-3");
    });

    it("returns empty array if no active thesis", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getActiveThesisForStudent.mockResolvedValue(null);

      const result = await getCompletedGuidanceHistoryService("user-1");

      expect(result.guidances).toEqual([]);
    });

    it("rejects (404) if student profile not found", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(null);

      await expect(getCompletedGuidanceHistoryService("user-unknown")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("getGuidanceForExportService", () => {
    it("returns guidance data for PDF export", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceForExport.mockResolvedValue({
        id: "guid-3",
        completedAt: new Date("2026-01-10"),
        approvedDate: new Date("2026-01-05"),
        duration: 60,
        studentNotes: "Bab 3",
        sessionSummary: "Summary bab 3",
        actionItems: "Revisi",
        supervisor: { user: { fullName: "Dr. Andi" } },
        milestone: { title: "Milestone 3" },
        thesis: { title: "Sistem Monitoring", student: { user: { fullName: "Budi" } } },
      });

      const result = await getGuidanceForExportService("user-1", "guid-3");

      expect(result.guidance).toHaveProperty("id", "guid-3");
      expect(result.guidance).toHaveProperty("supervisorName");
    });

    it("rejects (404) if guidance not found", async () => {
      mockRepo.getStudentByUserId.mockResolvedValue(STUDENT);
      mockRepo.getGuidanceForExport.mockResolvedValue(null);

      await expect(getGuidanceForExportService("user-1", "nonexistent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
