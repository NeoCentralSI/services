import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  thesis: {
    findMany: vi.fn(async () => []),
  },
};

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));

const { logAudit, listAdminAuditLogs, AUDIT_ACTIONS, ENTITY_TYPES } = await import(
  "../../services/auditLog.service.js"
);

describe("auditLog.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists admin authorization mutations", async () => {
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit-1" });

    await logAudit({
      actorUserId: "admin-1",
      action: AUDIT_ACTIONS.USER_ROLES_UPDATED,
      entityType: ENTITY_TYPES.USER,
      entityId: "user-1",
      oldValues: { roles: ["Mahasiswa"] },
      newValues: { roles: ["Dosen"] },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        action: "USER_ROLES_UPDATED",
        entity: "USER",
        entityId: "user-1",
      }),
    });
  });

  it("lists the sensitive actions with actor names and the object name", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "log-1",
        userId: "admin-1",
        action: "USER_ROLES_UPDATED",
        entity: "USER",
        entityId: "user-1",
        changes: { oldValues: { roles: ["Mahasiswa"] }, newValues: { roles: ["Dosen"] } },
        createdAt: new Date("2026-08-13T00:00:00Z"),
      },
    ]);
    prismaMock.auditLog.count.mockResolvedValue(1);
    prismaMock.user.findMany
      .mockResolvedValueOnce([{ id: "admin-1", fullName: "Admin Uji", email: "admin@dummy.ac.id", identityNumber: "1" }])
      .mockResolvedValueOnce([{ id: "user-1", fullName: "Budi", identityNumber: "2211" }]);

    const result = await listAdminAuditLogs({ page: 1, pageSize: 10 });

    const where = prismaMock.auditLog.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({
      action: { in: expect.arrayContaining(["USER_ROLES_UPDATED", "SUPERVISION_LIMIT_UPDATED", "STUDENT_STATUS_CHANGED"]) },
    });
    expect(where.AND[0].action.in).not.toContain("GUIDANCE_REQUESTED");
    expect(prismaMock.auditLog.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(result.logs[0].actor.fullName).toBe("Admin Uji");
    expect(result.logs[0].objectLabel).toBe("Budi · 2211");
    expect(result.meta.total).toBe(1);
  });

  it("filters by action, object type, date range (Jakarta days) and the actor or object search", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.count.mockResolvedValue(0);
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u-9" }]);
    prismaMock.thesis.findMany.mockResolvedValueOnce([{ id: "t-9" }]);

    await listAdminAuditLogs({ action: "USER_CREATED", entity: "USER", search: "budi", dateFrom: "2026-10-01", dateTo: "2026-10-24" });

    const { AND } = prismaMock.auditLog.findMany.mock.calls[0][0].where;
    expect(AND[0]).toEqual({ action: "USER_CREATED" });
    expect(AND[1]).toEqual({ entity: "USER" });
    expect(AND[2].createdAt.gte.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(AND[2].createdAt.lte.toISOString()).toBe("2026-10-24T16:59:59.999Z");
    expect(AND[3].OR).toEqual(expect.arrayContaining([{ userId: { in: ["u-9"] } }, { entityId: { in: ["u-9", "t-9"] } }]));
  });

  it("ignores an action outside the activity log list", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.count.mockResolvedValue(0);
    await listAdminAuditLogs({ action: "GUIDANCE_REQUESTED" });
    expect(prismaMock.auditLog.findMany.mock.calls[0][0].where.AND[0].action).toHaveProperty("in");
  });
});
