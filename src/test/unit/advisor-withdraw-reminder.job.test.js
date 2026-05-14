import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockPush } = vi.hoisted(() => ({
  mockPrisma: {
    thesisAdvisorRequest: {
      findMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  mockPush: {
    sendFcmToUsers: vi.fn().mockResolvedValue({ success: true, sent: 1 }),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../services/push.service.js", () => mockPush);

const { runAdvisorWithdrawReminderJob } = await import(
  "../../jobs/advisor-withdraw-reminder.job.js"
);

describe("advisor-withdraw-reminder job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one unlock reminder per request and skips already-reminded requests", async () => {
    const oldDate = new Date(Date.now() - 80 * 60 * 60 * 1000);
    mockPrisma.thesisAdvisorRequest.findMany.mockResolvedValue([
      {
        id: "req-1",
        studentId: "student-1",
        createdAt: oldDate,
        lecturer: { user: { fullName: "Dr. Satu" } },
      },
      {
        id: "req-2",
        studentId: "student-2",
        createdAt: oldDate,
        lecturer: null,
      },
    ]);
    mockPrisma.notification.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ data: { requestId: "req-2" } }]);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-1" });

    const result = await runAdvisorWithdrawReminderJob();

    expect(result).toMatchObject({ total: 2, sent: 1, skipped: 1, failed: 0 });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "student-1",
        type: "advisor_withdraw_unlocked",
        data: expect.objectContaining({ requestId: "req-1" }),
      }),
    });
    expect(mockPush.sendFcmToUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: "req-1",
          type: "advisor_withdraw_unlocked",
        }),
      }),
    );
  });
});
