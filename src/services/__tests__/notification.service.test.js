import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/notification.repository.js", () => ({
  findNotificationsByUserId: vi.fn(),
  countUnreadNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
  markAllNotificationsAsRead: vi.fn(),
  createNotification: vi.fn(),
  createNotificationsMany: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
  findThesisDeletionNotification: vi.fn(),
}));

vi.mock("../push.service.js", () => ({
  sendFcmToUsers: vi.fn(),
}));

const notificationRepo = await import("../../repositories/notification.repository.js");
const pushService = await import("../push.service.js");
const { createNotificationEventForUsers } = await import("../notification.service.js");

describe("notification.service — createNotificationEventForUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationRepo.createNotificationsMany.mockResolvedValue({ count: 2 });
    pushService.sendFcmToUsers.mockResolvedValue({ successCount: 2, failureCount: 0 });
  });

  it("creates in-app rows with type/data and sends FCM when push is enabled", async () => {
    const result = await createNotificationEventForUsers(
      ["user-1", "user-2", "user-1"],
      {
        title: "Pengajuan Baru",
        message: "Ada pengajuan yang perlu ditinjau.",
        type: "simpta_advisor_request_submitted",
        data: {
          route: "/dosen/inbox-pembimbing",
          requestId: "req-1",
        },
      },
      { push: true },
    );

    expect(notificationRepo.createNotificationsMany).toHaveBeenCalledWith([
      {
        userId: "user-1",
        title: "Pengajuan Baru",
        message: "Ada pengajuan yang perlu ditinjau.",
        type: "simpta_advisor_request_submitted",
        data: {
          route: "/dosen/inbox-pembimbing",
          requestId: "req-1",
          type: "simpta_advisor_request_submitted",
        },
      },
      {
        userId: "user-2",
        title: "Pengajuan Baru",
        message: "Ada pengajuan yang perlu ditinjau.",
        type: "simpta_advisor_request_submitted",
        data: {
          route: "/dosen/inbox-pembimbing",
          requestId: "req-1",
          type: "simpta_advisor_request_submitted",
        },
      },
    ]);
    expect(pushService.sendFcmToUsers).toHaveBeenCalledWith(
      ["user-1", "user-2"],
      expect.objectContaining({
        title: "Pengajuan Baru",
        body: "Ada pengajuan yang perlu ditinjau.",
        dataOnly: true,
        data: expect.objectContaining({
          route: "/dosen/inbox-pembimbing",
          requestId: "req-1",
          type: "simpta_advisor_request_submitted",
        }),
      }),
    );
    expect(result.inApp).toEqual({ count: 2 });
  });

  it("does not send FCM when push is disabled", async () => {
    await createNotificationEventForUsers(
      ["user-1"],
      {
        title: "Status berubah",
        message: "Status sudah diperbarui.",
        type: "simpta_status_updated",
        data: { route: "/metopel" },
      },
      { push: false },
    );

    expect(notificationRepo.createNotificationsMany).toHaveBeenCalledTimes(1);
    expect(pushService.sendFcmToUsers).not.toHaveBeenCalled();
  });
});
