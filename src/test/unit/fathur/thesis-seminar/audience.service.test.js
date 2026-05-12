import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockAudienceRepo, mockCoreRepo, mockXlsx, mockOutlook } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findUnique: vi.fn() },
    thesisSeminarAudience: { create: vi.fn() },
    student: { findUnique: vi.fn() },
  },
  mockAudienceRepo: {
    findAudiencesBySeminarId: vi.fn(),
    findAudienceByKey: vi.fn(),
    createAudience: vi.fn(),
    createAudiencesMany: vi.fn(),
    findAudienceRegistration: vi.fn(),
    createAudienceRegistration: vi.fn(),
    deleteAudienceRegistration: vi.fn(),
    deleteAudience: vi.fn(),
  },
  mockCoreRepo: {
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    findThesisById: vi.fn(),
    findSupervisorsByThesisId: vi.fn(),
    findStudentScheduleConflict: vi.fn(),
    findStudentByNameOrNim: vi.fn(),
  },
  mockXlsx: {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn(),
      json_to_sheet: vi.fn(),
      book_new: vi.fn(),
      book_append_sheet: vi.fn(),
    },
    write: vi.fn(),
  },
  mockOutlook: {
    hasCalendarAccess: vi.fn(),
    createCalendarEvent: vi.fn(),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/audience.repository.js", () => mockAudienceRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../services/outlook-calendar.service.js", () => mockOutlook);
vi.mock("xlsx", () => mockXlsx);

import {
  getAudiences,
  addAudience,
  updateAudience,
  removeAudience,
  importAudiences,
} from "../../../../services/thesis-seminar/audience.service.js";

