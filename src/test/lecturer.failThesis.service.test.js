import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for repository
const mocks = vi.hoisted(() => {
  return {
    repo: {
      getLecturerByUserId: vi.fn(),
      getStudentActiveThesis: vi.fn(),
      getThesisStatusMap: vi.fn(),
      updateThesisStatusById: vi.fn(),
      countGraduatedAsSupervisor2: vi.fn(),
    },
  };
});

vi.mock("../repositories/thesisGuidance/lecturer.guidance.repository.js", () => {
  return {
    getLecturerByUserId: mocks.repo.getLecturerByUserId,
    getStudentActiveThesis: mocks.repo.getStudentActiveThesis,
    getThesisStatusMap: mocks.repo.getThesisStatusMap,
    updateThesisStatusById: mocks.repo.updateThesisStatusById,
    countGraduatedAsSupervisor2: mocks.repo.countGraduatedAsSupervisor2,
    // other exports not used in this test can be no-ops
  };
});

import { failStudentThesisService } from "../services/thesisGuidance/lecturer.guidance.service.js";

const LECTURER = { id: "lec-1", userId: "user-1" };
const THESIS = { id: "th-1", thesisStatusId: "status-at-risk" };
const STATUS_MAP = new Map([
  ["at_risk", "status-at-risk"],
  ["failed", "status-failed"],
]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("failStudentThesisService", () => {
  it("fails thesis when status is at_risk", async () => {
    mocks.repo.getLecturerByUserId.mockResolvedValueOnce(LECTURER);
    mocks.repo.getStudentActiveThesis.mockResolvedValueOnce(THESIS);
    mocks.repo.getThesisStatusMap.mockResolvedValueOnce(STATUS_MAP);
    mocks.repo.updateThesisStatusById.mockResolvedValueOnce({ id: THESIS.id, thesisStatusId: "status-failed" });

    const res = await failStudentThesisService("user-1", "student-1", { reason: "no progress" });
    expect(res).toEqual({ thesisId: THESIS.id, status: "failed" });

    expect(mocks.repo.updateThesisStatusById).toHaveBeenCalledWith(THESIS.id, "status-failed");
  });

  it("throws 400 if thesis not at_risk", async () => {
    mocks.repo.getLecturerByUserId.mockResolvedValueOnce(LECTURER);
    mocks.repo.getStudentActiveThesis.mockResolvedValueOnce({ ...THESIS, thesisStatusId: "status-ongoing" });
    const map = new Map(STATUS_MAP);
    map.set("ongoing", "status-ongoing");
    mocks.repo.getThesisStatusMap.mockResolvedValueOnce(map);

    await expect(
      failStudentThesisService("user-1", "student-1", { reason: "not at risk" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 404 if lecturer or thesis missing", async () => {
    mocks.repo.getLecturerByUserId.mockResolvedValueOnce(null);
    await expect(
      failStudentThesisService("user-x", "student-1")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
