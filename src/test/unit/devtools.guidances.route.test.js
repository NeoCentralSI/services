import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { prismaMock, logAudit } = vi.hoisted(() => ({
  prismaMock: {
    thesisGuidance: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  logAudit: vi.fn(),
}));

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
vi.mock("../../services/research-method/eligibility.service.js", () => ({
  setStudentPeriodFlags: vi.fn(),
  ACADEMIC_FLAG_SOURCE: { SIA: "sia", DEVTOOLS: "devtools" },
}));
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit,
  AUDIT_ACTIONS: { GUIDANCE_SCHEDULE_OVERRIDDEN: "GUIDANCE_SCHEDULE_OVERRIDDEN" },
  ENTITY_TYPES: { THESIS_GUIDANCE: "THESIS_GUIDANCE" },
}));

const { default: devtoolsRouter } = await import("../../routes/devtools.route.js");
const { default: errorHandler } = await import("../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/devtools", devtoolsRouter);
app.use(errorHandler);

const ADMIN = { "x-test-role": "Admin" };
const row = (overrides = {}) => ({
  id: "g1",
  status: "accepted",
  phase: "research",
  requestedDate: new Date("2026-10-01T03:00:00.000Z"),
  approvedDate: new Date("2026-10-02T03:00:00.000Z"),
  summarySubmittedAt: null,
  completedAt: null,
  thesis: { id: "t1", title: "Judul", student: { user: { fullName: "Ilham", identityNumber: "2211522028" } } },
  supervisor: { user: { fullName: "Husnil" } },
  ...overrides,
});

describe("devtools guidance routes", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("permissions", () => {
    it("rejects unauthenticated requests", async () => {
      expect((await request(app).get("/devtools/guidances")).status).toBe(401);
      expect((await request(app).patch("/devtools/guidances/g1").send({})).status).toBe(401);
    });

    it("rejects every role except Admin", async () => {
      for (const role of ["Mahasiswa", "Pembimbing 1", "Ketua Departemen", "Sekretaris Departemen"]) {
        const headers = { "x-test-role": role };
        expect((await request(app).get("/devtools/guidances").set(headers)).status).toBe(403);
        expect((await request(app).patch("/devtools/guidances/g1").set(headers).send({})).status).toBe(403);
      }
      expect(prismaMock.thesisGuidance.update).not.toHaveBeenCalled();
    });
  });

  describe("GET /devtools/guidances", () => {
    it("lists sessions with search, status filter and pagination", async () => {
      prismaMock.thesisGuidance.findMany.mockResolvedValue([row()]);
      prismaMock.thesisGuidance.count.mockResolvedValue(41);

      const res = await request(app)
        .get("/devtools/guidances?search=ilham&status=accepted&page=2&pageSize=20")
        .set(ADMIN);

      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
      expect(res.body.data[0]).toMatchObject({
        id: "g1",
        status: "accepted",
        studentName: "Ilham",
        studentNim: "2211522028",
        supervisorName: "Husnil",
        requestedDate: "2026-10-01T03:00:00.000Z",
        approvedDate: "2026-10-02T03:00:00.000Z",
        summarySubmittedAt: null,
        completedAt: null,
      });
      const args = prismaMock.thesisGuidance.findMany.mock.calls[0][0];
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(args.where.status).toBe("accepted");
      expect(args.where.thesis.student.user.OR).toEqual([
        { fullName: { contains: "ilham" } },
        { identityNumber: { contains: "ilham" } },
      ]);
    });

    it("rejects an unknown status filter", async () => {
      const res = await request(app).get("/devtools/guidances?status=bogus").set(ADMIN);
      expect(res.status).toBe(400);
      expect(prismaMock.thesisGuidance.findMany).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /devtools/guidances/:id", () => {
    it("saves past dates without touching the status, and writes an audit log", async () => {
      prismaMock.thesisGuidance.findUnique.mockResolvedValue(row());
      prismaMock.thesisGuidance.update.mockResolvedValue(
        row({ approvedDate: new Date("2020-01-05T02:00:00.000Z"), completedAt: null }),
      );

      const res = await request(app)
        .patch("/devtools/guidances/g1")
        .set(ADMIN)
        .send({ approvedDate: "2020-01-05T02:00:00.000Z", completedAt: null, status: "completed" });

      expect(res.status).toBe(200);
      expect(res.body.data.approvedDate).toBe("2020-01-05T02:00:00.000Z");
      expect(prismaMock.thesisGuidance.update.mock.calls[0][0].data).toEqual({
        approvedDate: new Date("2020-01-05T02:00:00.000Z"),
        completedAt: null,
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "admin-1",
          action: "GUIDANCE_SCHEDULE_OVERRIDDEN",
          entityType: "THESIS_GUIDANCE",
          entityId: "g1",
          oldValues: { approvedDate: new Date("2026-10-02T03:00:00.000Z"), completedAt: null },
          newValues: { approvedDate: new Date("2020-01-05T02:00:00.000Z"), completedAt: null },
        }),
      );
    });

    it.each([
      ["an invalid date", { approvedDate: "not-a-date" }],
      ["an empty requestedDate", { requestedDate: null }],
      ["a body without date fields", { status: "completed" }],
    ])("rejects %s", async (_label, body) => {
      const res = await request(app).patch("/devtools/guidances/g1").set(ADMIN).send(body);
      expect(res.status).toBe(400);
      expect(prismaMock.thesisGuidance.update).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown session", async () => {
      prismaMock.thesisGuidance.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .patch("/devtools/guidances/missing")
        .set(ADMIN)
        .send({ approvedDate: "2026-01-01T00:00:00.000Z" });
      expect(res.status).toBe(404);
      expect(prismaMock.thesisGuidance.update).not.toHaveBeenCalled();
    });
  });
});
