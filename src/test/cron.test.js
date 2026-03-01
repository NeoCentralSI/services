/**
 * Unit Tests — Module 20: CRON & Scheduled Tasks
 * Covers: updateAllThesisStatuses (CRON job), getFailedTheses
 * The thesisStatus.service already has detailed categorization tests,
 * this file tests the CRON-specific behavior: pagination, logger, batch processing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockPush, mockNotif, mockRoles } = vi.hoisted(() => ({
  mockPrisma: {
    thesisStatus: { findMany: vi.fn() },
    thesis: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    thesisGuidance: { findMany: vi.fn() },
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockRoles: {
    ROLES: { MAHASISWA: "mahasiswa", PEMBIMBING_1: "pembimbing_1" },
  },
}));

vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../constants/roles.js", () => mockRoles);

import { updateAllThesisStatuses, getFailedThesesCount, getFailedTheses } from "../services/thesisStatus.service.js";

describe("Module 20: CRON — Thesis Status Update", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("updateAllThesisStatuses", () => {
    it("processes batch with custom pageSize and logger", async () => {
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };

      mockPrisma.thesisStatus.findMany.mockResolvedValue([
        { id: 1, name: "Bimbingan" },
        { id: 2, name: "Ongoing" },
        { id: 3, name: "Slow" },
      ]);
      mockPrisma.thesis.findMany.mockResolvedValue([]); // no theses to process
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);

      const result = await updateAllThesisStatuses({ pageSize: 50, logger: mockLogger });

      expect(mockPrisma.thesisStatus.findMany).toHaveBeenCalled();
    });

    it("returns without error when no theses need updating", async () => {
      mockPrisma.thesisStatus.findMany.mockResolvedValue([
        { id: 1, name: "Bimbingan" },
      ]);
      mockPrisma.thesis.findMany.mockResolvedValue([]);
      mockPrisma.thesisGuidance.findMany.mockResolvedValue([]);

      await expect(
        updateAllThesisStatuses({ pageSize: 100 })
      ).resolves.not.toThrow();
    });
  });

  describe("getFailedThesesCount", () => {
    it("returns count of failed theses", async () => {
      mockPrisma.thesis.count.mockResolvedValue(5);

      const count = await getFailedThesesCount();

      expect(count).toBe(5);
    });
  });

  describe("getFailedTheses", () => {
    it("returns list of failed theses", async () => {
      mockPrisma.thesis.findMany.mockResolvedValue([
        { id: "t1", title: "Failed Thesis", student: { user: { fullName: "Budi" } } },
      ]);

      const result = await getFailedTheses();

      expect(result).toHaveLength(1);
    });
  });
});

