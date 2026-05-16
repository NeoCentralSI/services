import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockPrisma,
  mockParticipantRepo,
  mockRequirementRepo,
  mockFs,
  mockNotificationService,
  mockPushService,
} = vi.hoisted(() => ({
  mockPrisma: {
    document: { findUnique: vi.fn(), delete: vi.fn() },
    student: { findUnique: vi.fn() },
    yudisium: { findFirst: vi.fn() },
    yudisiumParticipant: { findFirst: vi.fn(), findMany: vi.fn() },
    yudisiumRequirement: { findMany: vi.fn(), findUnique: vi.fn() },
    studentExitSurveyResponse: { findFirst: vi.fn() },
  },
  mockParticipantRepo: {
    findCplsActive: vi.fn(),
    findStudentCplScores: vi.fn(),
    findByThesisAndYudisium: vi.fn(),
    createForThesis: vi.fn(),
    findRequirementRecord: vi.fn(),
    createDocument: vi.fn(),
    upsertRequirementRecord: vi.fn(),
    findUserIdsByRole: vi.fn(),
  },
  mockRequirementRepo: {
    findAll: vi.fn(),
  },
  mockFs: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  },
  mockNotificationService: {
    createNotificationsForUsers: vi.fn(),
  },
  mockPushService: {
    sendFcmToUsers: vi.fn(),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/yudisium/participant.repository.js", () => mockParticipantRepo);
vi.mock("../../../../repositories/yudisium/requirement.repository.js", () => mockRequirementRepo);
vi.mock("fs/promises", () => mockFs);
vi.mock("../../../../services/notification.service.js", () => mockNotificationService);
vi.mock("../../../../services/push.service.js", () => mockPushService);

import * as service from "../../../../services/yudisium/student.service.js";

const makeStudent = (overrides = {}) => ({
  id: "student-1",
  skscompleted: 150,
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: true,
  user: { fullName: "Mahasiswa Test", identityNumber: "2011520001" },
  thesis: [
    {
      id: "thesis-1",
      title: "Sistem Informasi Yudisium",
      thesisDefences: [
        {
          id: "defence-1",
          status: "passed",
          revisionFinalizedAt: null,
          revisionFinalizedBy: null,
        },
      ],
    },
  ],
  ...overrides,
});

const makeYudisium = (overrides = {}) => ({
  id: "yudisium-1",
  name: "Yudisium Mei 2026",
  registrationOpenDate: new Date("2026-05-01T00:00:00.000Z"),
  registrationCloseDate: new Date("2026-05-31T23:59:59.000Z"),
  eventDate: new Date("2026-06-10T02:00:00.000Z"),
  documentId: null,
  document: null,
  exitSurveyForm: { id: "form-1", name: "Exit Survey" },
  requirementItems: [{ id: "item-1", yudisiumRequirementId: "req-1" }],
  ...overrides,
});

describe("Unit Test: Yudisium Student Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T00:00:00.000Z"));

    mockPrisma.student.findUnique.mockResolvedValue(makeStudent());
    mockPrisma.yudisiumParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.yudisiumParticipant.findMany.mockResolvedValue([]);
    mockPrisma.yudisium.findFirst.mockResolvedValue(makeYudisium());
    mockPrisma.yudisiumRequirement.findMany.mockResolvedValue([
      { id: "req-1", name: "Bebas Pustaka", description: "Surat bebas pustaka" },
    ]);
    mockPrisma.yudisiumRequirement.findUnique.mockResolvedValue({
      id: "req-1",
      name: "Bebas Pustaka",
      description: "Surat bebas pustaka",
    });
    mockPrisma.studentExitSurveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.document.findUnique.mockResolvedValue(null);
    mockPrisma.document.delete.mockResolvedValue({});
    mockParticipantRepo.findCplsActive.mockResolvedValue([]);
    mockParticipantRepo.findStudentCplScores.mockResolvedValue([]);
    mockParticipantRepo.findByThesisAndYudisium.mockResolvedValue({
      id: "participant-1",
      yudisiumId: "yudisium-1",
      thesisId: "thesis-1",
      status: "registered",
    });
    mockParticipantRepo.createForThesis.mockResolvedValue({
      id: "participant-1",
      yudisiumId: "yudisium-1",
      thesisId: "thesis-1",
      status: "registered",
    });
    mockParticipantRepo.findRequirementRecord.mockResolvedValue(null);
    mockParticipantRepo.createDocument.mockResolvedValue({ id: "document-1" });
    mockParticipantRepo.upsertRequirementRecord.mockResolvedValue({});
    mockParticipantRepo.findUserIdsByRole.mockResolvedValue([]);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockNotificationService.createNotificationsForUsers.mockResolvedValue({ count: 1 });
    mockPushService.sendFcmToUsers.mockResolvedValue({ success: true });
    mockRequirementRepo.findAll.mockResolvedValue([
      { id: "req-1", name: "Bebas Pustaka", description: "Surat bebas pustaka" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getOverview", () => {
    it("returns a waiting state when there is no open yudisium period", async () => {
      mockPrisma.student.findUnique.mockResolvedValue(makeStudent({ thesis: [] }));
      mockPrisma.yudisium.findFirst.mockResolvedValue(null);
      mockPrisma.yudisiumRequirement.findMany.mockResolvedValue([]);

      const result = await service.getOverview("student-user-1");

      expect(result.yudisium).toBeNull();
      expect(result.thesis).toBeNull();
      expect(result.checklist.exitSurvey.met).toBe(false);
      expect(result.checklist.exitSurvey.isAvailable).toBe(false);
      expect(result.allChecklistMet).toBe(false);
    });

    it("marks exit survey available only while registration is open", async () => {
      const result = await service.getOverview("student-user-1");

      expect(result.yudisium.status).toBe("open");
      expect(result.checklist.exitSurvey.isAvailable).toBe(true);
    });

    it("keeps exit survey unavailable until all academic requirements are met", async () => {
      mockPrisma.student.findUnique.mockResolvedValue(makeStudent({ kknCompleted: false }));

      const result = await service.getOverview("student-user-1");

      expect(result.yudisium.status).toBe("open");
      expect(result.checklist.mataKuliahKkn.met).toBe(false);
      expect(result.checklist.exitSurvey.isAvailable).toBe(false);
      expect(result.allChecklistMet).toBe(false);
    });

    it("keeps exit survey unavailable when the current participant is in a closed period", async () => {
      mockPrisma.yudisiumParticipant.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          yudisium: makeYudisium({
            registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
            registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          }),
        });
      mockPrisma.yudisiumParticipant.findMany.mockResolvedValue([
        {
          id: "participant-1",
          status: "registered",
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          yudisium: makeYudisium({
            registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
            registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          }),
          yudisiumParticipantRequirements: [],
        },
      ]);

      const result = await service.getOverview("student-user-1");

      expect(result.yudisium.status).toBe("closed");
      expect(result.participantStatus).toBe("registered");
      expect(result.checklist.exitSurvey.isAvailable).toBe(false);
    });

    it("keeps showing the finalized yudisium when a passed student has a newer open period available", async () => {
      const finalizedYudisium = makeYudisium({
        id: "yudisium-finalized",
        name: "Yudisium Lulus 2025",
        registrationOpenDate: new Date("2025-04-01T00:00:00.000Z"),
        registrationCloseDate: new Date("2025-04-30T23:59:59.000Z"),
        eventDate: new Date("2025-05-10T02:00:00.000Z"),
      });
      mockPrisma.yudisiumParticipant.findFirst.mockResolvedValueOnce({
        yudisium: finalizedYudisium,
      });
      mockPrisma.yudisiumParticipant.findMany.mockResolvedValue([
        {
          id: "participant-finalized",
          status: "finalized",
          createdAt: new Date("2025-04-10T00:00:00.000Z"),
          yudisium: finalizedYudisium,
          yudisiumParticipantRequirements: [],
        },
      ]);
      mockPrisma.studentExitSurveyResponse.findFirst.mockResolvedValue({
        id: "response-finalized",
        submittedAt: new Date("2025-04-15T00:00:00.000Z"),
      });

      const result = await service.getOverview("student-user-1");

      expect(mockPrisma.yudisium.findFirst).not.toHaveBeenCalled();
      expect(result.yudisium.id).toBe("yudisium-finalized");
      expect(result.yudisium.status).toBe("completed");
      expect(result.participantStatus).toBe("finalized");
      expect(result.checklist.exitSurvey.met).toBe(true);
      expect(result.checklist.exitSurvey.isAvailable).toBe(false);
      expect(result.allChecklistMet).toBe(true);
    });

    it("falls back to a new open yudisium when previous attempts are all rejected", async () => {
      const rejectedYudisium = makeYudisium({
        id: "yudisium-rejected",
        name: "Yudisium Gagal 2025",
        registrationOpenDate: new Date("2025-04-01T00:00:00.000Z"),
        registrationCloseDate: new Date("2025-04-30T23:59:59.000Z"),
        eventDate: new Date("2025-05-10T02:00:00.000Z"),
      });
      const openYudisium = makeYudisium({
        id: "yudisium-open",
        name: "Yudisium Baru 2026",
      });
      mockPrisma.yudisiumParticipant.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.yudisium.findFirst.mockResolvedValue(openYudisium);
      mockPrisma.yudisiumParticipant.findMany.mockResolvedValue([
        {
          id: "participant-rejected",
          status: "rejected",
          createdAt: new Date("2025-04-10T00:00:00.000Z"),
          yudisium: rejectedYudisium,
          yudisiumParticipantRequirements: [],
        },
      ]);

      const result = await service.getOverview("student-user-1");

      expect(result.yudisium.id).toBe("yudisium-open");
      expect(result.yudisium.status).toBe("open");
      expect(result.participantStatus).toBeNull();
      expect(result.history).toHaveLength(1);
      expect(result.checklist.exitSurvey.isAvailable).toBe(true);
    });

    it("maps CPL validation metadata for the frontend table and CPL report", async () => {
      mockParticipantRepo.findCplsActive.mockResolvedValue([{ id: "cpl-1" }]);
      mockParticipantRepo.findStudentCplScores.mockResolvedValue([
        {
          cplId: "cpl-1",
          score: 85,
          status: "validated",
          validatedAt: new Date("2026-05-15T03:00:00.000Z"),
          validator: { fullName: "Koordinator CPL", identityNumber: "19800101" },
          cpl: {
            id: "cpl-1",
            code: "CPL-01",
            description: "Mampu menganalisis kebutuhan sistem informasi",
            minimalScore: 70,
          },
        },
      ]);

      const result = await service.getOverview("student-user-1");

      expect(result.allCplVerified).toBe(true);
      expect(result.cplScores[0]).toEqual(expect.objectContaining({
        code: "CPL-01",
        passed: true,
        validatedBy: "Koordinator CPL",
        validatedByNip: "19800101",
        verifiedBy: "Koordinator CPL",
        verifiedByNip: "19800101",
      }));
    });
  });

  describe("uploadOwnDocument", () => {
    it("returns uploaded documents from the finalized yudisium period", async () => {
      const finalizedYudisium = makeYudisium({
        id: "yudisium-finalized",
        name: "Yudisium Lulus 2025",
        registrationOpenDate: new Date("2025-04-01T00:00:00.000Z"),
        registrationCloseDate: new Date("2025-04-30T23:59:59.000Z"),
        eventDate: new Date("2025-05-10T02:00:00.000Z"),
      });
      mockPrisma.yudisiumParticipant.findFirst
        .mockResolvedValueOnce({
          yudisium: finalizedYudisium,
        })
        .mockResolvedValueOnce({
          id: "participant-finalized",
          status: "finalized",
          yudisiumParticipantRequirements: [
            {
              yudisiumRequirementItemId: "item-1",
              status: "approved",
              submittedAt: new Date("2025-04-12T00:00:00.000Z"),
              verifiedAt: new Date("2025-04-13T00:00:00.000Z"),
              notes: null,
              documentId: "doc-1",
              document: {
                id: "doc-1",
                fileName: "bebas-pustaka.pdf",
                filePath: "uploads/yudisium/yudisium-finalized/participant-finalized/bebas-pustaka.pdf",
              },
            },
          ],
        });

      const result = await service.getOwnRequirements("student-user-1");

      expect(result.yudisiumId).toBe("yudisium-finalized");
      expect(result.participantId).toBe("participant-finalized");
      expect(result.participantStatus).toBe("finalized");
      expect(result.requirements[0]).toEqual(expect.objectContaining({
        id: "req-1",
        name: "Bebas Pustaka",
        status: "approved",
        document: {
          id: "doc-1",
          fileName: "bebas-pustaka.pdf",
          filePath: "uploads/yudisium/yudisium-finalized/participant-finalized/bebas-pustaka.pdf",
        },
      }));
    });

    it("rejects document upload when the current yudisium registration is closed", async () => {
      mockPrisma.yudisiumParticipant.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          yudisium: makeYudisium({
            registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
            registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          }),
        });

      await expect(service.uploadOwnDocument(
        "student-user-1",
        { originalname: "dokumen.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      )).rejects.toThrow("Upload dokumen hanya dapat dilakukan saat pendaftaran yudisium dibuka");

      expect(mockPrisma.yudisiumRequirement.findUnique).not.toHaveBeenCalled();
      expect(mockParticipantRepo.createDocument).not.toHaveBeenCalled();
    });

    it("rejects document upload until academic requirements and exit survey are complete", async () => {
      mockPrisma.student.findUnique.mockResolvedValue(makeStudent({ kknCompleted: false }));

      await expect(service.uploadOwnDocument(
        "student-user-1",
        { originalname: "dokumen.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      )).rejects.toThrow("Upload dokumen hanya dapat dilakukan setelah seluruh persyaratan akademik terpenuhi");

      mockPrisma.student.findUnique.mockResolvedValue(makeStudent());
      mockPrisma.studentExitSurveyResponse.findFirst.mockResolvedValue(null);

      await expect(service.uploadOwnDocument(
        "student-user-1",
        { originalname: "dokumen.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      )).rejects.toThrow("Upload dokumen hanya dapat dilakukan setelah exit survey diisi");
      expect(mockParticipantRepo.createDocument).not.toHaveBeenCalled();
    });

    it("uploads a yudisium requirement document and notifies admins", async () => {
      mockPrisma.studentExitSurveyResponse.findFirst.mockResolvedValue({ id: "response-1" });
      mockParticipantRepo.findByThesisAndYudisium.mockResolvedValue(null);
      mockParticipantRepo.findUserIdsByRole.mockResolvedValue(["admin-1"]);

      const result = await service.uploadOwnDocument(
        "student-user-1",
        { originalname: "bebas-pustaka.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      );

      expect(mockParticipantRepo.createForThesis).toHaveBeenCalledWith("yudisium-1", "thesis-1");
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockParticipantRepo.upsertRequirementRecord).toHaveBeenCalledWith("participant-1", "item-1", {
        documentId: "document-1",
      });
      expect(mockNotificationService.createNotificationsForUsers).toHaveBeenCalledWith(
        ["admin-1"],
        expect.objectContaining({ title: "Dokumen Yudisium Baru" })
      );
      expect(mockPushService.sendFcmToUsers).toHaveBeenCalledWith(
        ["admin-1"],
        expect.objectContaining({
          data: expect.objectContaining({ type: "yudisium_doc_upload" }),
        })
      );
      expect(result).toMatchObject({
        documentId: "document-1",
        requirementId: "req-1",
        fileName: "bebas-pustaka.pdf",
        status: "submitted",
      });
    });

    it("allows re-upload for submitted or declined documents but blocks approved documents", async () => {
      mockPrisma.studentExitSurveyResponse.findFirst.mockResolvedValue({ id: "response-1" });
      mockParticipantRepo.findRequirementRecord.mockResolvedValueOnce({
        documentId: "old-doc-1",
        status: "declined",
      });
      mockPrisma.document.findUnique.mockResolvedValue({ filePath: "uploads/yudisium/old.pdf" });

      await service.uploadOwnDocument(
        "student-user-1",
        { originalname: "dokumen-baru.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      );

      expect(mockFs.unlink).toHaveBeenCalled();
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: "old-doc-1" } });
      expect(mockParticipantRepo.upsertRequirementRecord).toHaveBeenCalled();

      mockParticipantRepo.findRequirementRecord.mockResolvedValueOnce({
        documentId: "approved-doc",
        status: "approved",
      });

      await expect(service.uploadOwnDocument(
        "student-user-1",
        { originalname: "dokumen-baru.pdf", buffer: Buffer.from("pdf") },
        "req-1"
      )).rejects.toThrow("Dokumen ini sudah diverifikasi dan tidak dapat diubah");
    });
  });
});
