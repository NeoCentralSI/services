/**
 * Unit Tests — thesisStatus.service: updateAllThesisStatuses
 * Tests the CRON-driven thesis rating update logic (Paket A, K15):
 *   ONGOING / SLOW / AT_RISK from TA-phase activity age. The job only reads
 *   theses with status `research`, never changes `status`, never writes
 *   FAILED/CANCELLED and never cancels sessions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesis: { findMany: vi.fn(), update: vi.fn() },
    thesisGuidance: { updateMany: vi.fn() },
  },
}));

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));

import { updateAllThesisStatuses } from "../../../services/thesisStatus.service.js";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const silentLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };

function oneBatch(rows) {
  mockPrisma.thesis.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  mockPrisma.thesis.update.mockResolvedValue({});
}

describe("updateAllThesisStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks ONGOING for thesis with recent guidance activity", async () => {
    oneBatch([{
      id: "A", rating: "SLOW", createdAt: daysAgo(100), updatedAt: daysAgo(100),
      thesisGuidances: [{ completedAt: daysAgo(10), approvedDate: daysAgo(10) }],
    }]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith({ where: { id: "A" }, data: { rating: "ONGOING" } });
    expect(summary.ONGOING).toBe(1);
  });

  it("marks SLOW for thesis with no guidance activity > 60 days", async () => {
    oneBatch([{
      id: "B", rating: "ONGOING", createdAt: daysAgo(200), updatedAt: daysAgo(200),
      thesisGuidances: [{ completedAt: daysAgo(90), approvedDate: daysAgo(90) }],
    }]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith({ where: { id: "B" }, data: { rating: "SLOW" } });
    expect(summary.SLOW).toBe(1);
  });

  it("marks AT_RISK for thesis with no guidance activity > 120 days", async () => {
    oneBatch([{
      id: "C", rating: "ONGOING", createdAt: daysAgo(300), updatedAt: daysAgo(300),
      thesisGuidances: [{ completedAt: daysAgo(150), approvedDate: daysAgo(150) }],
    }]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledWith({ where: { id: "C" }, data: { rating: "AT_RISK" } });
    expect(summary.AT_RISK).toBe(1);
  });

  it("never marks FAILED and never touches status or sessions, even past one year", async () => {
    oneBatch([{
      id: "D", rating: "SLOW", createdAt: daysAgo(400), updatedAt: daysAgo(400),
      thesisGuidances: [],
    }]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.thesis.update).toHaveBeenCalledWith({ where: { id: "D" }, data: { rating: "AT_RISK" } });
    expect(mockPrisma.thesisGuidance.updateMany).not.toHaveBeenCalled();
    expect(summary).toEqual({ ONGOING: 0, SLOW: 0, AT_RISK: 1 });
  });

  it("only reads TA-phase theses (status research) and TA-phase activity", async () => {
    oneBatch([]);

    await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    const args = mockPrisma.thesis.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "research" });
    expect(args.select.thesisGuidances.where).toEqual({ status: "completed", phase: "research" });
    expect(args.select.thesisMilestones.where).toEqual({ phase: "research" });
    expect(args.select).not.toHaveProperty("status");
  });

  it("leaves an existing FAILED/CANCELLED rating as-is", async () => {
    oneBatch([
      { id: "E", rating: "FAILED", createdAt: daysAgo(10), updatedAt: daysAgo(10), thesisGuidances: [] },
      { id: "G", rating: "CANCELLED", createdAt: daysAgo(10), updatedAt: daysAgo(10), thesisGuidances: [] },
    ]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).not.toHaveBeenCalled();
    expect(summary).toEqual({ ONGOING: 0, SLOW: 0, AT_RISK: 0 });
  });

  it("does not update thesis if rating hasn't changed", async () => {
    oneBatch([{
      id: "F", rating: "ONGOING", createdAt: daysAgo(30), updatedAt: daysAgo(30),
      thesisGuidances: [{ completedAt: daysAgo(5), approvedDate: daysAgo(5) }],
    }]);

    const summary = await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    expect(mockPrisma.thesis.update).not.toHaveBeenCalled();
    expect(summary.ONGOING).toBe(0);
  });

  it("never writes any field other than rating", async () => {
    oneBatch([
      { id: "H", rating: "ONGOING", createdAt: daysAgo(500), updatedAt: daysAgo(500), thesisGuidances: [] },
      { id: "I", rating: "AT_RISK", createdAt: daysAgo(5), updatedAt: daysAgo(5), thesisGuidances: [] },
    ]);

    await updateAllThesisStatuses({ pageSize: 500, logger: silentLogger });

    for (const [args] of mockPrisma.thesis.update.mock.calls) {
      expect(Object.keys(args.data)).toEqual(["rating"]);
    }
  });
});
