/**
 * Unit Tests — Module 19: Kelola Kelompok Keilmuan
 * Covers: CRUD science groups, delete with lecturer references
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    scienceGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    lecturer: { findFirst: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

import {
  getScienceGroups,
  createScienceGroup,
  updateScienceGroup,
  deleteScienceGroup,
} from "../../services/scienceGroup.service.js";

// ── Test Data ──────────────────────────────────────────────────
const GROUP = { id: "sg-1", name: "Artificial Intelligence" };

// ══════════════════════════════════════════════════════════════
describe("Module 19: Kelola Kelompok Keilmuan", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Get Science Groups ───────────────────────────────────
  describe("getScienceGroups", () => {
    it("returns all science groups ordered by name", async () => {
      mockPrisma.scienceGroup.findMany.mockResolvedValue([GROUP]);

      const result = await getScienceGroups();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("name", "Artificial Intelligence");
    });
  });

  // ─── Create Science Group ────────────────────────────────
  describe("createScienceGroup", () => {
    it("creates science group with valid name", async () => {
      mockPrisma.scienceGroup.create.mockResolvedValue({ id: "sg-new", name: "Data Science" });

      const result = await createScienceGroup({ name: "Data Science" });

      expect(result).toHaveProperty("name", "Data Science");
    });

    it("rejects (400) if name is missing", async () => {
      await expect(createScienceGroup({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if name is empty string", async () => {
      await expect(createScienceGroup({ name: "" })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Update Science Group ────────────────────────────────
  describe("updateScienceGroup", () => {
    it("updates science group name", async () => {
      mockPrisma.scienceGroup.update.mockResolvedValue({ ...GROUP, name: "Updated" });

      const result = await updateScienceGroup("sg-1", { name: "Updated" });

      expect(result).toHaveProperty("name", "Updated");
    });

    it("rejects (400) if name is missing", async () => {
      await expect(updateScienceGroup("sg-1", {})).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Delete Science Group ────────────────────────────────
  describe("deleteScienceGroup", () => {
    it("deletes science group with no lecturer references", async () => {
      mockPrisma.lecturer.findFirst.mockResolvedValue(null);
      mockPrisma.scienceGroup.delete.mockResolvedValue(GROUP);

      const result = await deleteScienceGroup("sg-1");

      expect(mockPrisma.scienceGroup.delete).toHaveBeenCalledWith({
        where: { id: "sg-1" },
      });
    });

    it("rejects (400) if science group is assigned to lecturers", async () => {
      mockPrisma.lecturer.findFirst.mockResolvedValue({ id: "lec-1" });

      await expect(deleteScienceGroup("sg-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
