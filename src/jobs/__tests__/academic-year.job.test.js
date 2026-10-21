import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, eligibilityService, notificationService } = vi.hoisted(() => ({
  prismaMock: {
    academicYear: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    userHasRole: { findMany: vi.fn() },
  },
  eligibilityService: { getPeriodFlagCoverage: vi.fn() },
  notificationService: { createNotificationEventForUsers: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../services/research-method/eligibility.service.js", () => eligibilityService);
vi.mock("../../services/notification.service.js", () => notificationService);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  formatAcademicYearLabel: (year) => year?.id ?? "year",
  syncAcademicYearActiveFlags: vi.fn(async () => ({ activeId: "ay-new", updated: 1 })),
}));

const { syncActiveAcademicYear } = await import("../academic-year.job.js");

const fullCoverage = { totalStudents: 2, studentsWithFlags: 2, studentsWithoutFlags: 0 };

describe("syncActiveAcademicYear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.academicYear.findUnique.mockResolvedValue({ id: "ay-new", year: "2026/2027", semester: "ganjil" });
    prismaMock.userHasRole.findMany.mockResolvedValue([]);
    eligibilityService.getPeriodFlagCoverage.mockResolvedValue(fullCoverage);
  });

  it("reports the change and the SIA flag coverage of the new period", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-old" });

    const result = await syncActiveAcademicYear();

    expect(result.changed).toBe(true);
    expect(result.activeAcademicYearId).toBe("ay-new");
    expect(result.snapshotCoverage).toEqual({ studentsWithFlags: 2, totalStudents: 2, complete: true });
    // No period close; unfinished attempts stay as they are.
    expect(result).not.toHaveProperty("periodClose");
  });

  it("tells Admin to run the SIA sync when the new period has students without flags", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-old" });
    prismaMock.userHasRole.findMany.mockResolvedValue([{ userId: "admin-1" }]);
    eligibilityService.getPeriodFlagCoverage.mockResolvedValue({ totalStudents: 3, studentsWithFlags: 1, studentsWithoutFlags: 2 });

    const result = await syncActiveAcademicYear();

    expect(result.snapshotCoverage.complete).toBe(false);
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({ type: "simpta_period_snapshot_incomplete" }),
      expect.anything(),
    );
  });

  it("does not notify when the period did not change", async () => {
    prismaMock.academicYear.findFirst.mockResolvedValue({ id: "ay-new" });
    eligibilityService.getPeriodFlagCoverage.mockResolvedValue({ totalStudents: 3, studentsWithFlags: 1, studentsWithoutFlags: 2 });

    const result = await syncActiveAcademicYear();

    expect(result.changed).toBe(false);
    expect(notificationService.createNotificationEventForUsers).not.toHaveBeenCalled();
  });
});
