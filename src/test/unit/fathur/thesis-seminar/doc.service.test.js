import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────
const {
  mockDocRepo,
  mockCoreRepo,
  mockPrisma,
} = vi.hoisted(() => ({
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
  },
  mockPrisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../../../repositories/thesis-seminar/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

// Mock dynamic imports for notification services
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));

import { verifyDocument, uploadDocument } from "../../../../services/thesis-seminar/doc.service.js";

describe("Thesis Seminar Document Service — Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyDocument", () => {
    const seminarId = "sem-1";
    const docTypeId = "dt-1";
    const adminUserId = "admin-1";

    it("approves a document and transitions seminar when all docs are approved", async () => {
      // Setup
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: seminarId, status: "registered", thesisId: "thesis-1" });
      mockDocRepo.findDocumentWithFile.mockResolvedValue({ documentId: "file-1" });
      mockDocRepo.getSeminarDocumentTypes.mockResolvedValue([{ id: "dt-1", name: "Laporan Tugas Akhir" }, { id: "dt-2", name: "Slide Presentasi" }]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "student-1" });
      
      // Mock counts: 1 is approved (the other one), this one is about to be approved
      mockDocRepo.countDocumentsByStatus.mockResolvedValue([
        { documentTypeId: "dt-2", status: "approved" },
        { documentTypeId: "dt-1", status: "submitted" } 
      ]);

      const result = await verifyDocument(seminarId, docTypeId, { action: "approve", userId: adminUserId });

      expect(result.status).toBe("approved");
      expect(result.seminarTransitioned).toBe(true);
      expect(mockCoreRepo.updateSeminar).toHaveBeenCalledWith(seminarId, expect.objectContaining({
        status: "verified",
        verifiedAt: expect.any(Date)
      }));
      expect(mockDocRepo.updateDocumentStatus).toHaveBeenCalledWith(seminarId, docTypeId, expect.objectContaining({
        status: "approved",
        verifiedBy: adminUserId
      }));
    });

    it("declines a document and does not transition seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: seminarId, status: "registered", thesisId: "thesis-1" });
      mockDocRepo.findDocumentWithFile.mockResolvedValue({ documentId: "file-1" });
      mockDocRepo.getSeminarDocumentTypes.mockResolvedValue([{ id: "dt-1", name: "Laporan Tugas Akhir" }]);
      mockCoreRepo.findThesisById.mockResolvedValue({ studentId: "student-1" });

      const result = await verifyDocument(seminarId, docTypeId, { action: "decline", notes: "Salah file", userId: adminUserId });

      expect(result.status).toBe("declined");
      expect(result.seminarTransitioned).toBe(false);
      expect(mockCoreRepo.updateSeminar).not.toHaveBeenCalled();
      expect(mockDocRepo.updateDocumentStatus).toHaveBeenCalledWith(seminarId, docTypeId, expect.objectContaining({
        status: "declined",
        notes: "Salah file"
      }));
    });

    it("throws 400 if action is invalid", async () => {
      await expect(verifyDocument(seminarId, docTypeId, { action: "invalid" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 if seminar is not in registered status", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: seminarId, status: "verified" });
      await expect(verifyDocument(seminarId, docTypeId, { action: "approve" }))
        .rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("uploadDocument — Reset Logic", () => {
    it("clears notes and resets status to submitted on re-upload", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "registered", thesisId: "thesis-1" });
      mockDocRepo.getSeminarDocumentTypes.mockResolvedValue([{ id: "dt-1", name: "Laporan Tugas Akhir" }]);
      mockDocRepo.getOrCreateDocumentType.mockResolvedValue({ id: "dt-1", name: "Laporan Tugas Akhir" });
      mockDocRepo.findSeminarDocument.mockResolvedValue({ status: "declined", notes: "Old notes" });
      mockDocRepo.createDocument.mockResolvedValue({ id: "new-file-id" });
      mockCoreRepo.findUserIdsByRole.mockResolvedValue([]);

      await uploadDocument("sem-1", "stu-1", { originalname: "test.pdf", buffer: Buffer.from(""), size: 100 }, "Laporan Tugas Akhir");

      expect(mockDocRepo.updateSeminarDocument).toHaveBeenCalledWith("sem-1", "dt-1", expect.objectContaining({
        status: "submitted",
        notes: null
      }));
    });
  });
});
