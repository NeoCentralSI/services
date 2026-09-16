import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSiaClient, mockSiaStore, mockMetopenService } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    student: { updateMany: vi.fn(), update: vi.fn() },
    academicYear: { findMany: vi.fn() },
    studentAcademicYearSnapshot: { findMany: vi.fn(), findUnique: vi.fn(), createMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    curriculum: { findMany: vi.fn() },
    cpl: { findMany: vi.fn() },
    studentCplScore: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockSiaClient: { fetchStudentsFull: vi.fn(), hashStudent: vi.fn() },
  mockSiaStore: {
    saveStudents: vi.fn(),
    saveSyncStatus: vi.fn(),
    cleanupObsoleteStudents: vi.fn(),
  },
  mockMetopenService: { syncBookingActivationForStudent: vi.fn() },
}));

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../services/sia.client.js", () => mockSiaClient);
vi.mock("../../../services/sia.store.js", () => mockSiaStore);
vi.mock("../../../services/metopen.service.js", () => mockMetopenService);

import { runSiaSync } from "../../../services/sia.sync.job.js";

const CURRICULUM = {
  id: "curriculum-2024",
  name: "Kurikulum 2024",
  startYear: 2024,
  endYear: null,
};

const CPL_V1 = {
  id: "cpl-v1",
  curriculumId: CURRICULUM.id,
  code: "CPL-01",
  description: "Mampu berpikir kritis",
  version: 1,
  isActive: false,
};

const CPL_V2 = { ...CPL_V1, id: "cpl-v2", version: 2, isActive: true };

const studentPayload = (overrides = {}) => ({
  nim: "2211524001",
  name: "Budi Santoso",
  sksCompleted: 120,
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: true,
  researchMethodCompleted: true,
  currentSemester: 5,
  cplScores: [
    {
      code: "CPL-01",
      description: "  MAMPU   BERPIKIR KRITIS ",
      score: 80,
      inputAt: "2026-04-20T10:00:00.000Z",
    },
  ],
  ...overrides,
});

function arrangeSync({
  payload = studentPayload(),
  enrollmentYear = 2024,
  curricula = [CURRICULUM],
  cpls = [CPL_V1, CPL_V2],
  existingScores = [],
} = {}) {
  mockSiaClient.fetchStudentsFull.mockResolvedValue([payload]);
  mockPrisma.user.findMany
    .mockResolvedValueOnce([{ id: "student-1", identityNumber: payload.nim }])
    .mockResolvedValueOnce([
      {
        id: "student-1",
        identityNumber: payload.nim,
        fullName: payload.name,
        student: { id: "student-1", enrollmentYear },
      },
    ]);
  mockPrisma.curriculum.findMany.mockResolvedValue(curricula);
  mockPrisma.cpl.findMany.mockResolvedValue(cpls);
  mockPrisma.studentCplScore.findMany.mockResolvedValue(existingScores);
}

