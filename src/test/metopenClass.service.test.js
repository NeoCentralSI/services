import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRepo, mockPrisma, mockAcademicYearHelper } = vi.hoisted(() => ({
  mockRepo: {
    findAcademicYearById: vi.fn(),
    findRosterEnrollments: vi.fn(),
    findClassById: vi.fn(),
    findConflictingEnrollments: vi.fn(),
    enrollStudents: vi.fn(),
    resolveDuplicateEnrollment: vi.fn(),
  },
  mockPrisma: {
    lecturer: {
      findUnique: vi.fn(),
    },
  },
  mockAcademicYearHelper: {
    getActiveAcademicYear: vi.fn(),
    getAcademicYearsWithStatus: vi.fn(),
  },
}));

vi.mock("../repositories/metopenClass.repository.js", () => mockRepo);
vi.mock("../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../helpers/academicYear.helper.js", () => mockAcademicYearHelper);

import {
  enrollStudents,
  getRoster,
  resolveDuplicateEnrollment,
} from "../services/metopenClass.service.js";

describe("metopenClass.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds unique roster while keeping duplicate class assignments visible", async () => {
    mockAcademicYearHelper.getActiveAcademicYear.mockResolvedValue({
      id: "ay-active",
      year: 2025,
      semester: "genap",
    });
    mockRepo.findRosterEnrollments.mockResolvedValue([
      {
        studentId: "student-1",
        classId: "class-1",
        enrolledAt: new Date("2025-02-01"),
        student: {
          user: { fullName: "Ilham Nugraha", identityNumber: "2211522028", email: "ilham@example.com" },
        },
        metopenClass: {
          id: "class-1",
          name: "Metopen Genap 2025",
          isActive: true,
          lecturer: { id: "lecturer-1", user: { fullName: "Dr. Andi" } },
          academicYear: { id: "ay-active", year: 2025, semester: "genap" },
        },
      },
      {
        studentId: "student-1",
        classId: "class-2",
        enrolledAt: new Date("2025-02-02"),
        student: {
          user: { fullName: "Ilham Nugraha", identityNumber: "2211522028", email: "ilham@example.com" },
        },
        metopenClass: {
          id: "class-2",
          name: "Test",
          isActive: true,
          lecturer: { id: "lecturer-2", user: { fullName: "Dr. Budi" } },
          academicYear: { id: "ay-active", year: 2025, semester: "genap" },
        },
      },
    ]);

    const roster = await getRoster();

    expect(roster.summary).toEqual({
      totalStudents: 1,
      duplicateStudents: 1,
      totalAssignments: 2,
      classCount: 2,
    });
    expect(roster.students[0]).toMatchObject({
      studentId: "student-1",
      studentName: "Ilham Nugraha",
      classCount: 2,
      hasDuplicateEnrollment: true,
    });
  });

  it("blocks enrolling a student into a second class in the same academic year", async () => {
    mockRepo.findClassById.mockResolvedValue({
      id: "class-1",
      academicYearId: "ay-active",
    });
    mockRepo.findConflictingEnrollments.mockResolvedValue([
      {
        studentId: "student-1",
        student: { user: { fullName: "Ilham Nugraha", identityNumber: "2211522028" } },
        metopenClass: { name: "Test" },
      },
    ]);

    await expect(enrollStudents("class-1", ["student-1"])).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockRepo.enrollStudents).not.toHaveBeenCalled();
  });

  it("resolves duplicate enrollment by moving milestones and deleting extra rows", async () => {
    mockAcademicYearHelper.getActiveAcademicYear.mockResolvedValue({
      id: "ay-active",
      year: 2025,
      semester: "genap",
    });
    mockRepo.findAcademicYearById.mockResolvedValue({
      id: "ay-active",
      year: 2025,
      semester: "genap",
      isActive: true,
    });
    mockRepo.findConflictingEnrollments.mockResolvedValue([
      {
        studentId: "student-1",
        classId: "class-1",
        student: { user: { fullName: "Ilham Nugraha", identityNumber: "2211522028" } },
        metopenClass: { name: "Metopen Genap 2025" },
      },
      {
        studentId: "student-1",
        classId: "class-2",
        student: { user: { fullName: "Ilham Nugraha", identityNumber: "2211522028" } },
        metopenClass: { name: "Test" },
      },
    ]);
    mockRepo.resolveDuplicateEnrollment.mockResolvedValue({
      keepEnrollment: {
        metopenClass: { name: "Metopen Genap 2025" },
      },
      movedMilestones: 2,
      deletedEnrollments: 1,
    });
    mockRepo.findRosterEnrollments.mockResolvedValue([
      {
        studentId: "student-1",
        classId: "class-1",
        enrolledAt: new Date("2025-02-01"),
        student: {
          user: { fullName: "Ilham Nugraha", identityNumber: "2211522028", email: "ilham@example.com" },
        },
        metopenClass: {
          id: "class-1",
          name: "Metopen Genap 2025",
          isActive: true,
          lecturer: { id: "lecturer-1", user: { fullName: "Dr. Andi" } },
          academicYear: { id: "ay-active", year: 2025, semester: "genap" },
        },
      },
    ]);

    const result = await resolveDuplicateEnrollment({
      academicYearId: "ay-active",
      studentId: "student-1",
      keepClassId: "class-1",
    });

    expect(mockRepo.resolveDuplicateEnrollment).toHaveBeenCalledWith({
      academicYearId: "ay-active",
      studentId: "student-1",
      keepClassId: "class-1",
    });
    expect(result).toMatchObject({
      studentId: "student-1",
      keepClassName: "Metopen Genap 2025",
      movedMilestones: 2,
      deletedEnrollments: 1,
      resolved: true,
    });
  });
});
