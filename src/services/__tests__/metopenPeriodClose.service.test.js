import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, quotaService, notificationService } = vi.hoisted(() => {
  const tx = {
    researchMethodScore: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    researchMethodScoreDetail: { deleteMany: vi.fn() },
    thesisAdvisorRequest: { update: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    academicYear: { findUnique: vi.fn() },
    thesis: { findMany: vi.fn() },
    userHasRole: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
  return {
    prismaMock: prisma,
    txMock: tx,
    quotaService: { syncLecturerQuotaCurrentCount: vi.fn() },
    notificationService: { createNotificationEventForUsers: vi.fn() },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../advisorQuota.service.js", () => quotaService);
vi.mock("../notification.service.js", () => notificationService);
vi.mock("../auditLog.service.js", () => ({
  AUDIT_ACTIONS: {
    REQUEST_ADVISOR_RELEASED: "REQUEST_ADVISOR_RELEASED",
    REQUEST_ADVISOR_CANCELLED: "REQUEST_ADVISOR_CANCELLED",
  },
  ENTITY_TYPES: { THESIS_ADVISOR_REQUEST: "THESIS_ADVISOR_REQUEST" },
}));

const { closeUnfinishedMetopenForYear, assertDevtoolsMetopenPeriodCloseAllowed } = await import("../metopenPeriodClose.service.js");

function scoringThesis(overrides = {}) {
  return {
    id: "thesis-1",
    studentId: "student-1",
    academicYearId: "ay-old",
    ta04AssignmentIssuedAt: new Date("2026-06-01T00:00:00.000Z"),
    researchMethodScores: [
      {
        id: "score-1",
        isFinalized: false,
        attendanceAutoZeroedAt: null,
        periodClosedAt: null,
      },
    ],
    advisorRequests: [
      {
        id: "request-1",
        status: "booking_approved",
        lecturerId: "lecturer-1",
        redirectedTo: null,
        academicYearId: "ay-old",
        studentId: "student-1",
        thesisId: "thesis-1",
      },
    ],
    thesisSupervisors: [{ id: "sup-1", lecturerId: "lecturer-1" }],
    student: {
      id: "student-1",
      eligibleMetopen: true,
      user: { id: "student-1", fullName: "Akram", identityNumber: "2211521001" },
    },
    ...overrides,
  };
}

describe("closeUnfinishedMetopenForYear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.academicYear.findUnique.mockResolvedValue({
      id: "ay-old",
      year: "2025/2026",
      semester: "genap",
    });
    prismaMock.userHasRole.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));
    txMock.researchMethodScore.findUnique.mockResolvedValue({ id: "score-1" });
    txMock.researchMethodScore.update.mockResolvedValue({ id: "score-1" });
    txMock.researchMethodScore.create.mockResolvedValue({ id: "score-new" });
    txMock.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
    txMock.thesisAdvisorRequest.update.mockResolvedValue({ id: "request-1" });
    txMock.thesisSupervisors.updateMany.mockResolvedValue({ count: 1 });
    txMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("dry-run does not write when booking is ready to score", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([scoringThesis()]);

    const result = await closeUnfinishedMetopenForYear("ay-old", { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.counts.zeroed).toBe(1);
    expect(result.counts.released).toBe(1);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(result.items[0].eligibleMetopen).toBe(true);
  });

  it("zeroes unfinished scored thesis and releases booking", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([scoringThesis()]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.zeroed).toBe(1);
    expect(result.counts.released).toBe(1);
    expect(txMock.researchMethodScore.update).toHaveBeenCalledWith({
      where: { thesisId: "thesis-1" },
      data: expect.objectContaining({
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        periodClosedReason: "metopen_period_closed",
      }),
    });
    expect(txMock.thesisAdvisorRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: "released",
        releaseReason: "metopen_period_closed",
      }),
    });
    expect(quotaService.syncLecturerQuotaCurrentCount).toHaveBeenCalled();
    expect(txMock.researchMethodScoreDetail.deleteMany).not.toHaveBeenCalled();
    expect(result.counts.noFinalProposal).toBe(1);
    expect(result.items[0].warningCohort).toBe("no_final_proposal");
  });

  it("closes pending requests without creating a score row", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([
      scoringThesis({
        ta04AssignmentIssuedAt: null,
        researchMethodScores: [],
        advisorRequests: [
          {
            id: "request-pending",
            status: "pending",
            lecturerId: "lecturer-1",
            redirectedTo: null,
            academicYearId: "ay-old",
            studentId: "student-1",
            thesisId: "thesis-1",
          },
        ],
      }),
    ]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.closed).toBe(1);
    expect(result.counts.zeroed).toBe(0);
    expect(txMock.researchMethodScore.create).not.toHaveBeenCalled();
    expect(txMock.researchMethodScore.update).not.toHaveBeenCalled();
    expect(txMock.thesisAdvisorRequest.update).toHaveBeenCalledWith({
      where: { id: "request-pending" },
      data: { status: "closed" },
    });
  });

  it("does not overwrite a passing finalized score", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([
      scoringThesis({
        researchMethodScores: [
          {
            id: "score-1",
            isFinalized: true,
            attendanceAutoZeroedAt: null,
            periodClosedAt: null,
          },
        ],
      }),
    ]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.zeroed).toBe(0);
    expect(result.items[0].skipReason).toBe("ta03_already_final_pass");
    expect(txMock.researchMethodScore.update).not.toHaveBeenCalled();
    expect(txMock.thesisAdvisorRequest.update).not.toHaveBeenCalled();
  });

  it("keeps auto-zero scores and releases booking with metopen_auto_zeroed", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([
      scoringThesis({
        researchMethodScores: [
          {
            id: "score-1",
            isFinalized: true,
            attendanceAutoZeroedAt: new Date("2026-07-01T00:00:00.000Z"),
            periodClosedAt: null,
          },
        ],
      }),
    ]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.zeroed).toBe(0);
    expect(result.counts.released).toBe(1);
    expect(txMock.researchMethodScore.update).not.toHaveBeenCalled();
    expect(txMock.thesisAdvisorRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: "released",
        releaseReason: "metopen_auto_zeroed",
      }),
    });
  });

  it("is idempotent when the score is already period-closed", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([
      scoringThesis({
        researchMethodScores: [
          {
            id: "score-1",
            isFinalized: true,
            attendanceAutoZeroedAt: null,
            periodClosedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        ],
        advisorRequests: [],
      }),
    ]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.zeroed).toBe(0);
    expect(txMock.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("keeps rubric details and flags ungraded final separately from no-final-proposal", async () => {
    prismaMock.thesis.findMany.mockResolvedValue([
      scoringThesis({
        finalProposalVersionId: "version-final",
      }),
    ]);

    const result = await closeUnfinishedMetopenForYear("ay-old");

    expect(result.counts.zeroed).toBe(1);
    expect(result.counts.ungradedFinal).toBe(1);
    expect(result.counts.noFinalProposal).toBe(0);
    expect(result.items[0].warningCohort).toBe("ungraded_final");
    expect(txMock.researchMethodScoreDetail.deleteMany).not.toHaveBeenCalled();
  });
});

describe("assertDevtoolsMetopenPeriodCloseAllowed", () => {
  it("allows dry-run on the active year without force", () => {
    expect(() => assertDevtoolsMetopenPeriodCloseAllowed({
      isActive: true,
      dryRun: true,
      force: false,
    })).not.toThrow();
  });

  it("allows executing close on an inactive year without force", () => {
    expect(() => assertDevtoolsMetopenPeriodCloseAllowed({
      isActive: false,
      dryRun: false,
      force: false,
    })).not.toThrow();
  });

  it("rejects executing close on the active year without force", () => {
    expect(() => assertDevtoolsMetopenPeriodCloseAllowed({
      isActive: true,
      dryRun: false,
      force: false,
    })).toThrow(/force dan konfirmasi kedua/);
  });

  it("allows executing close on the active year with force", () => {
    expect(() => assertDevtoolsMetopenPeriodCloseAllowed({
      isActive: true,
      dryRun: false,
      force: true,
    })).not.toThrow();
  });
});
