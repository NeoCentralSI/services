import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDocRepo, mockCoreRepo, mockPrisma } = vi.hoisted(() => ({
  mockDocRepo: {
    findSeminarDocument: vi.fn(),
    findSeminarDocuments: vi.fn(),
    createSeminarDocument: vi.fn(),
    updateSeminarDocument: vi.fn(),
    updateDocumentStatus: vi.fn(),
    countDocumentsByStatus: vi.fn(),
    findDocumentWithFile: vi.fn(),
    getSeminarDocumentTypes: vi.fn(),
    getOrCreateDocumentType: vi.fn(),
    findDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    createDocument: vi.fn(),
  },
  mockCoreRepo: {
    findSeminarBasicById: vi.fn(),
    updateSeminar: vi.fn(),
    findThesisById: vi.fn(),
    findUserIdsByRole: vi.fn().mockResolvedValue([]),
    getThesisWithSeminar: vi.fn(),
    createThesisSeminar: vi.fn(),
    countSeminarAttendance: vi.fn(),
  },
  mockPrisma: {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    thesisGuidance: { count: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
  },
}));

vi.mock("../../../../repositories/thesis-seminar/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));

import { verifyDocument, uploadDocument, getDocuments, viewDocument } from "../../../../services/thesis-seminar/doc.service.js";

describe("Document Service (Full)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Fetching", () => {
    it("returns all documents for a seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1" });
      mockDocRepo.findSeminarDocuments.mockResolvedValue([]);
      const res = await getDocuments("s1");
      expect(res.documents).toBeDefined();
    });

    it("returns view metadata", async () => {
      mockDocRepo.findSeminarDocument.mockResolvedValue({ documentId: "d1", status: "submitted" });
      mockDocRepo.findDocumentById.mockResolvedValue({ fileName: "test.pdf" });
      const res = await viewDocument("s1", "dt1");
      expect(res.fileName).toBe("test.pdf");
    });
  });

  describe("Uploads", () => {
    it("uploads document to existing seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "registered", thesisId: "t1" });
      mockDocRepo.getOrCreateDocumentType.mockResolvedValue({ id: "dt1", name: "Laporan Tugas Akhir" });
      mockDocRepo.findSeminarDocument.mockResolvedValue(null);
      mockDocRepo.createDocument.mockResolvedValue({ id: "f1" });
      const res = await uploadDocument("s1", "st1", { originalname: "t.pdf", buffer: Buffer.from("t") }, "Laporan Tugas Akhir");
      expect(res.status).toBe("submitted");
    });

    it("handles auto-registration on first upload", async () => {
      mockCoreRepo.getThesisWithSeminar.mockResolvedValue({ id: "t1", studentId: "st1", thesisSeminars: [] });
      mockPrisma.student.findUnique.mockResolvedValue({ researchMethodCompleted: true });
      mockPrisma.thesisGuidance.count.mockResolvedValue(10);
      mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);
      mockPrisma.thesisSupervisors.findMany.mockResolvedValue([{ seminarReady: true }]);
      mockCoreRepo.createThesisSeminar.mockResolvedValue({ id: "s1", status: "registered" });
      mockDocRepo.getOrCreateDocumentType.mockResolvedValue({ id: "dt1", name: "Laporan Tugas Akhir" });
      mockDocRepo.createDocument.mockResolvedValue({ id: "f1" });

      const res = await uploadDocument(null, "st1", { originalname: "t.pdf", buffer: Buffer.from("t") }, "Laporan Tugas Akhir");
      expect(res.status).toBe("submitted");
    });
  });

  describe("Verification", () => {
    it("approves and transitions seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "registered", thesisId: "t1" });
      mockDocRepo.findDocumentWithFile.mockResolvedValue({ id: "f1" });
      mockDocRepo.getSeminarDocumentTypes.mockResolvedValue([{ id: "dt1", name: "Laporan Tugas Akhir" }]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "st1" });
      mockDocRepo.countDocumentsByStatus.mockResolvedValue([{ documentTypeId: "dt1", status: "submitted" }]);
      
      const res = await verifyDocument("s1", "dt1", { action: "approve", userId: "a1" });
      expect(res.status).toBe("approved");
      expect(res.seminarTransitioned).toBe(true);
    });

    it("declines a document", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "s1", status: "registered", thesisId: "t1" });
      mockDocRepo.findDocumentWithFile.mockResolvedValue({ id: "f1" });
      mockDocRepo.getSeminarDocumentTypes.mockResolvedValue([{ id: "dt1", name: "Laporan Tugas Akhir" }]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "st1" });
      const res = await verifyDocument("s1", "dt1", { action: "decline", notes: "N", userId: "a1" });
      expect(res.status).toBe("declined");
    });
  });
});
