/**
 * Unit Tests — Module 2 (Dosen): Approve/Reject Guidance
 *              Module 3 (Dosen): Approve Session Summary
 *              Module 8: Dashboard Dosen (My Students)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockRepo, mockPush, mockNotif, mockCalendar, mockDateUtil, mockGlobalUtil, mockRoles } = vi.hoisted(() => ({
  mockPrisma: {
    thesisGuidance: { update: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    thesisMilestone: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
    notification: { update: vi.fn() },
    thesis: { findUnique: vi.fn(), update: vi.fn() },
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
    // Guidance revival correction: action authority requires an ACTIVE supervisor relation.
    findActiveSupervisorRelation: vi.fn().mockResolvedValue({ id: "ts-active", status: "active", role: { name: "Pembimbing 1" }, thesis: { status: "research" } }),
    approveSessionSummary: vi.fn(),
    findScheduledGuidances: vi.fn(),
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
  mockDateUtil: { formatDateTimeJakarta: vi.fn().mockReturnValue("15 Jan 2026 10:00 WIB"), formatDateTimeWib: vi.fn().mockReturnValue("15 Januari 2026 10.00 WIB") },
  mockGlobalUtil: { toTitleCaseName: vi.fn((s) => s) },
  mockRoles: {
    ROLES: { MAHASISWA: "mahasiswa", PEMBIMBING_1: "pembimbing_1", PEMBIMBING_2: "pembimbing_2" },
    SUPERVISOR_ROLES: ["pembimbing_1", "pembimbing_2"],
    ROLE_CATEGORY: { STUDENT: "student", LECTURER: "lecturer" },
    isSupervisorRole: vi.fn((r) => r === "pembimbing_1" || r === "pembimbing_2"),
  },
}));

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../repositories/thesisGuidance/lecturer.guidance.repository.js", () => mockRepo);
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../services/outlook-calendar.service.js", () => mockCalendar);
vi.mock("../../../utils/date.util.js", () => mockDateUtil);
vi.mock("../../../utils/global.util.js", () => mockGlobalUtil);
vi.mock("../../../constants/roles.js", () => mockRoles);

import {
  getMyStudentsService,
  rejectGuidanceService,
  approveGuidanceService,
  approveSessionSummaryService,
  cancelGuidanceByLecturerService,
  getStudentDetailService,
  getPendingApprovalService,
  approveThesisProposalService,
  sendWarningNotificationService,
  getGuidanceDetailService,
} from "../../../services/thesisGuidance/lecturer.guidance.service.js";

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
            status: "research",
            activityLevel: "active",
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

      const result = await rejectGuidanceService("user-dosen-1", "guid-1", { reason: "Jadwal tidak cocok" });

      expect(result).toHaveProperty("guidance");
      expect(mockRepo.rejectGuidanceById).toHaveBeenCalledWith("guid-1", { reason: "Jadwal tidak cocok", suggestedDate: null });
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
      mockRepo.findGuidanceByIdForLecturer
        .mockResolvedValueOnce(GUIDANCE_ACCEPTED)   // initial fetch
        .mockResolvedValueOnce({ ...GUIDANCE_ACCEPTED, status: "cancelled" }); // fresh re-fetch
      mockPrisma.thesisGuidance.update.mockResolvedValue({});

      const result = await cancelGuidanceByLecturerService("user-dosen-1", "guid-2", { reason: "Dosen sakit" });

      expect(result).toHaveProperty("guidance");
      expect(mockPrisma.thesisGuidance.update).toHaveBeenCalledWith({
        where: { id: "guid-2" },
        data: expect.objectContaining({
          status: "cancelled",
          cancelReason: "Dosen sakit",
          cancelledBy: "lecturer",
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
    it("rejects (403) when the lecturer no longer has an ACTIVE relation with the thesis", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_SUMMARY_PENDING);
      mockRepo.findActiveSupervisorRelation.mockResolvedValueOnce(null);

      await expect(approveSessionSummaryService("user-dosen-1", "guid-3")).rejects.toMatchObject({ statusCode: 403 });
      expect(mockRepo.approveSessionSummary).not.toHaveBeenCalled();
    });

    it("approves session summary and sets status to 'completed'", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_SUMMARY_PENDING);
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

    it("rejects (404) if the guidance is not found for this lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(null);

      await expect(
        approveSessionSummaryService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("sends completion notification to student", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findGuidanceByIdForLecturer.mockResolvedValue(GUIDANCE_SUMMARY_PENDING);
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

// Module 8b: Student Detail (Lecturer View)
// ══════════════════════════════════════════════════════════════
describe("Module 8b: Student Detail (Lecturer View)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getStudentDetailService", () => {
    it("returns thesis detail with milestones and guidance history", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findThesisDetailForLecturer.mockResolvedValue({
        id: "thesis-1", title: "AI Research",
        student: { id: "stu-1", user: { fullName: "Budi", identityNumber: "123", email: "budi@test.com" } },
        status: "research",
        document: null, thesisProposal: null,
        startDate: new Date(),
        thesisMilestones: [{ id: "m1", title: "Bab 1", status: "completed", updatedAt: new Date(), progressPercentage: 100, targetDate: null }],
        studentId: "stu-1",
      });
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]); // no guidance documents
      mockRepo.listGuidanceHistory.mockResolvedValue([]);

      const result = await getStudentDetailService("user-dosen-1", "thesis-1");

      expect(result).toHaveProperty("thesisId", "thesis-1");
      expect(result).toHaveProperty("title", "AI Research");
      expect(result.milestones).toHaveLength(1);
    });

    it("takes the latest report from the latest TA-phase session with a file; no file means null", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findThesisDetailForLecturer.mockResolvedValue({
        id: "thesis-1", title: "AI Research",
        student: { id: "stu-1", user: { fullName: "Budi", identityNumber: "123", email: "budi@test.com" } },
        status: "research",
        // Final proposal of the latest Research Method attempt (K32).
        researchMethodAssessments: [{ id: "rma-2", proposalFileName: "proposal.pdf", proposalFilePath: "uploads/thesis/thesis-1/proposal/rma-2/proposal.pdf" }],
        startDate: new Date(),
        thesisMilestones: [],
        studentId: "stu-1",
      });
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);
      mockPrisma.thesisGuidance.findFirst.mockResolvedValue({
        id: "g-9",
        filePath: "uploads/thesis/thesis-1/guidance/g-9/1700000000000-bab3.pdf",
        fileName: "bab3.pdf",
      });
      mockRepo.listGuidanceHistory.mockResolvedValue([]);

      const result = await getStudentDetailService("user-dosen-1", "thesis-1");

      expect(mockPrisma.thesisGuidance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { thesisId: "thesis-1", phase: "research", filePath: { not: null } },
        }),
      );
      expect(result.document).toEqual({
        id: "g-9",
        fileName: "bab3.pdf",
        url: "/uploads/thesis/thesis-1/guidance/g-9/1700000000000-bab3.pdf",
      });
      expect(result.proposalDocument).toEqual({
        id: "rma-2",
        fileName: "proposal.pdf",
        url: "/uploads/thesis/thesis-1/proposal/rma-2/proposal.pdf",
      });

      mockPrisma.thesisGuidance.findFirst.mockResolvedValue(null);
      const empty = await getStudentDetailService("user-dosen-1", "thesis-1");
      expect(empty.document).toBeNull();
    });

    it("rejects (404) if thesis not found for lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockRepo.findThesisDetailForLecturer.mockResolvedValue(null);

      await expect(
        getStudentDetailService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects (404) if lecturer not found", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(null);

      await expect(
        getStudentDetailService("user-unknown", "thesis-1")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("approveThesisProposalService", () => {
    it("rejects (403) because proposal approval is handled via TA-03 scoring", async () => {
      await expect(
        approveThesisProposalService("user-dosen-1", "thesis-1")
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining("Pengesahan proposal tidak lagi dilakukan oleh dosen pembimbing"),
      });
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Lecturer Warning Notification
// ══════════════════════════════════════════════════════════════
describe("Lecturer Warning Notification", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("sendWarningNotificationService (Lecturer)", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    /** A supervised research thesis with `daysIdle` whole days without any activity. */
    const supervisedThesis = (daysIdle, overrides = {}) => ({
      id: "thesis-1",
      status: "research",
      startDate: new Date(Date.now() - daysIdle * DAY_MS),
      statusChangedAt: null,
      createdAt: new Date(Date.now() - daysIdle * DAY_MS),
      totalLeaveDays: 0,
      leaveStartedAt: null,
      thesisGuidances: [],
      thesisMilestones: [],
      thesisSeminars: [],
      thesisGuidanceEvaluations: [],
      student: { user: { id: "user-mhs-1", fullName: "Budi" } },
      thesisSupervisors: [{ role: { name: "pembimbing_1" } }],
      ...overrides,
    });

    it("sends the Lambat warning to a Lambat thesis via FCM and in-app, whatever the client asks", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(supervisedThesis(90));
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      const result = await sendWarningNotificationService("user-dosen-1", "thesis-1", "at_risk");

      expect(result).toMatchObject({ success: true, warningType: "slow" });
      const [recipients, push] = mockPush.sendFcmToUsers.mock.calls[0];
      expect(recipients).toEqual(["user-mhs-1"]);
      expect(push.title).toBe("⚠️ Peringatan Progress Tugas Akhir");
      expect(push.data.warningType).toBe("slow");
      expect(mockNotif.createNotificationsForUsers.mock.calls[0][1].message).toContain("terdeteksi lambat");
    });

    it("sends the Berisiko warning to a Berisiko thesis", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(supervisedThesis(200));
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      const result = await sendWarningNotificationService("user-dosen-1", "thesis-1", "slow");

      expect(result).toMatchObject({ success: true, warningType: "at_risk" });
      const push = mockPush.sendFcmToUsers.mock.calls[0][1];
      expect(push.title).toBe("🚨 Peringatan Serius: Progress Tugas Akhir");
      expect(push.data.warningType).toBe("at_risk");
      expect(mockNotif.createNotificationsForUsers.mock.calls[0][1].message).toContain("Berisiko");
    });

    it.each([
      ["Lancar", supervisedThesis(10), "Peringatan tidak dikirim: Aktivitas tugas akhir Lancar."],
      ["on leave (BSS)", supervisedThesis(200, { status: "on_leave" }), "Peringatan tidak dikirim: Tugas akhir tidak berstatus Penelitian."],
    ])("sends nothing for a thesis that is %s (400)", async (_label, thesis, message) => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(thesis);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      await expect(
        sendWarningNotificationService("user-dosen-1", "thesis-1", "at_risk")
      ).rejects.toMatchObject({ statusCode: 400, message });

      expect(mockPush.sendFcmToUsers).not.toHaveBeenCalled();
      expect(mockNotif.createNotificationsForUsers).not.toHaveBeenCalled();
    });

    it("keeps the active-supervisor filter on the thesis query", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(supervisedThesis(90));
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      await sendWarningNotificationService("user-dosen-1", "thesis-1");

      const { select } = mockPrisma.thesis.findUnique.mock.calls[0][0];
      expect(select.thesisSupervisors.where).toEqual({ lecturerId: "lec-1", status: "active" });
      expect(select).toMatchObject({ status: true, startDate: true });
    });

    it("rejects (403) if lecturer is not a supervisor of the thesis", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(supervisedThesis(90, { thesisSupervisors: [] })); // empty = not a supervisor

      await expect(
        sendWarningNotificationService("user-dosen-1", "thesis-1")
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("rejects (404) if thesis not found", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesis.findUnique.mockResolvedValue(null);

      await expect(
        sendWarningNotificationService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Guidance Detail (Lecturer)
// ══════════════════════════════════════════════════════════════
describe("Guidance Detail (Lecturer)", () => {
  beforeEach(() => vi.clearAllMocks());


  describe("getGuidanceDetailService", () => {
    it("returns guidance detail with student and thesis info", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesisGuidance.findFirst.mockResolvedValue({
        id: "guid-1", status: "accepted",
        requestedDate: new Date(), approvedDate: new Date(),
        duration: 60, studentNotes: "Test",
        supervisorId: "lec-1", supervisorFeedback: null,
        thesis: { id: "thesis-1", title: "AI Research", student: { user: { fullName: "Budi", identityNumber: "123" } }, document: null },
        supervisor: { user: { fullName: "Dr. Andi" } },
        milestones: [],
        sessionSummary: null, actionItems: null, completedAt: null,
        document: null, thesisId: "thesis-1",
      });

      const result = await getGuidanceDetailService("user-dosen-1", "guid-1");

      expect(result.guidance).toHaveProperty("id", "guid-1");
    });

    it("rejects (404) if guidance not found for lecturer", async () => {
      mockRepo.getLecturerByUserId.mockResolvedValue(LECTURER);
      mockPrisma.thesisGuidance.findFirst.mockResolvedValue(null);

      await expect(
        getGuidanceDetailService("user-dosen-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});



