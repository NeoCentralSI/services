import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, closeService, snapshotService, notificationService } = vi.hoisted(() => ({
  prismaMock: {
    academicYear: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    userHasRole: { findMany: vi.fn() },
  },
  closeService: { closeUnfinishedMetopenForYear: vi.fn() },
  snapshotService: { getPeriodSnapshotCoverage: vi.fn() },
  notificationService: { createNotificationEventForUsers: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../services/metopenPeriodClose.service.js", () => closeService);
vi.mock("../../services/studentPeriodSnapshot.service.js", () => snapshotService);
vi.mock("../../services/notification.service.js", () => notificationService);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  formatAcademicYearLabel: (year) => year?.id ?? "year",
  syncAcademicYearActiveFlags: vi.fn(async () => ({ activeId: "ay-new", updated: 1 })),
}));

const { syncActiveAcademicYear } = await import("../academic-year.job.js");

describe("syncActiveAcademicYear — period close hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-new", year: "2026/2027", semester: "ganjil" });
    prismaMock.academicYear.findMany.mockResolvedValue([]);
    prismaMock.userHasRole.findMany.mockResolvedValue([]);
    snapshotService.getPeriodSnapshotCoverage.mockResolvedValue({
      complete: true,
      studentsWithSnapshot: 1,
      totalStudents: 1,
      pendingCreate: 0,
      pendingFill: 0,
      coverageLabel: "1/1",
    });
    closeService.closeUnfinishedMetopenForYear.mockResolvedValue({
      closedAcademicYearId: "ay-old",
      counts: { examined: 1, zeroed: 1, released: 1, closed: 0, skipped: 0 },
    });
  });

  it("closes leftover Metopel on inactive years when the operational year changes", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-old" });
    prismaMock.academicYear.findMany.mockResolvedValue([
      { id: "ay-old", year: "2025/2026", semester: "genap" },
    ]);

    const result = await syncActiveAcademicYear();

    expect(closeService.closeUnfinishedMetopenForYear).toHaveBeenCalledTimes(1);
    expect(closeService.closeUnfinishedMetopenForYear).toHaveBeenCalledWith("ay-old");
    expect(result.changed).toBe(true);
    expect(result.periodClose.closedAcademicYearId).toBe("ay-old");
  });

  it("retries leftover close even when the operational year is unchanged", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-new" });
    prismaMock.academicYear.findMany.mockResolvedValue([
      { id: "ay-old", year: "2025/2026", semester: "genap" },
    ]);

    const result = await syncActiveAcademicYear();

    expect(result.changed).toBe(false);
    expect(closeService.closeUnfinishedMetopenForYear).toHaveBeenCalledWith("ay-old");
    expect(result.periodClose.closedAcademicYearId).toBe("ay-old");
  });

  it("does not close when no inactive year still has leftover proposal theses", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-new" });
    prismaMock.academicYear.findMany.mockResolvedValue([]);

    const result = await syncActiveAcademicYear();

    expect(closeService.closeUnfinishedMetopenForYear).not.toHaveBeenCalled();
    expect(result.periodClose).toBeNull();
  });

  it("alerts Admin and throws when leftover close fails", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-old" });
    prismaMock.academicYear.findMany.mockResolvedValue([
      { id: "ay-old", year: "2025/2026", semester: "genap" },
    ]);
    prismaMock.userHasRole.findMany.mockResolvedValue([{ userId: "admin-1" }]);
    closeService.closeUnfinishedMetopenForYear.mockRejectedValue(new Error("db down"));

    await expect(syncActiveAcademicYear()).rejects.toThrow("db down");
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({
        type: "simpta_metopen_period_close_failed",
      }),
      expect.anything(),
    );
  });
});
