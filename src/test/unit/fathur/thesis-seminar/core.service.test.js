import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma, mockCoreRepo, mockXlsx } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminar: { findFirst: vi.fn() },
  },
  mockCoreRepo: {
    findThesisById: vi.fn(),
    findRoomById: vi.fn(),
    findSeminarByThesisId: vi.fn(),
    findSeminarByThesisIdExcludingId: vi.fn(),
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    createSeminarWithExaminers: vi.fn(),
    updateSeminarWithExaminers: vi.fn(),
    deleteSeminar: vi.fn(),
    findSupervisorsByThesisId: vi.fn(),
    findStudentByNim: vi.fn(),
    findActiveThesisByStudentId: vi.fn(),
    findRoomByNameLike: vi.fn(),
    findLecturerByNameLike: vi.fn(),
    updateSeminar: vi.fn(),
  },
  mockXlsx: {
    read: vi.fn(),
    utils: {
      sheet_to_json: vi.fn(),
    },
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("xlsx", () => mockXlsx);

import {
  createArchive,
  updateArchive,
  deleteArchive,
  importArchive,
  cancelSeminar,
} from "../../../../services/thesis-seminar/core.service.js";

describe("Thesis Seminar Core Service (Archive Logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createArchive (Manual)", () => {
    const validBody = {
      thesisId: "thesis-1",
      roomId: "room-1",
      date: "2026-05-20T10:00:00Z",
      status: "passed",
      examinerLecturerIds: ["lec-1", "lec-2"],
    };

    it("creates archive seminar successfully", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findSeminarByThesisId.mockResolvedValue(null);
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null); // No existing passed seminar
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ lecturerId: "lec-3" }]);
      mockCoreRepo.createSeminarWithExaminers.mockResolvedValue({ id: "sem-1" });
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1" });

      const result = await createArchive(validBody, "admin-user");

      expect(result).toHaveProperty("id", "sem-1");
      expect(mockCoreRepo.createSeminarWithExaminers).toHaveBeenCalledWith(expect.objectContaining({
        thesisId: "thesis-1",
        status: "passed",
      }));
    });

    it("throws 409 if student already passed a seminar", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue({ id: "old-sem", status: "passed" });

      await expect(createArchive(validBody, "admin-user")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws 400 if examiner is also a supervisor", async () => {
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null);
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([{ lecturerId: "lec-1" }]); // lec-1 is examiner in validBody

      await expect(createArchive(validBody, "admin-user")).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("updateArchive", () => {
    const validBody = {
      thesisId: "thesis-1",
      roomId: "room-1",
      date: "2026-05-20T10:00:00Z",
      status: "passed",
      examinerLecturerIds: ["lec-1", "lec-2"],
    };

    it("updates manual archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: null }); // It's a manual archive
      mockCoreRepo.findThesisById.mockResolvedValue({ id: "thesis-1" });
      mockCoreRepo.findRoomById.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findSupervisorsByThesisId.mockResolvedValue([]);
      mockCoreRepo.updateSeminarWithExaminers.mockResolvedValue({});
      mockCoreRepo.findSeminarById.mockResolvedValue({ id: "sem-1" });

      const result = await updateArchive("sem-1", validBody, "admin-user");
      expect(result).toHaveProperty("id", "sem-1");
    });

    it("throws 403 if trying to update an active seminar (registeredAt is not null)", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: new Date() });
      await expect(updateArchive("sem-1", validBody, "admin-user")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("deleteArchive", () => {
    it("deletes manual archive successfully", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: null });
      mockCoreRepo.deleteSeminar.mockResolvedValue({});

      const result = await deleteArchive("sem-1");
      expect(result.success).toBe(true);
    });

    it("throws 403 if trying to delete an active seminar", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", registeredAt: new Date() });
      await expect(deleteArchive("sem-1")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("importArchive", () => {
    it("imports multiple seminars from excel", async () => {
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "NIM": "12345", "Ruangan": "Room A", "Hasil": "Lulus", "Tanggal": "2026-05-20", "Dosen Penguji 1": "Dosen A", "Dosen Penguji 2": "Dosen B" }
      ]);
      mockCoreRepo.findStudentByNim.mockResolvedValue({ id: "stu-1" });
      mockCoreRepo.findActiveThesisByStudentId.mockResolvedValue({ id: "thesis-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue(null);
      mockCoreRepo.findRoomByNameLike.mockResolvedValue({ id: "room-1" });
      mockCoreRepo.findLecturerByNameLike.mockResolvedValue({ id: "lec-1" });
      mockCoreRepo.createSeminarWithExaminers.mockResolvedValue({});

      const result = await importArchive(Buffer.from("test"), "admin-user");

      expect(result.successCount).toBe(1);
      expect(mockCoreRepo.createSeminarWithExaminers).toHaveBeenCalled();
    });
    it("skips row if student already passed a seminar", async () => {
      mockXlsx.read.mockReturnValue({
        SheetNames: ["Sheet1"],
        Sheets: { "Sheet1": {} }
      });
      mockXlsx.utils.sheet_to_json.mockReturnValue([
        { "NIM": "12345", "Ruangan": "Room A", "Hasil": "Lulus", "Tanggal": "2026-05-20", "Dosen Penguji 1": "Dosen A", "Dosen Penguji 2": "Dosen B" }
      ]);
      mockCoreRepo.findStudentByNim.mockResolvedValue({ id: "stu-1" });
      mockCoreRepo.findActiveThesisByStudentId.mockResolvedValue({ id: "thesis-1" });
      mockPrisma.thesisSeminar.findFirst.mockResolvedValue({ id: "old-sem", status: "passed" });

      const result = await importArchive(Buffer.from("test"), "admin-user");

      expect(result.successCount).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failedRows[0].error).toBe("Sudah lulus seminar hasil");
    });
  });

  describe("cancelSeminar", () => {
    it("cancels seminar and resets supervisor seminarReady flag", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "verified", thesisId: "thesis-1" });
      mockCoreRepo.updateSeminar.mockResolvedValue({ id: "sem-1", status: "cancelled" });
      mockPrisma.thesisSupervisors = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

      const result = await cancelSeminar("sem-1", { cancelledReason: "Test Reason" });

      expect(result.status).toBe("cancelled");
      expect(mockCoreRepo.updateSeminar).toHaveBeenCalledWith("sem-1", expect.objectContaining({ status: "cancelled", cancelledReason: "Test Reason" }));
      expect(mockPrisma.thesisSupervisors.updateMany).toHaveBeenCalledWith({
        where: { thesisId: "thesis-1" },
        data: { seminarReady: false }
      });
    });

    it("throws 400 if seminar is already concluded", async () => {
      mockCoreRepo.findSeminarBasicById.mockResolvedValue({ id: "sem-1", status: "passed" });
      await expect(cancelSeminar("sem-1", { cancelledReason: "Reason" })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
