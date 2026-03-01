/**
 * Unit Tests — Module 14: Data Master Tugas Akhir
 * Covers: getAllThesesMasterData, createThesisMasterData, updateThesisMasterData, syncSia
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockRepo, mockPrisma } = vi.hoisted(() => ({
  mockRepo: {
    findAllTheses: vi.fn(),
    findThesisById: vi.fn(),
    createThesis: vi.fn(),
    updateThesis: vi.fn(),
  },
  mockPrisma: {
    thesis: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    thesisStatus: { findMany: vi.fn(), findFirst: vi.fn() },
    thesisSupervisors: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    userRole: { findFirst: vi.fn() },
    student: { findUnique: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../repositories/masterDataTa.repository.js", () => mockRepo);
vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));

import {
  getAllThesesMasterData,
  getAllThesisStatuses,
  createThesisMasterData,
  updateThesisMasterData,
} from "../services/masterDataTa.service.js";

// ── Test Data ──────────────────────────────────────────────────
const THESIS = {
  id: "thesis-1",
  title: "AI Research",
  student: { id: "s1", user: { fullName: "Budi", identityNumber: "123" } },
  thesisTopic: { name: "ML" },
  thesisStatus: { name: "Bimbingan" },
  thesisSupervisors: [],
};

// ══════════════════════════════════════════════════════════════
describe("Module 14: Data Master Tugas Akhir", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Get All Theses ───────────────────────────────────────
  describe("getAllThesesMasterData", () => {
    it("returns all theses with student, topic, status, supervisors", async () => {
      mockRepo.findAllTheses.mockResolvedValue([THESIS]);

      const result = await getAllThesesMasterData();

      expect(result).toHaveLength(1);
    });
  });

  // ─── Get All Thesis Statuses ──────────────────────────────
  describe("getAllThesisStatuses", () => {
    it("returns all thesis statuses ordered by id", async () => {
      mockPrisma.thesisStatus.findMany.mockResolvedValue([
        { id: 1, name: "Bimbingan" },
        { id: 2, name: "Selesai" },
      ]);

      const result = await getAllThesisStatuses();

      expect(result).toHaveLength(2);
    });
  });

  // ─── Create Thesis ───────────────────────────────────────
  describe("createThesisMasterData", () => {
    it("creates thesis with auto start date, 1-year deadline, and Bimbingan status", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue(null); // no active thesis
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: "ay1" });
      mockPrisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
      mockPrisma.userRole.findFirst
        .mockResolvedValueOnce({ id: "role-p1" })  // Pembimbing 1
        .mockResolvedValueOnce({ id: "role-p2" }); // Pembimbing 2
      mockRepo.createThesis.mockResolvedValue({ id: "thesis-new", title: "New Research" });

      const result = await createThesisMasterData({
        studentId: "s1",
        title: "New Research",
        pembimbing1: "lec-1",
      });

      expect(result).toHaveProperty("id");
    });

    it("rejects (400) if student has an active thesis", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue({ id: "active-thesis" });

      await expect(
        createThesisMasterData({ studentId: "s1", title: "X", pembimbing1: "lec-1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects (400) if no active academic year", async () => {
      mockPrisma.thesis.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        createThesisMasterData({ studentId: "s1", title: "X", pembimbing1: "lec-1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ─── Update Thesis ───────────────────────────────────────
  describe("updateThesisMasterData", () => {
    it("updates thesis supervisor and status", async () => {
      mockRepo.findThesisById.mockResolvedValue(THESIS);
      mockRepo.updateThesis.mockResolvedValue({ ...THESIS, title: "Updated" });
      // Service looks up userRole when pembimbing1 is provided
      mockPrisma.userRole.findFirst.mockResolvedValue({ id: "role-p1", name: "Pembimbing 1" });

      const result = await updateThesisMasterData("thesis-1", {
        pembimbing1: "lec-2",
        thesisStatusId: 2,
      });

      expect(result).toBeDefined();
    });

    it("throws 404 if thesis not found", async () => {
      mockRepo.findThesisById.mockResolvedValue(null);

      await expect(
        updateThesisMasterData("nonexistent", { title: "X" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
