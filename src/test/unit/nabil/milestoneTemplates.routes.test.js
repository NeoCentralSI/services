/**
 * Milestone template endpoints (route level, real router/guards/controller/service/repo,
 * in-memory Prisma). Covers TA vs Metopen separation, includeInactive scoping and
 * count/list consistency used by TemplateManagementPanel.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./helpers/fakePrisma.js";

vi.mock("../../../config/prisma.js", async () => ({
  default: (await import("./helpers/fakePrisma.js")).prismaFake,
}));
vi.mock("../../../middlewares/auth.middleware.js", async (importOriginal) => ({
  ...(await importOriginal()),
  authGuard: (req, res, next) => {
    const sub = req.headers["x-test-user"];
    if (!sub) return res.status(401).json({ message: "Unauthorized" });
    req.user = { sub };
    return next();
  },
}));

// Readiness lists are stubbed: only the route resolution is under test for them.
vi.mock("../../../services/thesisGuidance/milestone.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getStudentsReadyForSeminar: vi.fn().mockResolvedValue([{ thesisId: "ready-seminar" }]),
  getStudentsReadyForDefence: vi.fn().mockResolvedValue([{ thesisId: "ready-defence" }]),
}));

const { default: milestonesRouter } = await import("../../../routes/milestones.route.js");
const { default: errorHandler } = await import("../../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/milestones", milestonesRouter);
app.use(errorHandler);

const as = (userId) => ({ "x-test-user": userId });
const topicBi = { id: "t-bi", name: "Business Intelligence (BI)" };
const topicPs = { id: "t-ps", name: "Pengembangan Sistem (Enterprise Application)" };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetDb({
    userHasRole: [
      { userId: "sekdep", status: "active", role: { name: "Sekretaris Departemen" } },
      { userId: "stu1", status: "active", role: { name: "Mahasiswa" } },
    ],
    thesisTopic: [topicBi, topicPs],
    thesisMilestoneTemplate: [
      { id: "ps-active", name: "TA aktif", topicId: "t-ps", phase: "research", isActive: true, orderIndex: 0, topic: topicPs },
      { id: "ps-inactive", name: "TA nonaktif", topicId: "t-ps", phase: "research", isActive: false, orderIndex: 1, topic: topicPs },
      // Old-seeder output / Metopen template on the BI topic: must stay hidden from TA views.
      { id: "bi-metopen", name: "Studi Literatur BI & Data Warehouse", topicId: "t-bi", phase: "proposal", isActive: true, orderIndex: 0, topic: topicBi },
    ],
  });
});

const ids = (res) => res.body.data.map((t) => t.id).sort();

describe("GET /milestones/templates", () => {
  it("returns only active TA (phase research) templates by default", async () => {
    const res = await request(app).get("/milestones/templates?topicId=t-ps").set(as("stu1"));
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(["ps-active"]);
  });

  it("never returns Metopen templates, even on a topic that only has Metopen rows", async () => {
    const res = await request(app).get("/milestones/templates?topicId=t-bi&includeInactive=true").set(as("sekdep"));
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([]);
  });

  it("includeInactive=true is honoured for Sekdep (template management)", async () => {
    const res = await request(app).get("/milestones/templates?topicId=t-ps&includeInactive=true").set(as("sekdep"));
    expect(ids(res)).toEqual(["ps-active", "ps-inactive"]);
  });

  it("includeInactive=true is ignored for other roles (student selector stays active-only)", async () => {
    const res = await request(app).get("/milestones/templates?topicId=t-ps&includeInactive=true").set(as("stu1"));
    expect(ids(res)).toEqual(["ps-active"]);
  });
});

describe("GET /milestones/templates/categories (per-topic counts)", () => {
  it("counts with the same filter as the list", async () => {
    const counts = await request(app).get("/milestones/templates/categories?includeInactive=true").set(as("sekdep"));
    const byId = Object.fromEntries(counts.body.data.map((t) => [t.id, t.count]));
    expect(byId).toEqual({ "t-bi": 0, "t-ps": 2 });

    const activeOnly = await request(app).get("/milestones/templates/categories").set(as("sekdep"));
    expect(Object.fromEntries(activeOnly.body.data.map((t) => [t.id, t.count]))).toEqual({ "t-bi": 0, "t-ps": 1 });
  });
});

describe("GET /milestones/ready-for-seminar and /ready-for-defence", () => {
  it("resolve to the readiness lists, not to GET /milestones/:milestoneId", async () => {
    const seminar = await request(app).get("/milestones/ready-for-seminar").set(as("sekdep"));
    expect(seminar.status).toBe(200);
    expect(JSON.stringify(seminar.body)).toContain("ready-seminar");

    const defence = await request(app).get("/milestones/ready-for-defence").set(as("sekdep"));
    expect(defence.status).toBe(200);
    expect(JSON.stringify(defence.body)).toContain("ready-defence");
  });
});
