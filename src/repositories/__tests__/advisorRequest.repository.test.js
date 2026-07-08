import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADVISOR_REQUEST_PENDING_REVIEW_STATUSES,
  ADVISOR_REQUEST_STATUS,
} from "../../constants/advisorRequestStatus.js";
import { ROLES } from "../../constants/roles.js";

const prisma = vi.hoisted(() => ({
  thesisAdvisorRequest: {
    findMany: vi.fn(),
  },
  thesis: {
    findMany: vi.fn(),
  },
}));

vi.mock("../../config/prisma.js", () => ({
  default: prisma,
}));

const repo = await import("../advisorRequest.repository.js");

describe("advisorRequest.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads pending lecturer target requests for review", async () => {
    prisma.thesisAdvisorRequest.findMany.mockResolvedValue([]);

    await repo.findByLecturerId("lecturer-1");

    expect(prisma.thesisAdvisorRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lecturerId: "lecturer-1",
          status: { in: ADVISOR_REQUEST_PENDING_REVIEW_STATUSES },
        }),
      }),
    );
  });

  it("loads approved booking cohort for early TA-04 batch thesis query", async () => {
    prisma.thesis.findMany.mockResolvedValue([]);

    await repo.findThesesWithSupervisors("academic-year-1");

    expect(prisma.thesis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicYearId: "academic-year-1",
          advisorRequests: {
            some: {
              academicYearId: "academic-year-1",
              status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
            },
          },
          thesisSupervisors: {
            some: {
              status: "active",
              role: { name: ROLES.PEMBIMBING_1 },
            },
          },
        }),
      }),
    );
  });
});
