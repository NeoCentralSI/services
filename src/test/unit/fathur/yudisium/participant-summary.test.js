import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  yudisium: { findUnique: vi.fn() },
  yudisiumParticipant: { findMany: vi.fn() },
  academicYear: { findFirst: vi.fn() },
}));
vi.mock("../../../../config/prisma.js", () => ({ default: prisma }));

const { getParticipantSummary } = await import("../../../../services/yudisium/participant.service.js");

const participant = (enrollmentYear, gpa, topic) => ({
  thesis: { thesisTopic: topic ? { id: topic, name: `Topik ${topic}` } : null, student: { id: `s-${Math.random()}`, enrollmentYear, gpa } },
});

describe("getParticipantSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ganjil 2026/2027: a 2022 cohort is in its 9th semester, a 2023 cohort in its 7th.
    prisma.yudisium.findUnique.mockResolvedValue({ id: "y1", academicYear: { year: "2026/2027", semester: "ganjil" } });
  });

  it("counts cohorts, computed predicates and the five largest topics plus Lainnya, without rejected participants", async () => {
    prisma.yudisiumParticipant.findMany.mockResolvedValue([
      participant(2023, 3.8, "a"), participant(2023, 3.6, "a"), participant(2022, 3.8, "b"),
      participant(2022, 2.9, "c"), participant(2022, 2.5, "d"), participant(2022, 3.1, "e"),
      participant(2021, 3.2, "f"), participant(2021, 3.3, "g"),
    ]);
    const summary = await getParticipantSummary("y1");

    expect(prisma.yudisiumParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { yudisiumId: "y1", status: { not: "rejected" } } }));
    expect(summary.total).toBe(8);
    expect(summary.enrollmentYears.map((row) => [row.name, row.count])).toEqual([["2021", 2], ["2022", 4], ["2023", 2]]);
    expect(summary.predicates.map((row) => [row.name, row.count])).toEqual([
      ["Dengan Pujian", 2], ["Sangat Memuaskan", 4], ["Memuaskan", 1], ["Tanpa predikat", 1],
    ]);
    expect(summary.topics).toHaveLength(6);
    expect(summary.topics[0]).toMatchObject({ name: "Topik a", count: 2 });
    expect(summary.topics.at(-1)).toMatchObject({ id: "others", name: "Lainnya", count: 2 });
  });

  it("an empty period has empty series", async () => {
    prisma.yudisiumParticipant.findMany.mockResolvedValue([]);
    const summary = await getParticipantSummary("y1");
    expect(summary).toEqual({ total: 0, enrollmentYears: [], predicates: [], topics: [] });
  });

  it("an unknown period is a 404", async () => {
    prisma.yudisium.findUnique.mockResolvedValue(null);
    await expect(getParticipantSummary("x")).rejects.toMatchObject({ statusCode: 404 });
  });
});
