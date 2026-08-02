import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDocRepo, mockCoreRepo, mockPrisma, mockFs, mockAcademicYear } = vi.hoisted(() => ({
  mockDocRepo: {
    findRequirementsByAcademicYear: vi.fn(),
    findRequirementForAcademicYear: vi.fn(),
    findSeminarDocument: vi.fn(),
    findSeminarDocuments: vi.fn(),
    upsertSeminarDocument: vi.fn(),
    verifyRequirementDocumentAtomic: vi.fn(),
  },
  mockCoreRepo: {
    findSeminarBasicById: vi.fn(),
    findUserIdsByRole: vi.fn().mockResolvedValue([]),
    getThesisWithSeminar: vi.fn(),
    createThesisSeminar: vi.fn(),
    countSeminarAttendance: vi.fn(),
  },
  mockPrisma: {
    student: { findUnique: vi.fn() },
    thesisGuidance: { count: vi.fn() },
    thesisSupervisors: { findMany: vi.fn() },
  },
  mockFs: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
  mockAcademicYear: {
    getActiveAcademicYear: vi.fn(),
    formatAcademicYearLabel: vi.fn(() => "Ganjil 2026"),
  },
}));

vi.mock("../../../../repositories/thesis-seminar/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../helpers/academicYear.helper.js", () => mockAcademicYear);
vi.mock("fs/promises", () => mockFs);
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  getDocuments,
  getRequirementsForOverview,
  uploadDocument,
  verifyDocument,
  viewDocument,
} from "../../../../services/thesis-seminar/doc.service.js";

const requirement = {
  id: "req-1",
  academicYearId: "ay-1",
  name: "Laporan Tugas Akhir",
  description: "Laporan final",
  displayOrder: 1,
};

const thesis = {
  id: "thesis-1",
  studentId: "student-1",
  academicYearId: "ay-1",
  student: { user: { id: "user-1", fullName: "Mahasiswa" } },
  thesisSeminars: [{ id: "seminar-1", status: "registered" }],
};

const pdfFile = () => ({
  originalname: "laporan.pdf",
  mimetype: "application/pdf",
  size: 14,
  buffer: Buffer.from("%PDF-1.4\nbody"),
});

const storedDocument = (overrides = {}) => ({
  thesisSeminarId: "seminar-1",
  thesisSeminarRequirementId: "req-1",
  filePath: "uploads/thesis/thesis-1/seminar/seminar-1/requirement-req-1.pdf",
  fileName: "laporan.pdf",
  mimeType: "application/pdf",
  fileSize: 14,
  status: "submitted",
  submittedAt: new Date(),
  verifiedAt: null,
  notes: null,
  verifier: null,
  requirement,
  ...overrides,
});

