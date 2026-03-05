/**
 * Unit Tests — Module 11: Monitoring Tugas Akhir
 * Covers: dashboard, thesis list, filter options, at-risk/slow, detail, warning notification, report
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRepo, mockPrisma, mockPush, mockNotif } = vi.hoisted(() => ({
  mockRepo: {
    getThesesOverview: vi.fn(),
    getStatusDistribution: vi.fn(),
    getRatingDistribution: vi.fn(),
    getProgressStatistics: vi.fn(),
    getAtRiskStudents: vi.fn(),
    getSlowStudents: vi.fn(),
    getStudentsReadyForSeminar: vi.fn(),
    getAllAcademicYears: vi.fn(),
    getAllSupervisors: vi.fn(),
    getThesisDetailById: vi.fn(),
    getThesesForReport: vi.fn(),
    getAcademicYearById: vi.fn(),
    getTopicDistribution: vi.fn(),
    getBatchDistribution: vi.fn(),
    getProgressDistribution: vi.fn(),
    getGuidanceTrend: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn(), findFirst: vi.fn() },
    thesisStatus: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../repositories/thesisGuidance/monitoring.repository.js", () => mockRepo);
vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);

import {
  getMonitoringDashboard,
  getThesesList,
  getFilterOptions,
  getAtRiskStudentsFull,
  getSlowStudentsFull,
  getThesisDetail,
  sendWarningNotificationService,
  getProgressReportService,
} from "../services/thesisGuidance/monitoring.service.js";

// ── Test Data ──────────────────────────────────────────────────
const ACADEMIC_YEAR = "2024/2025";
const THESIS_DETAIL = {
  id: "thesis-1",
  title: "AI Research",
  student: { id: "s1", user: { id: "u1", fullName: "Budi" } },
  thesisSupervisors: [],
  thesisMilestones: [],
  thesisGuidances: [],
};

// ══════════════════════════════════════════════════════════════
describe("Module 11: Monitoring Tugas Akhir", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Dashboard ────────────────────────────────────────────
  describe("getMonitoringDashboard", () => {
    it("returns summary stats, distributions, charts, at-risk and slow students", async () => {
      mockRepo.getProgressStatistics.mockResolvedValue({ total: 100, active: 80 });
      mockRepo.getStatusDistribution.mockResolvedValue([{ status: "Bimbingan", count: 60 }]);
      mockRepo.getRatingDistribution.mockResolvedValue([{ rating: "on_track", count: 50 }]);
      mockRepo.getAtRiskStudents.mockResolvedValue([{ id: "s1", name: "At Risk Student" }]);
      mockRepo.getSlowStudents.mockResolvedValue([{ id: "s2", name: "Slow Student" }]);
      mockRepo.getStudentsReadyForSeminar.mockResolvedValue([]);
      mockRepo.getTopicDistribution.mockResolvedValue([{ id: "t1", name: "Machine Learning", count: 10 }]);
      mockRepo.getBatchDistribution.mockResolvedValue([{ id: "2022", name: "Angkatan 2022", count: 15 }]);
      mockRepo.getProgressDistribution.mockResolvedValue([{ label: "0-25%", count: 5 }]);
      mockRepo.getGuidanceTrend.mockResolvedValue([{ month: "2025-01", count: 12 }]);

      const result = await getMonitoringDashboard(ACADEMIC_YEAR);

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("statusDistribution");
      expect(result).toHaveProperty("ratingDistribution");
      expect(result).toHaveProperty("topicDistribution");
      expect(result).toHaveProperty("batchDistribution");
      expect(result).toHaveProperty("progressDistribution");
      expect(result).toHaveProperty("guidanceTrend");
      expect(result).toHaveProperty("atRiskStudents");
      expect(result).toHaveProperty("slowStudents");
      expect(result).toHaveProperty("readyForSeminar");
      expect(mockRepo.getProgressStatistics).toHaveBeenCalledWith(ACADEMIC_YEAR);
      expect(mockRepo.getBatchDistribution).toHaveBeenCalledWith(ACADEMIC_YEAR);
      expect(mockRepo.getGuidanceTrend).toHaveBeenCalledWith(ACADEMIC_YEAR);
    });
  });

  // ─── Thesis List (Paginated) ──────────────────────────────
  describe("getThesesList", () => {
    it("returns paginated thesis list with filters", async () => {
      mockRepo.getThesesOverview.mockResolvedValue({
        theses: [{ id: "t1", title: "Thesis 1", thesisMilestones: [], thesisSupervisors: [], student: { user: { fullName: "Budi" } }, thesisTopic: { name: "ML" }, thesisStatus: { name: "Bimbingan" } }],
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
  });

  // ─── Filter Options ───────────────────────────────────────
  describe("getFilterOptions", () => {
    it("returns statuses, supervisors, and academic years", async () => {
      mockRepo.getThesesOverview.mockResolvedValue({ data: [] });
      mockRepo.getAllSupervisors.mockResolvedValue([{ id: "l1", name: "Dr. Andi" }]);
      mockRepo.getAllAcademicYears.mockResolvedValue([{ id: "ay1", name: "2024/2025" }]);

      const result = await getFilterOptions();

      expect(result).toHaveProperty("supervisors");
      expect(result).toHaveProperty("academicYears");
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
        thesisStatus: { name: "Bimbingan" },
        thesisTopic: { name: "ML" },
        academicYear: { semester: "Ganjil", year: 2024 },
        startDate: new Date(),
        deadlineDate: new Date(),
        rating: "on_track",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getThesisDetail("thesis-1");

      expect(result).toHaveProperty("title", "AI Research");
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
    it("sends FCM + in-app notification for SLOW warning", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Admin" });
      mockPrisma.thesis.findUnique.mockResolvedValue({
        id: "thesis-1",
        title: "AI Research",
        student: { user: { id: "user-1", fullName: "Budi" } },
      });

      await sendWarningNotificationService("user-1", "thesis-1", "SLOW");

      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });

    it("sends notification for AT_RISK warning type", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Admin" });
      mockPrisma.thesis.findUnique.mockResolvedValue({
        id: "thesis-1",
        title: "AI Research",
        student: { user: { id: "user-1", fullName: "Budi" } },
      });

      await sendWarningNotificationService("user-1", "thesis-1", "AT_RISK");

      expect(mockPush.sendFcmToUsers).toHaveBeenCalled();
    });

    it("throws 404 if thesis not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Admin" });
      mockPrisma.thesis.findUnique.mockResolvedValue(null);

      await expect(
        sendWarningNotificationService("user-1", "nonexistent", "SLOW")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ─── Progress Report ──────────────────────────────────────
  describe("getProgressReportService", () => {
    it("returns comprehensive report data for PDF generation", async () => {
      mockRepo.getAcademicYearById.mockResolvedValue({ id: "ay1", semester: "Ganjil", year: 2024 });
      mockRepo.getProgressStatistics.mockResolvedValue({ total: 50 });
      mockRepo.getStatusDistribution.mockResolvedValue([]);
      mockRepo.getRatingDistribution.mockResolvedValue([]);
      mockRepo.getThesesForReport.mockResolvedValue([]);

      const result = await getProgressReportService("ay1");

      expect(result).toHaveProperty("summary");
      expect(mockRepo.getAcademicYearById).toHaveBeenCalledWith("ay1");
    });
  });
});
