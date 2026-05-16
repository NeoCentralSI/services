import { describe, it, expect, vi, beforeEach } from "vitest";
import * as service from "../../../../services/yudisium/participant.service.js";
import * as participantRepo from "../../../../repositories/yudisium/participant.repository.js";
import * as xlsx from "xlsx";
import { mkdir, writeFile } from "fs/promises";
import { convertHtmlToPdf } from "../../../../utils/pdf.util.js";
import { createNotificationsForUsers } from "../../../../services/notification.service.js";
import { sendFcmToUsers } from "../../../../services/push.service.js";

vi.mock("../../../../repositories/yudisium/participant.repository.js");
vi.mock("../../../../repositories/yudisium/requirement.repository.js");
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../../config/prisma.js", () => ({
  default: {
    yudisium: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    yudisiumRequirementItem: { count: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../../../utils/pdf.util.js", () => ({
  convertHtmlToPdf: vi.fn(),
}));
vi.mock("../../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }),
}));

import prisma from "../../../../config/prisma.js";

const archiveYudisium = {
  id: "y1",
  name: "Arsip Yudisium",
  registrationOpenDate: null,
  registrationCloseDate: null,
  eventDate: new Date("2024-08-01T00:00:00.000Z"),
};

const activeYudisium = {
  ...archiveYudisium,
  registrationOpenDate: new Date("2026-07-01T00:00:00.000Z"),
  registrationCloseDate: new Date("2026-07-20T00:00:00.000Z"),
};

