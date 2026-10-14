import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * DevTools tab Proposal (Paket P, plan 10.8): SIA flags per semester and the sending time of a
 * Pengajuan Pembimbing (to test the 72-hour withdraw rule without waiting).
 */
const { prismaMock, logAudit } = vi.hoisted(() => ({
  prismaMock: {
    student: { findUnique: vi.fn() },
    academicYear: { findMany: vi.fn() },
    studentAcademicYearSnapshot: { findMany: vi.fn() },
    thesisSupervisorRequest: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  AUDIT_ACTIONS: { SUPERVISOR_REQUEST_TIME_OVERRIDDEN: "SUPERVISOR_REQUEST_TIME_OVERRIDDEN" },
  ENTITY_TYPES: { THESIS_SUPERVISOR_REQUEST: "THESIS_SUPERVISOR_REQUEST" },
}));

const { default: devtoolsRouter } = await import("../../routes/devtools.route.js");
const { default: errorHandler } = await import("../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/devtools", devtoolsRouter);
app.use(errorHandler);

const ADMIN = { "x-test-role": "Admin" };
const SENT = new Date("2026-10-10T03:00:00.000Z");
const requestRow = (overrides = {}) => ({
  id: "r1",
  status: "pending",
  route: "direct",
  createdAt: SENT,
  proposedTitle: "Judul",
  academicYear: { semester: "ganjil", year: "2026/2027" },
  student: { user: { fullName: "Uji Proposal", identityNumber: "2211528002" } },
  lecturer: { user: { fullName: "Husnil Kamil" } },
  ...overrides,
});

describe("DevTools tab Proposal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is for Admin only", async () => {
    expect((await request(app).get("/devtools/supervisor-requests")).status).toBe(401);
    expect((await request(app).get("/devtools/supervisor-requests").set({ "x-test-role": "Mahasiswa" })).status).toBe(403);
  });

  it("lists every period with the student's flags, unknown flags as null", async () => {
    prismaMock.student.findUnique.mockResolvedValue({ id: "s1" });
    prismaMock.academicYear.findMany.mockResolvedValue([
      { id: "ay-ganjil", year: "2026/2027", semester: "ganjil", isActive: true },
      { id: "ay-genap", year: "2025/2026", semester: "genap", isActive: false },
    ]);
    prismaMock.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      { academicYearId: "ay-genap", eligibleResearchMethod: true, takingThesisCourse: false, eligibilitySource: "sia", thesisCourseSource: "sia" },
    ]);
    const res = await request(app).get("/devtools/students/s1/period-flags").set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => [r.academicYearLabel, r.eligibleResearchMethod ?? null, r.takingThesisCourse ?? null])).toEqual([
      ["2026/2027 Ganjil", null, null],
      ["2025/2026 Genap", true, false],
    ]);
  });

  it("lists requests with the time the 72-hour withdraw opens", async () => {
    prismaMock.thesisSupervisorRequest.findMany.mockResolvedValue([requestRow()]);
    prismaMock.thesisSupervisorRequest.count.mockResolvedValue(1);
    const res = await request(app).get("/devtools/supervisor-requests?search=2211528002").set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: "r1", student: { nim: "2211528002" }, academicYearLabel: "2026/2027 Ganjil" });
    expect(new Date(res.body.data[0].withdrawAvailableAt).getTime() - SENT.getTime()).toBe(72 * 60 * 60 * 1000);
    expect(prismaMock.thesisSupervisorRequest.findMany.mock.calls[0][0].where.student.user.OR).toHaveLength(2);
  });

  it("moves the sending time back and records it in the audit log", async () => {
    const backdated = new Date(SENT.getTime() - 73 * 60 * 60 * 1000);
    prismaMock.thesisSupervisorRequest.findUnique.mockResolvedValue(requestRow());
    prismaMock.thesisSupervisorRequest.update.mockResolvedValue(requestRow({ createdAt: backdated }));
    const res = await request(app).patch("/devtools/supervisor-requests/r1").set(ADMIN).send({ createdAt: backdated.toISOString() });
    expect(res.status).toBe(200);
    expect(prismaMock.thesisSupervisorRequest.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1" }, data: { createdAt: backdated } }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "SUPERVISOR_REQUEST_TIME_OVERRIDDEN",
      entityId: "r1",
      oldValues: { createdAt: SENT },
      newValues: { createdAt: backdated },
    }));
  });

  it("rejects a missing, invalid or future time, and an unknown request", async () => {
    for (const createdAt of [undefined, "bukan-tanggal", new Date(Date.now() + 60_000).toISOString()]) {
      const res = await request(app).patch("/devtools/supervisor-requests/r1").set(ADMIN).send({ createdAt });
      expect(res.status).toBe(400);
    }
    prismaMock.thesisSupervisorRequest.findUnique.mockResolvedValue(null);
    const res = await request(app).patch("/devtools/supervisor-requests/x").set(ADMIN).send({ createdAt: SENT.toISOString() });
    expect(res.status).toBe(404);
    expect(prismaMock.thesisSupervisorRequest.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
