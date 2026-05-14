import { afterEach, describe, expect, it, vi } from "vitest";

import generated from "../../generated/prisma/index.js";
import errorHandler from "../../middlewares/error.middleware.js";

const { Prisma } = generated;

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe("error.middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Prisma missing-table errors to an actionable schema sync message", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "The table `thesis_participants` does not exist in the current database.",
      {
        code: "P2021",
        clientVersion: "test",
      }
    );
    const req = { originalUrl: "/advisorRequest/access-state" };
    const res = createResponse();

    vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: 500,
        code: "P2021",
        message: expect.stringContaining("Skema database belum sinkron"),
      })
    );
  });
});
