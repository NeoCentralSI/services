import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockCoreRepo, mockXlsx, mockStatusUtil } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    student: { findMany: vi.fn(), findUnique: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn(), findMany: vi.fn() },
    documentType: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSeminarDocument: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSeminarAudience: { findMany: vi.fn().mockResolvedValue([]) },
    lecturer: { findMany: vi.fn().mockResolvedValue([]) },
  },
  mockCoreRepo: {
    findThesisById: vi.fn(),
    findRoomById: vi.fn(),
    findSeminarByThesisId: vi.fn(),
    findSeminarByThesisIdExcludingId: vi.fn(),
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    createSeminarWithExaminers: vi.fn(),
    updateSeminarWithExaminers: vi.fn(),
    deleteSeminar: vi.fn(),
    findSupervisorsByThesisId: vi.fn(),
    findStudentByNim: vi.fn(),
    findActiveThesisByStudentId: vi.fn(),
    findRoomByNameLike: vi.fn(),
    findLecturerByNameLike: vi.fn(),
    updateSeminar: vi.fn(),
    getAllSeminarsForExport: vi.fn(),
    findLecturerAvailabilities: vi.fn(),
    findAllRooms: vi.fn(),
    findRoomBookings: vi.fn(),
    findRoomScheduleConflict: vi.fn(),
    findStudentsForOptions: vi.fn(),
    findLecturersForOptions: vi.fn(),
    findThesesForOptions: vi.fn(),
    findAllSeminarResultsForExport: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
    findSeminarsPaginated: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    countSeminars: vi.fn().mockResolvedValue(0),
    getAllAnnouncedSeminarsForBoard: vi.fn(),
  },
  mockXlsx: {
    read: vi.fn().mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} }
    }),
    utils: { 
      sheet_to_json: vi.fn().mockReturnValue([]), 
      json_to_sheet: vi.fn().mockReturnValue({}), 
      book_new: vi.fn().mockReturnValue({}), 
      book_append_sheet: vi.fn() 
    },
    write: vi.fn().mockReturnValue(Buffer.from('')),
  },
  mockStatusUtil: { computeEffectiveStatus: vi.fn() },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("xlsx", () => mockXlsx);
