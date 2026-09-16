import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedis, mockFcm } = vi.hoisted(() => ({
  mockRedis: {
    isOpen: true,
    connect: vi.fn(),
    sAdd: vi.fn(),
    sMembers: vi.fn(),
    sRem: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  mockFcm: {
    getFcmMessaging: vi.fn(),
  },
}));

vi.mock("../../config/redis.js", () => ({ default: mockRedis }));
vi.mock("../../config/fcm.js", () => ({
  getFcmMessaging: mockFcm.getFcmMessaging,
}));
vi.mock("../../config/env.js", () => ({
  ENV: { SKIP_REDIS: false, NODE_ENV: "test" },
}));

const { registerFcmToken, sendFcmToUsers } = await import("../../services/push.service.js");

describe("push.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.isOpen = true;
    mockRedis.connect.mockResolvedValue(undefined);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.sMembers.mockResolvedValue([]);
    mockRedis.sRem.mockResolvedValue(1);
    mockRedis.sAdd.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(1);
    mockFcm.getFcmMessaging.mockReturnValue(null);
  });

  it("registers an FCM token with platform metadata and reverse owner index", async () => {
    const result = await registerFcmToken("user-1", "token-1", "web");

    expect(result).toEqual({ registered: 1 });
    expect(mockRedis.sMembers).toHaveBeenCalledWith("fcm:tokens:user-1");
    expect(mockRedis.sAdd).toHaveBeenCalledTimes(1);

    const [key, rawValue] = mockRedis.sAdd.mock.calls[0];
    expect(key).toBe("fcm:tokens:user-1");
    expect(JSON.parse(rawValue)).toEqual({ token: "token-1", platform: "web" });
    expect(mockRedis.set).toHaveBeenCalledWith("fcm:token-owner:token-1", "user-1");
  });

  it("migrates a token away from its previous owner and removes duplicate records", async () => {
    mockRedis.get.mockResolvedValue("old-user");
    mockRedis.sMembers.mockImplementation(async (key) => {
      if (key === "fcm:tokens:old-user") {
        return ["token-1", JSON.stringify({ token: "token-1", platform: "web" }), "other-token"];
      }
      return [JSON.stringify({ token: "token-1", platform: "android" })];
    });

    await registerFcmToken("user-1", "token-1", "web");

    expect(mockRedis.sRem).toHaveBeenCalledWith("fcm:tokens:old-user", "token-1");
    expect(mockRedis.sRem).toHaveBeenCalledWith(
      "fcm:tokens:old-user",
      JSON.stringify({ token: "token-1", platform: "web" }),
    );
    expect(mockRedis.sRem).toHaveBeenCalledWith(
      "fcm:tokens:user-1",
      JSON.stringify({ token: "token-1", platform: "android" }),
    );
  });

  it("returns a non-fatal failure when FCM multicast send throws", async () => {
    mockRedis.sMembers.mockResolvedValue([JSON.stringify({ token: "token-1", platform: "web" })]);
    mockFcm.getFcmMessaging.mockReturnValue({
      sendEachForMulticast: vi.fn().mockRejectedValue(new Error("bad credentials")),
    });

    const result = await sendFcmToUsers(["user-1"], {
      title: "Judul",
      body: "Isi",
    });

    expect(result).toMatchObject({
      success: false,
      reason: "fcm-send-failed",
      error: "bad credentials",
    });
  });
});
