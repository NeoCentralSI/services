/** Indonesian date-time text for notifications ("14 Oktober 2026 14.00 WIB"). */
import { describe, expect, it } from "vitest";
import { formatDateTimeWib, formatDateTimeJakarta } from "../../../utils/date.util.js";

describe("formatDateTimeWib", () => {
  it("formats in Asia/Jakarta with a 24-hour clock and a dot", () => {
    expect(formatDateTimeWib("2026-10-14T07:00:00.000Z")).toBe("14 Oktober 2026 14.00 WIB");
    expect(formatDateTimeWib(new Date("2026-10-13T17:05:00.000Z"))).toBe("14 Oktober 2026 00.05 WIB");
  });

  it("adds the weekday on request", () => {
    expect(formatDateTimeWib("2026-10-14T07:00:00.000Z", { withWeekday: true })).toBe("Rabu, 14 Oktober 2026 14.00 WIB");
  });

  it("returns '-' for empty or invalid input", () => {
    expect(formatDateTimeWib(null)).toBe("-");
    expect(formatDateTimeWib("x")).toBe("-");
  });

  it("leaves the shared formatDateTimeJakarta output unchanged", () => {
    expect(formatDateTimeJakarta("2026-10-14T07:00:00.000Z", { withDay: true })).toBe("Rabu, 2026-10-14 14:00");
  });
});
