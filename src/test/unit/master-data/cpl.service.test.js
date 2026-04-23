/**
 * Unit Tests — Module: CPL Management
 * Covers:
 * - getCpls (default/filter/search)
 * - getCplById
 * - createCpl
 * - updateCpl
 * - toggleCpl
 * - deleteCpl
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    cpl: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    studentCplScore: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));

import {
  getAllCpls as getCpls,
  getCplById,
  createCpl,
  updateCpl,
  toggleCpl,
  deleteCpl,
} from "../../../services/cpl.service.js";

const NOW = new Date("2026-04-20T09:00:00.000Z");

const CPL_ACTIVE_1 = {
  id: "cpl-1",
  code: "CPL-01",
  description: "Berpikir kritis",
  minimalScore: 70,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const CPL_ACTIVE_2 = {
  id: "cpl-2",
  code: "CPL-02",
  description: "Komunikasi efektif",
  minimalScore: 75,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const CPL_INACTIVE = {
  id: "cpl-3",
  code: "CPL-03",
  description: "Kepemimpinan",
  minimalScore: 80,
  isActive: false,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("CPL Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCpls", () => {
    it("returns active CPLs (default), ordered by code, paginated, with hasRelatedScores", async () => {
      mockPrisma.cpl.findMany.mockResolvedValue([
        { ...CPL_ACTIVE_1, _count: { studentCplScores: 1 } },
        { ...CPL_ACTIVE_2, _count: { studentCplScores: 0 } },
      ]);

      // required mock boilerplate
      mockPrisma.studentCplScore.findFirst
        .mockResolvedValueOnce({ studentId: "mhs-1", cplId: CPL_ACTIVE_1.id })
        .mockResolvedValueOnce(null);

      const result = await getCpls({ status: "active", page: 1, limit: 10 });

      expect(mockPrisma.cpl.findMany).toHaveBeenCalledWith({
        orderBy: { code: "asc" },
        include: { _count: { select: { studentCplScores: true } } },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "cpl-1",
        code: "CPL-01",
        hasRelatedScores: true,
      });
      expect(result[1]).toMatchObject({
        id: "cpl-2",
        code: "CPL-02",
        hasRelatedScores: false,
      });
    });

    it("applies inactive filter and returns only inactive CPLs", async () => {
      mockPrisma.cpl.findMany.mockResolvedValue([
        { ...CPL_INACTIVE, _count: { studentCplScores: 0 } },
      ]);

      const result = await getCpls({ status: "inactive", page: 1, limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: CPL_INACTIVE.id,
        isActive: false,
      });
    });

    it("applies all filter and returns active + inactive CPLs", async () => {
      mockPrisma.cpl.findMany.mockResolvedValue([
        { ...CPL_ACTIVE_1, _count: { studentCplScores: 0 } },
        { ...CPL_INACTIVE, _count: { studentCplScores: 1 } },
      ]);

      const result = await getCpls({ status: "all", page: 1, limit: 10 });

      expect(result).toHaveLength(2);
      expect(result.map((x) => x.isActive)).toEqual([true, false]);
    });

    it("applies search query against code/description", async () => {
      mockPrisma.cpl.findMany.mockResolvedValue([
        { ...CPL_ACTIVE_1, _count: { studentCplScores: 0 } },
      ]);

      const result = await getCpls({ status: "active", search: "kritis", page: 1, limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        code: "CPL-01",
        description: "Berpikir kritis",
      });
    });
  });

  describe("getCplById", () => {
    it("returns CPL detail and appends hasRelatedScores", async () => {
      mockPrisma.cpl.findUnique.mockResolvedValue({
        ...CPL_ACTIVE_1,
        _count: { studentCplScores: 1 },
      });
      mockPrisma.studentCplScore.findFirst.mockResolvedValue({
        studentId: "mhs-1",
        cplId: CPL_ACTIVE_1.id,
      });

      const result = await getCplById(CPL_ACTIVE_1.id);

      expect(mockPrisma.cpl.findUnique).toHaveBeenCalledWith({
        where: { id: CPL_ACTIVE_1.id },
        include: { _count: { select: { studentCplScores: true } } },
      });
      expect(result).toMatchObject({
        id: CPL_ACTIVE_1.id,
        hasRelatedScores: true,
      });
    });
  });

  describe("createCpl", () => {
    it("creates CPL when no active CPL with same code exists (active by default)", async () => {
      mockPrisma.cpl.findFirst.mockResolvedValue(null);
      mockPrisma.cpl.create.mockResolvedValue({ id: "cpl-new" });
      mockPrisma.cpl.findUnique.mockResolvedValue({
        id: "cpl-new",
        code: "CPL-10",
        description: "Etika profesi",
        minimalScore: 78,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        _count: { studentCplScores: 0 },
      });

      const result = await createCpl({
        code: "CPL-10",
        description: "Etika profesi",
        minimalScore: 78,
      });

      expect(mockPrisma.cpl.create).toHaveBeenCalledWith({
        data: {
          code: "CPL-10",
          description: "Etika profesi",
          minimalScore: 78,
        },
      });
      expect(result).toMatchObject({
        id: "cpl-new",
        isActive: true,
        hasRelatedScores: false,
      });
    });

    it("rejects (400) when active CPL with identical code exists", async () => {
      mockPrisma.cpl.findFirst.mockResolvedValue({
        id: "cpl-existing",
        code: "CPL-10",
        isActive: true,
      });

      await expect(
        createCpl({
          code: "CPL-10",
          description: "Duplicate",
          minimalScore: 60,
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockPrisma.cpl.create).not.toHaveBeenCalled();
    });
  });

  describe("updateCpl", () => {
    it("updates all fields when there are no related StudentCplScore records", async () => {
      mockPrisma.cpl.findUnique
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          _count: { studentCplScores: 0 },
        })
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          code: "CPL-01-R1",
          description: "Berpikir kritis terstruktur",
          minimalScore: 85,
          _count: { studentCplScores: 0 },
        });
      mockPrisma.cpl.findFirst.mockResolvedValue(null);
      mockPrisma.cpl.update.mockResolvedValue({ ...CPL_ACTIVE_1, id: CPL_ACTIVE_1.id });

      const result = await updateCpl(CPL_ACTIVE_1.id, {
        code: "CPL-01-R1",
        description: "Berpikir kritis terstruktur",
        minimalScore: 85,
      });

      expect(mockPrisma.cpl.update).toHaveBeenCalledWith({
        where: { id: CPL_ACTIVE_1.id },
        data: {
          code: "CPL-01-R1",
          description: "Berpikir kritis terstruktur",
          minimalScore: 85,
        },
      });
      expect(result).toMatchObject({
        id: CPL_ACTIVE_1.id,
        code: "CPL-01-R1",
        minimalScore: 85,
      });
    });

    it("updates description only when hasRelatedScores is true", async () => {
      mockPrisma.cpl.findUnique
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          _count: { studentCplScores: 1 },
        })
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          description: "Deskripsi diperbarui",
          _count: { studentCplScores: 1 },
        });
      mockPrisma.cpl.update.mockResolvedValue({ ...CPL_ACTIVE_1 });

      const result = await updateCpl(CPL_ACTIVE_1.id, {
        description: "Deskripsi diperbarui",
      });

      expect(mockPrisma.cpl.update).toHaveBeenCalledWith({
        where: { id: CPL_ACTIVE_1.id },
        data: { description: "Deskripsi diperbarui" },
      });
      expect(result).toMatchObject({
        id: CPL_ACTIVE_1.id,
        description: "Deskripsi diperbarui",
        hasRelatedScores: true,
      });
    });

    it("updates inactive CPL when payload is valid", async () => {
      mockPrisma.cpl.findUnique
        .mockResolvedValueOnce({
          ...CPL_INACTIVE,
          _count: { studentCplScores: 0 },
        })
        .mockResolvedValueOnce({
          ...CPL_INACTIVE,
          description: "Boleh diubah saat nonaktif",
          _count: { studentCplScores: 0 },
        });
      mockPrisma.cpl.update.mockResolvedValue({ ...CPL_INACTIVE });

      const result = await updateCpl(CPL_INACTIVE.id, {
        description: "Boleh diubah saat nonaktif",
      });

      expect(mockPrisma.cpl.update).toHaveBeenCalledWith({
        where: { id: CPL_INACTIVE.id },
        data: { description: "Boleh diubah saat nonaktif" },
      });
      expect(result).toMatchObject({
        id: CPL_INACTIVE.id,
        isActive: false,
        description: "Boleh diubah saat nonaktif",
      });
    });
  });

  describe("toggleCpl (Deactivate)", () => {
    it("deactivates currently active CPL", async () => {
      mockPrisma.cpl.findUnique
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          isActive: true,
          _count: { studentCplScores: 1 },
        })
        .mockResolvedValueOnce({
          ...CPL_ACTIVE_1,
          isActive: false,
          _count: { studentCplScores: 1 },
        });
      mockPrisma.cpl.update.mockResolvedValue({ ...CPL_ACTIVE_1, isActive: false });

      const result = await toggleCpl(CPL_ACTIVE_1.id);

      expect(mockPrisma.cpl.update).toHaveBeenCalledWith({
        where: { id: CPL_ACTIVE_1.id },
        data: { isActive: false },
      });
      expect(result).toMatchObject({ isActive: false });
    });
  });

  describe("toggleCpl (Re-activate)", () => {
    it("reactivates inactive CPL when no active duplicate code exists", async () => {
      mockPrisma.cpl.findUnique
        .mockResolvedValueOnce({
          ...CPL_INACTIVE,
          _count: { studentCplScores: 0 },
        })
        .mockResolvedValueOnce({
          ...CPL_INACTIVE,
          isActive: true,
          _count: { studentCplScores: 0 },
        });
      mockPrisma.cpl.findFirst.mockResolvedValue(null);
      mockPrisma.cpl.update.mockResolvedValue({ ...CPL_INACTIVE, isActive: true });

      const result = await toggleCpl(CPL_INACTIVE.id);

      expect(mockPrisma.cpl.update).toHaveBeenCalledWith({
        where: { id: CPL_INACTIVE.id },
        data: { isActive: true },
      });
      expect(result).toMatchObject({ isActive: true });
    });

    it("rejects (400) when reactivation conflicts with another active same-code CPL", async () => {
      mockPrisma.cpl.findUnique.mockResolvedValue({
        ...CPL_INACTIVE,
        _count: { studentCplScores: 0 },
      });
      mockPrisma.cpl.findFirst.mockResolvedValue({
        id: "cpl-active-dup",
        code: CPL_INACTIVE.code,
        isActive: true,
      });

      await expect(toggleCpl(CPL_INACTIVE.id)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.cpl.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteCpl", () => {
    it("hard deletes when there are absolutely no StudentCplScore relations", async () => {
      mockPrisma.cpl.findUnique.mockResolvedValue({
        ...CPL_ACTIVE_1,
        _count: { studentCplScores: 0 },
      });
      mockPrisma.studentCplScore.findFirst.mockResolvedValue(null);
      mockPrisma.studentCplScore.count.mockResolvedValue(0);
      mockPrisma.cpl.delete.mockResolvedValue(CPL_ACTIVE_1);

      await deleteCpl(CPL_ACTIVE_1.id);

      expect(mockPrisma.cpl.delete).toHaveBeenCalledWith({
        where: { id: CPL_ACTIVE_1.id },
      });
    });

    it("rejects (400) when StudentCplScore.findFirst detects related records", async () => {
      mockPrisma.cpl.findUnique.mockResolvedValue({
        ...CPL_ACTIVE_1,
        _count: { studentCplScores: 1 },
      });
      mockPrisma.studentCplScore.findFirst.mockResolvedValue({
        studentId: "mhs-1",
        cplId: CPL_ACTIVE_1.id,
      });
      mockPrisma.studentCplScore.count.mockResolvedValue(1);

      await expect(deleteCpl(CPL_ACTIVE_1.id)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.cpl.delete).not.toHaveBeenCalled();
    });
  });
});
