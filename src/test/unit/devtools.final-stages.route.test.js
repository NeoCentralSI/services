import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { prismaMock, logAudit } = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn(async () => []), count: vi.fn(async () => 0), findUnique: vi.fn(), update: vi.fn() });
  return {
    prismaMock: { thesisSeminar: model(), thesisDefence: model(), yudisium: model(), yudisiumParticipant: model() },
    logAudit: vi.fn(),
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../middlewares/auth.middleware.js", () => ({
  authGuard: (req, res, next) => {
    const role = req.headers["x-test-role"];
    if (!role) return res.status(401).json({ success: false, message: "Unauthorized" });
    req.user = { sub: "admin-1", role };
    return next();
  },
  requireAnyRole: (roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ success: false, message: "Forbidden" }),
}));
vi.mock("../../services/research-method/eligibility.service.js", () => ({ setStudentPeriodFlags: vi.fn(), ACADEMIC_FLAG_SOURCE: { DEVTOOLS: "devtools" } }));
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit,
  AUDIT_ACTIONS: { DEVTOOLS_DATA_CHANGED: "DEVTOOLS_DATA_CHANGED" },
  ENTITY_TYPES: { THESIS: "THESIS", STUDENT: "STUDENT", YUDISIUM: "YUDISIUM" },
}));

async function appWith(env = {}) {
  vi.resetModules();
  const previous = { NODE_ENV: process.env.NODE_ENV, ENABLE_DEVTOOLS: process.env.ENABLE_DEVTOOLS };
  Object.assign(process.env, { NODE_ENV: env.NODE_ENV ?? "test", ENABLE_DEVTOOLS: env.ENABLE_DEVTOOLS ?? "" });
  const { default: router } = await import("../../routes/devtools.route.js");
  const { default: errorHandler } = await import("../../middlewares/error.middleware.js");
  Object.assign(process.env, previous);
  const app = express();
  app.use(express.json());
  app.use("/devtools", router);
  app.use(errorHandler);
  return app;
}

const ENDPOINTS = [
  ["get", "/devtools/seminars"],
  ["patch", "/devtools/seminars/s1"],
  ["get", "/devtools/defences"],
  ["patch", "/devtools/defences/d1"],
  ["get", "/devtools/yudisium-periods"],
  ["patch", "/devtools/yudisium-periods/y1"],
  ["get", "/devtools/yudisium-participants"],
  ["patch", "/devtools/yudisium-participants/p1"],
];

const seminarRow = (overrides = {}) => ({
  id: "s1",
  status: "scheduled",
  date: new Date("2026-11-02T00:00:00.000Z"),
  startTime: new Date("1970-01-01T13:30:00.000Z"),
  endTime: new Date("1970-01-01T15:30:00.000Z"),
  thesisId: "t1",
  thesis: { student: { user: { fullName: "Uji Demo", identityNumber: "2211529202" } } },
  ...overrides,
});

