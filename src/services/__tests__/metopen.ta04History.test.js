import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, ta04BatchRepo } = vi.hoisted(() => ({
  prismaMock: {
    thesis: { findMany: vi.fn() },
  },
  ta04BatchRepo: {
    findCurrentTa04BatchesByAcademicYears: vi.fn(),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/ta04Batch.repository.js", () => ta04BatchRepo);

const { getKadepTitleReportHistory } = await import("../metopen.service.js");

function bookingWithoutActiveP1() {
  return {
    id: "thesis-1",
    title: "Judul perlu diperbaiki",
    isProposal: true,
    proposalStatus: null,
    activePromotedAt: null,
    ta04AssignmentIssuedAt: new Date("2026-07-10T00:00:00.000Z"),
    ta04AssignmentTitle: null,
    ta04AssignmentSupervisorNames: "Dr. Data Lama",
    proposalReviewedAt: null,
    proposalReviewNotes: null,
    academicYear: { id: "ay-1", year: "2025/2026", semester: "genap" },
    ta04AssignmentAcademicYear: null,
    activeAcademicYear: null,
    finalProposalVersion: null,
    thesisTopic: null,
    student: {
      takingThesisCourse: false,
      user: { fullName: "Mahasiswa Tanpa P1", identityNumber: "2200000002" },
    },
    advisorRequests: [{
      id: "request-1",
      status: "booking_approved",
      academicYearId: "ay-1",
      proposedTitle: "Judul perlu diperbaiki",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      academicYear: { id: "ay-1", year: "2025/2026", semester: "genap" },
    }],
    thesisSupervisors: [],
    researchMethodScores: [],
    titleApprovalDocument: null,
    proposalReviewedBy: null,
  };
}

describe("getKadepTitleReportHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ta04BatchRepo.findCurrentTa04BatchesByAcademicYears.mockResolvedValue([]);
  });

  it("shows an approved booking with no active P1 as a repair item, never as a TA-04 cohort member", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([bookingWithoutActiveP1()]);

    const result = await getKadepTitleReportHistory();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      thesisId: "thesis-1",
      ta04BatchEligible: false,
      ta04BatchBlock: "no_active_pembimbing_1",
      repairRequired: true,
      listSection: "history_other",
    });

    const query = prismaMock.thesis.findMany.mock.calls[0][0];
    expect(query.where.AND.some((filter) => "thesisSupervisors" in filter)).toBe(false);
  });
});
