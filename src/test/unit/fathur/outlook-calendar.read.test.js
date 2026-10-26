import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  thesisGuidance: { findMany: vi.fn() },
}));
const axios = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../config/prisma.js", () => ({ default: prisma }));
vi.mock("axios", () => ({ default: axios }));

const outlook = await import("../../../services/outlook-calendar.service.js");

describe("Outlook events read back into the calendar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads Graph times as UTC (09.00 WIB stays 09.00 WIB)", () => {
    expect(outlook.parseGraphUtcDateTime({ dateTime: "2026-11-15T02:00:00.0000000", timeZone: "UTC" })).toBe("2026-11-15T02:00:00.000Z");
    expect(outlook.parseGraphUtcDateTime({ dateTime: "2026-11-15T09:00:00", timeZone: "Asia/Jakarta" })).toBe("2026-11-15T02:00:00.000Z");
  });

  it("knows the events NeoCentral wrote: hidden mark, body line, or a stored guidance id", () => {
    const marked = { id: "a", singleValueExtendedProperties: [{ id: outlook.NEOCENTRAL_EVENT_PROPERTY_ID, value: "neocentral" }] };
    expect(outlook.isNeoCentralEvent(marked)).toBe(true);
    expect(outlook.isNeoCentralEvent({ id: "b", bodyPreview: "Pelaksanaan Yudisium\nDisinkronkan dari Neo Central." })).toBe(true);
    expect(outlook.isNeoCentralEvent({ id: "c", bodyPreview: "Rapat" }, new Set(["c"]))).toBe(true);
    expect(outlook.isNeoCentralEvent({ id: "d", bodyPreview: "Rapat dosen" })).toBe(false);
  });

  it("new events carry the hidden mark", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u", oauthProvider: "microsoft", oauthRefreshToken: "r" });
    // Token refresh, then the event creation.
    axios.post
      .mockResolvedValueOnce({ data: { access_token: "t", refresh_token: "r", expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { id: "new", webLink: "w" } });
    await outlook.createCalendarEvent("u", { subject: "Bimbingan", startTime: new Date(), endTime: new Date() });
    const createCall = axios.post.mock.calls.find((call) => String(call[0]).endsWith("/me/events"));
    expect(createCall[1].singleValueExtendedProperties).toEqual([{ id: outlook.NEOCENTRAL_EVENT_PROPERTY_ID, value: "neocentral" }]);
  });
});
