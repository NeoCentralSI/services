import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminarRequirement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import * as service from "../../../../services/seminar-requirement.service.js";

const mockReq1 = {
  id: "req-1",
  academicYearId: "ay-1",
  code: "REQ_1",
  name: "Draf Laporan",
  description: "Draf final",
  isRequired: true,
  isActive: true,
  displayOrder: 1,
};

const mockReq2 = {
  id: "req-2",
  academicYearId: "ay-1",
  code: "REQ_2",
  name: "Bukti Submit Jurnal",
  description: null,
  isRequired: true,
  isActive: true,
  displayOrder: 2,
};

describe("Seminar Requirement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("should return all requirements sorted by displayOrder", async () => {
      mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([
        { ...mockReq1, _count: { requirementDocuments: 0 } },
        { ...mockReq2, _count: { requirementDocuments: 0 } }
      ]);
      
      const res = await service.getAll({ academicYearId: "ay-1" });
      expect(res).toHaveLength(2);
      expect(mockPrisma.thesisSeminarRequirement.findMany).toHaveBeenCalledWith({
        where: { academicYearId: "ay-1" },
        orderBy: { displayOrder: "asc" },
        include: { _count: { select: { requirementDocuments: true } } },
      });
    });
  });

  describe("getById", () => {
    it("should return a requirement if found", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue({ ...mockReq1, _count: { requirementDocuments: 0 } });
      
      const res = await service.getById("req-1");
      expect(res).toEqual({ ...mockReq1, hasRelatedData: false });
    });

    it("should throw NotFoundError if not found", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(null);
      await expect(service.getById("not-found")).rejects.toThrow("Data tidak ditemukan");
    });
  });

  describe("create", () => {
    it("should generate code and displayOrder if not provided", async () => {
      mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([{ ...mockReq1, _count: { requirementDocuments: 0 } }]);
      mockPrisma.thesisSeminarRequirement.create.mockResolvedValue({
        id: "req-new",
        name: "New Req",
        code: expect.any(String),
        displayOrder: 2,
      });

      const payload = {
        academicYearId: "ay-1",
        name: "New Req",
      };

      const res = await service.create(payload);
      
      expect(mockPrisma.thesisSeminarRequirement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          academicYearId: "ay-1",
          name: "New Req",
          code: expect.stringMatching(/^NEW_REQ_\d+/),
          displayOrder: 2,
        }),
      });
      expect(res).toHaveProperty("id", "req-new");
    });
  });

  describe("update", () => {
    it("should update and return data", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue({ ...mockReq1, _count: { requirementDocuments: 0 } });
      mockPrisma.thesisSeminarRequirement.update.mockResolvedValue({ ...mockReq1, name: "Updated" });

      const res = await service.update("req-1", { name: "Updated" });
      expect(res.name).toBe("Updated");
      expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { name: "Updated" },
      });
    });

    it("should throw NotFoundError if item does not exist", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(null);
      await expect(service.update("req-1", { name: "Updated" })).rejects.toThrow("Data tidak ditemukan");
    });
  });

  describe("remove", () => {
    it("should remove the requirement if it exists and has no related data", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue({ ...mockReq1, _count: { requirementDocuments: 0 } });
      mockPrisma.thesisSeminarRequirement.delete.mockResolvedValue(mockReq1);

      await service.remove("req-1");
      expect(mockPrisma.thesisSeminarRequirement.delete).toHaveBeenCalledWith({ where: { id: "req-1" } });
    });

    it("should throw NotFoundError if item does not exist", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(null);
      await expect(service.remove("req-1")).rejects.toThrow("Data tidak ditemukan");
    });

    it("should throw ValidationError if item has related data", async () => {
      mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue({ ...mockReq1, _count: { requirementDocuments: 1 } });
      await expect(service.remove("req-1")).rejects.toThrow("Persyaratan tidak dapat dihapus karena sudah memiliki dokumen yang diunggah");
    });
  });

  describe("reorder", () => {
    it("should reorder the requirements", async () => {
      mockPrisma.thesisSeminarRequirement.update.mockResolvedValue({});
      
      await service.reorder(["req-2", "req-1"]);
      
      expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenNthCalledWith(1, {
        where: { id: "req-2" },
        data: { displayOrder: 1 },
      });
      expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenNthCalledWith(2, {
        where: { id: "req-1" },
        data: { displayOrder: 2 },
      });
    });
  });

  describe("copyTemplate", () => {
    it("should throw ValidationError if source or target academic year is missing", async () => {
      await expect(service.copyTemplate(null, "ay-2")).rejects.toThrow("Tahun ajaran sumber dan tujuan harus diisi");
      await expect(service.copyTemplate("ay-1", null)).rejects.toThrow("Tahun ajaran sumber dan tujuan harus diisi");
    });

    it("should throw ValidationError if source and target academic year are the same", async () => {
      await expect(service.copyTemplate("ay-1", "ay-1")).rejects.toThrow("Tahun ajaran sumber dan tujuan tidak boleh sama");
    });
  });
});
