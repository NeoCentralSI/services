/**
 * Unit Tests — Module 11: Monitoring Tugas Akhir
 * Covers: dashboard, thesis list, filter options, at-risk/slow, detail, warning notification, report
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRepo, mockPrisma, mockPush, mockNotif, mockAcademicYear } = vi.hoisted(() => ({
  mockAcademicYear: { getActiveAcademicYearId: vi.fn().mockResolvedValue(null) },
  mockRepo: {
    getThesesOverview: vi.fn(),
    getStatusDistribution: vi.fn(),
    getActivityDistribution: vi.fn(),
    getEvaluationDueStudents: vi.fn().mockResolvedValue([]),
    getProgressStatistics: vi.fn(),
    getAtRiskStudents: vi.fn(),
    getSlowStudents: vi.fn(),
    getStudentsReadyForSeminar: vi.fn(),
    getAllAcademicYears: vi.fn(),
    getAllSupervisors: vi.fn(),
    getThesisDetailById: vi.fn(),
    findLatestThesisReport: vi.fn().mockResolvedValue(null),
    getThesesForReport: vi.fn(),
    getAcademicYearById: vi.fn(),
    getTopicDistribution: vi.fn(),
    getBatchDistribution: vi.fn(),
    getProgressDistribution: vi.fn(),
    getGuidanceTrend: vi.fn(),
    getSupervisorWorkloadRows: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    thesisSupervisors: { findFirst: vi.fn(), count: vi.fn() },
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../../repositories/thesisGuidance/monitoring.repository.js", () => mockRepo);
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../helpers/academicYear.helper.js", () => mockAcademicYear);

import {
  getMonitoringDashboard,
  getThesesList,
  getFilterOptions,
  getAtRiskStudentsFull,
  getSlowStudentsFull,
  getStudentsReadyForSeminarFull,
  getThesisDetail,
  sendWarningNotificationService,
  sendBatchWarningNotificationService,
  getProgressReportService,
} from "../../../services/thesisGuidance/monitoring.service.js";

// ── Test Data ──────────────────────────────────────────────────
const ACADEMIC_YEAR = "2024/2025";
const THESIS_DETAIL = {
  id: "thesis-1",
  title: "AI Research",
  student: { id: "s1", user: { id: "u1", fullName: "Budi" } },
  thesisSupervisors: [],
  thesisMilestones: [],
  thesisGuidances: [],
  thesisSeminars: [],
  thesisDefences: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

/** A thesis as the warning services read it: `daysIdle` whole days without any activity. */
const warningThesis = (id, daysIdle, overrides = {}) => ({
  id,
  status: "research",
  startDate: daysAgo(daysIdle),
  statusChangedAt: null,
  createdAt: daysAgo(daysIdle),
  totalLeaveDays: 0,
  leaveStartedAt: null,
  thesisGuidances: [],
  thesisMilestones: [],
  thesisSeminars: [],
  thesisGuidanceEvaluations: [],
  student: { user: { id: `user-${id}`, fullName: `MAHASISWA ${id.toUpperCase()}` } },
  ...overrides,
});

