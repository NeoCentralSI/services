import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, snapshotService, store } = vi.hoisted(() => ({
  prismaMock: {
    thesisAdvisorRequest: { findMany: vi.fn() },
    thesis: { findMany: vi.fn() },
    studentAcademicYearSnapshot: { findMany: vi.fn() },
  },
  snapshotService: { getPeriodSnapshotCoverage: vi.fn() },
  store: { getSyncStatus: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../studentPeriodSnapshot.service.js", () => snapshotService);
vi.mock("../sia.store.js", () => store);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn().mockResolvedValue({
    id: "ay-active",
    year: "2026/2027",
    semester: "ganjil",
  }),
  formatAcademicYearLabel: () => "2026/2027 Ganjil",
}));

const { getMetopenSiaOperations } = await import("../metopenOperations.service.js");

describe("getMetopenSiaOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.getSyncStatus.mockResolvedValue({ lastRun: "2026-08-16", error: "" });
    snapshotService.getPeriodSnapshotCoverage.mockResolvedValue({
      complete: true,
      coverageLabel: "1/1",
      studentsWithSnapshot: 1,
      totalStudents: 1,
      pendingCreate: 0,
    });
    prismaMock.thesis.findMany.mockResolvedValue([]);
    prismaMock.studentAcademicYearSnapshot.findMany.mockResolvedValue([]);
  });

  it("lists passed bookings whose active-year KRS snapshot is not true", async () => {
    prismaMock.thesisAdvisorRequest.findMany.mockResolvedValue([
      {
        id: "request-wait",
        studentId: "student-1",
        academicYearId: "ay-old",
        thesisId: "thesis-1",
        status: "booking_approved",
        student: {
          id: "student-1",
          takingThesisCourse: false,
          user: { fullName: "Budi", identityNumber: "2211521001" },
        },
        thesis: {
          id: "thesis-1",
          academicYearId: "ay-old",
          isProposal: true,
          researchMethodScores: [
            {
              isFinalized: true,
              attendanceAutoZeroedAt: null,
              periodClosedAt: null,
            },
          ],
        },
      },
    ]);
    prismaMock.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      { studentId: "student-1", takingThesisCourse: false },
    ]);

    const data = await getMetopenSiaOperations();

    expect(data.waitingKrs).toHaveLength(1);
    expect(data.waitingKrs[0].requestId).toBe("request-wait");
    expect(data.exceptions).toHaveLength(0);
  });

  it("lists failed Metopel + KRS true as exceptions, not archive", async () => {
    prismaMock.thesisAdvisorRequest.findMany.mockResolvedValue([]);
    prismaMock.thesis.findMany.mockImplementation(async ({ where }) => {
      if (where?.academicYearId === null) return [];
      return [
        {
          id: "thesis-fail",
          studentId: "student-2",
          academicYearId: "ay-old",
          student: {
            id: "student-2",
            takingThesisCourse: true,
            user: { fullName: "Siti", identityNumber: "2211521002" },
          },
          researchMethodScores: [
            {
              isFinalized: true,
              attendanceAutoZeroedAt: null,
              periodClosedAt: new Date("2026-08-16T00:00:00.000Z"),
              finalScore: 0,
            },
          ],
          advisorRequests: [
            { id: "request-released", status: "released", releaseReason: "metopen_period_closed" },
          ],
        },
      ];
    });
    prismaMock.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      { studentId: "student-2", takingThesisCourse: true },
    ]);

    const data = await getMetopenSiaOperations();

    expect(data.exceptions).toHaveLength(1);
    expect(data.exceptions[0].thesisId).toBe("thesis-fail");
    expect(data.waitingKrs).toHaveLength(0);
  });
});
