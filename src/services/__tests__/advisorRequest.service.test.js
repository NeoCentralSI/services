import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/advisorRequest.repository.js", () => ({
  findById: vi.fn(),
  findAlternativeLecturers: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({
  default: {
    academicYear: { findFirst: vi.fn() },
  },
}));

const repo = await import("../../repositories/advisorRequest.repository.js");
const prisma = (await import("../../config/prisma.js")).default;
const { getRecommendations } = await import("../advisorRequest.service.js");

describe("advisorRequest.service — getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses topic.scienceGroupId (not lecturer.scienceGroupId) for KBK matching", async () => {
    const topicScienceGroupId = "kbk-from-topic";
    const lecturerScienceGroupId = "kbk-from-lecturer";

    repo.findById.mockResolvedValue({
      id: "req-1",
      topicId: "topic-1",
      lecturerId: "lect-1",
      topic: { id: "topic-1", scienceGroupId: topicScienceGroupId },
      lecturer: {
        id: "lect-1",
        scienceGroupId: lecturerScienceGroupId,
        user: { fullName: "Dr. Target" },
      },
    });

    prisma.academicYear.findFirst.mockResolvedValue({ id: "ay-1" });
    repo.findAlternativeLecturers.mockResolvedValue([]);

    await getRecommendations("req-1");

    expect(repo.findAlternativeLecturers).toHaveBeenCalledWith(
      topicScienceGroupId,
      "ay-1",
      "lect-1"
    );
  });

  it("returns clear message when topic has no scienceGroupId", async () => {
    repo.findById.mockResolvedValue({
      id: "req-1",
      topicId: "topic-1",
      lecturerId: "lect-1",
      topic: { id: "topic-1", scienceGroupId: null },
      lecturer: {
        id: "lect-1",
        scienceGroupId: "kbk-from-lecturer",
      },
    });

    const result = await getRecommendations("req-1");

    expect(result.alternatives).toEqual([]);
    expect(result.message).toContain("KBK topik belum dipetakan");
    expect(repo.findAlternativeLecturers).not.toHaveBeenCalled();
  });
});
