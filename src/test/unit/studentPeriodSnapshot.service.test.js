import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    academicYear: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    student: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    studentAcademicYearSnapshot: {
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

const { backfillPeriodSnapshots, getPeriodSnapshotCoverage } = await import(
  "../../services/studentPeriodSnapshot.service.js"
);

const ACADEMIC_YEAR = {
  id: "ay-active",
  year: "2026/2027",
  semester: "ganjil",
  startDate: new Date("2026-08-01T00:00:00.000Z"),
  endDate: new Date("2027-01-31T00:00:00.000Z"),
  isActive: true,
};

const OBSERVED_AT = new Date("2026-07-20T02:56:52.000Z");

const student = (overrides = {}) => ({
  id: "student-1",
  eligibleMetopen: true,
  researchMethodCompleted: true,
  metopenEligibilitySource: "sia",
  metopenEligibilityUpdatedAt: OBSERVED_AT,
  takingThesisCourse: null,
  thesisCourseEnrollmentSource: null,
  thesisCourseEnrollmentUpdatedAt: null,
  ...overrides,
});

describe("studentPeriodSnapshot.service — backfill snapshot periode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.academicYear.findUnique.mockResolvedValue(ACADEMIC_YEAR);
    mockPrisma.academicYear.findMany.mockResolvedValue([ACADEMIC_YEAR]);
    mockPrisma.student.count.mockResolvedValue(3);
    mockPrisma.student.findMany.mockResolvedValue([student()]);
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.studentAcademicYearSnapshot.count.mockResolvedValue(0);
    mockPrisma.studentAcademicYearSnapshot.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.studentAcademicYearSnapshot.update.mockResolvedValue({ id: "snapshot-1" });
    mockPrisma.$transaction.mockImplementation(async (arg) =>
      typeof arg === "function" ? arg(mockPrisma) : Promise.all(arg),
    );
  });

  it("dry-run melaporkan rencana tanpa menulis satu baris pun", async () => {
    const result = await backfillPeriodSnapshots("ay-active");

    expect(result.applied).toBe(false);
    expect(result.plannedCreate).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.studentAcademicYearSnapshot.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.studentAcademicYearSnapshot.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("apply membawa provenance observasi dan membiarkan KRS Tugas Akhir tetap null", async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      student({
        takingThesisCourse: false,
        thesisCourseEnrollmentSource: "sia",
        thesisCourseEnrollmentUpdatedAt: OBSERVED_AT,
      }),
    ]);
    mockPrisma.studentAcademicYearSnapshot.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const result = await backfillPeriodSnapshots("ay-active", { apply: true });

    expect(result.created).toBe(1);
    expect(result.snapshotsBefore).toBe(0);
    expect(result.snapshotsAfter).toBe(1);

    const [payload] = mockPrisma.studentAcademicYearSnapshot.createMany.mock.calls[0];
    expect(payload.skipDuplicates).toBe(true);
    expect(payload.data).toEqual([
      {
        studentId: "student-1",
        academicYearId: "ay-active",
        eligibleMetopen: true,
        researchMethodCompleted: true,
        takingThesisCourse: null,
        eligibilitySource: "sia",
        eligibilityCapturedAt: OBSERVED_AT,
        thesisCourseSource: null,
        thesisCourseCapturedAt: null,
        capturedAt: OBSERVED_AT,
      },
    ]);
  });

  it("membawa status KRS Tugas Akhir hanya saat diminta eksplisit", async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      student({
        takingThesisCourse: true,
        thesisCourseEnrollmentSource: "sia",
        thesisCourseEnrollmentUpdatedAt: OBSERVED_AT,
      }),
    ]);

    await backfillPeriodSnapshots("ay-active", {
      apply: true,
      includeThesisCourse: true,
    });

    const [payload] = mockPrisma.studentAcademicYearSnapshot.createMany.mock.calls[0];
    expect(payload.data[0]).toMatchObject({
      takingThesisCourse: true,
      thesisCourseSource: "sia",
      thesisCourseCapturedAt: OBSERVED_AT,
    });
  });

  it("idempoten: mahasiswa yang sudah punya snapshot lengkap tidak diproses ulang", async () => {
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      {
        id: "snapshot-1",
        studentId: "student-1",
        eligibleMetopen: false,
        takingThesisCourse: true,
      },
    ]);
    mockPrisma.studentAcademicYearSnapshot.count.mockResolvedValue(1);

    const result = await backfillPeriodSnapshots("ay-active", { apply: true });

    expect(result.plannedCreate).toBe(0);
    expect(result.plannedFill).toBe(0);
    expect(result.created).toBe(0);
    expect(mockPrisma.studentAcademicYearSnapshot.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.studentAcademicYearSnapshot.update).not.toHaveBeenCalled();
  });

  it("hanya mengisi kolom yang masih null pada baris yang sudah ada", async () => {
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      {
        id: "snapshot-1",
        studentId: "student-1",
        eligibleMetopen: null,
        takingThesisCourse: true,
      },
    ]);
    mockPrisma.studentAcademicYearSnapshot.count.mockResolvedValue(1);
    mockPrisma.student.findMany.mockResolvedValue([
      student({
        takingThesisCourse: false,
        thesisCourseEnrollmentSource: "sia",
        thesisCourseEnrollmentUpdatedAt: OBSERVED_AT,
      }),
    ]);

    const result = await backfillPeriodSnapshots("ay-active", {
      apply: true,
      includeThesisCourse: true,
    });

    expect(result.filled).toBe(1);
    expect(mockPrisma.studentAcademicYearSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snapshot-1" },
      data: {
        eligibleMetopen: true,
        researchMethodCompleted: true,
        eligibilitySource: "sia",
        eligibilityCapturedAt: OBSERVED_AT,
      },
    });
  });

  it("mahasiswa tanpa observasi akademik tidak pernah dibuatkan snapshot", async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      student({
        eligibleMetopen: null,
        metopenEligibilitySource: null,
        metopenEligibilityUpdatedAt: null,
      }),
    ]);

    const result = await backfillPeriodSnapshots("ay-active", { apply: true });

    expect(result.plannedCreate).toBe(0);
    expect(mockPrisma.studentAcademicYearSnapshot.createMany).not.toHaveBeenCalled();
  });

  it("menolak periode yang tidak dikenal", async () => {
    mockPrisma.academicYear.findUnique.mockResolvedValue(null);

    await expect(backfillPeriodSnapshots("ay-hilang")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("studentPeriodSnapshot.service — kelengkapan snapshot periode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.academicYear.findUnique.mockResolvedValue(ACADEMIC_YEAR);
    mockPrisma.academicYear.findMany.mockResolvedValue([ACADEMIC_YEAR]);
    mockPrisma.student.count.mockResolvedValue(105);
    mockPrisma.student.findMany.mockResolvedValue([student()]);
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.studentAcademicYearSnapshot.count.mockResolvedValue(0);
  });

  it("melaporkan N dari M dan menandai periode belum lengkap", async () => {
    const coverage = await getPeriodSnapshotCoverage("ay-active");

    expect(coverage.coverageLabel).toBe("0 dari 105");
    expect(coverage.totalStudents).toBe(105);
    expect(coverage.studentsWithSnapshot).toBe(0);
    expect(coverage.pendingCreate).toBe(1);
    expect(coverage.complete).toBe(false);
    expect(coverage.academicYear.label).toBe("2026/2027 Ganjil");
  });

  it("menandai lengkap saat tidak ada lagi yang bisa dibentuk", async () => {
    mockPrisma.studentAcademicYearSnapshot.count.mockResolvedValue(45);
    mockPrisma.studentAcademicYearSnapshot.findMany.mockResolvedValue([
      {
        id: "snapshot-1",
        studentId: "student-1",
        eligibleMetopen: true,
        takingThesisCourse: null,
      },
    ]);

    const coverage = await getPeriodSnapshotCoverage("ay-active");

    expect(coverage.pendingCreate).toBe(0);
    expect(coverage.pendingFill).toBe(0);
    expect(coverage.complete).toBe(true);
  });

  it("memakai periode operasional saat academicYearId tidak diberikan", async () => {
    await getPeriodSnapshotCoverage();

    expect(mockPrisma.academicYear.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.academicYear.findMany).toHaveBeenCalled();
  });
});
