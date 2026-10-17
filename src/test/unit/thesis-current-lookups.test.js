/**
 * Paket E7 (K28): the seminar and defence pages (and the student's guidance history and log)
 * still find a thesis that became Selesai; supervision quotas only count open theses, so a
 * finished thesis no longer takes a supervisor's slot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesis: { findFirst: vi.fn() },
    thesisSupervisors: { groupBy: vi.fn() },
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getStudentByUserId: vi.fn(async () => ({ id: "stu-1" })),
}));
vi.mock("../../services/thesis-seminar/core.service.js", () => ({ mapSeminarsToAnnouncementItems: vi.fn(() => []) }));
vi.mock("../../repositories/thesis-seminar/thesis-seminar.repository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getAllAnnouncedSeminars: vi.fn(async () => []),
}));

const { CURRENT_THESIS_STATUSES, OPEN_THESIS_STATUSES } = await import("../../constants/thesisStatus.js");
const defenceRepo = await import("../../repositories/thesis-defence/thesis-defence.repository.js");
const seminarRepo = await import("../../repositories/thesis-seminar/thesis-seminar.repository.js");
const seminarStudent = await import("../../services/thesis-seminar/student.service.js");
const guidanceRepo = await import("../../repositories/thesisGuidance/student.guidance.repository.js");
const quotaRepo = await import("../../repositories/thesis-proposal/supervision-quota.repository.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.thesis.findFirst.mockResolvedValue(null);
});

describe("CURRENT_THESIS_STATUSES", () => {
  it("is every status but Gagal: the latest thesis that has not failed, a Selesai one included", () => {
    expect(CURRENT_THESIS_STATUSES).toEqual(["proposal", "research", "on_leave", "completed"]);
    expect(OPEN_THESIS_STATUSES).not.toContain("completed");
  });
});

describe("the student's current thesis is found once it is Selesai", () => {
  const whereOfLastLookup = () => mockPrisma.thesis.findFirst.mock.calls.at(-1)[0];

  it.each([
    ["sidang: getStudentThesisWithDefenceInfo", () => defenceRepo.getStudentThesisWithDefenceInfo("stu-1")],
    ["seminar hasil: getStudentThesisWithSeminarInfo", () => seminarRepo.getStudentThesisWithSeminarInfo("stu-1")],
    ["pengumuman seminar: getAnnouncements", () => seminarStudent.getAnnouncements("user-1")],
    ["riwayat dan log bimbingan: getCurrentThesisForStudent", () => guidanceRepo.getCurrentThesisForStudent("stu-1")],
  ])("%s", async (_label, call) => {
    await call();
    const query = whereOfLastLookup();
    expect(query.where).toMatchObject({ studentId: "stu-1", status: { in: CURRENT_THESIS_STATUSES } });
    expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
});

describe("supervision quotas count open theses only", () => {
  it("a Selesai thesis no longer takes the supervisor's slot", async () => {
    const relations = [
      { lecturerId: "p1", status: "active", thesisStatus: "research" },
      { lecturerId: "p1", status: "active", thesisStatus: "completed" },
      { lecturerId: "p1", status: "active", thesisStatus: "proposal" },
      { lecturerId: "p2", status: "active", thesisStatus: "completed" },
    ];
    mockPrisma.thesisSupervisors.groupBy.mockImplementation(async ({ where }) => {
      const counted = relations.filter((r) => r.status === where.status && where.thesis.status.in.includes(r.thesisStatus));
      const byLecturer = new Map();
      for (const r of counted) byLecturer.set(r.lecturerId, (byLecturer.get(r.lecturerId) ?? 0) + 1);
      return [...byLecturer].map(([lecturerId, count]) => ({ lecturerId, _count: { _all: count } }));
    });

    const counts = await quotaRepo.countActiveSupervisions(["p1", "p2"]);
    expect(counts.get("p1")).toBe(2);
    expect(counts.get("p2") ?? 0).toBe(0);
    expect(mockPrisma.thesisSupervisors.groupBy.mock.calls[0][0].where.thesis).toEqual({ status: { in: OPEN_THESIS_STATUSES } });
  });
});
