import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalizeSupervisorAssignments,
  createSupervisorAssignments,
  replaceSupervisorAssignments,
} from "../../utils/supervisorIntegrity.js";

const roles = [
  { id: "role-p1", name: "Pembimbing 1" },
  { id: "role-p2", name: "Pembimbing 2" },
];

function makeClient(overrides = {}) {
  return {
    userRole: {
      findMany: vi.fn().mockResolvedValue(roles),
    },
    thesisParticipant: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ id: `new-${data.lecturerId}`, ...data, status: "active" })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

describe("supervisorIntegrity", () => {
  let client;

  beforeEach(() => {
    client = makeClient();
  });

  it("rejects two active Pembimbing 1 assignments in the same payload", async () => {
    await expect(
      canonicalizeSupervisorAssignments(client, [
        { lecturerId: "lecturer-a", supervisorRole: "pembimbing_1" },
        { lecturerId: "lecturer-b", supervisorRole: "pembimbing_1" },
      ]),
    ).rejects.toThrow("satu Pembimbing 1 aktif");
  });

  it("rejects the same lecturer as Pembimbing 1 and Pembimbing 2", async () => {
    await expect(
      canonicalizeSupervisorAssignments(client, [
        { lecturerId: "lecturer-a", supervisorRole: "pembimbing_1" },
        { lecturerId: "lecturer-a", supervisorRole: "pembimbing_2" },
      ]),
    ).rejects.toThrow("Dosen yang sama tidak boleh");
  });

  it("rejects create when the thesis already has an active participant for that role", async () => {
    client.thesisParticipant.findMany.mockResolvedValue([
      {
        id: "existing-p1",
        lecturerId: "lecturer-old",
        roleId: "role-p1",
        role: { name: "Pembimbing 1" },
        lecturer: { user: { fullName: "Dosen Lama" } },
      },
    ]);

    await expect(
      createSupervisorAssignments(client, "thesis-1", [
        { lecturerId: "lecturer-new", supervisorRole: "pembimbing_1" },
      ]),
    ).rejects.toThrow("sudah memiliki Pembimbing 1");
  });

  it("replace terminates removed active participants and reactivates explicit targets", async () => {
    client.thesisParticipant.findMany.mockResolvedValue([
      { id: "old-p1", lecturerId: "lecturer-old", roleId: "role-p1" },
      { id: "keep-p2", lecturerId: "lecturer-b", roleId: "role-p2" },
    ]);
    client.thesisParticipant.findFirst.mockResolvedValue({ id: "terminated-p1" });
    client.thesisParticipant.update.mockResolvedValue({
      id: "terminated-p1",
      thesisId: "thesis-1",
      lecturerId: "lecturer-a",
      roleId: "role-p1",
      status: "active",
    });

    const result = await replaceSupervisorAssignments(client, "thesis-1", [
      { lecturerId: "lecturer-a", supervisorRole: "pembimbing_1" },
      { lecturerId: "lecturer-b", supervisorRole: "pembimbing_2" },
    ]);

    expect(client.thesisParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-p1"] } },
      data: { status: "terminated" },
    });
    expect(client.thesisParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "terminated-p1" },
        data: expect.objectContaining({ roleId: "role-p1", status: "active" }),
      }),
    );
    expect(result.terminated).toEqual([{ id: "old-p1", lecturerId: "lecturer-old", roleId: "role-p1" }]);
    expect(result.affectedLecturerIds.sort()).toEqual(["lecturer-a", "lecturer-b", "lecturer-old"]);
  });
});
