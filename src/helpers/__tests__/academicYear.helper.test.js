import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  academicYear: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));

const {
  getActiveAcademicYear,
  resolveOperationalAcademicYear,
  syncAcademicYearActiveFlags,
} = await import("../academicYear.helper.js");

const period = (overrides = {}) => ({
  id: "ay-current",
  year: "2025/2026",
  semester: "genap",
  startDate: new Date("2026-01-13T00:00:00.000Z"),
  endDate: new Date("2026-07-31T23:59:59.999Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  isActive: true,
  activeKey: "ACTIVE",
  ...overrides,
});

describe("academicYear.helper — unambiguous operational period", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T02:00:00.000Z"));
    prismaMock.academicYear.updateMany.mockReturnValue({ operation: "clear" });
    prismaMock.academicYear.update.mockReturnValue({ operation: "activate" });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the sole period whose date window contains the current instant", async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([period()]);

    await expect(getActiveAcademicYear()).resolves.toMatchObject({ id: "ay-current" });
    expect(prismaMock.academicYear.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startDate: { lte: expect.any(Date) },
          endDate: { gte: expect.any(Date) },
        },
        take: 2,
      }),
    );
  });

  it("fails closed when date windows overlap", async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([
      period(),
      period({ id: "ay-overlap", semester: "ganjil" }),
    ]);

    await expect(getActiveAcademicYear()).rejects.toMatchObject({ statusCode: 409 });
  });

  it("uses the sole persisted operational flag only during a calendar gap", async () => {
    prismaMock.academicYear.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([period()]);

    await expect(resolveOperationalAcademicYear()).resolves.toMatchObject({
      id: "ay-current",
    });
  });

  it("rejects multiple persisted active flags during a calendar gap", async () => {
    prismaMock.academicYear.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        period(),
        period({ id: "ay-other", activeKey: null }),
      ]);

    await expect(resolveOperationalAcademicYear()).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("supports a transaction client so quota decisions use the same locked view", async () => {
    const transactionClient = {
      academicYear: {
        findMany: vi.fn().mockResolvedValue([period()]),
      },
    };

    await expect(
      resolveOperationalAcademicYear(transactionClient),
    ).resolves.toMatchObject({ id: "ay-current" });
    expect(transactionClient.academicYear.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.academicYear.findMany).not.toHaveBeenCalled();
  });

  it("synchronizes only active markers and never rewrites date boundaries", async () => {
    prismaMock.academicYear.findMany.mockResolvedValue([
      period({ isActive: false, activeKey: null }),
    ]);

    await expect(syncAcademicYearActiveFlags()).resolves.toEqual({
      activeId: "ay-current",
      updated: 1,
    });
    expect(prismaMock.academicYear.update).toHaveBeenCalledWith({
      where: { id: "ay-current" },
      data: { isActive: true, activeKey: "ACTIVE" },
    });
    expect(prismaMock.academicYear.updateMany).toHaveBeenCalledWith({
      where: {
        OR: [{ isActive: true }, { activeKey: { not: null } }],
      },
      data: { isActive: false, activeKey: null },
    });
  });
});