describe("SIA CPL synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSiaClient.hashStudent.mockReturnValue("hash-value");
    mockSiaStore.saveStudents.mockResolvedValue({ updated: 0, skipped: 0 });
    mockSiaStore.saveSyncStatus.mockResolvedValue(undefined);
    mockSiaStore.cleanupObsoleteStudents.mockResolvedValue({ cleaned: 0 });
    mockPrisma.academicYear.findMany.mockResolvedValue([{ id: "ay-active", startDate: new Date(0), endDate: new Date(4102444800000) }]);
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.studentAcademicYearSnapshot.createMany.mockResolvedValue({ count: 1 });
    mockMetopenService.syncBookingActivationForStudent.mockResolvedValue({ synced: false });
    mockPrisma.student.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.student.update.mockResolvedValue({ id: "student-1" });
    mockPrisma.studentCplScore.create.mockResolvedValue({});
    mockPrisma.studentCplScore.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (arg) => Promise.all(arg));
  });

  it("uses the active version for a student's first logical CPL score", async () => {
    arrangeSync();

    const summary = await runSiaSync();

    expect(mockPrisma.studentCplScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        cplId: "cpl-v2",
        score: 80,
        source: "SIA",
        status: "calculated",
      }),
    });
    expect(summary).toMatchObject({ cplCreated: 1, cplUpdated: 0 });
  });

  it("keeps an existing score pinned to its inactive historical version", async () => {
    arrangeSync({
      existingScores: [
        {
          studentId: "student-1",
          cplId: "cpl-v1",
          score: 70,
          inputAt: new Date("2026-04-19T10:00:00.000Z"),
          source: "SIA",
          status: "calculated",
        },
      ],
    });

    const summary = await runSiaSync();

    expect(mockPrisma.studentCplScore.update).toHaveBeenCalledWith({
      where: { studentId_cplId: { studentId: "student-1", cplId: "cpl-v1" } },
      data: expect.objectContaining({ score: 80 }),
    });
    expect(summary.cplUpdated).toBe(1);
  });

  it("requires a description and reports missing descriptions", async () => {
    arrangeSync({
      payload: studentPayload({
        cplScores: [{ code: "CPL-01", score: 80, inputAt: "2026-04-20T10:00:00.000Z" }],
      }),
    });

    const summary = await runSiaSync();

    expect(summary.cplSkippedMissingDescription).toBe(1);
    expect(mockPrisma.studentCplScore.create).not.toHaveBeenCalled();
  });

  it("rejects a description that does not match the selected version", async () => {
    arrangeSync({
      payload: studentPayload({
        cplScores: [{
          code: "CPL-01",
          description: "Definisi CPL yang berbeda",
          score: 80,
          inputAt: "2026-04-20T10:00:00.000Z",
        }],
      }),
    });

    const summary = await runSiaSync();

    expect(summary.cplSkippedDescriptionMismatch).toBe(1);
    expect(mockPrisma.studentCplScore.create).not.toHaveBeenCalled();
  });

  it("never overwrites a manual score", async () => {
    arrangeSync({
      existingScores: [
        {
          studentId: "student-1",
          cplId: "cpl-v1",
          score: 75,
          inputAt: new Date("2026-04-19T10:00:00.000Z"),
          source: "manual",
          status: "calculated",
        },
      ],
    });

    const summary = await runSiaSync();

    expect(summary.cplSkippedProtected).toBe(1);
    expect(mockPrisma.studentCplScore.update).not.toHaveBeenCalled();
  });

  it("rejects stale SIA timestamps", async () => {
    arrangeSync({
      existingScores: [
        {
          studentId: "student-1",
          cplId: "cpl-v2",
          score: 85,
          inputAt: new Date("2026-04-21T10:00:00.000Z"),
          source: "SIA",
          status: "calculated",
        },
      ],
    });

    const summary = await runSiaSync();

    expect(summary.cplSkippedStaleData).toBe(1);
    expect(mockPrisma.studentCplScore.update).not.toHaveBeenCalled();
  });

  it("treats an identical score and timestamp as an idempotent no-op", async () => {
    arrangeSync({
      existingScores: [
        {
          studentId: "student-1",
          cplId: "cpl-v2",
          score: 80,
          inputAt: new Date("2026-04-20T10:00:00.000Z"),
          source: "SIA",
          status: "calculated",
        },
      ],
    });

    const summary = await runSiaSync();

    expect(summary.cplUnchanged).toBe(1);
    expect(mockPrisma.studentCplScore.update).not.toHaveBeenCalled();
  });

  it("reports a missing enrollment year without falling back", async () => {
    arrangeSync({ enrollmentYear: null });

    const summary = await runSiaSync();

    expect(summary.cplSkippedMissingEnrollmentYear).toBe(1);
    expect(mockPrisma.studentCplScore.create).not.toHaveBeenCalled();
  });

  it("reports ambiguous existing scores across multiple versions", async () => {
    arrangeSync({
      existingScores: [
        { studentId: "student-1", cplId: "cpl-v1", source: "SIA", status: "calculated" },
        { studentId: "student-1", cplId: "cpl-v2", source: "SIA", status: "calculated" },
      ],
    });

    const summary = await runSiaSync();

    expect(summary.cplSkippedMultipleExistingVersions).toBe(1);
    expect(mockPrisma.studentCplScore.create).not.toHaveBeenCalled();
    expect(mockPrisma.studentCplScore.update).not.toHaveBeenCalled();
  });
});