vi.mock("../../../../utils/seminarStatus.util.js", () => mockStatusUtil);
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../../services/outlook-calendar.service.js", () => ({ hasCalendarAccess: vi.fn().mockResolvedValue(true), createSeminarCalendarEvents: vi.fn().mockResolvedValue({}) }));
vi.mock("../../../../helpers/pdf.helper.js", () => ({ convertHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")) }));
vi.mock("../../../../services/thesis-seminar/examiner.service.js", () => ({ getFinalizationData: vi.fn() }));

import * as coreService from "../../../../services/thesis-seminar/core.service.js";
import { getFinalizationData } from "../../../../services/thesis-seminar/examiner.service.js";

describe("Thesis Seminar Core Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusUtil.computeEffectiveStatus.mockImplementation((s) => s);
  });

  describe("Announcements", () => {
    it("returns board announcements without audience context for staff", async () => {
      mockCoreRepo.getAllAnnouncedSeminarsForBoard.mockResolvedValue([
        {
          id: "sem-1",
          date: new Date("2026-06-01"),
          startTime: new Date("2026-06-01T08:00:00Z"),
          endTime: new Date("2026-06-01T10:00:00Z"),
          status: "scheduled",
          meetingLink: null,
          room: { id: "r1", name: "Ruang A" },
          thesis: {
            title: "Judul TA",
            student: { id: "st-1", user: { fullName: "Mahasiswa A" } },
            thesisSupervisors: [],
          },
          examiners: [{ order: 1, lecturerId: "lec-1" }],
        },
      ]);
      mockPrisma.lecturer.findMany.mockResolvedValue([
        { id: "lec-1", user: { fullName: "Penguji 1" } },
      ]);

      const result = await coreService.getAnnouncements();

      expect(result).toHaveLength(1);
      expect(result[0].isRegistered).toBe(false);
      expect(result[0].isPresent).toBe(false);
      expect(result[0].isOwn).toBe(false);
      expect(result[0].presenterName).toBe("Mahasiswa A");
    });
  });

  describe("List & Detail", () => {
    it("returns admin list successfully", async () => {
      mockCoreRepo.findSeminarsPaginated.mockResolvedValue({ data: [], total: 0 });
      // Call with the object parameter as defined in the service
      const res = await coreService.getSeminarList({ page: 1, pageSize: 10, user: { role: "Admin" } });
      expect(res).toBeDefined();
    });

    it("returns seminar detail correctly", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", examiners: [] });
      const res = await coreService.getSeminarDetail("s1");
      expect(res.id).toBeDefined();
    });
  });

  describe("Archive Management", () => {
    it("creates archive seminar", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "t1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "r1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null);
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([]);
      mockCoreRepo.createSeminarWithExaminers.mockResolvedValue({ id: "s1" });
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1" });
      const res = await coreService.createArchive({ thesisId: "t1", roomId: "r1", status: "passed", examinerLecturerIds: ["l1"], date: "2026-01-01" }, "u1");
      expect(res.id).toBeDefined();
    });

    it("updates manual archive data", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "t1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "r1" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([]);
      mockCoreRepo.updateSeminarWithExaminers.mockResolvedValue({});
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1" });
      const res = await coreService.updateArchive("s1", { thesisId: "t1", roomId: "r1", status: "passed", examinerLecturerIds: ["l1"] }, "u1");
      expect(res.id).toBeDefined();
    });

    it("deletes archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockCoreRepo.deleteSeminar.mockResolvedValue({});
      const res = await coreService.deleteArchive("s1");
      expect(res.success).toBe(true);
    });
  });

  describe("Scheduling & Lifecycle", () => {
    it("finalizes schedule and sends notifications", async () => {
      const mockSeminar = { id: "s1", status: "examiner_assigned", date: new Date(), startTime: new Date(), endTime: new Date(), thesis: { student: { id: "u1" } }, examiners: [], thesisSupervisors: [] };
      mockCoreRepo.findSeminarById.mockResolvedValue(mockSeminar);
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockCoreRepo.updateSeminar.mockResolvedValue({ status: "scheduled" });
      const res = await coreService.finalizeSchedule("s1", "admin1");
      expect(res.status).toBe("scheduled");
    });

    it("cancels seminar and resets supervisors", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "scheduled", thesisId: "t1" });
      mockCoreRepo.updateSeminar.mockResolvedValue({ status: "cancelled" });
      mockPrisma.thesisSupervisors.updateMany.mockResolvedValue({ count: 1 });
      const res = await coreService.cancelSeminar("s1", { cancelledReason: "Reason" });
      expect(res.status).toBe("cancelled");
      expect(mockPrisma.thesisSupervisors.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { seminarReady: false }
      }));
    });
  });

  describe("Document Generation", () => {
    it("generates assessment result PDF", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", date: new Date(), startTime: new Date(), thesis: { student: { user: { fullName: "S" } } } });
      vi.mocked(getFinalizationData).mockResolvedValue({
        seminar: { resultFinalizedAt: new Date(), status: "passed" },
        examiners: [],
        criteriaGroups: []
      });
      const res = await coreService.generateAssessmentResultPdf("s1");
      expect(res).toBeDefined();
    });

    it("generates invitation letter PDF", async () => {
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({ id: "s1", date: new Date(), startTime: new Date(), thesis: { title: "T", student: { user: { fullName: "S" } } }, examiners: [] });
      mockPrisma.lecturer.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ fullName: "Kadep", identityNumber: "123" });
      const res = await coreService.generateInvitationLetter("s1", "REF/123");
      expect(res).toBeDefined();
    });
  });

  describe("Import/Export", () => {
    it("exports archive data correctly", async () => {
      mockCoreRepo.findAllSeminarResultsForExport.mockResolvedValue([]);
      await coreService.exportArchive();
      expect(mockXlsx.utils.json_to_sheet).toHaveBeenCalled();
      expect(mockXlsx.write).toHaveBeenCalled();
    });

    it("processes excel rows during import", async () => {
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { NIM: '123', Hasil: 'Lulus', Tanggal: '2023-01-01', 'Dosen Penguji 1': 'Lec A' }
      ]);
      mockCoreRepo.findAllRooms.mockResolvedValue([]);
      mockCoreRepo.findLecturersForOptions.mockResolvedValue([{ user: { fullName: 'Lec A' }, id: 'lec-a' }]);
      mockCoreRepo.findStudentsForOptions.mockResolvedValue([{ user: { identityNumber: '123' }, id: 'stud-1' }]);
      mockCoreRepo.findThesesForOptions.mockResolvedValue([{ student: { user: { identityNumber: '123' } }, id: 't1', thesisSeminars: [] }]);

      const result = await coreService.importArchive(Buffer.from(''), 'u1');
      expect(result.successCount).toBe(1);
    });
  });

  describe("Options", () => {
    it("returns thesis options", async () => {
      mockCoreRepo.findThesesForOptions.mockResolvedValue([]);
      await coreService.getThesisOptions();
      expect(mockCoreRepo.findThesesForOptions).toHaveBeenCalled();
    });
  });
});
