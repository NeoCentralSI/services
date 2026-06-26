import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    notification: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

const {
  INTERNAL_NOTIFICATION_TITLES,
  deleteAllNotifications,
  deleteNotification,
} = await import("../../repositories/notification.repository.js");

describe("notification.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("does not delete internal state-tracking notifications in delete all", async () => {
    await deleteAllNotifications("user-1");

    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        title: { notIn: INTERNAL_NOTIFICATION_TITLES },
      },
    });
  });

  it("does not delete internal state-tracking notifications by id", async () => {
    await deleteNotification("notification-1", "user-1");

    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        userId: "user-1",
        title: { notIn: INTERNAL_NOTIFICATION_TITLES },
      },
    });
  });
});
