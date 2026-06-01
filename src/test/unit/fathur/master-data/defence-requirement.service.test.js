import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesisDefenceRequirement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import * as service from "../../../../services/defence-requirement.service.js";

const mockReq1 = {
  id: "req-1",
  academicYearId: "ay-1",
  code: "REQ_1",
  name: "Buku Tesis",
  description: "Buku tesis final",
  isRequired: true,
  isActive: true,
  displayOrder: 1,
};

const mockReq2 = {
  id: "req-2",
  academicYearId: "ay-1",
  code: "REQ_2",
  name: "Form Bebas Lab",
  description: null,
  isRequired: true,
  isActive: true,
  displayOrder: 2,
};

describe("Defence Requirement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("should return all requirements sorted by displayOrder", async () => {
      mockPrisma.thesisDefenceRequirement.findMany.mockResolvedValue([mockReq1, mockReq2]);
      
      const res = await service.getAll({ academicYearId: "ay-1" });
      expect(res).toHaveLength(2);
      expect(mockPrisma.thesisDefenceRequirement.findMany).toHaveBeenCalledWith({
        where: { academicYearId: "ay-1" },
        orderBy: { displayOrder: "asc" },
      });
    });
  });

  describe("getById", () => {
    it("should return a requirement if found", async () => {
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(mockReq1);
      
      const res = await service.getById("req-1");
      expect(res).toEqual(mockReq1);
    });

    it("should throw NotFoundError if not found", async () => {
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(null);
      await expect(service.getById("not-found")).rejects.toThrow("Data tidak ditemukan");
    });
  });

  describe("create", () => {
    it("should generate code and displayOrder if not provided", async () => {
      mockPrisma.thesisDefenceRequirement.findMany.mockResolvedValue([mockReq1]);
      mockPrisma.thesisDefenceRequirement.create.mockResolvedValue({
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
      
      expect(mockPrisma.thesisDefenceRequirement.create).toHaveBeenCalledWith({
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
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(mockReq1);
      mockPrisma.thesisDefenceRequirement.update.mockResolvedValue({ ...mockReq1, name: "Updated" });

      const res = await service.update("req-1", { name: "Updated" });
      expect(res.name).toBe("Updated");
      expect(mockPrisma.thesisDefenceRequirement.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { name: "Updated" },
      });
    });

    it("should throw NotFoundError if item does not exist", async () => {
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(null);
      await expect(service.update("req-1", { name: "Updated" })).rejects.toThrow("Data tidak ditemukan");
    });
  });

  describe("remove", () => {
    it("should remove the requirement if it exists", async () => {
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(mockReq1);
      mockPrisma.thesisDefenceRequirement.delete.mockResolvedValue(mockReq1);

      await service.remove("req-1");
      expect(mockPrisma.thesisDefenceRequirement.delete).toHaveBeenCalledWith({ where: { id: "req-1" } });
    });

    it("should throw NotFoundError if item does not exist", async () => {
      mockPrisma.thesisDefenceRequirement.findUnique.mockResolvedValue(null);
      await expect(service.remove("req-1")).rejects.toThrow("Data tidak ditemukan");
    });
  });

  describe("reorder", () => {
    it("should reorder the requirements", async () => {
      mockPrisma.thesisDefenceRequirement.update.mockResolvedValue({});
      
      await service.reorder(["req-2", "req-1"]);
      
      expect(mockPrisma.thesisDefenceRequirement.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.thesisDefenceRequirement.update).toHaveBeenNthCalledWith(1, {
        where: { id: "req-2" },
        data: { displayOrder: 1 },
      });
      expect(mockPrisma.thesisDefenceRequirement.update).toHaveBeenNthCalledWith(2, {
        where: { id: "req-1" },
        data: { displayOrder: 2 },
      });
    });
  });
});
