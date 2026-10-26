import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Log Aktivitas: Admin, Ketua and Sekretaris Departemen read the same list; other lecturers and
 * students are refused by the backend. Master data routes write their activity log after a
 * successful change only.
 */
const { logAudit } = vi.hoisted(() => ({ logAudit: vi.fn() }));

vi.mock("../../middlewares/auth.middleware.js", () => ({
  authGuard: (req, res, next) => {
    const role = req.headers["x-test-role"];
    if (!role) return res.status(401).json({ success: false, message: "Unauthorized" });
    req.user = { sub: "user-1", role };
    return next();
  },
  requireRole: (role) => (req, res, next) => (req.user.role === role ? next() : res.status(403).json({ success: false })),
  requireAnyRole: (roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ success: false })),
}));
vi.mock("../../middlewares/file.middleware.js", () => ({ uploadCsv: (q, s, n) => n(), uploadSpreadsheetFile: (q, s, n) => n() }));
// Every controller of the router answers 200; only the role guards are under test.
vi.mock("../../controllers/adminfeatures.controller.js", async () => {
  const source = readFileSync(fileURLToPath(new URL("../../routes/adminfeatures.route.js", import.meta.url)), "utf8");
  const names = source.match(/import \{([^}]+)\} from "\.\.\/controllers\/adminfeatures\.controller\.js"/)[1].split(",").map((n) => n.trim());
  return Object.fromEntries(names.map((name) => [name, (req, res) => res.status(200).json({ success: true, name })]));
});
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit,
  AUDIT_ACTIONS: { ASSESSMENT_MASTER_CHANGED: "ASSESSMENT_MASTER_CHANGED" },
  ENTITY_TYPES: { CPMK: "CPMK" },
}));

const { default: adminRouter } = await import("../../routes/adminfeatures.route.js");
const { logMasterDataChange } = await import("../../middlewares/activity-log.middleware.js");

const app = express();
app.use(express.json());
app.use("/adminfeatures", adminRouter);

describe("Log Aktivitas access", () => {
  it.each(["Admin", "Ketua Departemen", "Sekretaris Departemen"])("%s reads the activity log", async (role) => {
    const res = await request(app).get("/adminfeatures/audit-logs").set("x-test-role", role);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("getAdminAuditLogsController");
  });

  it.each(["Pembimbing 1", "Penguji", "GKM", "Mahasiswa"])("%s is refused", async (role) => {
    expect((await request(app).get("/adminfeatures/audit-logs").set("x-test-role", role)).status).toBe(403);
  });

  it("needs a login", async () => {
    expect((await request(app).get("/adminfeatures/audit-logs")).status).toBe(401);
  });

  it("the user list stays Admin only", async () => {
    expect((await request(app).get("/adminfeatures/users").set("x-test-role", "Ketua Departemen")).status).toBe(403);
  });
});

describe("master data activity log middleware", () => {
  beforeEach(() => vi.clearAllMocks());
  const mini = express();
  mini.use(express.json());
  mini.use((req, res, next) => { req.user = { sub: "sekdep-1" }; next(); });
  mini.patch("/cpmks/:id", logMasterDataChange({ entity: "CPMK", scope: "thesis", idParam: "id" }), (req, res) =>
    req.body.fail ? res.status(400).json({ message: "x" }) : res.json({ data: { id: req.params.id, code: "CPMK-1" } }),
  );

  it("logs a successful change with what was asked and the object name", async () => {
    await request(mini).patch("/cpmks/c1").send({ description: "Baru" });
    await new Promise((r) => setTimeout(r, 0));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "sekdep-1",
      action: "ASSESSMENT_MASTER_CHANGED",
      entityType: "CPMK",
      entityId: "c1",
      newValues: { description: "Baru" },
      metadata: { operation: "update", scope: "thesis", objectLabel: "CPMK-1" },
    }));
  });

  it("writes nothing when the change is refused", async () => {
    await request(mini).patch("/cpmks/c1").send({ fail: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(logAudit).not.toHaveBeenCalled();
  });
});