describe("DevTools tables for Seminar Hasil, Sidang and Yudisium", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reject unauthenticated requests and every role except Admin, without writing", async () => {
    const app = await appWith();
    for (const [method, url] of ENDPOINTS) {
      expect((await request(app)[method](url).send({})).status).toBe(401);
      for (const role of ["Mahasiswa", "Pembimbing 1", "Ketua Departemen", "GKM"]) {
        expect((await request(app)[method](url).set("x-test-role", role).send({})).status).toBe(403);
      }
    }
    expect(prismaMock.thesisSeminar.update).not.toHaveBeenCalled();
  });

  it("are off in production unless ENABLE_DEVTOOLS is on", async () => {
    const off = await appWith({ NODE_ENV: "production" });
    for (const [method, url] of ENDPOINTS) {
      expect((await request(off)[method](url).set("x-test-role", "Admin").send({})).status).toBe(404);
    }
    const on = await appWith({ NODE_ENV: "production", ENABLE_DEVTOOLS: "true" });
    expect((await request(on).get("/devtools/seminars").set("x-test-role", "Admin")).status).toBe(200);
  });

  it("writes the status and the schedule as given, with no application rule, and logs it", async () => {
    const app = await appWith();
    prismaMock.thesisSeminar.findUnique.mockResolvedValue(seminarRow());
    prismaMock.thesisSeminar.update.mockImplementation(async ({ data }) => seminarRow(data));
    const res = await request(app).patch("/devtools/seminars/s1").set("x-test-role", "Admin")
      .send({ status: "passed", date: "2020-01-05", startTime: "23:00", endTime: "06:00" });
    expect(res.status).toBe(200);
    expect(prismaMock.thesisSeminar.update.mock.calls[0][0].data).toEqual({
      status: "passed",
      date: new Date("2020-01-05T00:00:00.000Z"),
      startTime: new Date("1970-01-01T23:00:00.000Z"),
      endTime: new Date("1970-01-01T06:00:00.000Z"),
    });
    expect(res.body.data).toMatchObject({ status: "passed", date: "2020-01-05", startTime: "23:00", endTime: "06:00", studentName: "Uji Demo" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "admin-1",
      action: "DEVTOOLS_DATA_CHANGED",
      entityId: "t1",
      oldValues: { eventStatus: "scheduled", date: "2026-11-02", startTime: "13:30", endTime: "15:30" },
      metadata: { source: "devtools", operation: "update", scope: "seminar" },
    }));
  });

  it("Mulai sekarang: start five minutes ago, end two hours from now", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T03:00:00.000Z") }); // 10:00 WIB
    const app = await appWith();
    prismaMock.thesisDefence.findUnique.mockResolvedValue(seminarRow({ id: "d1" }));
    prismaMock.thesisDefence.update.mockImplementation(async ({ data }) => seminarRow({ id: "d1", ...data }));
    const res = await request(app).patch("/devtools/defences/d1").set("x-test-role", "Admin").send({ preset: "now" });
    vi.useRealTimers();
    expect(res.body.data).toMatchObject({ date: "2026-10-25", startTime: "09:55", endTime: "12:00", status: "scheduled" });
  });

  it("Sudah lewat: yesterday at the same clock", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-25T03:00:00.000Z") });
    const app = await appWith();
    prismaMock.thesisSeminar.findUnique.mockResolvedValue(seminarRow());
    prismaMock.thesisSeminar.update.mockImplementation(async ({ data }) => seminarRow(data));
    const res = await request(app).patch("/devtools/seminars/s1").set("x-test-role", "Admin").send({ preset: "past" });
    vi.useRealTimers();
    expect(res.body.data).toMatchObject({ date: "2026-10-24", startTime: "13:30", endTime: "15:30" });
  });

  it("rejects an unknown status and a malformed date", async () => {
    const app = await appWith();
    prismaMock.thesisSeminar.findUnique.mockResolvedValue(seminarRow());
    expect((await request(app).patch("/devtools/seminars/s1").set("x-test-role", "Admin").send({ status: "ongoing" })).status).toBe(400);
    expect((await request(app).patch("/devtools/seminars/s1").set("x-test-role", "Admin").send({ date: "5 Jan" })).status).toBe(400);
    prismaMock.yudisiumParticipant.findUnique.mockResolvedValue({ id: "p1", status: "registered", thesis: { studentId: "st1" } });
    expect((await request(app).patch("/devtools/yudisium-participants/p1").set("x-test-role", "Admin").send({ status: "lulus" })).status).toBe(400);
    expect(prismaMock.thesisSeminar.update).not.toHaveBeenCalled();
  });

  it("sets a participant status directly", async () => {
    const app = await appWith();
    const row = { id: "p1", status: "registered", yudisium: { id: "y1", name: "Yudisium" }, thesis: { studentId: "st1", student: { user: { fullName: "A", identityNumber: "1" } } } };
    prismaMock.yudisiumParticipant.findUnique.mockResolvedValue(row);
    prismaMock.yudisiumParticipant.update.mockResolvedValue({ ...row, status: "finalized" });
    const res = await request(app).patch("/devtools/yudisium-participants/p1").set("x-test-role", "Admin").send({ status: "finalized" });
    expect(res.status).toBe(200);
    expect(prismaMock.yudisiumParticipant.update.mock.calls[0][0].data).toEqual({ status: "finalized" });
  });

  it("are not auto-mounted by app.js outside /devtools", () => {
    const routes = fs.readdirSync(path.resolve(process.cwd(), "src/routes")).filter((f) => f.endsWith(".route.js"));
    expect(routes.filter((f) => f.startsWith("devtools"))).toEqual(["devtools.route.js"]);
  });
});