// ══════════════════════════════════════════════════════════════
describe("Module 11: Monitoring Tugas Akhir", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Dashboard ────────────────────────────────────────────
  describe("getMonitoringDashboard", () => {
    it("returns summary stats, distributions, charts, at-risk and slow students", async () => {
      mockRepo.getProgressStatistics.mockResolvedValue({ total: 100, active: 80 });
      mockRepo.getStatusDistribution.mockResolvedValue([{ status: "Bimbingan", count: 60 }]);
      mockRepo.getActivityDistribution.mockResolvedValue([
        { id: "active", name: "Lancar", value: "active", count: 50 },
        { id: "slow", name: "Lambat", value: "slow", count: 4 },
        { id: "at_risk", name: "Berisiko", value: "at_risk", count: 2 },
      ]);
      mockRepo.getAtRiskStudents.mockResolvedValue([{ id: "s1", name: "At Risk Student" }]);
      mockRepo.getSlowStudents.mockResolvedValue([{ id: "s2", name: "Slow Student" }]);
      mockRepo.getStudentsReadyForSeminar.mockResolvedValue([]);
      mockRepo.getTopicDistribution.mockResolvedValue([{ id: "t1", name: "Machine Learning", count: 10 }]);
      mockRepo.getBatchDistribution.mockResolvedValue([{ id: "2022", name: "Angkatan 2022", count: 15 }]);
      mockRepo.getProgressDistribution.mockResolvedValue([{ label: "0-25%", count: 5 }]);
      mockRepo.getGuidanceTrend.mockResolvedValue([{ month: "2025-01", count: 12 }]);
      mockRepo.getSupervisorWorkloadRows.mockResolvedValue([
        {
          lecturerId: "l1",
          lecturer: {
            user: {
              fullName: "Dr. Andi",
              identityNumber: "19800101",
              email: "andi@test.com",
            },
          },
          role: { name: "Pembimbing 1" },
          thesis: {
            id: "t1",
            title: "AI Research",
            student: {
              user: {
                fullName: "Budi",
                identityNumber: "123",
                email: "budi@test.com",
              },
            },
          },
        },
      ]);

      const result = await getMonitoringDashboard(ACADEMIC_YEAR);

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("statusDistribution");
      expect(result).toHaveProperty("activityDistribution");
      expect(result).not.toHaveProperty("ratingDistribution");
      expect(result.summary).toMatchObject({ totalSlow: 4, totalAtRisk: 2 });
      expect(result).toHaveProperty("topicDistribution");
      expect(result).toHaveProperty("batchDistribution");
      expect(result).toHaveProperty("progressDistribution");
      expect(result).toHaveProperty("guidanceTrend");
      expect(result).toHaveProperty("supervisorLoads");
      expect(result).toHaveProperty("atRiskStudents");
      expect(result).toHaveProperty("slowStudents");
      expect(result).toHaveProperty("readyForSeminar");
      expect(result.supervisorLoads).toEqual([
        {
          lecturerId: "l1",
          lecturerName: "Dr. Andi",
          lecturerNip: "19800101",
          lecturerEmail: "andi@test.com",
          studentCount: 1,
          students: [
            {
              thesisId: "t1",
              thesisTitle: "AI Research",
              role: "Pembimbing 1",
              name: "Budi",
              nim: "123",
              email: "budi@test.com",
            },
          ],
        },
      ]);
      expect(mockRepo.getProgressStatistics).toHaveBeenCalledWith(ACADEMIC_YEAR);
      expect(mockRepo.getBatchDistribution).toHaveBeenCalledWith(ACADEMIC_YEAR);
      expect(mockRepo.getGuidanceTrend).toHaveBeenCalledWith(ACADEMIC_YEAR);
      expect(mockRepo.getSupervisorWorkloadRows).toHaveBeenCalledWith(ACADEMIC_YEAR);
    });
  });

  // ─── Thesis List (Paginated) ──────────────────────────────
  describe("getThesesList", () => {
    it("returns paginated thesis list with filters", async () => {
      mockRepo.getThesesOverview.mockResolvedValue({
        theses: [{ 
          id: "t1", 
          title: "Thesis 1", 
          thesisMilestones: [], 
          thesisSupervisors: [], 
          student: { user: { fullName: "Budi" } }, 
          thesisTopic: { name: "ML" }, 
          status: "research",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      mockRepo.getAllAcademicYears.mockResolvedValue([]);

      const result = await getThesesList({
        status: "Bimbingan",
        page: 1,
        pageSize: 10,
      });

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("pagination");
    });

    it("passes topic filter and includes topic in thesis rows", async () => {
      mockRepo.getThesesOverview.mockResolvedValue({
        theses: [{
          id: "t1",
          title: "Thesis 1",
          thesisMilestones: [],
          thesisSupervisors: [],
          student: { id: "s1", user: { id: "u1", fullName: "Budi", identityNumber: "123", email: "budi@test.com" } },
          thesisTopic: { id: "topic-1", name: "Machine Learning" },
          status: "research",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      mockRepo.getAllAcademicYears.mockResolvedValue([]);

      const result = await getThesesList({
        topicId: "topic-1",
        page: 1,
        pageSize: 10,
      });

      expect(mockRepo.getThesesOverview).toHaveBeenCalledWith(
        expect.objectContaining({ topicId: "topic-1" })
      );
      expect(result.data[0].topic).toEqual({
        id: "topic-1",
        name: "Machine Learning",
      });
    });

    it("labels the start semester by the semester that holds the start, without a 30-day margin", async () => {
      const row = (id, studentId, startDate) => ({
        id,
        title: `Thesis ${id}`,
        thesisMilestones: [],
        thesisSupervisors: [],
        student: { id: studentId, user: { id: studentId, fullName: "Budi", identityNumber: "123" } },
        status: "research",
        startDate: startDate ? new Date(startDate) : null,
        statusChangedAt: null,
        createdAt: new Date("2025-03-03T00:00:00.000Z"),
      });
      mockRepo.getThesesOverview.mockResolvedValue({
        theses: [
          row("t1", "s1", "2026-08-13T00:00:00.000Z"),
          // 20 days before Ganjil starts: still the Genap semester.
          row("t2", "s2", "2026-07-12T00:00:00.000Z"),
          // No start date: the creation date decides.
          row("t3", "s3", null),
          // Before every listed semester.
          row("t4", "s4", "2019-01-01T00:00:00.000Z"),
        ],
        total: 4,
        page: 1,
        pageSize: 10,
      });
      mockRepo.getAllAcademicYears.mockResolvedValue([
        { id: "ay3", name: "Ganjil 2026/2027 ", startDate: new Date("2026-08-01"), endDate: new Date("2027-01-31") },
        { id: "ay2", name: "Genap 2025/2026 ", startDate: new Date("2026-02-01"), endDate: new Date("2026-07-31") },
        { id: "ay1", name: "Genap 2024/2025 ", startDate: new Date("2025-02-01"), endDate: new Date("2025-07-31") },
      ]);

      const result = await getThesesList({ page: 1, pageSize: 10 });

      expect(result.data.map((thesis) => [thesis.id, thesis.startSemester])).toEqual([
        ["t1", "Ganjil 2026/2027"],
        ["t2", "Genap 2025/2026"],
        ["t3", "Genap 2024/2025"],
        ["t4", null],
      ]);
    });
  });

  // ─── Filter Options ───────────────────────────────────────
  describe("getFilterOptions", () => {
    it("returns statuses, supervisors, and academic years", async () => {
      mockRepo.getThesesOverview.mockResolvedValue({ data: [] });
      mockRepo.getStatusDistribution.mockResolvedValue([{ name: "Bimbingan", count: 1 }]);
      mockRepo.getAllSupervisors.mockResolvedValue([{ id: "l1", name: "Dr. Andi" }]);
      mockRepo.getAllAcademicYears.mockResolvedValue([{ id: "ay1", name: "2024/2025" }]);
      mockRepo.getTopicDistribution.mockResolvedValue([{ id: "topic-1", name: "Machine Learning", count: 2 }]);

      const result = await getFilterOptions();

      expect(result).toHaveProperty("supervisors");
      expect(result.topics).toEqual([
        { value: "topic-1", label: "Machine Learning", count: 2 },
      ]);
      expect(result).toHaveProperty("academicYears");
    });

    describe("the running semester", () => {
      const semesters = [
        { id: "ay-old", name: "Genap 2025/2026 ", isActive: true }, // stale stored flag
        { id: "ay-now", name: "Ganjil 2026/2027 ", isActive: false },
      ];

      beforeEach(() => {
        mockRepo.getStatusDistribution.mockResolvedValue([]);
        mockRepo.getAllSupervisors.mockResolvedValue([]);
        mockRepo.getTopicDistribution.mockResolvedValue([]);
        mockRepo.getAllAcademicYears.mockResolvedValue(semesters);
      });

      it("is the one the academic year helper resolves, not the stored flag", async () => {
        mockAcademicYear.getActiveAcademicYearId.mockResolvedValue("ay-now");

        expect((await getFilterOptions()).academicYears).toEqual([
          { value: "ay-old", label: "Genap 2025/2026 ", isActive: false },
          { value: "ay-now", label: "Ganjil 2026/2027 ", isActive: true },
        ]);
      });

      it("is none when no semester is running", async () => {
        mockAcademicYear.getActiveAcademicYearId.mockResolvedValue(null);

        expect((await getFilterOptions()).academicYears.map((ay) => ay.isActive)).toEqual([false, false]);
      });

      it("follows the stored flag when the calendar is ambiguous", async () => {
        mockAcademicYear.getActiveAcademicYearId.mockRejectedValue(new Error("Konfigurasi tahun akademik overlap."));

        expect((await getFilterOptions()).academicYears.map((ay) => ay.isActive)).toEqual([true, false]);
      });
    });
  });

  // ─── At-Risk / Slow Students ──────────────────────────────
  describe("getAtRiskStudentsFull", () => {
    it("returns full at-risk students list (limit 50)", async () => {
      const atRisk = [{ id: "s1" }, { id: "s2" }];
      mockRepo.getAtRiskStudents.mockResolvedValue(atRisk);

      const result = await getAtRiskStudentsFull(ACADEMIC_YEAR);

      expect(mockRepo.getAtRiskStudents).toHaveBeenCalledWith(50, ACADEMIC_YEAR);
      expect(result).toEqual(atRisk);
    });
  });

  describe("getSlowStudentsFull", () => {
    it("returns full slow students list (limit 50)", async () => {
      const slow = [{ id: "s3" }];
      mockRepo.getSlowStudents.mockResolvedValue(slow);

      const result = await getSlowStudentsFull(ACADEMIC_YEAR);

      expect(mockRepo.getSlowStudents).toHaveBeenCalledWith(50, ACADEMIC_YEAR);
      expect(result).toEqual(slow);
    });
  });

  // ─── Thesis Detail ────────────────────────────────────────
  describe("getThesisDetail", () => {
    it("returns full thesis detail with student, supervisors, milestones", async () => {
      mockRepo.getThesisDetailById.mockResolvedValue({
        ...THESIS_DETAIL,
        thesisSeminars: [],
        thesisDefences: [],
        thesisGuidances: [],
        status: "research",
        thesisTopic: { name: "ML" },
        academicYear: { semester: "ganjil", year: "2024/2025" },
        startDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getThesisDetail("thesis-1");

      expect(result).toHaveProperty("title", "AI Research");
    });

    it("gives the Seminar and Sidang cards room, assigned examiners and revision progress", async () => {
      const examiner = (order, name, extra = {}) => ({
        id: `ex-${order}`, order, lecturerId: `l-${order}`, assessmentScore: null,
        availabilityStatus: "available", lecturer: { user: { fullName: name } }, ...extra,
      });
      mockRepo.getThesisDetailById.mockResolvedValue({
        ...THESIS_DETAIL,
        thesisSeminars: [{
          id: "sem-1", status: "passed_with_revision", finalScore: 81.5,
          date: new Date("2026-10-14T00:00:00.000Z"), startTime: new Date("1970-01-01T09:00:00.000Z"),
          endTime: new Date("1970-01-01T11:00:00.000Z"), updatedAt: new Date(),
          resultFinalizedAt: new Date("2026-10-14T05:00:00.000Z"), revisionFinalizedAt: null,
          room: { name: "Ruang Seminar 1" },
          examiners: [
            examiner(1, "Penguji Satu", {
              assessmentScore: 80,
              thesisSeminarRevisions: [
                { id: "r1", supervisorApprovedAt: new Date() },
                { id: "r2", supervisorApprovedAt: null },
              ],
            }),
            examiner(2, "Penguji Dua", { assessmentScore: 83, thesisSeminarRevisions: [{ id: "r3", supervisorApprovedAt: new Date() }] }),
            // A declined examiner stays in the table but is not shown.
            examiner(3, "Penguji Menolak", { availabilityStatus: "unavailable", thesisSeminarRevisions: [] }),
          ],
        }],
        thesisDefences: [{
          id: "def-1", status: "scheduled", finalScore: null, grade: null,
          date: null, startTime: null, endTime: null, updatedAt: new Date(),
          examiners: [],
        }],
      });

      const result = await getThesisDetail("thesis-1");

      expect(result.seminars[0]).toMatchObject({
        id: "sem-1",
        status: "passed_with_revision",
        finalScore: 81.5,
        room: "Ruang Seminar 1",
        examiners: [{ order: 1, name: "Penguji Satu" }, { order: 2, name: "Penguji Dua" }],
        revisions: { total: 3, completed: 2 },
        revisionFinalizedAt: null,
      });
      expect(result.seminars[0].resultFinalizedAt).toEqual(new Date("2026-10-14T05:00:00.000Z"));
      // Without a room, examiners or revisions the card fields are empty, never undefined.
      expect(result.defences[0]).toMatchObject({
        id: "def-1",
        room: null,
        examiners: [],
        resultFinalizedAt: null,
        revisionFinalizedAt: null,
        revisions: { total: 0, completed: 0 },
      });
    });

    it("calculates lastActivity correctly prioritizing the newest date from multiple sources", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const twoDaysAgo = new Date(now.getTime() - 172800000);

      mockRepo.getThesisDetailById.mockResolvedValue({
        ...THESIS_DETAIL,
        updatedAt: twoDaysAgo,
        thesisGuidances: [{ approvedDate: yesterday }],
        thesisMilestones: [{ status: "completed", updatedAt: now }], // This is the newest
        thesisSeminars: [{ updatedAt: yesterday }],
        thesisDefences: [],
      });

      const result = await getThesisDetail("thesis-1");
      expect(result.lastActivity).toBe(now.toISOString());
    });

    it("falls back to the start of supervision if no activity exists (not to the row's updatedAt)", async () => {
      const startDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      mockRepo.getThesisDetailById.mockResolvedValue({
        ...THESIS_DETAIL,
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        startDate,
        statusChangedAt: startDate,
        updatedAt: new Date(),
        thesisGuidances: [],
        thesisMilestones: [],
        thesisSeminars: [],
      });

      const result = await getThesisDetail("thesis-1");
      expect(result.lastActivity).toBe(startDate.toISOString());
    });

    it("throws 404 if thesis not found", async () => {
      mockRepo.getThesisDetailById.mockResolvedValue(null);

      await expect(getThesisDetail("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── Warning Notification ─────────────────────────────────
  describe("sendWarningNotificationService", () => {
    const asKadep = () =>
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Admin", userHasRoles: [{ role: { name: "Ketua Departemen" }, status: "active" }] });

    it("warns a Lambat thesis with the Lambat wording, from the level derived on the server", async () => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(warningThesis("thesis-1", 90));

      // A client value is not a parameter any more; an extra argument changes nothing.
      const result = await sendWarningNotificationService("user-1", "thesis-1", "at_risk");

      expect(result).toMatchObject({ success: true, warningType: "slow" });
      const [recipients, push] = mockPush.sendFcmToUsers.mock.calls[0];
      expect(recipients).toEqual(["user-thesis-1"]);
      expect(push.title).toBe("Peringatan Progress Tugas Akhir");
      expect(push.body).toContain("terdeteksi lambat");
      expect(push.data.warningType).toBe("slow");
      expect(mockNotif.createNotificationsForUsers.mock.calls[0][1].message).toContain("terdeteksi lambat");
    });

    it("warns a Berisiko thesis with the Berisiko wording", async () => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(warningThesis("thesis-1", 200));

      const result = await sendWarningNotificationService("user-1", "thesis-1", "slow");

      expect(result.warningType).toBe("at_risk");
      const push = mockPush.sendFcmToUsers.mock.calls[0][1];
      expect(push.title).toBe("Peringatan Serius: Progress Tugas Akhir");
      expect(push.body).toContain("Berisiko");
      expect(push.data.warningType).toBe("at_risk");
    });

    it("reads the activity of the thesis with the columns of the progress helper", async () => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(warningThesis("thesis-1", 90));

      await sendWarningNotificationService("user-1", "thesis-1");

      const { select } = mockPrisma.thesis.findUnique.mock.calls[0][0];
      expect(select).toMatchObject({ status: true, startDate: true, statusChangedAt: true });
      expect(select.thesisGuidances.where).toEqual({ status: "completed", phase: "research" });
    });

    it.each([
      ["Lancar", warningThesis("thesis-1", 10), "Peringatan tidak dikirim: Aktivitas tugas akhir Lancar."],
      ["not in Penelitian (BSS)", warningThesis("thesis-1", 200, { status: "on_leave" }), "Peringatan tidak dikirim: Tugas akhir tidak berstatus Penelitian."],
      ["Selesai", warningThesis("thesis-1", 200, { status: "completed" }), "Peringatan tidak dikirim: Tugas akhir tidak berstatus Penelitian."],
    ])("sends nothing for a thesis that is %s (400)", async (_label, thesis, message) => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(thesis);

      await expect(sendWarningNotificationService("user-1", "thesis-1", "at_risk")).rejects.toMatchObject({ statusCode: 400, message });

      expect(mockPush.sendFcmToUsers).not.toHaveBeenCalled();
      expect(mockNotif.createNotificationsForUsers).not.toHaveBeenCalled();
    });

    it("counts a recent completed guidance session as activity", async () => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(
        warningThesis("thesis-1", 200, { thesisGuidances: [{ approvedDate: daysAgo(5), completedAt: daysAgo(5) }] }),
      );

      await expect(sendWarningNotificationService("user-1", "thesis-1")).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 404 if thesis not found", async () => {
      asKadep();
      mockPrisma.thesis.findUnique.mockResolvedValue(null);

      await expect(
        sendWarningNotificationService("user-1", "nonexistent")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ─── Progress Report ──────────────────────────────────────
  describe("getProgressReportService", () => {
    it("returns comprehensive report data for PDF generation", async () => {
      mockRepo.getAcademicYearById.mockResolvedValue({ id: "ay1", semester: "ganjil", year: "2024/2025" });
      mockRepo.getStatusDistribution.mockResolvedValue([]);
      mockRepo.getActivityDistribution.mockResolvedValue([]);
      mockRepo.getThesesForReport.mockResolvedValue([]);

      const result = await getProgressReportService({ academicYearId: "ay1" });

      expect(result).toHaveProperty("summary");
      expect(mockRepo.getAcademicYearById).toHaveBeenCalledWith("ay1");
    });
  });

  // ─── Students Ready for Seminar ─────────────────────
  describe("getStudentsReadyForSeminarFull", () => {
    it("returns students meeting seminar criteria", async () => {
      mockRepo.getStudentsReadyForSeminar.mockResolvedValue([
        {
          id: "thesis-1", title: "AI Research",
          student: { user: { fullName: "Budi", identityNumber: "123", email: "budi@test.com" } },
          thesisSupervisors: [{ lecturer: { user: { fullName: "Dr. Andi" } }, role: { name: "pembimbing_1" } }],
        },
      ]);

      const result = await getStudentsReadyForSeminarFull(ACADEMIC_YEAR);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("thesisId", "thesis-1");
      expect(result[0].student).toHaveProperty("name", "Budi");
    });

    it("returns empty array if no students are ready", async () => {
      mockRepo.getStudentsReadyForSeminar.mockResolvedValue([]);

      const result = await getStudentsReadyForSeminarFull(ACADEMIC_YEAR);

      expect(result).toEqual([]);
    });
  });

  // ─── Batch Warning Notification ─────────────────────
  describe("sendBatchWarningNotificationService", () => {
    const asKadep = () =>
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Admin", userHasRoles: [{ role: { name: "Ketua Departemen" }, status: "active" }] });
    const pushFor = (userId) => mockPush.sendFcmToUsers.mock.calls.find(([recipients]) => recipients[0] === userId)?.[1];
    const notifFor = (userId) => mockNotif.createNotificationsForUsers.mock.calls.find(([recipients]) => recipients[0] === userId)?.[1];

    it("gives a mix of Lambat and Berisiko theses each their own wording and skips the Lancar one", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([
        warningThesis("t-slow", 90, { student: { user: { id: "u-slow", fullName: "BUDI SANTOSO" } } }),
        warningThesis("t-risk", 200, { student: { user: { id: "u-risk", fullName: "ANDI WIJAYA" } } }),
        warningThesis("t-active", 10, { student: { user: { id: "u-active", fullName: "CITRA LESTARI" } } }),
      ]);

      // The client asks for "slow" for everyone; the level of each thesis decides.
      const result = await sendBatchWarningNotificationService("admin-user", ["t-slow", "t-risk", "t-active"], "slow");

      expect(mockPush.sendFcmToUsers).toHaveBeenCalledTimes(2);
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledTimes(2);

      expect(pushFor("u-slow")).toMatchObject({
        title: "Peringatan: Progress Tugas Akhir",
        body: "Halo BUDI SANTOSO, Anda sudah tidak ada update progress tugas akhir selama 90 hari. Segera lakukan bimbingan dengan dosen pembimbing Anda.",
        data: { thesisId: "t-slow", warningType: "slow" },
      });
      expect(notifFor("u-slow")).toMatchObject({ title: "Peringatan: Progress Tugas Akhir", referenceId: "t-slow" });
      expect(notifFor("u-slow").message).not.toContain("Berisiko");

      expect(pushFor("u-risk")).toMatchObject({
        title: "Peringatan Serius: Progress Tugas Akhir",
        body: "Halo ANDI WIJAYA, Anda sudah tidak ada update progress tugas akhir selama 200 hari (aktivitas: Berisiko). Segera lakukan bimbingan dengan dosen pembimbing Anda.",
        data: { thesisId: "t-risk", warningType: "at_risk" },
      });
      expect(notifFor("u-risk").message).toBe("Progress Anda terhenti selama 200 hari (aktivitas: Berisiko). Segera hubungi dosen pembimbing Anda.");

      // The Lancar thesis got nothing and is reported.
      expect(pushFor("u-active")).toBeUndefined();
      expect(notifFor("u-active")).toBeUndefined();
      expect(result).toEqual({
        success: true,
        message: "Peringatan dikirim ke 2 mahasiswa (1 Berisiko, 1 Lambat). 1 tidak dikirim.",
        sentCount: 2,
        sentCounts: { slow: 1, at_risk: 1 },
        sent: [
          { thesisId: "t-slow", studentName: "BUDI SANTOSO", warningType: "slow" },
          { thesisId: "t-risk", studentName: "ANDI WIJAYA", warningType: "at_risk" },
        ],
        notSent: [
          { thesisId: "t-active", studentName: "CITRA LESTARI", reason: "active", reasonLabel: "Aktivitas tugas akhir Lancar" },
        ],
      });
    });

    it("does not let the client turn a Lambat warning into a Berisiko one", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([warningThesis("t-slow", 90)]);

      const result = await sendBatchWarningNotificationService("admin-user", ["t-slow"], "at_risk");

      expect(result.sent).toEqual([{ thesisId: "t-slow", studentName: "MAHASISWA T-SLOW", warningType: "slow" }]);
      expect(mockPush.sendFcmToUsers.mock.calls[0][1].title).toBe("Peringatan: Progress Tugas Akhir");
    });

    it("skips theses that are not in Penelitian, unknown ids and theses without a student account", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([
        warningThesis("t-risk", 130),
        warningThesis("t-leave", 200, { status: "on_leave" }),
        warningThesis("t-done", 200, { status: "completed" }),
        warningThesis("t-orphan", 200, { student: null }),
      ]);

      const result = await sendBatchWarningNotificationService("admin-user", ["t-risk", "t-leave", "t-done", "t-orphan", "t-gone", "t-risk"]);

      // Duplicate ids are one thesis.
      expect(mockPrisma.thesis.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["t-risk", "t-leave", "t-done", "t-orphan", "t-gone"] } });
      expect(mockPush.sendFcmToUsers).toHaveBeenCalledTimes(1);
      expect(result.sentCount).toBe(1);
      expect(result.sentCounts).toEqual({ slow: 0, at_risk: 1 });
      expect(result.notSent.map(({ thesisId, reason, reasonLabel }) => [thesisId, reason, reasonLabel])).toEqual([
        ["t-leave", "not_research", "Tugas akhir tidak berstatus Penelitian"],
        ["t-done", "not_research", "Tugas akhir tidak berstatus Penelitian"],
        ["t-orphan", "no_student", "Akun mahasiswa tidak ditemukan"],
        ["t-gone", "not_found", "Tugas akhir tidak ditemukan"],
      ]);
      expect(result.message).toBe("Peringatan dikirim ke 1 mahasiswa (1 Berisiko, 0 Lambat). 4 tidak dikirim.");
    });

    it("reports it when nothing at all is sent", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([warningThesis("t-active", 3)]);

      const result = await sendBatchWarningNotificationService("admin-user", ["t-active"]);

      expect(result).toMatchObject({ success: true, sentCount: 0, sent: [], message: "Tidak ada peringatan yang dikirim. 1 tidak dikirim." });
      expect(mockPush.sendFcmToUsers).not.toHaveBeenCalled();
      expect(mockNotif.createNotificationsForUsers).not.toHaveBeenCalled();
    });

    it("reports a thesis whose notification could not be sent, and still sends the others", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([warningThesis("t-a", 90), warningThesis("t-b", 90)]);
      mockPush.sendFcmToUsers.mockRejectedValueOnce(new Error("FCM down"));

      const result = await sendBatchWarningNotificationService("admin-user", ["t-a", "t-b"]);

      expect(result.sent.map((item) => item.thesisId)).toEqual(["t-b"]);
      expect(result.notSent).toEqual([
        { thesisId: "t-a", studentName: "MAHASISWA T-A", reason: "failed", reasonLabel: "Notifikasi gagal dikirim" },
      ]);
    });

    it("throws error if thesisIds is empty", async () => {
      await expect(
        sendBatchWarningNotificationService("admin-user", [])
      ).rejects.toThrow();
    });

    it("throws error if no theses are found", async () => {
      asKadep();
      mockPrisma.thesis.findMany = vi.fn().mockResolvedValue([]);

      await expect(
        sendBatchWarningNotificationService("admin-user", ["nonexistent"])
      ).rejects.toThrow();
    });
  });

  // ─── Progress Report (with filters) ─────────────────
  describe("getProgressReportService (with options)", () => {
    it("returns report data with all-semester filter", async () => {
      mockRepo.getThesesForReport.mockResolvedValue([]);
      mockRepo.getStatusDistribution.mockResolvedValue([]);
      mockRepo.getActivityDistribution.mockResolvedValue([]);

      const result = await getProgressReportService({});

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("academicYear", "Semua Semester");
    });

    it("computes milestone and guidance statistics correctly", async () => {
      mockRepo.getAcademicYearById.mockResolvedValue({ id: "ay1", semester: "ganjil", year: "2025/2026" });
      mockRepo.getThesesForReport.mockResolvedValue([
        {
          id: "t1", title: "Thesis 1",
          student: { user: { identityNumber: "123", fullName: "Budi" } },
          status: "research",
          thesisTopic: { name: "ML" },
          thesisSupervisors: [],
          thesisMilestones: [
            { status: "completed" }, { status: "in_progress" },
          ],
          thesisGuidances: [
            { status: "completed" }, { status: "accepted" },
          ],
          startDate: new Date(), createdAt: new Date(),
        },
      ]);
      mockRepo.getStatusDistribution.mockResolvedValue([]);
      mockRepo.getActivityDistribution.mockResolvedValue([]);

      const result = await getProgressReportService({ academicYearId: "ay1" });

      expect(result.summary.totalTheses).toBe(1);
      expect(result.summary.totalMilestones).toBe(2);
      expect(result.summary.completedMilestones).toBe(1);
      expect(result.summary.totalGuidances).toBe(2);
      expect(result.summary.completedGuidances).toBe(1);
      expect(result.theses[0]).toHaveProperty("progressPercent", 50);
    });
  });
});
