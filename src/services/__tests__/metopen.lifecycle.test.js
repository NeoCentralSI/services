import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, quotaService } = vi.hoisted(() => {
  const tx = {
    thesis: { update: vi.fn() },
    thesisAdvisorRequest: { update: vi.fn() },
    thesisSupervisors: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    studentAcademicYearSnapshot: { findUnique: vi.fn() },
    thesisAdvisorRequest: { findMany: vi.fn() },
    thesisStatus: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
  return {
    prismaMock: prisma,
    txMock: tx,
    quotaService: {
      syncLecturerQuotaCurrentCount: vi.fn(),
    },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../advisorQuota.service.js", () => quotaService);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn().mockResolvedValue({ id: "ay-active" }),
}));

const { syncBookingActivationForStudent } = await import("../metopen.service.js");

function bookingRequest(overrides = {}) {
  return {
    id: "request-1",
    studentId: "student-1",
    lecturerId: "lecturer-1",
    redirectedTo: null,
    academicYearId: "ay-metopen",
    thesisId: "thesis-1",
    status: "booking_approved",
    student: { takingThesisCourse: true },
    thesis: {
      id: "thesis-1",
      academicYearId: "ay-metopen",
      proposalStatus: null,
      ta04AssignmentIssuedAt: new Date("2026-06-01T00:00:00.000Z"),
      ta04AssignmentAcademicYearId: "ay-metopen",
      activeAcademicYearId: null,
      researchMethodScores: [
        {
          id: "score-1",
          isFinalized: true,
          attendanceAutoZeroedAt: null,
        },
      ],
      thesisSupervisors: [
        {
          id: "sup-1",
          lecturerId: "lecturer-1",
          status: "active",
          role: { name: "Pembimbing 1" },
        },
      ],
    },
    ...overrides,
  };
}

describe("metopen.service — syncBookingActivationForStudent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));
    prismaMock.thesisStatus.findFirst.mockResolvedValue({ id: "status-bimbingan" });
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue({
      takingThesisCourse: true,
      thesisCourseSource: "sia",
      thesisCourseCapturedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it("promotes booking to active official when TA-03 finalized and KRS TA is true", async () => {
    prismaMock.thesisAdvisorRequest.findMany.mockResolvedValue([bookingRequest()]);

    const result = await syncBookingActivationForStudent("student-1", "ay-active");

    expect(result).toMatchObject({ synced: true, promoted: 1, released: 0 });
    expect(txMock.thesis.update).toHaveBeenCalledWith({
      where: { id: "thesis-1" },
      data: expect.objectContaining({
        isProposal: false,
        proposalStatus: "accepted",
        thesisStatusId: "status-bimbingan",
        activeAcademicYearId: "ay-active",
        activePromotedAt: expect.any(Date),
      }),
    });
    expect(txMock.thesisAdvisorRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: "active_official",
        academicYearId: "ay-active",
        releasedAt: null,
        releaseReason: null,
      }),
    });
    expect(quotaService.syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(
      "lecturer-1",
      "ay-metopen",
      { client: txMock },
    );
    expect(quotaService.syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(
      "lecturer-1",
      "ay-active",
      { client: txMock },
    );
  });

  it("releases booking when TA-03 finalized but KRS TA is not true", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue({
      takingThesisCourse: false,
      thesisCourseSource: "sia",
      thesisCourseCapturedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    prismaMock.thesisAdvisorRequest.findMany.mockResolvedValue([
      bookingRequest({ student: { takingThesisCourse: false } }),
    ]);

    const result = await syncBookingActivationForStudent("student-1", "ay-active");

    expect(result).toMatchObject({ synced: true, promoted: 0, released: 1 });
    expect(txMock.thesisAdvisorRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        status: "released",
        releasedAt: expect.any(Date),
        releaseReason: "thesis_course_not_confirmed",
        releasedAcademicYearId: "ay-active",
      }),
    });
    expect(txMock.thesisSupervisors.updateMany).toHaveBeenCalledWith({
      where: {
        thesisId: "thesis-1",
        status: "active",
      },
      data: { status: "released", activeRoleKey: null },
    });
    expect(quotaService.syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(
      "lecturer-1",
      "ay-metopen",
      { client: txMock },
    );
  });

  it("skips lifecycle decision before active academic year changes", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue({
      takingThesisCourse: false,
      thesisCourseSource: "sia",
      thesisCourseCapturedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    prismaMock.thesisAdvisorRequest.findMany.mockResolvedValue([
      bookingRequest({ student: { takingThesisCourse: false } }),
    ]);

    const result = await syncBookingActivationForStudent("student-1", "ay-metopen");

    expect(result).toMatchObject({ synced: false, promoted: 0, released: 0, skipped: 1 });
    expect(txMock.thesisAdvisorRequest.update).not.toHaveBeenCalled();
    expect(txMock.thesisSupervisors.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when the new-period KRS snapshot does not exist", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue(null);

    const result = await syncBookingActivationForStudent("student-1", "ay-active");

    expect(result).toMatchObject({
      synced: false,
      promoted: 0,
      released: 0,
      reason: "thesis_course_snapshot_missing",
    });
    expect(prismaMock.thesisAdvisorRequest.findMany).not.toHaveBeenCalled();
    expect(txMock.thesisAdvisorRequest.update).not.toHaveBeenCalled();
  });

  it("does not interpret an incomplete KRS snapshot as false", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue({
      takingThesisCourse: null,
      thesisCourseSource: null,
      thesisCourseCapturedAt: null,
    });

    const result = await syncBookingActivationForStudent("student-1", "ay-active");

    expect(result).toMatchObject({
      synced: false,
      promoted: 0,
      released: 0,
      reason: "thesis_course_snapshot_missing",
    });
    expect(txMock.thesisSupervisors.updateMany).not.toHaveBeenCalled();
  });
});
