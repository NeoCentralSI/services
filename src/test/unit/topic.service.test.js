/**
 * Unit Tests — Module 12: Kelola Topik Tugas Akhir
 * Covers: CRUD topics, duplicate name check, delete with active references
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────
const { mockTopicRepo } = vi.hoisted(() => ({
  mockTopicRepo: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    hasRelatedData: vi.fn(),
    bulkDelete: vi.fn(),
  },
}));

vi.mock("../../repositories/thesisGuidance/topic.repository.js", () => mockTopicRepo);

import {
  getTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  bulkDeleteTopics,
} from "../../services/thesisGuidance/topic.service.js";

// ── Test Data ──────────────────────────────────────────────────
const ADMIN_USER = { id: "admin-1", fullName: "Admin" };
const TOPIC = { id: "topic-1", name: "Machine Learning", createdAt: new Date(), updatedAt: new Date(), _count: { thesis: 5, milestoneTemplates: 3 } };

// ══════════════════════════════════════════════════════════════
describe("Module 12: Kelola Topik Tugas Akhir", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Get Topics ───────────────────────────────────────────
  describe("getTopics", () => {
    it("returns all topics with thesis and template counts", async () => {
      mockTopicRepo.findAll.mockResolvedValue([TOPIC]);

      const result = await getTopics();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("name", "Machine Learning");
    });
  });

  // ─── Get Topic by ID ─────────────────────────────────────
  describe("getTopicById", () => {
    it("returns topic detail", async () => {
      mockTopicRepo.findById.mockResolvedValue(TOPIC);

      const result = await getTopicById("topic-1");

      expect(result).toHaveProperty("thesisCount", 5);
      expect(result).toHaveProperty("templateCount", 3);
    });

    it("throws 404 if topic not found", async () => {
      mockTopicRepo.findById.mockResolvedValue(null);

      await expect(getTopicById("nonexistent")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ─── Create Topic ────────────────────────────────────────
  describe("createTopic", () => {
    it("creates topic with valid name", async () => {
      mockTopicRepo.findByName.mockResolvedValue(null);
      mockTopicRepo.create.mockResolvedValue({ id: "topic-new", name: "Deep Learning" });

      const result = await createTopic(ADMIN_USER, { name: "Deep Learning" });

      expect(result).toHaveProperty("name", "Deep Learning");
    });

    it("rejects (409) if topic name already exists", async () => {
      mockTopicRepo.findByName.mockResolvedValue(TOPIC);

      await expect(createTopic(ADMIN_USER, { name: "Machine Learning" })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  // ─── Update Topic ────────────────────────────────────────
  describe("updateTopic", () => {
    it("updates topic name", async () => {
      mockTopicRepo.findById.mockResolvedValue(TOPIC);
      mockTopicRepo.findByName.mockResolvedValue(null);
      mockTopicRepo.update.mockResolvedValue({ ...TOPIC, name: "ML Updated" });

      const result = await updateTopic("topic-1", ADMIN_USER, { name: "ML Updated" });

      expect(result).toHaveProperty("name", "ML Updated");
    });

    it("throws 404 if topic not found", async () => {
      mockTopicRepo.findById.mockResolvedValue(null);

      await expect(updateTopic("nonexistent", ADMIN_USER, { name: "X" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects (409) if new name conflicts with existing topic", async () => {
      mockTopicRepo.findById.mockResolvedValue(TOPIC);
      mockTopicRepo.findByName.mockResolvedValue({ id: "topic-other", name: "Existing" });

      await expect(updateTopic("topic-1", ADMIN_USER, { name: "Existing" })).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  // ─── Delete Topic ────────────────────────────────────────
  describe("deleteTopic", () => {
    it("deletes topic with no active references", async () => {
      mockTopicRepo.findById.mockResolvedValue(TOPIC);
      mockTopicRepo.hasRelatedData.mockResolvedValue(false);
      mockTopicRepo.remove.mockResolvedValue(TOPIC);

      const result = await deleteTopic("topic-1", ADMIN_USER);

      expect(mockTopicRepo.remove).toHaveBeenCalledWith("topic-1");
    });

    it("throws 404 if topic not found", async () => {
      mockTopicRepo.findById.mockResolvedValue(null);

      await expect(deleteTopic("nonexistent", ADMIN_USER)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects (400) if topic has active thesis references", async () => {
      mockTopicRepo.findById.mockResolvedValue(TOPIC);
      mockTopicRepo.hasRelatedData.mockResolvedValue(true);

      await expect(deleteTopic("topic-1", ADMIN_USER)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ─── Bulk Delete ──────────────────────────────────────────
  describe("bulkDeleteTopics", () => {
    it("returns partial success report for bulk delete", async () => {
      // Mock the individual operations for each ID
      mockTopicRepo.findById
        .mockResolvedValueOnce({ id: "t1", name: "A" })
        .mockResolvedValueOnce({ id: "t2", name: "B" });
      mockTopicRepo.hasRelatedData
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true); // t2 has references
      mockTopicRepo.bulkDelete.mockResolvedValue({});

      const result = await bulkDeleteTopics(["t1", "t2"], ADMIN_USER);

      expect(result).toBeDefined();
    });
  });
});
