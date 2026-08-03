import { describe, expect, it, vi } from "vitest";

const prismaMock = {
  thesis: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("../../config/prisma.js", () => ({
  default: prismaMock,
}));

const { reviewTitleReport } = await import("../../services/metopen.service.js");

describe("reviewTitleReport — legacy manual TA-04 review", () => {
  it.each(["accept", "reject"])(
    "rejects the disabled %s path before touching persistence",
    async (action) => {
      await expect(
        reviewTitleReport("thesis-1", action, "Catatan KaDep", "kadep-1"),
      ).rejects.toThrow(/Review TA-04 manual sudah dinonaktifkan/i);

      expect(prismaMock.thesis.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.thesis.update).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );
});
