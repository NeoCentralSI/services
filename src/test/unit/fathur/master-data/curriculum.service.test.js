import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    curriculum: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    cpl: {
      deleteMany: vi.fn(),
    },
    studentCplScore: {
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
    mockPrisma.curriculum.findFirst.mockResolvedValue(null);
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
        include: {
          _count: { select: { cpls: true } },
          cpls: {
            select: {
              _count: { select: { studentCplScores: true } },
            },
          },
        },
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

    it("trims the curriculum name before creating", async () => {
      mockPrisma.curriculum.create.mockResolvedValue({ id: "curriculum-new" });
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        id: "curriculum-new",
        name: "Kurikulum Baru",
        startYear: 2026,
        endYear: null,
        _count: { cpls: 0 },
      });

      await create({
        name: "  Kurikulum Baru  ",
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
    });

    it("rejects an invalid year range", async () => {
      await expect(
        create({
          name: "Kurikulum Tidak Valid",
          startYear: 2026,
          endYear: 2025,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Tahun akhir tidak boleh kurang dari tahun mulai",
      });
      expect(mockPrisma.curriculum.create).not.toHaveBeenCalled();
    });

    it("rejects an overlapping closed year range", async () => {
      mockPrisma.curriculum.findFirst.mockResolvedValue({ id: "curriculum-existing" });

      await expect(
        create({
          name: "Kurikulum Tumpang Tindih",
          startYear: 2021,
          endYear: 2026,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Rentang tahun kurikulum bertumpang tindih dengan kurikulum lain",
      });
      expect(mockPrisma.curriculum.findFirst).toHaveBeenCalledWith({
        where: {
          startYear: { lte: 2026 },
          OR: [
            { endYear: null },
            { endYear: { gte: 2021 } },
          ],
        },
        select: { id: true },
      });
      expect(mockPrisma.curriculum.create).not.toHaveBeenCalled();
    });

    it("rejects an overlapping open-ended year range", async () => {
      mockPrisma.curriculum.findFirst.mockResolvedValue({ id: "curriculum-existing" });

      await expect(
        create({
          name: "Kurikulum Aktif Tumpang Tindih",
          startYear: 2026,
          endYear: null,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Rentang tahun kurikulum bertumpang tindih dengan kurikulum lain",
      });
      expect(mockPrisma.curriculum.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { endYear: null },
            { endYear: { gte: 2026 } },
          ],
        },
        select: { id: true },
      });
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

    it("allows renaming a curriculum that already has student CPL scores", async () => {
      const curriculumWithScores = {
        ...CURRICULUM_1,
        cpls: [{ _count: { studentCplScores: 1 } }],
        _count: { cpls: 1 },
      };
      mockPrisma.curriculum.findUnique
        .mockResolvedValueOnce(curriculumWithScores)
        .mockResolvedValueOnce({
          ...curriculumWithScores,
          name: "Kurikulum OBE",
        });
      mockPrisma.curriculum.update.mockResolvedValue({
        ...curriculumWithScores,
        name: "Kurikulum OBE",
      });

      await expect(
        update(CURRICULUM_1.id, { name: "Kurikulum OBE" })
      ).resolves.toMatchObject({ name: "Kurikulum OBE", hasRelatedScores: true });
      expect(mockPrisma.curriculum.update).toHaveBeenCalledWith({
        where: { id: CURRICULUM_1.id },
        data: { name: "Kurikulum OBE" },
      });
      expect(mockPrisma.curriculum.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      [{ startYear: 2020 }],
      [{ endYear: 2027 }],
      [{ endYear: null }],
    ])("rejects year-range changes after student CPL scores exist", async (payload) => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        cpls: [{ _count: { studentCplScores: 1 } }],
        _count: { cpls: 1 },
      });

      await expect(update(CURRICULUM_1.id, payload)).rejects.toMatchObject({
        statusCode: 400,
        message:
          "Tahun berlaku kurikulum tidak dapat diubah karena CPL terkait sudah memiliki nilai mahasiswa",
      });
      expect(mockPrisma.curriculum.update).not.toHaveBeenCalled();
      expect(mockPrisma.curriculum.findFirst).not.toHaveBeenCalled();
    });

    it("throws NotFoundError if updating non-existent curriculum", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(update("non-existent", { name: "test" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects a partial update that makes the persisted year range invalid", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 2 },
      });

      await expect(update(CURRICULUM_1.id, { startYear: 2027 })).rejects.toMatchObject({
        statusCode: 400,
        message: "Tahun akhir tidak boleh kurang dari tahun mulai",
      });
      expect(mockPrisma.curriculum.update).not.toHaveBeenCalled();
    });

    it("rejects an update that overlaps another curriculum year range", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 2 },
      });
      mockPrisma.curriculum.findFirst.mockResolvedValue({ id: CURRICULUM_2.id });

      await expect(
        update(CURRICULUM_1.id, {
          startYear: CURRICULUM_2.startYear,
          endYear: CURRICULUM_2.endYear,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Rentang tahun kurikulum bertumpang tindih dengan kurikulum lain",
      });
      expect(mockPrisma.curriculum.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: CURRICULUM_1.id },
          OR: [
            { endYear: null },
            { endYear: { gte: CURRICULUM_2.startYear } },
          ],
        },
        select: { id: true },
      });
      expect(mockPrisma.curriculum.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("deletes curriculum when there are no related CPLs", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_2,
        _count: { cpls: 0 },
      });
      mockPrisma.studentCplScore.count.mockResolvedValue(0);
      mockPrisma.cpl.deleteMany.mockReturnValue({ operation: "delete-cpls" });
      mockPrisma.curriculum.delete.mockReturnValue({ operation: "delete-curriculum" });
      mockPrisma.$transaction.mockResolvedValue([{ count: 0 }, CURRICULUM_2]);

      await remove(CURRICULUM_2.id);

      expect(mockPrisma.cpl.deleteMany).toHaveBeenCalledWith({
        where: { curriculumId: CURRICULUM_2.id },
      });
    });

    it("deletes curriculum and its CPLs when none have student scores", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 5 },
      });
      mockPrisma.studentCplScore.count.mockResolvedValue(0);
      mockPrisma.cpl.deleteMany.mockReturnValue({ operation: "delete-cpls" });
      mockPrisma.curriculum.delete.mockReturnValue({ operation: "delete-curriculum" });
      mockPrisma.$transaction.mockResolvedValue([{ count: 5 }, CURRICULUM_1]);

      await expect(remove(CURRICULUM_1.id)).resolves.toEqual(CURRICULUM_1);
      expect(mockPrisma.cpl.deleteMany).toHaveBeenCalledWith({
        where: { curriculumId: CURRICULUM_1.id },
      });
    });

    it("throws ValidationError when a related CPL has student scores", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue({
        ...CURRICULUM_1,
        _count: { cpls: 5 },
      });
      mockPrisma.studentCplScore.count.mockResolvedValue(1);

      await expect(remove(CURRICULUM_1.id)).rejects.toMatchObject({
        statusCode: 400,
        message: "Tidak dapat menghapus kurikulum karena CPL terkait sudah memiliki nilai mahasiswa",
      });
      expect(mockPrisma.curriculum.delete).not.toHaveBeenCalled();
      expect(mockPrisma.cpl.deleteMany).not.toHaveBeenCalled();
    });

    it("throws NotFoundError if deleting non-existent curriculum", async () => {
      mockPrisma.curriculum.findUnique.mockResolvedValue(null);

      await expect(remove("non-existent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
