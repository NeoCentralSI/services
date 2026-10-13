/**
 * Lanjutan Paket E3 — GET /thesisGuidance/monitoring/report/download answers 503 with a
 * message for the user when the PDF converter is not running.
 *
 * Mounts the real monitoring router, role guard, controller and error handler. Only
 * `authGuard` is replaced, Prisma is the in-memory store, and the service is a stub.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./nabil/helpers/fakePrisma.js";

vi.mock("../../config/prisma.js", async () => ({
  default: (await import("./nabil/helpers/fakePrisma.js")).prismaFake,
}));
vi.mock("../../middlewares/auth.middleware.js", async (importOriginal) => ({
  ...(await importOriginal()),
  authGuard: (req, res, next) => {
    const sub = req.headers["x-test-user"];
    if (!sub) return res.status(401).json({ message: "Unauthorized" });
    req.user = { sub };
    return next();
  },
}));

const { monitoringService } = vi.hoisted(() => ({
  monitoringService: { generateProgressReportPdfService: vi.fn(), getProgressReportService: vi.fn() },
}));
vi.mock("../../services/thesisGuidance/monitoring.service.js", () => monitoringService);
vi.mock("../../services/thesisGuidance/thesis-event-monitoring.service.js", () => ({
  getSeminarMonitoring: vi.fn(),
  getDefenceMonitoring: vi.fn(),
}));

const { default: monitoringRouter } = await import("../../routes/thesisGuidance/monitoring.route.js");
const { default: errorHandler } = await import("../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/thesisGuidance/monitoring", monitoringRouter);
app.use(errorHandler);

const PATH = "/thesisGuidance/monitoring/report/download";
const PDF_DOWN = "Layanan pembuat PDF sedang tidak aktif. Hubungi admin sistem.";
const as = (userId) => ({ "x-test-user": userId });

beforeEach(() => {
  vi.clearAllMocks();
  resetDb({
    userHasRole: [
      { userId: "kadep", status: "active", role: { name: "Ketua Departemen" } },
      { userId: "dosen", status: "active", role: { name: "Pembimbing 1" } },
    ],
  });
  monitoringService.generateProgressReportPdfService.mockResolvedValue({
    buffer: Buffer.from("%PDF-1.7 isi laporan"),
    filename: "Laporan_Progress_TA_Ganjil_2026/2027_2026-10-13.pdf",
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /thesisGuidance/monitoring/report/download", () => {
  it("sends the PDF of the chosen semester", async () => {
    const res = await request(app).get(`${PATH}?academicYear=ay-now`).set(as("kadep"));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    // The slash of "2026/2027" cannot stay in a file name.
    expect(res.headers["content-disposition"]).toBe('attachment; filename="Laporan_Progress_TA_Ganjil_2026%2F2027_2026-10-13.pdf"');
    expect(res.body.toString()).toBe("%PDF-1.7 isi laporan");
    expect(monitoringService.generateProgressReportPdfService).toHaveBeenCalledWith({
      academicYearId: "ay-now",
      statusIds: [],
      activityLevels: [],
    });
  });

  it("answers 503 with the message for the user when the PDF converter is not running", async () => {
    monitoringService.generateProgressReportPdfService.mockRejectedValue(Object.assign(new Error(PDF_DOWN), { statusCode: 503 }));

    const res = await request(app).get(PATH).set(as("kadep"));

    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.message).toBe(PDF_DOWN);
    expect(res.body.success).toBe(false);
  });

  it("keeps the general 500 answer for a conversion that failed while the converter is up", async () => {
    monitoringService.generateProgressReportPdfService.mockRejectedValue(new Error("Gagal mengonversi dokumen ke PDF melalui Gotenberg"));

    const res = await request(app).get(PATH).set(as("kadep"));

    // The global error handler does not show the message of a 5xx it did not write itself.
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Terjadi kesalahan pada sistem. Silakan coba lagi.");
  });

  it("leaves other errors of the service to the error handler", async () => {
    monitoringService.generateProgressReportPdfService.mockRejectedValue(
      Object.assign(new Error("Template log catatan (TA-06) belum diupload oleh Sekretaris Departemen. Template dibutuhkan untuk header laporan."), { statusCode: 404 }),
    );

    const res = await request(app).get(PATH).set(as("kadep"));

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/^Template log catatan/);
  });

  it("stays closed to roles without the monitoring page", async () => {
    expect((await request(app).get(PATH).set(as("dosen"))).status).toBe(403);
    expect((await request(app).get(PATH)).status).toBe(401);
    expect(monitoringService.generateProgressReportPdfService).not.toHaveBeenCalled();
  });
});
