import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    curriculum: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import {
  getAll,
  getById,
  create,
  update,
  remove,
} from "../../../../services/curriculum.service.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");

const CURRICULUM_1 = {
  id: "curriculum-1",
  name: "Kurikulum OBE 2021",
  startYear: 2021,
  endYear: 2026,
  createdAt: NOW,
  updatedAt: NOW,
};

const CURRICULUM_2 = {
  id: "curriculum-2",
  name: "Kurikulum Merdeka 2024",
  startYear: 2024,
  endYear: null,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("Curriculum Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAll", () => {
    it("returns paginated curriculums with cpl count", async () => {
      const mockData = [
        { ...CURRICULUM_1, _count: { cpls: 5 } },
        { ...CURRICULUM_2, _count: { cpls: 0 } },
      ];
      mockPrisma.$transaction.mockResolvedValue([mockData, 2]);

      const result = await getAll({ page: 1, limit: 10 });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0]).toMatchObject({
        id: "curriculum-1",
        cplCount: 5,
      });
      expect(result.data[1]).toMatchObject({
        id: "curriculum-2",
        cplCount: 0,
      });
    });

    it("applies search query", async () => {
      const mockData = [{ ...CURRICULUM_2, _count: { cpls: 0 } }];
      mockPrisma.$transaction.mockResolvedValue([mockData, 1]);

      const result = await getAll({ search: "Merdeka", page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("Kurikulum Merdeka 2024");
    });
  });

  describe("getById", () => {
    it("returns curriculum detail by id", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 10 },
      });

      const result = await getById(CURRICULUM_1.id);

      expect(mockPrisma.curriculum.findUnique).toHaveBeenCalledWith({
        where: { id: CURRICULUM_1.id },
        include: { _count: { select: { cpls: true } } },
      });
      expect(result).toMatchObject({
        id: CURRICULUM_1.id,
        cplCount: 10,
      });
    });

    it("throws NotFoundError if curriculum does not exist", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(getById("non-existent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("create", () => {
    it("creates a new curriculum", async () => {
      mockPrisma.curriculum.create.mockResolvedValue({ id: "curriculum-new" });
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        id: "curriculum-new",
        name: "Kurikulum Baru",
        startYear: 2026,
        endYear: null,
        _count: { cpls: 0 },
      });

      const result = await create({
        name: "Kurikulum Baru",
        startYear: 2026,
        endYear: null,
      });

      expect(mockPrisma.curriculum.create).toHaveBeenCalledWith({
        data: {
          name: "Kurikulum Baru",
          startYear: 2026,
          endYear: null,
        },
      });
      expect(result.id).toBe("curriculum-new");
      expect(result.cplCount).toBe(0);
    });
  });

  describe("update", () => {
    it("updates existing curriculum", async () => {
      mockPrisma.curriculum.findUnique
        .mockResolvedValueOnce({ ...CURRICULUM_1, _count: { cpls: 5 } }) // for check
        .mockResolvedValueOnce({
          ...CURRICULUM_1,
          endYear: 2027,
          _count: { cpls: 5 },
        }); // for return after update

      mockPrisma.curriculum.update.mockResolvedValue({
        ...CURRICULUM_1,
        endYear: 2027,
      });

      const result = await update(CURRICULUM_1.id, {
        endYear: 2027,
      });

      expect(mockPrisma.curriculum.update).toHaveBeenCalledWith({
        where: { id: CURRICULUM_1.id },
        data: { endYear: 2027 },
      });
      expect(result.endYear).toBe(2027);
    });

    it("throws NotFoundError if updating non-existent curriculum", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(update("non-existent", { name: "test" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("remove", () => {
    it("deletes curriculum when there are no related CPLs", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_2,
        _count: { cpls: 0 },
      });
      mockPrisma.curriculum.delete.mockResolvedValue(CURRICULUM_2);

      await remove(CURRICULUM_2.id);

      expect(mockPrisma.curriculum.delete).toHaveBeenCalledWith({
        where: { id: CURRICULUM_2.id },
      });
    });

    it("throws ValidationError if trying to delete curriculum with CPLs", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 5 },
      });

      await expect(remove(CURRICULUM_1.id)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.curriculum.delete).not.toHaveBeenCalled();
    });

    it("throws NotFoundError if deleting non-existent curriculum", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(remove("non-existent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
