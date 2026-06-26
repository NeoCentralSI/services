import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "../../constants/roles.js";

const prisma = vi.hoisted(() => ({
  thesisParticipant: {
    findFirst: vi.fn(),
  },
}));

vi.mock("../../config/prisma.js", () => ({
  default: prisma,
}));

const repo = await import("../thesisGuidance/proposal.repository.js");

describe("thesisGuidance proposal.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds proposal access by active thesis participant lecturer id", async () => {
    prisma.thesisParticipant.findFirst.mockResolvedValue({ id: "participant-1" });

    await repo.findThesisSupervisor("thesis-1", "lecturer-user-1");

    expect(prisma.thesisParticipant.findFirst).toHaveBeenCalledWith({
      where: {
        thesisId: "thesis-1",
        lecturerId: "lecturer-user-1",
        status: "active",
        role: {
          name: {
            in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
          },
        },
      },
    });
  });
});
