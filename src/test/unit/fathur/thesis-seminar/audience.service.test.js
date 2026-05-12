import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockAudienceRepo, mockCoreRepo, mockXlsx, mockOutlook, mockNotification } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findUnique: vi.fn() },
    thesisSeminarAudience: { create: vi.fn() },
    student: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
    lecturer: { findMany: vi.fn() },
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
    toggleAudiencePresence: vi.fn(),
    approveAudience: vi.fn(),
    resetAudienceApproval: vi.fn(),
    findStudentOptionsForAudience: vi.fn(),
  },
  mockCoreRepo: {
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    findThesisById: vi.fn(),
    findSupervisorsByThesisId: vi.fn(),
    findStudentScheduleConflict: vi.fn(),
    findStudentByNameOrNim: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
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
  mockOutlook: { hasCalendarAccess: vi.fn(), createCalendarEvent: vi.fn() },
  mockNotification: { createNotificationService: vi.fn() },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/audience.repository.js", () => mockAudienceRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../services/outlook-calendar.service.js", () => mockOutlook);
vi.mock("../../../../services/notification.service.js", () => mockNotification);
vi.mock("xlsx", () => mockXlsx);
vi.mock("../../../../helpers/pdf.helper.js", () => ({ convertHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")) }));

import {
  getAudiences, addAudience, updateAudience, removeAudience,
  importAudiences, getStudentOptionsForAudience, exportAudiences, exportAudiencesPdf
} from "../../../../services/thesis-seminar/audience.service.js";

describe("Thesis Seminar Audience Service (Full Suite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks to prevent crashes
    mockXlsx.utils.json_to_sheet.mockReturnValue({});
  });

  describe("getAudiences", () => {
    it("returns mapped list of audiences", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockAudienceRepo.findAudiencesBySeminarId.mockResolvedValue([
        { studentId: "st1", student: { user: { fullName: "A", identityNumber: "1" } }, supervisor: { lecturer: { user: { fullName: "S" } } } }
      ]);
      const res = await getAudiences("s1");
      expect(res).toHaveLength(1);
    });
  });

  describe("addAudience", () => {
    it("allows student self-registration", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockPrisma.thesisSeminar.findUnique.mockResolvedValue({ status: "scheduled", thesis: { student: { id: "owner" } } });
      mockAudienceRepo.findAudienceRegistration.mockResolvedValue(null);
      mockPrisma.student.findUnique.mockResolvedValue({ id: "st1", user: { id: "u1" } });
      mockOutlook.hasCalendarAccess.mockResolvedValue(false);

      const res = await addAudience("s1", {}, { studentId: "st1" });
      expect(res.message).toContain("Berhasil");
    });

    it("allows admin to add audience manually for archive", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockAudienceRepo.findAudienceByKey.mockResolvedValue(null);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "owner" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ id: "sup1" }]);

      await addAudience("s1", { studentId: "st1" }, { role: "admin" });
      expect(mockAudienceRepo.createAudience).toHaveBeenCalled();
    });
  });

  describe("updateAudience", () => {
    it("successfully toggles presence for past/ongoing seminar", async () => {
      const pastDate = new Date(); pastDate.setDate(pastDate.getDate() - 2);
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", date: pastDate });
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ thesis: { thesisSupervisors: [{ id: "sup1" }] } });
      mockAudienceRepo.findAudienceByKey.mockResolvedValue({ approvedAt: null });
      mockPrisma.student.findUnique.mockResolvedValue({ id: "st1", user: { id: "u1" } });
      mockCoreRepo.findSeminarById.mockResolvedValue({ student: { name: "P" } });

      const res = await updateAudience("s1", "st1", { action: "toggle_presence" }, { lecturerId: "l1" });
      expect(res.success).toBe(true);
    });

    it("approves audience registration", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockCoreRepo.findSeminarSupervisorRole.mockResolvedValue({ thesis: { thesisSupervisors: [{ id: "sup1" }] } });
      mockPrisma.student.findUnique.mockResolvedValue({ id: "st1", user: { id: "u1" } });
      mockCoreRepo.findSeminarById.mockResolvedValue({ student: { name: "P" } });

      await updateAudience("s1", "st1", { action: "approve" }, { lecturerId: "l1" });
      expect(mockAudienceRepo.approveAudience).toHaveBeenCalled();
    });
  });

  describe("removeAudience", () => {
    it("allows student to cancel their own registration", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockAudienceRepo.findAudienceRegistration.mockResolvedValue({ id: "r1" });
      await removeAudience("s1", "st1", { studentId: "st1" });
      expect(mockAudienceRepo.deleteAudienceRegistration).toHaveBeenCalled();
    });
  });

  describe("Options", () => {
    it("returns eligible students for manual addition", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockAudienceRepo.findStudentOptionsForAudience.mockResolvedValue([{ id: "st1", user: { fullName: "A" } }]);
      const res = await getStudentOptionsForAudience("s1");
      expect(res).toHaveLength(1);
    });
  });

  describe("Import/Export", () => {
    it("imports from excel successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", registeredAt: null });
      mockXlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { "S": {} } });
      mockXlsx.utils.sheet_to_json.mockReturnValue([{ "Nama Mahasiswa": "A", "NIM": "1" }]);
      mockCoreRepo.findStudentByNameOrNim.mockResolvedValue({ id: "st1" });
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "owner" });
      mockAudienceRepo.findAudienceByKey.mockResolvedValue(null);

      const res = await importAudiences("s1", { buffer: Buffer.from("test") });
      expect(res.successCount).toBe(1);
    });

    it("exports to excel successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockAudienceRepo.findAudiencesBySeminarId.mockResolvedValue([]);
      mockXlsx.write.mockReturnValue(Buffer.from("excel"));
      const res = await exportAudiences("s1");
      expect(res).toBeDefined();
    });

    it("exports to PDF successfully", async () => {
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "s1", thesis: { thesisSupervisors: [] } });
      mockAudienceRepo.findAudiencesBySeminarId.mockResolvedValue([]);
      mockPrisma.user.findFirst.mockResolvedValue({ fullName: "Kadep" });
      const res = await exportAudiencesPdf("s1");
      expect(res).toBeDefined();
    });
  });
});
