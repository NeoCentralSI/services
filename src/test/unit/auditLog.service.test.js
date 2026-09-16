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

  it("lists only admin authorization actions with actor names", async () => {
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
    prismaMock.user.findMany.mockResolvedValue([
      { id: "admin-1", fullName: "Admin Uji", email: "admin@dummy.ac.id", identityNumber: "1" },
    ]);

    const result = await listAdminAuditLogs({ page: 1, pageSize: 10 });

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { in: expect.arrayContaining(["USER_ROLES_UPDATED", "QUOTA_DEFAULT_UPDATED"]) },
        }),
      }),
    );
    expect(result.logs[0].actor.fullName).toBe("Admin Uji");
    expect(result.meta.total).toBe(1);
  });
});