describe("Unit Test: Yudisium Participant Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    participantRepo.findVerificationContext?.mockResolvedValue?.(null);
    participantRepo.findUserIdsByRole?.mockResolvedValue?.([]);
  });

  describe("getArchiveParticipantOptions", () => {
    it("returns thesis options that can be added to archive yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      participantRepo.findAvailableThesesForArchiveParticipant.mockResolvedValue([
        {
          id: "thesis-2",
          title: "Judul B",
          student: { id: "student-2", user: { fullName: "Budi", identityNumber: "002" } },
        },
        {
          id: "thesis-1",
          title: "Judul A",
          student: { id: "student-1", user: { fullName: "Ayu", identityNumber: "001" } },
        },
      ]);

      const result = await service.getArchiveParticipantOptions("y1");

      expect(result).toEqual([
        {
          thesisId: "thesis-1",
          thesisTitle: "Judul A",
          studentId: "student-1",
          studentName: "Ayu",
          studentNim: "001",
        },
        {
          thesisId: "thesis-2",
          thesisTitle: "Judul B",
          studentId: "student-2",
          studentName: "Budi",
          studentNim: "002",
        },
      ]);
    });

    it("rejects manual participant options for active yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(activeYudisium);

      await expect(service.getArchiveParticipantOptions("y1")).rejects.toThrow(
        "Peserta manual hanya dapat dikelola pada yudisium arsip"
      );
    });
  });

  describe("addArchiveParticipant", () => {
    it("creates a finalized participant for archive yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      participantRepo.findThesisById.mockResolvedValue({
        id: "thesis-1",
        title: "Judul TA",
        student: { id: "student-1", user: { fullName: "Ayu", identityNumber: "001" } },
      });
      participantRepo.findByThesisAndYudisium.mockResolvedValue(null);
      participantRepo.createFinalizedForThesis.mockResolvedValue({
        id: "participant-1",
        thesisId: "thesis-1",
        yudisiumId: "y1",
        registeredAt: new Date("2026-05-16T00:00:00.000Z"),
        status: "finalized",
      });

      const result = await service.addArchiveParticipant("y1", { thesisId: "thesis-1" });

      expect(participantRepo.createFinalizedForThesis).toHaveBeenCalledWith("y1", "thesis-1");
      expect(result).toMatchObject({
        id: "participant-1",
        status: "finalized",
        thesisId: "thesis-1",
        studentName: "Ayu",
        studentNim: "001",
        thesisTitle: "Judul TA",
      });
    });

    it("rejects duplicate thesis in the same yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      participantRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      participantRepo.findByThesisAndYudisium.mockResolvedValue({ id: "participant-1" });

      await expect(service.addArchiveParticipant("y1", { thesisId: "thesis-1" })).rejects.toThrow(
        "Mahasiswa sudah terdaftar sebagai peserta yudisium ini"
      );
      expect(participantRepo.createFinalizedForThesis).not.toHaveBeenCalled();
    });
  });

  describe("importArchiveParticipants", () => {
    const importFile = { buffer: Buffer.from("xlsx") };

    beforeEach(() => {
      xlsx.read.mockReturnValue({ SheetNames: ["Peserta"], Sheets: { Peserta: {} } });
    });

    it("imports valid archive participants as finalized records", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      xlsx.utils.sheet_to_json.mockReturnValue([
        {
          No: 1,
          "Nama Mahasiswa": "Ayu",
          NIM: "001",
          "Judul Tugas Akhir": "Sistem Informasi Yudisium",
        },
      ]);
      participantRepo.findStudentWithThesesByNim.mockResolvedValue({
        id: "student-1",
        user: { fullName: "Ayu", identityNumber: "001" },
        thesis: [{ id: "thesis-1", title: "Sistem Informasi Yudisium" }],
      });
      participantRepo.findByThesisAndYudisium.mockResolvedValue(null);
      participantRepo.createFinalizedForThesis.mockResolvedValue({ id: "participant-1" });

      const result = await service.importArchiveParticipants("y1", importFile);

      expect(result).toMatchObject({ total: 1, successCount: 1, failed: 0, failedRows: [] });
      expect(participantRepo.createFinalizedForThesis).toHaveBeenCalledWith("y1", "thesis-1");
    });

    it("returns formatted failures for duplicate and invalid rows", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      xlsx.utils.sheet_to_json.mockReturnValue([
        {
          No: 1,
          "Nama Mahasiswa": "Ayu",
          NIM: "001",
          "Judul Tugas Akhir": "Sistem Informasi Yudisium",
        },
        {
          No: 2,
          "Nama Mahasiswa": "Ayu",
          NIM: "001",
          "Judul Tugas Akhir": "Sistem Informasi Yudisium",
        },
        {
          No: 3,
          "Nama Mahasiswa": "Budi",
          NIM: "002",
          "Judul Tugas Akhir": "Tidak Ada",
        },
      ]);
      participantRepo.findStudentWithThesesByNim
        .mockResolvedValueOnce({
          id: "student-1",
          user: { fullName: "Ayu", identityNumber: "001" },
          thesis: [{ id: "thesis-1", title: "Sistem Informasi Yudisium" }],
        })
        .mockResolvedValueOnce({
          id: "student-2",
          user: { fullName: "Budi", identityNumber: "002" },
          thesis: [],
        });
      participantRepo.findByThesisAndYudisium.mockResolvedValueOnce({ id: "existing-1" });

      const result = await service.importArchiveParticipants("y1", importFile);

      expect(result.successCount).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.failedRows).toEqual([
        { row: 2, error: "Mahasiswa Ayu sudah terdaftar sebagai peserta yudisium ini" },
        { row: 3, error: "NIM 001 duplikat pada file import" },
        { row: 4, error: "Mahasiswa Budi belum memiliki data Tugas Akhir di sistem" },
      ]);
    });

    it("rejects import for active yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(activeYudisium);

      await expect(service.importArchiveParticipants("y1", importFile)).rejects.toThrow(
        "Peserta manual hanya dapat dikelola pada yudisium arsip"
      );
    });
  });

  describe("removeArchiveParticipant", () => {
    it("removes participant from archive yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(archiveYudisium);
      participantRepo.findByIdAndYudisium.mockResolvedValue({
        id: "participant-1",
        yudisiumId: "y1",
        thesisId: "thesis-1",
        status: "finalized",
      });
      participantRepo.removeParticipant.mockResolvedValue({ id: "participant-1" });

      await expect(service.removeArchiveParticipant("y1", "participant-1")).resolves.toEqual({
        id: "participant-1",
      });
      expect(participantRepo.removeParticipant).toHaveBeenCalledWith("participant-1");
    });

    it("rejects participant removal for active yudisium", async () => {
      participantRepo.findYudisiumById.mockResolvedValue(activeYudisium);

      await expect(service.removeArchiveParticipant("y1", "participant-1")).rejects.toThrow(
        "Peserta manual hanya dapat dikelola pada yudisium arsip"
      );
      expect(participantRepo.removeParticipant).not.toHaveBeenCalled();
    });
  });

  describe("participant detail access", () => {
    const participantDetail = {
      id: "participant-1",
      status: "rejected",
      registeredAt: new Date("2026-05-01T00:00:00.000Z"),
      notes: null,
      yudisium: {
        id: "y1",
        name: "Yudisium Mei 2026",
        registrationOpenDate: new Date("2026-05-01T00:00:00.000Z"),
        registrationCloseDate: new Date("2026-05-31T00:00:00.000Z"),
        eventDate: new Date("2026-06-10T00:00:00.000Z"),
        appointedAt: null,
      },
      thesis: {
        title: "Judul TA",
        student: {
          id: "student-1",
          user: { fullName: "Ayu", identityNumber: "001" },
        },
        thesisSupervisors: [],
      },
      yudisiumParticipantRequirements: [],
    };

    it("allows a student to read their own historical participant detail", async () => {
      participantRepo.findDetailById.mockResolvedValue(participantDetail);
      prisma.yudisiumRequirementItem.findMany.mockResolvedValue([
        {
          id: "item-1",
          order: 1,
          yudisiumRequirement: { name: "Bebas Pustaka", description: "Surat bebas pustaka" },
        },
      ]);

      const result = await service.getParticipantDetail("participant-1", {
        studentId: "student-1",
        roles: ["Mahasiswa"],
      });

      expect(result.id).toBe("participant-1");
      expect(result.studentName).toBe("Ayu");
      expect(result.documents).toHaveLength(1);
    });

    it("blocks a student from reading another student's participant detail", async () => {
      participantRepo.findDetailById.mockResolvedValue(participantDetail);

      await expect(service.getParticipantDetail("participant-1", {
        studentId: "student-2",
        roles: ["Mahasiswa"],
      })).rejects.toThrow("Anda tidak memiliki akses ke data peserta yudisium ini");
      expect(prisma.yudisiumRequirementItem.findMany).not.toHaveBeenCalled();
    });

    it("allows a student to read their own CPL scores", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue({
        id: "participant-1",
        status: "rejected",
        thesis: { student: { id: "student-1" } },
      });
      participantRepo.findStudentCplScores.mockResolvedValue([
        {
          cplId: "cpl-1",
          score: 80,
          oldCplScore: null,
          status: "validated",
          recommendationDocument: null,
          settlementDocument: null,
          validatedAt: new Date("2026-05-10T00:00:00.000Z"),
          validator: { fullName: "Validator", identityNumber: "1988" },
          cpl: { code: "CPL-01", description: "Deskripsi CPL", minimalScore: 70 },
        },
      ]);

      const result = await service.getParticipantCplScores("participant-1", {
        studentId: "student-1",
        roles: ["Mahasiswa"],
      });

      expect(result.participantId).toBe("participant-1");
      expect(result.cplScores[0]).toMatchObject({
        code: "CPL-01",
        passed: true,
        validatedBy: "Validator",
      });
    });

    it("blocks a student from reading another student's CPL scores", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue({
        id: "participant-1",
        status: "rejected",
        thesis: { student: { id: "student-1" } },
      });

      await expect(service.getParticipantCplScores("participant-1", {
        studentId: "student-2",
        roles: ["Mahasiswa"],
      })).rejects.toThrow("Anda tidak memiliki akses ke data peserta yudisium ini");
      expect(participantRepo.findStudentCplScores).not.toHaveBeenCalled();
    });
  });

  describe("verifyParticipantDocument", () => {
    const verificationContext = {
      id: "participant-1",
      status: "registered",
      yudisiumId: "y1",
      yudisium: { id: "y1", name: "Yudisium Mei 2026" },
      thesis: {
        student: {
          id: "student-1",
          user: { id: "student-user-1", fullName: "Ayu", identityNumber: "001" },
        },
      },
      yudisiumParticipantRequirements: [
        {
          yudisiumRequirementItemId: "item-1",
          requirement: { yudisiumRequirement: { name: "Bebas Pustaka" } },
        },
      ],
    };

    beforeEach(() => {
      participantRepo.findStatusById.mockResolvedValue({
        id: "participant-1",
        status: "registered",
        yudisiumId: "y1",
      });
      participantRepo.findRequirementRecord.mockResolvedValue({
        yudisiumParticipantId: "participant-1",
        yudisiumRequirementItemId: "item-1",
        documentId: "doc-1",
        status: "submitted",
      });
      participantRepo.updateRequirementRecord.mockResolvedValue({});
      participantRepo.findVerificationContext.mockResolvedValue(verificationContext);
      participantRepo.listRequirementRecords.mockResolvedValue([
        { yudisiumRequirementItemId: "item-1", status: "submitted" },
        { yudisiumRequirementItemId: "item-2", status: "submitted" },
      ]);
      participantRepo.updateStatus.mockResolvedValue({});
      participantRepo.findUserIdsByRole.mockResolvedValue([]);
      prisma.yudisiumRequirementItem.count.mockResolvedValue(2);
    });

    it("notifies the student when a document is declined", async () => {
      const result = await service.verifyParticipantDocument("participant-1", "item-1", {
        action: "decline",
        notes: "File tidak sesuai",
        userId: "admin-1",
      });

      expect(result).toMatchObject({
        requirementId: "item-1",
        status: "declined",
        participantTransitioned: false,
      });
      expect(participantRepo.updateRequirementRecord).toHaveBeenCalledWith(
        "participant-1",
        "item-1",
        expect.objectContaining({
          status: "declined",
          notes: "File tidak sesuai",
          verifiedBy: "admin-1",
        })
      );
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({
          title: "Dokumen Yudisium Ditolak",
          message: expect.stringContaining("Catatan: File tidak sesuai"),
        })
      );
      expect(sendFcmToUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({
          data: expect.objectContaining({ type: "yudisium_doc_verified" }),
        })
      );
      expect(participantRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("transitions participant to verified and notifies student plus GKM when all documents are approved", async () => {
      participantRepo.listRequirementRecords.mockResolvedValue([
        { yudisiumRequirementItemId: "item-1", status: "submitted" },
        { yudisiumRequirementItemId: "item-2", status: "approved" },
      ]);
      participantRepo.findUserIdsByRole.mockResolvedValue(["gkm-1"]);

      const result = await service.verifyParticipantDocument("participant-1", "item-1", {
        action: "approve",
        userId: "admin-1",
      });

      expect(participantRepo.updateStatus).toHaveBeenCalledWith(
        "participant-1",
        "verified",
        { verifiedAt: expect.any(Date) }
      );
      expect(result).toMatchObject({
        status: "approved",
        participantTransitioned: true,
        newParticipantStatus: "verified",
      });
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({ title: "Dokumen Yudisium Disetujui" })
      );
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({ title: "Dokumen Yudisium Terverifikasi" })
      );
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["gkm-1"],
        expect.objectContaining({ title: "Validasi CPL Yudisium" })
      );
      expect(sendFcmToUsers).toHaveBeenCalledWith(
        ["gkm-1"],
        expect.objectContaining({
          data: expect.objectContaining({ type: "yudisium_need_cpl_validation" }),
        })
      );
    });
  });

  describe("CPL validation", () => {
    const verifiedParticipant = {
      id: "participant-1",
      yudisiumId: "y1",
      status: "verified",
      yudisium: { id: "y1", name: "Yudisium Mei 2026" },
      thesis: {
        student: {
          id: "student-1",
          user: { id: "student-user-1", fullName: "Ayu" },
        },
      },
    };

    it("rejects CPL validation before all documents are verified", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue({
        ...verifiedParticipant,
        status: "registered",
      });

      await expect(
        service.validateCplScore("participant-1", "cpl-1", "gkm-1")
      ).rejects.toThrow("Validasi CPL hanya dapat dilakukan setelah seluruh dokumen yudisium terverifikasi");

      expect(participantRepo.validateStudentCplScore).not.toHaveBeenCalled();
      expect(participantRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("validates a CPL without transitioning when other CPLs are still pending", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);
      participantRepo.findStudentCplScore.mockResolvedValue({
        cplId: "cpl-1",
        score: 80,
        status: "calculated",
      });
      participantRepo.validateStudentCplScore.mockResolvedValue({});
      participantRepo.findCplsActive.mockResolvedValue([
        { id: "cpl-1" },
        { id: "cpl-2" },
      ]);
      participantRepo.findStudentCplScores.mockResolvedValue([
        { cplId: "cpl-1", status: "validated" },
        { cplId: "cpl-2", status: "calculated" },
      ]);

      const result = await service.validateCplScore("participant-1", "cpl-1", "gkm-1");

      expect(participantRepo.validateStudentCplScore).toHaveBeenCalledWith(
        "student-1",
        "cpl-1",
        "gkm-1"
      );
      expect(result).toEqual({ cplId: "cpl-1", status: "validated", allCplValidated: false });
      expect(participantRepo.updateStatus).not.toHaveBeenCalled();
      expect(createNotificationsForUsers).not.toHaveBeenCalled();
    });

    it("transitions to cpl_validated when all student scores for active CPLs are validated", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);
      participantRepo.findStudentCplScore.mockResolvedValue({
        cplId: "cpl-1",
        score: 80,
        status: "calculated",
      });
      participantRepo.validateStudentCplScore.mockResolvedValue({});
      participantRepo.findCplsActive.mockResolvedValue([
        { id: "cpl-1" },
        { id: "cpl-2" },
        { id: "cpl-3" },
        { id: "cpl-4" },
        { id: "cpl-5" },
        { id: "cpl-6" },
        { id: "cpl-7" },
        { id: "cpl-8" },
      ]);
      participantRepo.findStudentCplScores.mockResolvedValue([
        { cplId: "cpl-1", status: "validated" },
        { cplId: "cpl-2", status: "validated" },
        { cplId: "cpl-3", status: "validated" },
      ]);
      participantRepo.updateStatus.mockResolvedValue({});

      const result = await service.validateCplScore("participant-1", "cpl-1", "gkm-1");

      expect(participantRepo.updateStatus).toHaveBeenCalledWith("participant-1", "cpl_validated");
      expect(result).toEqual({ cplId: "cpl-1", status: "validated", allCplValidated: true });
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({
          title: "CPL Yudisium Tervalidasi",
          message: expect.stringContaining("Yudisium Mei 2026"),
        })
      );
      expect(sendFcmToUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({
          data: expect.objectContaining({ type: "yudisium_cpl_validated" }),
        })
      );
    });

    it("rejects CPL repair before all documents are verified and does not write files", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue({
        ...verifiedParticipant,
        status: "registered",
      });

      await expect(
        service.saveCplRepairment("participant-1", "cpl-1", {
          newScore: 75,
          oldScore: 60,
          recommendationFile: { originalname: "rekomendasi.pdf", buffer: Buffer.from("pdf") },
          settlementFile: { originalname: "penyelesaian.pdf", buffer: Buffer.from("pdf") },
          userId: "gkm-1",
        })
      ).rejects.toThrow("Validasi CPL hanya dapat dilakukan setelah seluruh dokumen yudisium terverifikasi");

      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(participantRepo.saveCplRepairment).not.toHaveBeenCalled();
    });

    it("saves CPL repair as validated, transitions, and notifies the student when all CPLs are complete", async () => {
      participantRepo.findStudentByParticipant.mockResolvedValue(verifiedParticipant);
      participantRepo.findStudentCplScore.mockResolvedValue({
        cplId: "cpl-1",
        score: 60,
        status: "calculated",
      });
      participantRepo.findCplById.mockResolvedValue({ id: "cpl-1", minimalScore: 70 });
      participantRepo.createDocument
        .mockResolvedValueOnce({ id: "doc-rec" })
        .mockResolvedValueOnce({ id: "doc-set" });
      participantRepo.saveCplRepairment.mockResolvedValue({});
      participantRepo.findCplsActive.mockResolvedValue([{ id: "cpl-1" }]);
      participantRepo.findStudentCplScores.mockResolvedValue([{ cplId: "cpl-1", status: "validated" }]);
      participantRepo.updateStatus.mockResolvedValue({});

      const result = await service.saveCplRepairment("participant-1", "cpl-1", {
        newScore: 75,
        oldScore: 60,
        recommendationFile: { originalname: "rekomendasi.pdf", buffer: Buffer.from("pdf") },
        settlementFile: { originalname: "penyelesaian.pdf", buffer: Buffer.from("pdf") },
        userId: "gkm-1",
      });

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalledTimes(2);
      expect(participantRepo.saveCplRepairment).toHaveBeenCalledWith(
        "student-1",
        "cpl-1",
        expect.objectContaining({
          score: 75,
          oldCplScore: 60,
          recommendationDocumentId: "doc-rec",
          settlementDocumentId: "doc-set",
          verifiedBy: "gkm-1",
        })
      );
      expect(participantRepo.updateStatus).toHaveBeenCalledWith("participant-1", "cpl_validated");
      expect(result).toEqual({ cplId: "cpl-1", status: "validated", allCplValidated: true });
      expect(createNotificationsForUsers).toHaveBeenCalledWith(
        ["student-user-1"],
        expect.objectContaining({ title: "CPL Yudisium Tervalidasi" })
      );
    });
  });

  describe("exportParticipants", () => {
    it("generates official participant PDF layout with logo and legacy document sections", async () => {
      convertHtmlToPdf.mockResolvedValue(Buffer.from("pdf"));
      prisma.yudisium.findUnique.mockResolvedValue({
        id: "y1",
        name: "Yudisium Periode 5 TA 2025",
        eventDate: new Date("2026-05-16T03:00:00.000Z"),
        room: { name: "Ruang Seminar Departemen Sistem Informasi" },
        participants: [
          {
            status: "finalized",
            thesis: {
              title: "Judul Tugas Akhir Tidak Ditampilkan",
              student: {
                user: { fullName: "Budi", identityNumber: "002" },
              },
            },
          },
          {
            status: "appointed",
            thesis: {
              title: "Judul Tugas Akhir Tidak Ditampilkan",
              student: {
                user: { fullName: "Ayu", identityNumber: "001" },
              },
            },
          },
        ],
      });
      prisma.user.findUnique.mockResolvedValue({
        fullName: "Koordinator Yudisium",
        identityNumber: "1988000000000001",
      });
      prisma.user.findFirst.mockResolvedValue({
        fullName: "Ketua Departemen",
        identityNumber: "1977000000000001",
      });

      const result = await service.exportParticipants("y1", "user-1");

      expect(result).toEqual(Buffer.from("pdf"));
      expect(convertHtmlToPdf).toHaveBeenCalledTimes(1);
      const html = convertHtmlToPdf.mock.calls[0][0];

      expect(html).toContain("data:image/png;base64,");
      expect(html).toContain("Daftar Peserta Yudisium");
      expect(html).toContain("A. INFORMASI UMUM");
      expect(html).toContain("B. JADWAL PELAKSANAAN YUDISIUM");
      expect(html).toContain("C. DAFTAR MAHASISWA PESERTA YUDISIUM");
      expect(html).toContain("D. TANDA TANGAN KOORDINATOR YUDISIUM");
      expect(html).toContain("Jumlah Mahasiswa Lulus");
      expect(html).toContain("2</td>");
      expect(html).toContain("<th style=\"width: 105px;\">NIM</th>");
      expect(html).toContain("<th>Nama Mahasiswa</th>");
      expect(html).not.toContain("Judul Tugas Akhir</th>");
      expect(html).not.toContain("Dicetak melalui NeoCentral");

      const ayuIndex = html.indexOf("Ayu");
      const budiIndex = html.indexOf("Budi");
      expect(ayuIndex).toBeGreaterThan(-1);
      expect(budiIndex).toBeGreaterThan(ayuIndex);
    });

    it("throws 404 when exporting participants for missing yudisium", async () => {
      prisma.yudisium.findUnique.mockResolvedValue(null);

      await expect(service.exportParticipants("missing", "user-1")).rejects.toThrow(
        "Periode yudisium tidak ditemukan"
      );
      expect(convertHtmlToPdf).not.toHaveBeenCalled();
    });
  });
});
