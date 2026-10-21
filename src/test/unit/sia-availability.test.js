import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Before the real SIA API exists, SIA_BASE_URL on
 * neocentral.dev is empty and nothing reads SIA: the scheduled sync is skipped with one log line,
 * and the manual sync is refused with "Sinkronisasi SIA belum tersedia.". The proposal flow keeps
 * working on the flags the Admin entered.
 */
const { siaClient, siaStore, eligibility } = vi.hoisted(() => ({
  siaClient: { fetchStudentsFull: vi.fn(), fetchSemesterEnrollments: vi.fn(), hashStudent: vi.fn() },
  siaStore: { saveStudents: vi.fn(), saveSyncStatus: vi.fn(), cleanupObsoleteStudents: vi.fn(), getSyncStatus: vi.fn(async () => ({ lastRun: null })), getAllCachedStudents: vi.fn(async () => []) },
  eligibility: { applySiaEnrollments: vi.fn(), getPeriodFlagCoverage: vi.fn(async () => null) },
}));
vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../services/sia.client.js", () => siaClient);
vi.mock("../../services/sia.store.js", () => siaStore);
vi.mock("../../services/research-method/eligibility.service.js", () => eligibility);

const { isSiaConfigured, assertSiaConfigured, SIA_NOT_AVAILABLE_MESSAGE } = await import("../../helpers/sia-availability.helper.js");
const { runSiaSync } = await import("../../services/sia.sync.job.js");
const controller = await import("../../controllers/sia.controller.js");

const ORIGINAL = process.env.SIA_BASE_URL;
const res = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });

describe("SIA belum dikonfigurasi (SIA_BASE_URL kosong)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIA_BASE_URL = "";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SIA_BASE_URL;
    else process.env.SIA_BASE_URL = ORIGINAL;
  });

  it("isSiaConfigured reads the raw variable: empty, blank, or missing is not configured", () => {
    expect(isSiaConfigured({ SIA_BASE_URL: "" })).toBe(false);
    expect(isSiaConfigured({ SIA_BASE_URL: "  " })).toBe(false);
    expect(isSiaConfigured({})).toBe(false);
    expect(isSiaConfigured({ SIA_BASE_URL: "http://sia.unand.ac.id" })).toBe(true);
    expect(() => assertSiaConfigured({})).toThrow(SIA_NOT_AVAILABLE_MESSAGE);
    expect(SIA_NOT_AVAILABLE_MESSAGE).toBe("Sinkronisasi SIA belum tersedia.");
  });

  it("the scheduled sync is skipped without an error, with one log line, and reads nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await runSiaSync();
    expect(result).toEqual({ skipped: true, reason: "not_configured" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/dilewati/);
    expect(siaClient.fetchStudentsFull).not.toHaveBeenCalled();
    expect(siaClient.fetchSemesterEnrollments).not.toHaveBeenCalled();
    expect(siaStore.saveSyncStatus).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("POST /sia/sync is refused with the same text; the status says configured: false", async () => {
    const next = vi.fn();
    await controller.triggerSiaSync({}, res(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400, message: "Sinkronisasi SIA belum tersedia." });
    expect(siaClient.fetchStudentsFull).not.toHaveBeenCalled();

    const statusRes = res();
    await controller.siaSyncStatus({}, statusRes, vi.fn());
    expect(statusRes.json.mock.calls[0][0].data.configured).toBe(false);
  });

  it("the cached roster does not fall back to SIA", async () => {
    const out = res();
    await controller.getCachedStudents({}, out, vi.fn());
    expect(siaClient.fetchStudentsFull).not.toHaveBeenCalled();
    expect(out.json).toHaveBeenCalledWith({ success: true, count: 0, data: [] });
  });

  it("with SIA_BASE_URL set the sync runs as before", async () => {
    process.env.SIA_BASE_URL = "http://sia.test";
    siaClient.fetchStudentsFull.mockResolvedValue([]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The rest of the sync needs the database (not mocked here); what matters is that SIA is read.
    const result = await runSiaSync().catch(() => null);
    expect(result?.skipped).toBeUndefined();
    expect(siaClient.fetchStudentsFull).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
