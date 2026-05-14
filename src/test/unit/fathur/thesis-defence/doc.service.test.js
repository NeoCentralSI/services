import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDocRepo, mockCoreRepo, mockPrisma, mockLecturerRepo } = vi.hoisted(() => ({
  mockDocRepo: {
    findDefenceDocument: vi.fn(),
    findDefenceDocuments: vi.fn(),
    upsertDefenceDocument: vi.fn(),
    updateDefenceDocumentStatus: vi.fn(),
    countDefenceDocumentsByStatus: vi.fn(),
    findDefenceDocumentWithFile: vi.fn(),
    getDefenceDocumentTypes: vi.fn(),
    ensureDefenceDocumentTypes: vi.fn(),
    findDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    createDocument: vi.fn(),
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
    student: { findUnique: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
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
  });

  describe("Fetching", () => {
    it("returns all documents for a defence", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1" });
      mockDocRepo.findDefenceDocuments.mockResolvedValue([]);
      const res = await getDocuments("d1");
      expect(res.documents).toBeDefined();
    });

    it("returns view metadata", async () => {
      mockDocRepo.findDefenceDocumentWithFile.mockResolvedValue({ 
        documentId: "f1", status: "submitted", document: { fileName: "t.pdf" } 
      });
      const res = await viewDocument("d1", "dt1");
      expect(res.fileName).toBe("t.pdf");
    });
  });

  describe("Uploads", () => {
    it("uploads document to existing defence", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", status: "registered", thesisId: "t1" });
      mockDocRepo.ensureDefenceDocumentTypes.mockResolvedValue({ "Laporan Tugas Akhir": { id: "dt1" } });
      mockDocRepo.findDefenceDocument.mockResolvedValue(null);
      mockDocRepo.createDocument.mockResolvedValue({ id: "f1" });
      
      const res = await uploadDocument("d1", "u1", { originalname: "t.pdf", buffer: Buffer.from("t") }, "Laporan Tugas Akhir");
      expect(res.status).toBe("submitted");
    });

    it("handles auto-registration on first upload with requirements check", async () => {
      mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue({ 
        id: "t1", studentId: "st1", 
        thesisSeminars: [{ id: "sem1", status: "passed" }],
        thesisSupervisors: [{ defenceReady: true }]
      });
      mockPrisma.student.findUnique.mockResolvedValue({ skscompleted: 144 });
      mockCoreRepo.createThesisDefence.mockResolvedValue({ id: "d1", status: "registered" });
      mockDocRepo.ensureDefenceDocumentTypes.mockResolvedValue({ "Laporan Tugas Akhir": { id: "dt1" } });
      mockDocRepo.createDocument.mockResolvedValue({ id: "f1" });

      const res = await uploadDocument(null, "u1", { originalname: "t.pdf", buffer: Buffer.from("t") }, "Laporan Tugas Akhir");
      expect(res.status).toBe("submitted");
    });

    it("throws error if requirements not met", async () => {
      mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue({ 
        id: "t1", studentId: "st1", 
        thesisSeminars: [], // No passed seminar
      });
      mockPrisma.student.findUnique.mockResolvedValue({ skscompleted: 120 });

      await expect(uploadDocument(null, "u1", { originalname: "t.pdf", buffer: Buffer.from("t") }, "Laporan Tugas Akhir"))
        .rejects.toThrow("Anda belum memenuhi persyaratan pendaftaran sidang tugas akhir.");
    });
  });

  describe("Verification", () => {
    it("approves and transitions defence to verified when all docs approved", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", status: "registered", thesisId: "t1" });
      mockDocRepo.findDefenceDocumentWithFile.mockResolvedValue({ id: "f1" });
      mockDocRepo.ensureDefenceDocumentTypes.mockResolvedValue({ "Laporan Tugas Akhir": { id: "dt1" } });
      mockDocRepo.getDefenceDocumentTypes.mockResolvedValue([{ id: "dt1", name: "Laporan Tugas Akhir" }]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "st1" });
      mockPrisma.student.findUnique.mockResolvedValue({ userId: "u1" });
      mockDocRepo.countDefenceDocumentsByStatus.mockResolvedValue([{ documentTypeId: "dt1", status: "submitted" }]);
      
      const res = await verifyDocument("d1", "dt1", { action: "approve", userId: "admin1" });
      expect(res.status).toBe("approved");
      expect(res.defenceTransitioned).toBe(true);
      expect(mockCoreRepo.updateDefence).toHaveBeenCalledWith("d1", expect.objectContaining({ status: "verified" }));
    });

    it("declines a document and notifies student", async () => {
      mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", status: "registered", thesisId: "t1" });
      mockDocRepo.findDefenceDocumentWithFile.mockResolvedValue({ id: "f1" });
      mockDocRepo.ensureDefenceDocumentTypes.mockResolvedValue({ "Laporan Tugas Akhir": { id: "dt1" } });
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "st1" });
      mockPrisma.student.findUnique.mockResolvedValue({ userId: "u1" });

      const res = await verifyDocument("d1", "dt1", { action: "decline", notes: "Please fix", userId: "admin1" });
      expect(res.status).toBe("declined");
    });
  });
});
