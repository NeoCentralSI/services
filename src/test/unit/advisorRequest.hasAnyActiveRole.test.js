import { describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    userHasRole: { findFirst: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

import { hasAnyActiveRole } from "../../repositories/advisorRequest.repository.js";

describe("hasAnyActiveRole", () => {
  it("selects the composite UserHasRole key instead of a nonexistent id", async () => {
    mockPrisma.userHasRole.findFirst.mockResolvedValue({ userId: "user-1", roleId: "role-1" });

    const hit = await hasAnyActiveRole("user-1", ["Sekretaris Departemen"]);

    expect(hit).toEqual({ userId: "user-1", roleId: "role-1" });
    expect(mockPrisma.userHasRole.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "active",
        role: { name: { in: ["Sekretaris Departemen"] } },
      },
      select: { userId: true, roleId: true },
    });
  });
});
