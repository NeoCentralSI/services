import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({ default: {} }));

const { generateScores, orderGuard, scheduleFromInput } = await import("../../services/devtools/devtools-final-stages.service.js");
const { derivePeriodStatus, periodPreset } = await import("../../services/devtools/devtools-yudisium.service.js");
const { clockText, eventStart } = await import("../../services/devtools/devtools-support.js");
const { computeEffectiveStatus } = await import("../../utils/seminarStatus.util.js");

const criteria = (maxes) => maxes.map((maxScore, index) => ({ id: `c${index}`, maxScore }));
const seminar = { minimum: 65, examinerCriteria: criteria([15, 10, 10, 10, 10, 15, 15, 15]), supervisorCriteria: [] };
const defence = { minimum: 65, examinerCriteria: criteria([20, 10, 15, 15]), supervisorCriteria: criteria([10, 10, 10, 10]) };
const total = (sheet) => sheet.scores.reduce((sum, s) => sum + s.score, 0);

describe("scores DevTools fills in", () => {
  it.each(["passed", "passed_with_revision", "failed"])("give the chosen seminar result (%s) under the minimum score", (target) => {
    const { examiners, final } = generateScores("seminar", seminar, 2, target);
    expect(examiners).toHaveLength(2);
    expect(examiners.every((e) => e.total === total(e))).toBe(true);
    expect(final).toBe((examiners[0].total + examiners[1].total) / 2);
    expect(target === "failed" ? final < 65 : final >= 65).toBe(true);
  });

  it.each(["passed", "failed"])("give the defence result (%s) as examiner average plus supervisor score", (target) => {
    const { examiners, supervisor, final } = generateScores("defence", defence, 2, target);
    expect(final).toBe((examiners[0].total + examiners[1].total) / 2 + supervisor.total);
    expect(target === "failed" ? final < 65 : final >= 65).toBe(true);
  });

  it("stay inside every criterion's maximum", () => {
    const { examiners } = generateScores("seminar", { ...seminar, minimum: 99 }, 2, "passed");
    for (const sheet of examiners) {
      sheet.scores.forEach((s, index) => expect(s.score).toBeLessThanOrEqual(seminar.examinerCriteria[index].maxScore));
    }
  });

  it("refuse a pass the rubric cannot reach and a fail under a minimum of 0", () => {
    expect(() => generateScores("seminar", { ...seminar, minimum: 101 }, 2, "passed")).toThrow("tidak mencapai nilai minimum");
    expect(() => generateScores("seminar", { ...seminar, minimum: 0 }, 2, "failed")).toThrow("Tidak Lulus tidak bisa dibuat");
  });
});

describe("schedule presets", () => {
  const now = new Date("2026-10-25T03:00:00.000Z"); // 10:00 WIB
  const current = { date: new Date("2026-11-02T00:00:00.000Z"), startTime: new Date("1970-01-01T13:30:00.000Z"), endTime: new Date("1970-01-01T15:30:00.000Z") };

  it("Mulai sekarang starts five minutes ago and ends two hours from now; the module shows Sedang Berlangsung", () => {
    const slot = scheduleFromInput({ preset: "now" }, current, now);
    expect(slot.date.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(clockText(slot.startTime)).toBe("09:55");
    expect(clockText(slot.endTime)).toBe("12:00");
    expect(eventStart(slot.date, slot.startTime).toISOString()).toBe("2026-10-25T02:55:00.000Z");
    vi.useFakeTimers({ now });
    expect(computeEffectiveStatus("scheduled", slot.date, slot.startTime, slot.endTime)).toBe("ongoing");
    vi.useRealTimers();
  });

  it("Sudah lewat is yesterday and Besok is tomorrow, at the same clock", () => {
    const past = scheduleFromInput({ preset: "past" }, current, now);
    const tomorrow = scheduleFromInput({ preset: "tomorrow" }, current, now);
    expect(past.date.toISOString().slice(0, 10)).toBe("2026-10-24");
    expect(tomorrow.date.toISOString().slice(0, 10)).toBe("2026-10-26");
    expect([clockText(past.startTime), clockText(tomorrow.endTime)]).toEqual(["13:30", "15:30"]);
  });

  it("Mulai sekarang late in the evening keeps the end on the same day", () => {
    const slot = scheduleFromInput({ preset: "now" }, current, new Date("2026-10-25T16:30:00.000Z")); // 23:30 WIB
    expect(clockText(slot.startTime)).toBe("23:25");
    expect(clockText(slot.endTime)).toBe("23:59");
  });

  it("accepts any date and time, also in the past, but keeps the start before the end", () => {
    const slot = scheduleFromInput({ date: "2019-03-04", startTime: "05:00", endTime: "05:30" }, current, now);
    expect(slot.date.toISOString()).toBe("2019-03-04T00:00:00.000Z");
    expect(() => scheduleFromInput({ startTime: "11:00", endTime: "10:00" }, current, now)).toThrow("Jam mulai harus sebelum jam selesai");
    expect(() => scheduleFromInput({ date: "4 Maret" }, current, now)).toThrow("YYYY-MM-DD");
  });
});

describe("yudisium period presets", () => {
  const now = new Date("2026-10-25T05:00:00.000Z");
  it.each([["open", "open"], ["close", "closed"], ["event", "ongoing"]])("%s gives consistent dates and the status %s", (preset, status) => {
    const dates = periodPreset(preset, now);
    expect(dates.registrationOpenDate <= dates.registrationCloseDate).toBe(true);
    expect(dates.registrationCloseDate <= dates.eventDate).toBe(true);
    expect(derivePeriodStatus(dates, now)).toBe(status);
  });
});

describe("order guards", () => {
  it("a seminar is locked by a defence, a defence by a yudisium registration", () => {
    expect(orderGuard("seminar", { defences: [{ id: "d" }], hasYudisium: false })).toMatch("Hapus sidang mahasiswa ini terlebih dahulu");
    expect(orderGuard("seminar", { defences: [], hasYudisium: true })).toBeNull();
    expect(orderGuard("defence", { defences: [{ id: "d" }], hasYudisium: true })).toMatch("Hapus mahasiswa ini dari periode yudisium terlebih dahulu");
    expect(orderGuard("defence", { defences: [{ id: "d" }], hasYudisium: false })).toBeNull();
  });
});
