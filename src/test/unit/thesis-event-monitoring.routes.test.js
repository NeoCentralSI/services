/**
 * Paket E3 — GET /thesisGuidance/monitoring/seminars and /defences are open to the roles of
 * the monitoring dashboard (Ketua Departemen, Sekretaris Departemen, GKM), read-only.
 *
 * Mounts the real monitoring router with the real role guard. Only `authGuard` is replaced
 * (reads the user id from an `x-test-user` header) and Prisma is the in-memory store.
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
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn() }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn() }));

const { eventService } = vi.hoisted(() => ({
  eventService: { getSeminarMonitoring: vi.fn(), getDefenceMonitoring: vi.fn() },
}));
vi.mock("../../services/thesisGuidance/thesis-event-monitoring.service.js", () => eventService);

const { default: monitoringRouter } = await import("../../routes/thesisGuidance/monitoring.route.js");
const { default: errorHandler } = await import("../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/thesisGuidance/monitoring", monitoringRouter);
app.use(errorHandler);

const as = (userId) => ({ "x-test-user": userId });
const role = (userId, name, status = "active") => ({ userId, status, role: { name } });

const ENDPOINTS = [
  ["/thesisGuidance/monitoring/seminars", "getSeminarMonitoring", "seminar"],
  ["/thesisGuidance/monitoring/defences", "getDefenceMonitoring", "defence"],
];

beforeEach(() => {
  vi.clearAllMocks();
  resetDb({
    userHasRole: [
      role("kadep", "Ketua Departemen"),
      role("sekdep", "Sekretaris Departemen"),
      role("gkm", "GKM"),
      role("dosen", "Pembimbing 1"),
      role("dosen", "Penguji"),
      role("mahasiswa", "Mahasiswa"),
      role("admin", "Admin"),
      // A department role that is no longer active does not open the page.
      role("mantan-kadep", "Ketua Departemen", "inactive"),
      role("mantan-kadep", "Pembimbing 1"),
    ],
  });
  eventService.getSeminarMonitoring.mockResolvedValue({ kind: "seminar", items: [] });
  eventService.getDefenceMonitoring.mockResolvedValue({ kind: "defence", items: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each(ENDPOINTS)("GET %s", (path, serviceName, kind) => {
  it.each(["kadep", "sekdep", "gkm"])("answers the %s", async (userId) => {
    const res = await request(app).get(`${path}?academicYear=ay-now`).set(as(userId));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { kind, items: [] } });
    expect(eventService[serviceName]).toHaveBeenCalledWith("ay-now");
  });

  it.each(["dosen", "mahasiswa", "admin", "mantan-kadep"])("refuses the %s with 403", async (userId) => {
    const res = await request(app).get(path).set(as(userId));

    expect(res.status).toBe(403);
    expect(eventService[serviceName]).not.toHaveBeenCalled();
  });

  it("refuses a request without a session with 401", async () => {
    const res = await request(app).get(path);

    expect(res.status).toBe(401);
    expect(eventService[serviceName]).not.toHaveBeenCalled();
  });

  it("asks for every semester when no semester is given", async () => {
    const res = await request(app).get(path).set(as("kadep"));

    expect(res.status).toBe(200);
    expect(eventService[serviceName]).toHaveBeenCalledWith(undefined);
  });

  it.each(["post", "put", "patch", "delete"])("has no %s: the tab cannot change a seminar or a defence", async (method) => {
    const res = await request(app)[method](path).set(as("kadep")).send({ status: "passed" });

    expect(res.status).toBe(404);
    expect(eventService[serviceName]).not.toHaveBeenCalled();
  });
});
