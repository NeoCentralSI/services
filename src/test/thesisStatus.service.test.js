/**
 * Unit Tests — thesisStatus.service: updateAllThesisStatuses
 * Tests the CRON-driven thesis rating update logic:
 *   ONGOING / SLOW / AT_RISK / FAILED based on guidance activity age and deadline
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockPush, mockNotif, mockRoles } = vi.hoisted(() => ({
  mockPrisma: {
    thesisStatus: { findMany: vi.fn() },
    thesis: { findMany: vi.fn(), update: vi.fn() },
    thesisGuidance: { updateMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockRoles: { ROLES: { KETUA_DEPARTEMEN: "Ketua Departemen" } },
}));

vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../services/push.service.js", () => mockPush);
vi.mock("../services/notification.service.js", () => mockNotif);
vi.mock("../constants/roles.js", () => mockRoles);

import { updateAllThesisStatuses } from "../services/thesisStatus.service.js";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const TERMINAL_STATUSES = [
  { id: "ts-selesai", name: "Selesai" },
  { id: "ts-gagal", name: "Gagal" },
  { id: "ts-lulus", name: "Lulus" },
];

const silentLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };

describe("updateAllThesisStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.thesisStatus.findMany.mockResolvedValue(TERMINAL_STATUSES);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.thesisGuidance.updateMany.mockResolvedValue({ count: 0 });
  });

  it("marks ONGOING for thesis with recent guidance activity", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "A", rating: null, createdAt: daysAgo(100), updatedAt: daysAgo(100), thesisStatusId: null,
        thesisGuidances: [{ completedAt: daysAgo(10), approvedDate: daysAgo(10) }],
        student: { user: { id: "u1", fullName: "Budi", identityNumber: "123" } },
      }])
      .mockResolvedValueOnce([]);
    mockPrisma.thesis.update.mockResolvedValue({});

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rating: "ONGOING" } })
    );
    expect(summary.ONGOING).toBe(1);
  });

  it("marks SLOW for thesis with no guidance activity > 60 days", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "B", rating: null, createdAt: daysAgo(200), updatedAt: daysAgo(200), thesisStatusId: null,
        thesisGuidances: [{ completedAt: daysAgo(90), approvedDate: daysAgo(90) }],
        student: { user: { id: "u2", fullName: "Andi", identityNumber: "456" } },
      }])
      .mockResolvedValueOnce([]);
    mockPrisma.thesis.update.mockResolvedValue({});

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rating: "SLOW" } })
    );
    expect(summary.SLOW).toBe(1);
  });

  it("marks AT_RISK for thesis with no guidance activity > 120 days", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "C", rating: null, createdAt: daysAgo(300), updatedAt: daysAgo(300), thesisStatusId: null,
        thesisGuidances: [{ completedAt: daysAgo(150), approvedDate: daysAgo(150) }],
        student: { user: { id: "u3", fullName: "Siti", identityNumber: "789" } },
      }])
      .mockResolvedValueOnce([]);
    mockPrisma.thesis.update.mockResolvedValue({});

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rating: "AT_RISK" } })
    );
    expect(summary.AT_RISK).toBe(1);
  });

  it("marks FAILED for thesis older than 1 year", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "D", rating: "AT_RISK", createdAt: daysAgo(400), updatedAt: daysAgo(400), thesisStatusId: null,
        thesisGuidances: [],
        student: { user: { id: "u4", fullName: "Fadi", identityNumber: "012" } },
      }])
      .mockResolvedValueOnce([]);
    mockPrisma.thesis.update.mockResolvedValue({});

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rating: "FAILED" }),
      })
    );
    expect(summary.FAILED).toBe(1);
  });

  it("skips theses already in terminal statuses (Selesai/Gagal)", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "E", rating: "ONGOING", createdAt: daysAgo(400), updatedAt: daysAgo(400), thesisStatusId: "ts-selesai",
        thesisGuidances: [],
        student: { user: { id: "u5", fullName: "Rini", identityNumber: "111" } },
      }])
      .mockResolvedValueOnce([]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ ONGOING: 0, SLOW: 0, AT_RISK: 0, FAILED: 0 });
  });

  it("does not update thesis if rating hasn't changed", async () => {
    mockPrisma.thesis.findMany
      .mockResolvedValueOnce([{
        id: "F", rating: "ONGOING", createdAt: daysAgo(30), updatedAt: daysAgo(30), thesisStatusId: null,
        thesisGuidances: [{ completedAt: daysAgo(5), approvedDate: daysAgo(5) }],
        student: { user: { id: "u6", fullName: "Joko", identityNumber: "222" } },
      }])
      .mockResolvedValueOnce([]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).not.toHaveBeenCalled();
    expect(summary.ONGOING).toBe(0);
  });
});
