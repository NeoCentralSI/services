/**
 * Paket E3 — Seminar Hasil and Sidang tabs of the monitoring page: the five blocks of one
 * response, built from rows the repositories read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { monitoringRepo, eventRepo } = vi.hoisted(() => ({
  monitoringRepo: { findSemester: vi.fn() },
  eventRepo: { findEvents: vi.fn(), findThesesReadyToRegister: vi.fn() },
}));

vi.mock("../../repositories/thesisGuidance/monitoring.repository.js", () => monitoringRepo);
vi.mock("../../repositories/thesisGuidance/thesis-event-monitoring.repository.js", () => eventRepo);

const { getSeminarMonitoring, getDefenceMonitoring } = await import("../../services/thesisGuidance/thesis-event-monitoring.service.js");

const DAY = 24 * 60 * 60 * 1000;
// Tuesday 13 October 2026, 15.00 WIB.
const NOW = new Date("2026-10-13T08:00:00.000Z");
const before = (days) => new Date(NOW.getTime() - days * DAY);
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const SEMESTER = { academicYearId: "ay-now", academicYear: { id: "ay-now" } };

let sequence = 0;
const row = (status, overrides = {}) => {
  sequence += 1;
  const { name = `MAHASISWA ${sequence}`, nim = `22115290${String(sequence).padStart(2, "0")}`, ...rest } = overrides;
  return {
    id: `event-${sequence}`,
    thesisId: `thesis-${sequence}`,
    status,
    date: null,
    startTime: null,
    endTime: null,
    registeredAt: before(1),
    verifiedAt: null,
    resultFinalizedAt: null,
    revisionFinalizedAt: null,
    finalScore: null,
    createdAt: before(1),
    room: null,
    thesis: { title: `Judul ${sequence}`, student: { user: { fullName: name, identityNumber: nim } } },
    examiners: [],
    ...rest,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  sequence = 0;
  monitoringRepo.findSemester.mockResolvedValue(SEMESTER);
  eventRepo.findEvents.mockResolvedValue([]);
  eventRepo.findThesesReadyToRegister.mockResolvedValue([]);
});

describe("getSeminarMonitoring", () => {
  it("reads the seminars and the ready theses of the chosen semester", async () => {
    await getSeminarMonitoring("ay-now", NOW);

    expect(monitoringRepo.findSemester).toHaveBeenCalledWith("ay-now");
    expect(eventRepo.findEvents).toHaveBeenCalledWith("seminar", SEMESTER);
    expect(eventRepo.findThesesReadyToRegister).toHaveBeenCalledWith("seminar", SEMESTER);
  });

  it("passes no semester for 'Semua Semester'", async () => {
    monitoringRepo.findSemester.mockResolvedValue(null);

    await getSeminarMonitoring(undefined, NOW);

    expect(eventRepo.findEvents).toHaveBeenCalledWith("seminar", null);
    expect(eventRepo.findThesesReadyToRegister).toHaveBeenCalledWith("seminar", null);
  });

  it("returns an empty tab when the semester has no seminar", async () => {
    expect(await getSeminarMonitoring("ay-now", NOW)).toEqual({
      kind: "seminar",
      summary: { total: 0, inProcess: 0, scheduled: 0, passed: 0, revisionPending: 0, notPassed: 0 },
      readyToRegister: [],
      upcoming: [],
      upcomingTotal: 0,
      attention: [],
      items: [],
    });
  });

  it("builds the five blocks from the seminars of the semester", async () => {
    eventRepo.findEvents.mockResolvedValue([
      row("registered", { registeredAt: before(2) }),
      row("registered", { name: "LAMA MENDAFTAR", registeredAt: before(10) }), // attention: 10 days
      row("verified", { verifiedAt: before(20) }), // attention: 20 days
      row("examiner_assigned", { verifiedAt: before(3) }),
      row("scheduled", {
        name: "TERJADWAL MINGGU DEPAN",
        nim: "2211529030",
        date: day("2026-10-20"),
        startTime: time("09:00"),
        endTime: time("11:00"),
        room: { name: "Ruang Seminar SI" },
        examiners: [
          { order: 1, availabilityStatus: "available", lecturer: { user: { fullName: "AINA HUBBY AZIIRA" } } },
          { order: 2, availabilityStatus: "unavailable", lecturer: { user: { fullName: "DITARIK" } } },
          { order: 3, availabilityStatus: "pending", lecturer: { user: { fullName: "ULLYA MEGA WAHYUNI" } } },
        ],
      }),
      row("scheduled", { date: day("2026-10-08") }), // held 5 days ago, result not final: attention
      row("passed", { date: day("2026-09-20"), finalScore: 82, resultFinalizedAt: before(23) }),
      row("passed_with_revision", { date: day("2026-09-01"), finalScore: 76, resultFinalizedAt: before(40) }), // attention: 40 days
      row("passed_with_revision", { date: day("2026-09-10"), finalScore: 79, resultFinalizedAt: before(33), revisionFinalizedAt: before(5) }),
      row("failed", { date: day("2026-09-15"), finalScore: 48, resultFinalizedAt: before(28) }),
      row("cancelled"),
    ]);
    eventRepo.findThesesReadyToRegister.mockResolvedValue([
      {
        id: "thesis-ready",
        title: "Judul Siap",
        student: { user: { fullName: "SIAP SEMINAR", identityNumber: "2211529040" } },
        thesisSupervisors: [
          { lecturer: { user: { fullName: "HUSNIL KAMIL" } }, role: { name: "Pembimbing 1" } },
          { lecturer: { user: { fullName: "AFRIYANTI DWI KARTIKA" } }, role: { name: "Pembimbing 2" } },
        ],
      },
    ]);

    const data = await getSeminarMonitoring("ay-now", NOW);

    expect(data.kind).toBe("seminar");
    // a. cards — no average score on the seminar tab
    expect(data.summary).toEqual({ total: 11, inProcess: 4, scheduled: 2, passed: 3, revisionPending: 1, notPassed: 2 });
    // b. ready to register
    expect(data.readyToRegister).toEqual([
      {
        thesisId: "thesis-ready",
        title: "Judul Siap",
        student: { name: "SIAP SEMINAR", nim: "2211529040" },
        supervisors: [
          { name: "HUSNIL KAMIL", role: "Pembimbing 1" },
          { name: "AFRIYANTI DWI KARTIKA", role: "Pembimbing 2" },
        ],
      },
    ]);
    // c. upcoming: only the one held today or later, with room and the examiners still assigned
    expect(data.upcomingTotal).toBe(1);
    expect(data.upcoming).toHaveLength(1);
    expect(data.upcoming[0]).toMatchObject({
      student: { name: "TERJADWAL MINGGU DEPAN", nim: "2211529030" },
      status: "scheduled",
      date: day("2026-10-20"),
      startTime: time("09:00"),
      endTime: time("11:00"),
      room: "Ruang Seminar SI",
      examiners: [
        { order: 1, name: "AINA HUBBY AZIIRA" },
        { order: 3, name: "ULLYA MEGA WAHYUNI" },
      ],
    });
    expect(data.upcoming[0]).not.toHaveProperty("grade");
    // d. attention: one reason per row, longest wait first
    expect(data.attention.map((item) => [item.status, item.attention.reason, item.attention.days])).toEqual([
      ["passed_with_revision", "revision", 40],
      ["verified", "scheduling", 20],
      ["registered", "document_verification", 10],
      ["scheduled", "result_finalization", 5],
    ]);
    expect(data.attention[2]).toMatchObject({
      student: { name: "LAMA MENDAFTAR" },
      attention: { reasonLabel: "Menunggu verifikasi dokumen", since: before(10) },
    });
    // e. table: every seminar of the semester. Paket E5 (1.4): by the status priority of the
    // seminar module, then latest first by the day it is held, or by its registration while
    // it has no schedule
    expect(data.items).toHaveLength(11);
    expect(data.items.map((item) => [item.status, (item.date ?? item.registeredAt).toISOString().slice(0, 10)])).toEqual([
      ["registered", "2026-10-11"],
      ["registered", "2026-10-03"],
      ["examiner_assigned", "2026-10-12"],
      ["verified", "2026-10-12"],
      ["scheduled", "2026-10-20"],
      ["scheduled", "2026-10-08"],
      ["cancelled", "2026-10-12"],
      ["passed", "2026-09-20"],
      ["failed", "2026-09-15"],
      ["passed_with_revision", "2026-09-10"],
      ["passed_with_revision", "2026-09-01"],
    ]);
    expect(data.items[7]).toMatchObject({ finalScore: 82, room: null, examiners: [], title: "Judul 7" });
  });

  it("shows the ten nearest scheduled seminars and says how many there are", async () => {
    eventRepo.findEvents.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) =>
        row("scheduled", { date: day(`2026-11-${String(28 - index).padStart(2, "0")}`), startTime: time("09:00") }),
      ),
    );

    const data = await getSeminarMonitoring("ay-now", NOW);

    expect(data.upcomingTotal).toBe(13);
    expect(data.upcoming).toHaveLength(10);
    // Nearest first, whatever the order of the rows.
    expect(data.upcoming[0].date).toEqual(day("2026-11-16"));
    expect(data.upcoming[9].date).toEqual(day("2026-11-25"));
    expect(data.items).toHaveLength(13);
  });
});

describe("getDefenceMonitoring", () => {
  it("reads defences and adds the average final score of the ones that passed", async () => {
    eventRepo.findEvents.mockResolvedValue([
      row("passed", { date: day("2026-09-20"), finalScore: 84, grade: "A", resultFinalizedAt: before(23) }),
      row("passed_with_revision", { date: day("2026-09-25"), finalScore: 78, grade: "B+", resultFinalizedAt: before(18) }),
      row("failed", { date: day("2026-09-27"), finalScore: 45, grade: "D", resultFinalizedAt: before(16) }),
      row("scheduled", { date: day("2026-10-21"), startTime: time("13:30") }),
    ]);

    const data = await getDefenceMonitoring("ay-now", NOW);

    expect(eventRepo.findEvents).toHaveBeenCalledWith("defence", SEMESTER);
    expect(eventRepo.findThesesReadyToRegister).toHaveBeenCalledWith("defence", SEMESTER);
    expect(data.kind).toBe("defence");
    expect(data.summary).toEqual({
      total: 4, inProcess: 0, scheduled: 1, passed: 2, revisionPending: 1, notPassed: 1,
      averageFinalScore: 81,
    });
    // Latest first: the scheduled one, then the three that were held.
    expect(data.items.map((item) => item.grade)).toEqual([null, "D", "B+", "A"]);
  });

  it("has no average while no defence has passed with a score", async () => {
    eventRepo.findEvents.mockResolvedValue([row("scheduled", { date: day("2026-10-21") }), row("failed", { finalScore: 40 })]);

    expect((await getDefenceMonitoring("ay-now", NOW)).summary.averageFinalScore).toBeNull();
  });
});
