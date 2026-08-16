import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, lifecycle } = vi.hoisted(() => ({
  prismaMock: {
    student: { update: vi.fn() },
    studentAcademicYearSnapshot: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  lifecycle: { syncBookingActivationForStudent: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn().mockResolvedValue({ id: "ay-active" }),
  formatAcademicYearLabel: vi.fn(() => "2026/2027 Ganjil"),
  resolveOperationalAcademicYear: vi.fn(),
}));
vi.mock("../metopen.service.js", () => lifecycle);

const {
  normalizeSiaObservation,
  setStudentMetopenEligibility,
  setStudentThesisCourseEnrollment,
} = await import("../metopenEligibility.service.js");
const { buildRuntimeSnapshotObservationPatch } = await import("../studentPeriodSnapshot.service.js");

describe("normalizeSiaObservation", () => {
  it("reads explicit flags and does not invent an academicYearId", () => {
    expect(normalizeSiaObservation({
      nim: "2211521001",
      eligibleMetopen: true,
      takingThesisCourse: false,
    })).toMatchObject({
      nim: "2211521001",
      eligibleMetopen: true,
      takingThesisCourse: false,
    });
  });
});

describe("buildRuntimeSnapshotObservationPatch", () => {
  it("keeps first-write eligibleMetopen and always overwrites KRS TA", () => {
    const patch = buildRuntimeSnapshotObservationPatch(
      {
        eligibleMetopen: true,
        takingThesisCourse: false,
      },
      {
        eligibleMetopen: false,
        takingThesisCourse: true,
        eligibilitySource: "sia",
        thesisCourseSource: "sia",
        capturedAt: new Date("2026-08-16T00:00:00.000Z"),
      },
    );

    expect(patch.eligibleMetopen).toBeUndefined();
    expect(patch.takingThesisCourse).toBe(true);
  });
});

describe("stampObservationOnActiveYear via setters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.student.update.mockImplementation(async ({ data }) => ({
      id: "student-1",
      ...data,
      researchMethodCompleted: false,
    }));
    lifecycle.syncBookingActivationForStudent.mockResolvedValue({ synced: false });
  });

  it("creates a snapshot when the active year has no row yet", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue(null);

    await setStudentMetopenEligibility("student-1", {
      eligibleMetopen: true,
      source: "sia",
      updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    });

    expect(prismaMock.studentAcademicYearSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: "student-1",
        academicYearId: "ay-active",
        eligibleMetopen: true,
        takingThesisCourse: null,
      }),
    });
  });

  it("overwrites KRS TA on an existing snapshot without requiring eligibility first", async () => {
    prismaMock.studentAcademicYearSnapshot.findUnique.mockResolvedValue({
      id: "snap-1",
      eligibleMetopen: null,
      takingThesisCourse: false,
    });

    await setStudentThesisCourseEnrollment("student-1", {
      takingThesisCourse: true,
      source: "sia",
      updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    });

    expect(prismaMock.studentAcademicYearSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snap-1" },
      data: expect.objectContaining({ takingThesisCourse: true }),
    });
    expect(lifecycle.syncBookingActivationForStudent).toHaveBeenCalledWith("student-1", "ay-active");
  });
});
