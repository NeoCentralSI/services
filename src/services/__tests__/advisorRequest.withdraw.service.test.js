import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADVISOR_REQUEST_STATUS } from "../../constants/advisorRequestStatus.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoMock = vi.hoisted(() => ({
  findStudentByUserId: vi.fn(),
  findById: vi.fn(),
  executeTransaction: vi.fn(),
  lockAdvisorRequestRow: vi.fn(),
  lockStudentRow: vi.fn(),
  findByIdWithClient: vi.fn(),
  findThesisProcessLockState: vi.fn(),
  updateStatusWithClient: vi.fn(),
  updateStatusIfCurrent: vi.fn(),
  terminateSupervisorAssignmentByLecturerAndThesis: vi.fn(),
  createAuditLogWithClient: vi.fn(),
  updateStatus: vi.fn(),
}));

const syncLecturerQuotaCurrentCount = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/advisorRequest.repository.js", () => repoMock);
vi.mock("../advisorQuota.service.js", () => ({
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
  lockLecturerQuotaForUpdate: vi.fn(),
  syncLecturerQuotaCurrentCount,
}));
vi.mock("../notification.service.js", () => ({
  createNotificationEventForUsers: vi.fn(),
}));
vi.mock("../metopenEligibility.service.js", () => ({
  resolveMetopenEligibilityState: vi.fn(),
}));
vi.mock("../../utils/ta04.pdf.js", () => ({
  generateTA04Pdf: vi.fn(),
}));
vi.mock("../../utils/supervisorIntegrity.js", () => ({
  createSupervisorAssignments: vi.fn(),
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(),
}));
vi.mock("../../config/prisma.js", () => ({
  default: {},
}));

const { withdrawRequest, markUnderReview } = await import("../advisorRequest.service.js");

const ORIGINAL_LECTURER = "lecturer-original";
const REDIRECT_TARGET = "lecturer-target";

function bookingApprovedRedirectRequest() {
  return {
    id: "req-1",
    studentId: "student-1",
    lecturerId: ORIGINAL_LECTURER,
    redirectedTo: REDIRECT_TARGET,
    academicYearId: "ay-1",
    status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    thesis: { id: "thesis-1" },
    thesisId: "thesis-1",
  };
}

describe("withdrawRequest Path C redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.executeTransaction.mockImplementation(async (callback) => callback({}));
    repoMock.findStudentByUserId.mockResolvedValue({ id: "student-1" });
    repoMock.lockAdvisorRequestRow.mockResolvedValue({ id: "req-1" });
    repoMock.lockStudentRow.mockResolvedValue({ id: "student-1" });
    repoMock.findThesisProcessLockState.mockResolvedValue({
      ta04AssignmentIssuedAt: null,
      proposalStatus: "draft",
      finalProposalVersionId: null,
      _count: { thesisGuidances: 0, researchMethodScores: 0 },
    });
    repoMock.updateStatusWithClient.mockResolvedValue({
      id: "req-1",
      status: ADVISOR_REQUEST_STATUS.CANCELED,
    });
    repoMock.terminateSupervisorAssignmentByLecturerAndThesis.mockResolvedValue({ count: 1 });
    repoMock.createAuditLogWithClient.mockResolvedValue({ id: "audit-1" });
    syncLecturerQuotaCurrentCount.mockResolvedValue(0);
  });

  it("terminates and syncs quota for redirectedTo, not the original lecturerId", async () => {
    const request = bookingApprovedRedirectRequest();
    repoMock.findById.mockResolvedValue(request);
    repoMock.findByIdWithClient.mockResolvedValue(request);

    await withdrawRequest("req-1", "student-1");

    expect(repoMock.terminateSupervisorAssignmentByLecturerAndThesis).toHaveBeenCalledWith(
      expect.anything(),
      "thesis-1",
      REDIRECT_TARGET,
    );
    expect(syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(REDIRECT_TARGET, "ay-1", {
      client: expect.anything(),
    });
    expect(repoMock.terminateSupervisorAssignmentByLecturerAndThesis).not.toHaveBeenCalledWith(
      expect.anything(),
      "thesis-1",
      ORIGINAL_LECTURER,
    );
  });
});

describe("markUnderReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.executeTransaction.mockImplementation(async (callback) => callback({}));
    repoMock.lockAdvisorRequestRow.mockResolvedValue({ id: "req-1" });
    repoMock.updateStatusIfCurrent.mockResolvedValue(1);
    repoMock.findByIdWithClient.mockResolvedValue({
      id: "req-1",
      status: ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
    });
  });

  it("locks the row and only updates while status is still pending", async () => {
    repoMock.findById.mockResolvedValue({
      id: "req-1",
      lecturerId: "lecturer-1",
      status: ADVISOR_REQUEST_STATUS.PENDING,
    });
    repoMock.findByIdWithClient
      .mockResolvedValueOnce({
        id: "req-1",
        status: ADVISOR_REQUEST_STATUS.PENDING,
      })
      .mockResolvedValueOnce({
        id: "req-1",
        status: ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
      });

    await markUnderReview("req-1", "lecturer-1");

    expect(repoMock.lockAdvisorRequestRow).toHaveBeenCalled();
    expect(repoMock.updateStatusIfCurrent).toHaveBeenCalledWith(
      expect.anything(),
      "req-1",
      ADVISOR_REQUEST_STATUS.PENDING,
      { status: ADVISOR_REQUEST_STATUS.UNDER_REVIEW },
    );
  });

  it("does not overwrite booking_approved after a concurrent accept", async () => {
    repoMock.findById.mockResolvedValue({
      id: "req-1",
      lecturerId: "lecturer-1",
      status: ADVISOR_REQUEST_STATUS.PENDING,
    });
    repoMock.findByIdWithClient.mockResolvedValue({
      id: "req-1",
      status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
    });

    await expect(markUnderReview("req-1", "lecturer-1")).rejects.toThrow(
      /status pending/,
    );
    expect(repoMock.updateStatusIfCurrent).not.toHaveBeenCalled();
  });
});

describe("GET /sia/cached", () => {
  it("is Admin-only", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../routes/sia.route.js"), "utf8");
    expect(src).toMatch(/\/cached[\s\S]*requireRoles\(ROLES\.ADMIN\)[\s\S]*getCachedStudents/);
  });
});
