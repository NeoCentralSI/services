import { describe, expect, it, vi } from "vitest";

import { ROLES } from "../../constants/roles.js";
import {
  findTrackedAdvisorRequests,
  findTrackedSupervisorAssignments,
} from "../../repositories/advisorQuota.repository.js";

describe("advisorQuota.repository", () => {
  it("queries active supervisor assignments from thesisSupervisors", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      thesisSupervisors: {
        findMany,
      },
    };

    await findTrackedSupervisorAssignments(client, "academic-year-1", ["lecturer-1"]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        lecturerId: { in: ["lecturer-1"] },
        role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
        thesis: {
          OR: [
            { academicYearId: "academic-year-1" },
            { activeAcademicYearId: "academic-year-1" },
          ],
        },
      },
      select: expect.any(Object),
      orderBy: { createdAt: "desc" },
    });
  });

  it("queries advisor requests scoped to the requested academic year", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      thesisAdvisorRequest: {
        findMany,
      },
    };

    await findTrackedAdvisorRequests(client, "academic-year-1", ["lecturer-1"]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicYearId: "academic-year-1",
          OR: [
            { lecturerId: { in: ["lecturer-1"] } },
            { redirectedTo: { in: ["lecturer-1"] } },
          ],
        }),
      }),
    );
  });
});
