import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { finalStages, yudisium } = vi.hoisted(() => ({
  finalStages: {
    getFinalStagesOverview: vi.fn(async () => ({ seminar: null })),
    previewEventStatus: vi.fn(async () => ({ prerequisites: [], effects: ["x"] })),
    previewDeleteEvent: vi.fn(),
    previewApproveRevisions: vi.fn(),
    applyEventStatus: vi.fn(async () => ({ id: "s1" })),
    approveAllRevisions: vi.fn(),
    deleteEvent: vi.fn(),
    updateEventSchedule: vi.fn(),
    kindConfig: (kind) => {
      if (!["seminar", "defence"].includes(kind)) {
        const error = new Error("Jenis harus seminar atau defence.");
        error.statusCode = 400;
        throw error;
      }
      return {};
    },
    EVENT_STATUS_LABELS: { passed: "Lulus" },
  },
  yudisium: {
    PARTICIPANT_STATUS_LABELS: {},
    ...Object.fromEntries([
      "listPeriods", "updatePeriodDates", "getStudentYudisium", "previewRegister", "registerParticipant", "previewRemoveParticipant",
      "removeParticipant", "previewParticipantStatus", "applyParticipantStatus", "setRequirementItems", "setExitSurvey", "setCplScore",
      "setAllCplPassing", "setOneCplFailing", "setCplRecommendation",
    ].map((name) => [name, vi.fn(async () => ({}))])),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: {} }));
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
vi.mock("../../services/devtools/devtools-final-stages.service.js", () => finalStages);
vi.mock("../../services/devtools/devtools-yudisium.service.js", () => yudisium);

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
  ["get", "/devtools/final-stages/s1"],
  ["post", "/devtools/final-stages/s1/seminar/preview"],
  ["post", "/devtools/final-stages/s1/seminar/status"],
  ["post", "/devtools/final-stages/s1/defence/approve-revisions"],
  ["delete", "/devtools/final-stages/s1/defence"],
  ["patch", "/devtools/final-stages/seminar/e1/schedule"],
  ["get", "/devtools/yudisium/periods"],
  ["patch", "/devtools/yudisium/periods/y1"],
  ["get", "/devtools/yudisium/students/s1"],
  ["post", "/devtools/yudisium/students/s1/register"],
  ["delete", "/devtools/yudisium/participants/p1"],
  ["post", "/devtools/yudisium/participants/p1/status"],
  ["post", "/devtools/yudisium/participants/p1/requirements"],
  ["post", "/devtools/yudisium/participants/p1/exit-survey"],
  ["patch", "/devtools/yudisium/students/s1/cpl/c1"],
  ["post", "/devtools/yudisium/students/s1/cpl/all-pass"],
  ["post", "/devtools/yudisium/students/s1/cpl/one-fail"],
  ["post", "/devtools/yudisium/students/s1/cpl/c1/recommendation"],
];

describe("DevTools routes for Seminar Hasil, Sidang TA and Yudisium", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reject unauthenticated requests and every role except Admin, without writing", async () => {
    const app = await appWith();
    for (const [method, url] of ENDPOINTS) {
      expect((await request(app)[method](url).send({})).status).toBe(401);
      for (const role of ["Mahasiswa", "Pembimbing 1", "Ketua Departemen", "Sekretaris Departemen", "GKM"]) {
        expect((await request(app)[method](url).set("x-test-role", role).send({})).status).toBe(403);
      }
    }
    expect(finalStages.applyEventStatus).not.toHaveBeenCalled();
    expect(yudisium.applyParticipantStatus).not.toHaveBeenCalled();
  });

  it("are off in production unless ENABLE_DEVTOOLS is on", async () => {
    const off = await appWith({ NODE_ENV: "production" });
    for (const [method, url] of ENDPOINTS) {
      expect((await request(off)[method](url).set("x-test-role", "Admin").send({})).status).toBe(404);
    }
    const on = await appWith({ NODE_ENV: "production", ENABLE_DEVTOOLS: "true" });
    expect((await request(on).get("/devtools/final-stages/s1").set("x-test-role", "Admin")).status).toBe(200);
  });

  it("pass the Admin as actor", async () => {
    const app = await appWith();
    const res = await request(app).post("/devtools/final-stages/s1/seminar/status").set("x-test-role", "Admin").send({ target: "passed" });
    expect(res.status).toBe(200);
    expect(finalStages.applyEventStatus).toHaveBeenCalledWith({ kind: "seminar", studentId: "s1", target: "passed", mode: "change", actorUserId: "admin-1" });
  });

  it("reject an unknown kind", async () => {
    const app = await appWith();
    expect((await request(app).post("/devtools/final-stages/s1/proposal/status").set("x-test-role", "Admin").send({ target: "passed" })).status).toBe(400);
  });

  it("are not auto-mounted by app.js outside /devtools", () => {
    const routes = fs.readdirSync(path.resolve(process.cwd(), "src/routes")).filter((f) => f.endsWith(".route.js"));
    expect(routes.filter((f) => f.startsWith("devtools"))).toEqual(["devtools.route.js"]);
  });
});
