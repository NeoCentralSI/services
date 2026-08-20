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

    // The period filter and the lecturer filter are both disjunctions, so they
    // have to sit in separate `AND` entries; as sibling `OR` keys the second
    // would overwrite the first and silently drop a filter. The period clause
    // also matches on the thesis period, because that is the period a booking
    // is charged to once a thesis exists (SIMPTA-FUN-006).
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { academicYearId: "academic-year-1" },
                { thesis: { academicYearId: "academic-year-1" } },
                { thesis: { activeAcademicYearId: "academic-year-1" } },
              ],
            },
            {
              OR: [
                { lecturerId: { in: ["lecturer-1"] } },
                { redirectedTo: { in: ["lecturer-1"] } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("selects the thesis period fields the quota attribution depends on", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      thesisAdvisorRequest: {
        findMany,
      },
    };

    await findTrackedAdvisorRequests(client, "academic-year-1", ["lecturer-1"]);

    // `requestBelongsToQuotaYear` reads these off the request; without them in
    // the projection every request would silently fall back to its own period
    // and the double count would come back.
    const { select } = findMany.mock.calls[0][0];
    expect(select.thesis.select).toMatchObject({
      academicYearId: true,
      activeAcademicYearId: true,
      proposalStatus: true,
    });
  });

  it("overwrites currentCount absolutely instead of incrementing", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "q-1",
      lecturerId: "lec-1",
      academicYearId: "ay-1",
      currentCount: 4,
    });
    const client = {
      lecturerSupervisionQuota: { update },
    };

    const { updateLecturerQuotaCurrentCount } = await import(
      "../../repositories/advisorQuota.repository.js"
    );
    await updateLecturerQuotaCurrentCount(client, "lec-1", "ay-1", 4);

    expect(update).toHaveBeenCalledWith({
      where: {
        lecturerId_academicYearId: { lecturerId: "lec-1", academicYearId: "ay-1" },
      },
      data: { currentCount: 4 },
      select: { id: true, lecturerId: true, academicYearId: true, currentCount: true },
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("increment");
    expect(update.mock.calls[0][0].data).not.toHaveProperty("decrement");
  });
});