describe("Seminar requirement document service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoreRepo.findUserIdsByRole.mockResolvedValue([]);
    mockCoreRepo.getThesisWithSeminar.mockResolvedValue(thesis);
    mockAcademicYear.getActiveAcademicYear.mockResolvedValue({ id: "ay-current", semester: "ganjil", year: "2026" });
    mockDocRepo.findRequirementsByAcademicYear.mockResolvedValue([requirement]);
    mockDocRepo.findRequirementForAcademicYear.mockResolvedValue(requirement);
    mockDocRepo.findSeminarDocument.mockResolvedValue(null);
    mockDocRepo.upsertSeminarDocument.mockImplementation(async (_seminarId, _requirementId, data) =>
      storedDocument(data)
    );
  });

  it("maps dynamic requirements and their document for the overview", async () => {
    const document = storedDocument();
    const result = await getRequirementsForOverview(
      { academicYearId: "ay-old" },
      { status: "registered", requirementDocuments: [document] }
    );

    expect(result.requirementConfiguration.isConfigured).toBe(true);
    expect(mockDocRepo.findRequirementsByAcademicYear).toHaveBeenCalledWith("ay-current");
    expect(result.requirements[0].id).toBe("req-1");
    expect(result.requirements[0].document.fileName).toBe("laporan.pdf");
  });

  it("returns a clear configuration state when no current academic year exists", async () => {
    mockAcademicYear.getActiveAcademicYear.mockResolvedValueOnce(null);
    const result = await getRequirementsForOverview({ academicYearId: "ay-old" }, null);
    expect(result.requirementConfiguration.isConfigured).toBe(false);
    expect(result.requirementConfiguration.message).toContain("Tahun akademik");
  });

  it("returns current requirements and submitted documents", async () => {
    mockCoreRepo.findSeminarBasicById.mockResolvedValue({
      id: "seminar-1",
      status: "registered",
      thesis: { academicYearId: "ay-1" },
    });
    mockDocRepo.findSeminarDocuments.mockResolvedValue([storedDocument()]);

    const result = await getDocuments("seminar-1");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].document.status).toBe("submitted");
  });

  it("returns direct document metadata for viewing", async () => {
    mockDocRepo.findSeminarDocument.mockResolvedValue(storedDocument());
    const result = await viewDocument("seminar-1", "req-1");
    expect(result.fileName).toBe("laporan.pdf");
    expect(result.requirementId).toBe("req-1");
  });

  it("uploads into the selected student's registered seminar", async () => {
    mockCoreRepo.findSeminarBasicById.mockResolvedValue({
      id: "seminar-1",
      thesisId: "thesis-1",
      status: "registered",
      thesis: { studentId: "student-1", academicYearId: "ay-1" },
    });

    const result = await uploadDocument("seminar-1", "student-1", pdfFile(), "req-1");

    expect(result.status).toBe("submitted");
    expect(result.requirementId).toBe("req-1");
    expect(mockDocRepo.upsertSeminarDocument).toHaveBeenCalledWith(
      "seminar-1",
      "req-1",
      expect.objectContaining({ status: "submitted", verifiedBy: null, notes: null })
    );
  });

  it("auto-registers a new attempt on the first valid upload", async () => {
    mockCoreRepo.getThesisWithSeminar.mockResolvedValue({ ...thesis, thesisSeminars: [] });
    mockPrisma.student.findUnique.mockResolvedValue({ researchMethodCompleted: true });
    mockPrisma.thesisGuidance.count.mockResolvedValue(8);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(8);
    mockPrisma.thesisSupervisors.findMany.mockResolvedValue([{ seminarReady: true }]);
    mockCoreRepo.createThesisSeminar.mockResolvedValue({ id: "seminar-2", status: "registered" });
    mockDocRepo.upsertSeminarDocument.mockImplementation(async (_seminarId, _requirementId, data) =>
      storedDocument({ ...data, thesisSeminarId: "seminar-2" })
    );

    const result = await uploadDocument("active", "student-1", pdfFile(), "req-1");
    expect(result.thesisSeminarId).toBe("seminar-2");
    expect(mockCoreRepo.createThesisSeminar).toHaveBeenCalledWith("thesis-1");
  });

  it("rejects a fake PDF before creating an attempt", async () => {
    await expect(
      uploadDocument("active", "student-1", {
        ...pdfFile(),
        buffer: Buffer.from("not a pdf"),
      }, "req-1")
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCoreRepo.createThesisSeminar).not.toHaveBeenCalled();
  });

  it("locks an approved document from re-upload", async () => {
    mockCoreRepo.findSeminarBasicById.mockResolvedValue({
      id: "seminar-1",
      status: "registered",
      thesis: { studentId: "student-1", academicYearId: "ay-1" },
    });
    mockDocRepo.findSeminarDocument.mockResolvedValue(storedDocument({ status: "approved" }));
    await expect(
      uploadDocument("seminar-1", "student-1", pdfFile(), "req-1")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("approves atomically and returns the seminar transition", async () => {
    mockDocRepo.verifyRequirementDocumentAtomic.mockResolvedValue({
      kind: "ok",
      document: storedDocument({ status: "approved" }),
      requirement,
      studentUserId: "user-1",
      seminarTransitioned: true,
      newSeminarStatus: "verified",
    });

    const result = await verifyDocument("seminar-1", "req-1", {
      action: "approve",
      userId: "admin-1",
    });
    expect(mockDocRepo.verifyRequirementDocumentAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: "ay-current" })
    );
    expect(result).toMatchObject({
      requirementId: "req-1",
      status: "approved",
      seminarTransitioned: true,
      newSeminarStatus: "verified",
    });
  });

  it("requires a human-readable decline note", async () => {
    await expect(
      verifyDocument("seminar-1", "req-1", {
        action: "decline",
        notes: " ",
        userId: "admin-1",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: "Catatan wajib diisi saat dokumen ditolak." });
  });
});