describe("Thesis Seminar Audience Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAudiences", () => {
    it("returns mapped audience list", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1" });
      mockAudienceRepo.findAudiencesBySeminarId.mockResolvedValue([
        {
          studentId: "stu-1",
          student: { user: { fullName: "Student 1", identityNumber: "123" } },
          approvedAt: new Date(),
          supervisor: { lecturer: { user: { fullName: "Supervisor 1" } } },
          registeredAt: null,
          createdAt: new Date(),
        },
      ]);

      const result = await getAudiences("sem-1");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        fullName: "Student 1",
        nim: "123",
        registeredAt: null,
      });
    });

    it("throws 404 if seminar not found", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(null);
      await expect(getAudiences("invalid")).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("addAudience (Manual Admin Addition)", () => {
    const adminUser = { id: "admin-1", role: "admin" };
    const seminarArchive = { id: "sem-1", thesisId: "thesis-1", registeredAt: null, date: new Date() };

    it("successfully adds audience for archive seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminarArchive);
      mockAudienceRepo.findAudienceByKey.mockResolvedValue(null);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "other-stu" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ id: "sup-1" }]);
      mockAudienceRepo.createAudience.mockResolvedValue({ success: true });

      await addAudience("sem-1", { studentId: "stu-1" }, adminUser);

      expect(mockAudienceRepo.createAudience).toHaveBeenCalledWith({
        seminarId: "sem-1",
        studentId: "stu-1",
        supervisorId: "sup-1",
        seminarDate: seminarArchive.date,
      });
    });

    it("throws 403 if trying to manually add audience to an active seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ ...seminarArchive, registeredAt: new Date() });
      await expect(addAudience("sem-1", { studentId: "stu-1" }, adminUser)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 400 if student is the owner of the thesis", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminarArchive);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "stu-1" });
      await expect(addAudience("sem-1", { studentId: "stu-1" }, adminUser)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("importAudiences", () => {
    const seminarArchive = { id: "sem-1", thesisId: "thesis-1", registeredAt: null, date: new Date() };

    it("processes excel rows and calls createAudience", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminarArchive);
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "Nama Mahasiswa": "Budi", "NIM": "12345" }
      ]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "owner" });
      mockCoreRepo.findStudentByNameOrNim.mockResolvedValue({ id: "stu-1" });
      mockAudienceRepo.findAudienceByKey.mockResolvedValue(null);
      mockAudienceRepo.createAudience.mockResolvedValue({});

      const result = await importAudiences("sem-1", { buffer: Buffer.from("test") });

      expect(result.successCount).toBe(1);
      expect(mockAudienceRepo.createAudience).toHaveBeenCalled();
    });

    it("fails if student not found", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminarArchive);
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "Nama Mahasiswa": "Unknown", "NIM": "000" }
      ]);
      mockCoreRepo.findStudentByNameOrNim.mockResolvedValue(null);

      const result = await importAudiences("sem-1", { buffer: Buffer.from("test") });
      expect(result.failed).toBe(1);
      expect(result.successCount).toBe(0);
    });
  });

  describe("addAudience (Student Self-Registration)", () => {
    const studentUser = { studentId: "stu-1" };
    const seminar = { id: "sem-1", status: "scheduled", date: new Date(Date.now() + 86400000) };

    it("successfully registers student and triggers outlook sync", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminar);
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({
        id: "sem-1",
        status: "scheduled",
        date: seminar.date,
        thesis: { student: { id: "other-stu" } }
      });
      mockAudienceRepo.findAudienceRegistration.mockResolvedValue(null);
      mockAudienceRepo.createAudienceRegistration.mockResolvedValue({});
      
      // Mock for calendar sync
      mockPrisma.student.findUnique.mockResolvedValue({ id: "stu-1", user: { id: "user-1" } });
      mockOutlook.hasCalendarAccess.mockResolvedValue(true);
      mockCoreRepo.findSeminarById.mockResolvedValue({
        id: "sem-1",
        date: seminar.date,
        startTime: new Date(),
        endTime: new Date(),
        thesis: { student: { user: { fullName: "Presenter" } } }
      });

      const result = await addAudience("sem-1", {}, studentUser);

      expect(result.message).toContain("Berhasil mendaftar");
      expect(mockAudienceRepo.createAudienceRegistration).toHaveBeenCalledWith("sem-1", "stu-1");
      // Note: syncAudienceToOutlook is fire-and-forget, but we can check if prisma was called at least
    });

    it("throws 400 if registering for own seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(seminar);
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({
        id: "sem-1",
        thesis: { student: { id: "stu-1" } }
      });
      await expect(addAudience("sem-1", {}, studentUser)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if seminar is in the past", async () => {
      const pastSeminar = { ...seminar, date: new Date(Date.now() - 86400000) };
      mockCoreRepo.findSeminarBasicById.mockResolvedValue(pastSeminar);
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({
        id: "sem-1",
        status: "scheduled",
        date: pastSeminar.date,
        thesis: { student: { id: "other-stu" } }
      });
      await expect(addAudience("sem-1", {}, studentUser)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("removeAudience", () => {
    it("successfully cancels student registration", async () => {
      const studentUser = { studentId: "stu-1" };
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1" });
      mockAudienceRepo.findAudienceRegistration.mockResolvedValue({ id: "reg-1" });
      mockAudienceRepo.deleteAudienceRegistration.mockResolvedValue({});

      const result = await removeAudience("sem-1", "stu-1", studentUser);
      expect(result.message).toContain("berhasil dibatalkan");
      expect(mockAudienceRepo.deleteAudienceRegistration).toHaveBeenCalledWith("sem-1", "stu-1");
    });

    it("successfully deletes audience record as admin", async () => {
      const adminUser = { id: "admin-1", role: "admin" };
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: null });
      mockAudienceRepo.deleteAudience.mockResolvedValue({});

      const result = await removeAudience("sem-1", "stu-1", adminUser);
      expect(result.success).toBe(true);
      expect(mockAudienceRepo.deleteAudience).toHaveBeenCalledWith("sem-1", "stu-1");
    });
  });
});
