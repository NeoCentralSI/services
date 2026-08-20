import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_GROUPS,
  mergeLegacyScienceGroups,
} from "../../../scripts/sync-dsi-master.js";

function createTx() {
  return {
    scienceGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    lecturer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    thesisTopic: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe("mergeLegacyScienceGroups", () => {
  let tx;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTx();
    tx.scienceGroup.create.mockImplementation(async ({ data }) => ({
      id: `new-${data.name}`,
      name: data.name,
    }));
  });

  it("merges KBK Sistem Informasi into Sistem Enterprise instead of renaming in place", async () => {
    tx.scienceGroup.findMany.mockImplementation(async ({ where }) => {
      if (where?.name?.notIn) {
        return [{ id: "legacy-kbk-si", name: "KBK Sistem Informasi" }];
      }
      if (where?.name === "Sistem Enterprise") {
        return [{ id: "se-1", name: "Sistem Enterprise" }];
      }
      return [];
    });

    const client = {
      $transaction: async (fn) => fn(tx),
    };

    const result = await mergeLegacyScienceGroups(client);

    expect(result.groups).toEqual(CANONICAL_GROUPS);
    expect(tx.lecturer.updateMany).toHaveBeenCalledWith({
      where: { scienceGroupId: "legacy-kbk-si" },
      data: { scienceGroupId: "se-1" },
    });
    expect(tx.thesisTopic.updateMany).toHaveBeenCalledWith({
      where: { scienceGroupId: "legacy-kbk-si" },
      data: { scienceGroupId: "se-1" },
    });
    expect(tx.scienceGroup.delete).toHaveBeenCalledWith({ where: { id: "legacy-kbk-si" } });
    expect(tx.scienceGroup.create).not.toHaveBeenCalledWith({
      data: { name: "KBK Sistem Informasi" },
    });
    expect(result.groupMerges).toEqual([
      { name: "KBK Sistem Informasi", target: "Sistem Enterprise", action: "merged" },
    ]);
  });
});
