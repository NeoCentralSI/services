import { describe, it, expect, vi, beforeEach } from "vitest";
import * as service from "../../../../services/yudisium/participant.service.js";
import * as participantRepo from "../../../../repositories/yudisium/participant.repository.js";
import * as xlsx from "xlsx";

vi.mock("../../../../repositories/yudisium/participant.repository.js");
vi.mock("../../../../repositories/yudisium/requirement.repository.js");
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));
vi.mock("../../../../config/prisma.js", () => ({
  default: {
    yudisiumRequirementItem: { count: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../../../../utils/pdf.util.js", () => ({
  convertHtmlToPdf: vi.fn(),
}));

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
});
