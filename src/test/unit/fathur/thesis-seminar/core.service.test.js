import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockCoreRepo, mockXlsx, mockStatusUtil } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
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
    getSeminarList: vi.fn(),
    getThesisOptions: vi.fn(),
    findAllSeminarResultsForExport: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
    findSeminarsPaginated: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    countSeminars: vi.fn().mockResolvedValue(0),
  },
  mockXlsx: {
    read: vi.fn(),
    utils: { 
      sheet_to_json: vi.fn().mockReturnValue([]), 
      json_to_sheet: vi.fn().mockReturnValue({}), 
      book_new: vi.fn().mockReturnValue({}), 
      book_append_sheet: vi.fn() 
    },
    write: vi.fn(),
  },
  mockStatusUtil: { computeEffectiveStatus: vi.fn() },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("xlsx", () => mockXlsx);
vi.mock("../../../../utils/seminarStatus.util.js", () => mockStatusUtil);
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../../services/outlook-calendar.service.js", () => ({ hasCalendarAccess: vi.fn().mockResolvedValue(true), createCalendarEvent: vi.fn().mockResolvedValue({ eventId: "e1" }) }));
vi.mock("../../../../helpers/pdf.helper.js", () => ({ convertHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")) }));
vi.mock("../../../../services/thesis-seminar/examiner.service.js", () => ({ getFinalizationData: vi.fn() }));

import {
  scheduleSeminar, finalizeSchedule, generateAssessmentResultPdf,
  createArchive, updateArchive, deleteArchive, getSeminarList, getSeminarDetail,
  cancelSeminar, importArchive, generateInvitationLetter
} from "../../../../services/thesis-seminar/core.service.js";

import { getFinalizationData } from "../../../../services/thesis-seminar/examiner.service.js";

describe("Core Service (Full restored suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusUtil.computeEffectiveStatus.mockImplementation((s) => s);
    mockPrisma.documentType.findMany.mockResolvedValue([]);
    mockPrisma.thesisSeminarDocument.findMany.mockResolvedValue([]);
    mockPrisma.thesisSeminarAudience.findMany.mockResolvedValue([]);
    mockCoreRepo.findSeminarsPaginated.mockResolvedValue({ data: [], total: 0 });
    mockCoreRepo.countSeminars.mockResolvedValue(0);
  });

  describe("List & Detail", () => {
    it("returns admin list as an array", async () => {
      const res = await getSeminarList({ page: 1, pageSize: 10 }, { role: "Admin" });
      expect(Array.isArray(res)).toBe(true);
    });

    it("returns seminar detail correctly", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", examiners: [] });
      const res = await getSeminarDetail("s1");
      expect(res.id).toBe("s1");
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
      const res = await createArchive({ thesisId: "t1", roomId: "r1", status: "passed", examinerLecturerIds: ["l1"], date: "2026-01-01" }, "u1");
      expect(res.id).toBe("s1");
    });

    it("updates manual archive data", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "t1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "r1" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([]);
      mockCoreRepo.updateSeminarWithExaminers.mockResolvedValue({});
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1" });
      const res = await updateArchive("s1", { thesisId: "t1", roomId: "r1", status: "passed", examinerLecturerIds: ["l1"] }, "u1");
      expect(res.id).toBe("s1");
    });

    it("deletes archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockCoreRepo.deleteSeminar.mockResolvedValue({});
      const res = await deleteArchive("s1");
      expect(res.success).toBe(true);
    });
  });

  describe("Scheduling & Lifecycle", () => {
    it("finalizes schedule and sends notifications", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", status: "examiner_assigned", date: new Date(), thesis: { student: { id: "u1" } }, examiners: [], thesisSupervisors: [] });
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockCoreRepo.updateSeminar.mockResolvedValue({ status: "scheduled" });
      const res = await finalizeSchedule("s1", "admin1");
      expect(res.status).toBe("scheduled");
    });

    it("cancels seminar and resets supervisors", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "scheduled", thesisId: "t1" });
      mockCoreRepo.updateSeminar.mockResolvedValue({ status: "cancelled" });
      mockPrisma.thesisSupervisors.updateMany.mockResolvedValue({ count: 1 });
      const res = await cancelSeminar("s1", { cancelledReason: "Reason" });
      expect(res.status).toBe("cancelled");
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
      const res = await generateAssessmentResultPdf("s1");
      expect(res).toBeDefined();
    });

    it("generates invitation letter PDF", async () => {
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({ id: "s1", date: new Date(), startTime: new Date(), thesis: { title: "T", student: { user: { fullName: "S" } } }, examiners: [] });
      mockPrisma.lecturer.findMany.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ fullName: "Kadep", identityNumber: "123" });
      const res = await generateInvitationLetter("s1", "REF/123");
      expect(res).toBeDefined();
    });
  });
});
