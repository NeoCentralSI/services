import { describe, expect, it, vi } from "vitest";
import { countSemesterIntake } from "../../repositories/thesis-proposal/supervision-quota.repository.js";
import { classifyLoad } from "../../services/thesis-proposal/supervision-quota.service.js";

describe("semester intake", () => {
  it("counts distinct accepted students including assigned and redirected department requests, separately from pending", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { studentId: "s1", lecturerId: "l1", status: "accepted" },
      { studentId: "s1", lecturerId: "l1", status: "assigned" },
      { studentId: "s2", lecturerId: null, redirectedTo: "l1", status: "assigned" },
      { studentId: "s3", lecturerId: "l2", redirectedTo: "l1", status: "redirected" },
      { studentId: "s4", lecturerId: "l1", status: "pending" },
      { studentId: "s5", lecturerId: "l1", status: "pending_kadep" },
    ]);
    const result = await countSemesterIntake("semester", { thesisSupervisorRequest: { findMany } });
    expect(result.get("l1")).toEqual({ acceptedCount: 3, pendingCount: 2 });
    expect(result.has("l2")).toBe(false);
    expect(findMany.mock.calls[0][0].where).toEqual({ academicYearId: "semester", status: { in: ["accepted", "redirected", "assigned", "pending", "under_review", "pending_kadep"] } });
  });
  it("classifies either limit independently and warns at one remaining place", () => {
    const limits = { semesterQuota: 5, totalLimit: 10 };
    expect(classifyLoad(2, limits, 5)).toBe("full");
    expect(classifyLoad(10, limits, 1)).toBe("full");
    expect(classifyLoad(3, limits, 4)).toBe("near_limit");
    expect(classifyLoad(9, limits, 1)).toBe("near_limit");
    expect(classifyLoad(8, limits, 3)).toBe("available");
  });
});
