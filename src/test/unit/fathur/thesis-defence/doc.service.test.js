import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDocRepo, mockCoreRepo, mockPrisma, mockLecturerRepo } = vi.hoisted(() => ({
  mockDocRepo: {
    findDefenceDocument: vi.fn(),
    findDefenceDocuments: vi.fn(),
    upsertDefenceDocument: vi.fn(),
    findRequirementsByAcademicYear: vi.fn().mockResolvedValue([]),
    findRequirementForAcademicYear: vi.fn(),
    verifyRequirementDocumentAtomic: vi.fn(),
  },
  mockCoreRepo: {
    findDefenceBasicById: vi.fn(),
    updateDefence: vi.fn(),
    findThesisById: vi.fn(),
    findUserIdsByRole: vi.fn().mockResolvedValue([]),
    getStudentThesisWithDefenceInfo: vi.fn(),
    createThesisDefence: vi.fn(),
    countSeminarRevisions: vi.fn(),
  },
  mockPrisma: {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn(), findFirst: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
    academicYear: { findMany: vi.fn().mockResolvedValue([{ id: "ay1", name: "2025/2026 Ganjil", startDate: new Date(0), endDate: new Date(4102444800000) }]) },
  },
  mockLecturerRepo: {
    getStudentByUserId: vi.fn(),
  }
}));

vi.mock("../../../../repositories/thesis-defence/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../../../repositories/thesisGuidance/student.guidance.repository.js", () => ({ getStudentByUserId: mockLecturerRepo.getStudentByUserId }));
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

import { verifyDocument, uploadDocument, getDocuments, viewDocument } from "../../../../services/thesis-defence/doc.service.js";

describe("Defence Document Service (Full Alignment)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue({ id: "st1", userId: "u1" });
    mockPrisma.academicYear.findMany.mockResolvedValue([{ id: "ay1", name: "2025/2026 Ganjil", startDate: new Date(0), endDate: new Date(4102444800000) }]);
  });

  describe("Fetching", () => {
    it("returns all requirements and documents for a defence", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", status: "registered" });
      mockDocRepo.findDefenceDocuments.mockResolvedValue([]);
      mockDocRepo.findRequirementsByAcademicYear.mockResolvedValue([{ id: "req1", name: "Laporan TA" }]);
      const res = await getDocuments("d1");
      expect(res.requirements).toBeDefined();
    });

    it("returns view document metadata", async () => {
      mockDocRepo.findDefenceDocument.mockResolvedValue({
        thesisDefenceId: "d1",
        thesisDefenceRequirementId: "req1",
        status: "submitted",
        fileName: "t.pdf",
      });
      const res = await viewDocument("d1", "req1");
      expect(res.fileName).toBe("t.pdf");
    });
  });

  describe("Uploads", () => {
    it("uploads document to existing defence", async () => {
      mockDocRepo.findRequirementForAcademicYear.mockResolvedValue({ id: "req1", name: "Laporan TA" });
      mockDocRepo.findRequirementsByAcademicYear.mockResolvedValue([{ id: "req1", name: "Laporan TA" }]);
      mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue({ id: "t1", studentId: "st1" });
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", status: "registered", thesisId: "t1", thesis: { studentId: "st1" } });
      mockDocRepo.findDefenceDocument.mockResolvedValue(null);
      mockDocRepo.upsertDefenceDocument.mockResolvedValue({
        thesisDefenceId: "d1",
        thesisDefenceRequirementId: "req1",
        status: "submitted",
        fileName: "t.pdf",
      });

      const pdfBuf = Buffer.from("%PDF-1.4\nfake pdf content");
      const res = await uploadDocument("d1", "u1", { originalname: "t.pdf", mimetype: "application/pdf", buffer: pdfBuf, size: pdfBuf.length }, "req1");
      expect(res.status).toBe("submitted");
    });

    it("handles auto-registration on first upload with requirements check", async () => {
      mockDocRepo.findRequirementForAcademicYear.mockResolvedValue({ id: "req1", name: "Laporan TA" });
      mockDocRepo.findRequirementsByAcademicYear.mockResolvedValue([{ id: "req1", name: "Laporan TA" }]);
      mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue({
        id: "t1", studentId: "st1",
        thesisSeminars: [{ id: "sem1", status: "passed" }],
        thesisSupervisors: [{ defenceReady: true }]
      });
      mockPrisma.student.findUnique.mockResolvedValue({ sksCompleted: 144 });
      mockCoreRepo.createThesisDefence.mockResolvedValue({ id: "d1", status: "registered" });
      mockDocRepo.upsertDefenceDocument.mockResolvedValue({
        thesisDefenceId: "d1",
        thesisDefenceRequirementId: "req1",
        status: "submitted",
        fileName: "t.pdf",
      });

      const pdfBuf = Buffer.from("%PDF-1.4\nfake pdf content");
      const res = await uploadDocument(null, "u1", { originalname: "t.pdf", mimetype: "application/pdf", buffer: pdfBuf, size: pdfBuf.length }, "req1");
      expect(res.status).toBe("submitted");
    });

    it("throws error if requirements not met", async () => {
      mockDocRepo.findRequirementForAcademicYear.mockResolvedValue({ id: "req1", name: "Laporan TA" });
      mockDocRepo.findRequirementsByAcademicYear.mockResolvedValue([{ id: "req1", name: "Laporan TA" }]);
      mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue({
        id: "t1", studentId: "st1",
        thesisSeminars: [], // No passed seminar
      });
      mockPrisma.student.findUnique.mockResolvedValue({ sksCompleted: 120 });

      const pdfBuf = Buffer.from("%PDF-1.4\nfake pdf content");
      await expect(uploadDocument(null, "u1", { originalname: "t.pdf", mimetype: "application/pdf", buffer: pdfBuf, size: pdfBuf.length }, "req1"))
        .rejects.toThrow("Lengkapi seluruh checklist persyaratan sebelum mengunggah dokumen sidang.");
    });
  });

  describe("Verification", () => {
    it("approves and transitions defence to verified when all docs approved", async () => {
      mockDocRepo.verifyRequirementDocumentAtomic.mockResolvedValue({
        kind: "ok",
        document: { status: "approved" },
        requirement: { name: "Laporan TA" },
        studentUserId: "u1",
        defenceTransitioned: true,
        newDefenceStatus: "verified",
      });

      const res = await verifyDocument("d1", "req1", { action: "approve", userId: "admin1" });
      expect(res.status).toBe("approved");
      expect(res.defenceTransitioned).toBe(true);
      expect(res.newDefenceStatus).toBe("verified");
    });

    it("declines a document with notes", async () => {
      mockDocRepo.verifyRequirementDocumentAtomic.mockResolvedValue({
        kind: "ok",
        document: { status: "declined" },
        requirement: { name: "Laporan TA" },
        studentUserId: "u1",
        defenceTransitioned: false,
        newDefenceStatus: "registered",
      });

      const res = await verifyDocument("d1", "req1", { action: "decline", notes: "Perbaiki format", userId: "admin1" });
      expect(res.status).toBe("declined");
    });
  });
});
