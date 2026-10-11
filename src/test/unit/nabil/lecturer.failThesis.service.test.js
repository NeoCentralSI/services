import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for repository
const mocks = vi.hoisted(() => {
  return {
    repo: {
      getLecturerByUserId: vi.fn(),
      getStudentActiveThesis: vi.fn(),
      countGraduatedAsSupervisor2: vi.fn(),
    },
  };
});

vi.mock("../../../repositories/thesisGuidance/lecturer.guidance.repository.js", () => {
  return {
    getLecturerByUserId: mocks.repo.getLecturerByUserId,
    getStudentActiveThesis: mocks.repo.getStudentActiveThesis,
    countGraduatedAsSupervisor2: mocks.repo.countGraduatedAsSupervisor2,
    // other exports not used in this test can be no-ops
  };
});

import { failStudentThesisService } from "../../../services/thesisGuidance/lecturer.guidance.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// Paket A (K15): the endpoint read ThesisStatus rows "at_risk"/"failed" that never
// existed. Stopping a thesis (status `failed` with a mandatory reason) is an Admin action,
// so the lecturer endpoint is closed.
describe("failStudentThesisService", () => {
  it("is closed with 410 for any input", async () => {
    await expect(
      failStudentThesisService("user-1", "student-1", { reason: "no progress" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("does not look up or change any thesis", async () => {
    await expect(failStudentThesisService("user-1", "student-1")).rejects.toMatchObject({ statusCode: 410 });
    expect(mocks.repo.getLecturerByUserId).not.toHaveBeenCalled();
    expect(mocks.repo.getStudentActiveThesis).not.toHaveBeenCalled();
  });
});
