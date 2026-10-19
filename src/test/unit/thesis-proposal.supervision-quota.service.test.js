/** Batas bimbingan dua tingkat and the withdraw reminder job. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { quotaRepo, prismaMock, notify, requestRepo } = vi.hoisted(() => ({
  quotaRepo: {
    findGeneralQuota: vi.fn(),
    findPeriodQuota: vi.fn(),
    countActiveSupervisions: vi.fn(),
    findActiveSupervisionRows: vi.fn(),
    findLecturersForLoadScreen: vi.fn(),
    upsertGeneralQuota: vi.fn(),
    upsertPeriodQuota: vi.fn(),
    deletePeriodQuota: vi.fn(),
  },
  prismaMock: { academicYear: { findUnique: vi.fn() }, notification: { findFirst: vi.fn() }, lecturer: { findUnique: vi.fn(), update: vi.fn() } },
  notify: { createNotificationEventForUsers: vi.fn() },
  requestRepo: { findStaleWaitingRequests: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-proposal/supervision-quota.repository.js", () => quotaRepo);
vi.mock("../../repositories/thesis-proposal/supervisor-request.repository.js", () => requestRepo);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn(),
  AUDIT_ACTIONS: { SUPERVISION_LIMIT_UPDATED: "SUPERVISION_LIMIT_UPDATED" },
  ENTITY_TYPES: { SUPERVISION_QUOTA: "SUPERVISION_QUOTA" },
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-1", semester: "ganjil", year: "2026/2027" })),
  formatAcademicYearLabel: () => "2026/2027 Ganjil",
}));

const service = await import("../../services/thesis-proposal/supervision-quota.service.js");
const { runSupervisorRequestReminderJob } = await import("../../jobs/supervisor-request-reminder.job.js");

beforeEach(() => {
  vi.clearAllMocks();
  quotaRepo.findGeneralQuota.mockResolvedValue(null);
  quotaRepo.findPeriodQuota.mockResolvedValue(null);
});

describe("applicable limits (10.1)", () => {
  it("period limits win over general limits, which win over the defaults (8/10)", async () => {
    await expect(service.getApplicableLimits("ay-1")).resolves.toEqual({ softLimit: 8, hardLimit: 10, source: "default" });
    quotaRepo.findGeneralQuota.mockResolvedValue({ softLimit: 6, hardLimit: 9 });
    await expect(service.getApplicableLimits("ay-1")).resolves.toEqual({ softLimit: 6, hardLimit: 9, source: "general" });
    quotaRepo.findPeriodQuota.mockResolvedValue({ softLimit: 10, hardLimit: 12 });
    await expect(service.getApplicableLimits("ay-1")).resolves.toEqual({ softLimit: 10, hardLimit: 12, source: "period" });
  });

  it("soft warns, hard is full", () => {
    const limits = { softLimit: 8, hardLimit: 10 };
    expect([7, 8, 9, 10, 31].map((n) => service.classifyLoad(n, limits))).toEqual(["available", "near_limit", "near_limit", "full", "full"]);
  });

  it("validates limits: whole numbers 1–100, soft not above hard", () => {
    expect(() => service.assertLimits({ softLimit: 9, hardLimit: 8 })).toThrow(/tidak boleh lebih besar/);
    expect(() => service.assertLimits({ softLimit: 0, hardLimit: 8 })).toThrow(/1–100/);
    expect(() => service.assertLimits({ softLimit: 8, hardLimit: 10 })).not.toThrow();
  });

  it("load overview breaks the count down by phase", async () => {
    quotaRepo.findLecturersForLoadScreen.mockResolvedValue([{ id: "lec-1", acceptingRequests: true, user: { fullName: "Aina" }, scienceGroup: null }]);
    quotaRepo.findActiveSupervisionRows.mockResolvedValue([
      { lecturerId: "lec-1", role: { name: "Pembimbing 1" }, thesis: { status: "proposal", supervisorAssignedAt: null } },
      { lecturerId: "lec-1", role: { name: "Pembimbing 1" }, thesis: { status: "proposal", supervisorAssignedAt: new Date() } },
      { lecturerId: "lec-1", role: { name: "Pembimbing 2" }, thesis: { status: "research", supervisorAssignedAt: new Date() } },
    ]);
    const overview = await service.getLoadOverview();
    expect(overview.lecturers[0]).toMatchObject({
      activeCount: 3,
      level: "available",
      breakdown: { total: 3, waitingAssignment: 1, proposal: 1, research: 1, onLeave: 0, asSupervisor2: 1 },
    });
  });
});

describe("supervisor request reminder job", () => {
  it("reminds once per request that the 72-hour lock is over", async () => {
    requestRepo.findStaleWaitingRequests.mockResolvedValue([
      { id: "r1", studentId: "s1", lecturer: { user: { fullName: "Dr. Satu" } } },
      { id: "r2", studentId: "s2", lecturer: null },
    ]);
    prismaMock.notification.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "n-old" });
    const result = await runSupervisorRequestReminderJob(new Date("2026-10-14T00:00:00Z"));
    expect(result).toEqual({ total: 2, sent: 1, skipped: 1, failed: 0 });
    expect(requestRepo.findStaleWaitingRequests).toHaveBeenCalledWith(new Date("2026-10-11T00:00:00Z"));
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["s1"],
      expect.objectContaining({ type: "supervisor_request_withdraw_available", data: expect.objectContaining({ requestId: "r1" }) }),
      { push: true },
    );
  });
});
