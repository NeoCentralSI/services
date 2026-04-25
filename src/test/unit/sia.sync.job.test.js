import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSiaClient, mockSiaStore } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    cpl: {
      findMany: vi.fn(),
    },
    studentCplScore: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockSiaClient: {
    fetchStudentsFull: vi.fn(),
    hashStudent: vi.fn(),
  },
  mockSiaStore: {
    saveStudents: vi.fn(),
    saveSyncStatus: vi.fn(),
    cleanupObsoleteStudents: vi.fn(),
  },
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../services/sia.client.js", () => mockSiaClient);
vi.mock("../../services/sia.store.js", () => mockSiaStore);

import { runSiaSync } from "../../services/sia.sync.job.js";

const STUDENT_BASE = {
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: true,
  researchMethodCompleted: true,
  currentSemester: 7,
};

describe("SIA Sync Job Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSiaClient.hashStudent.mockReturnValue("hash-value");
    mockSiaStore.saveStudents.mockResolvedValue({ updated: 0, skipped: 0 });
    mockSiaStore.saveSyncStatus.mockResolvedValue(undefined);
    mockSiaStore.cleanupObsoleteStudents.mockResolvedValue({ cleaned: 0 });

    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.student.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.student.update.mockResolvedValue({ id: "student-1" });
    mockPrisma.cpl.findMany.mockResolvedValue([]);
    mockPrisma.studentCplScore.findMany.mockResolvedValue([]);
    mockPrisma.studentCplScore.create.mockResolvedValue({});
    mockPrisma.studentCplScore.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(mockPrisma);
      return Promise.all(arg);
    });
  });

  describe("Test Case 1: Sync Student Academic Data", () => {
    it("updates student academic fields including researchMethodCompleted when NIM matches", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211521001",
          name: "Budi Santoso",
          sksCompleted: 128,
          ...STUDENT_BASE,
          cplScores: [],
        },
      ]);

      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: "student-1", identityNumber: "2211521001" },
      ]);

      const summary = await runSiaSync();

      expect(mockPrisma.student.updateMany).toHaveBeenCalledWith({
        where: { id: "student-1" },
        data: {
          skscompleted: 128,
          mandatoryCoursesCompleted: true,
          mkwuCompleted: true,
          internshipCompleted: true,
          kknCompleted: true,
          researchMethodCompleted: true,
          currentSemester: 7,
        },
      });
      expect(summary).toMatchObject({ fetched: 1, dbUpdated: 1 });
    });

    it("gracefully skips unmatched NIM and does not throw", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "9999999999",
          name: "Unknown Student",
          sksCompleted: 100,
          ...STUDENT_BASE,
          cplScores: [],
        },
      ]);

      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await expect(runSiaSync()).resolves.toMatchObject({
        fetched: 1,
        dbUpdated: 0,
      });
      expect(mockPrisma.student.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("Test Case 2: Sync Student CPL Scores", () => {
    it("creates StudentCplScore with source SIA and status calculated when no prior score exists", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211522001",
          name: "Alice Putri",
          sksCompleted: 120,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-01", score: 84, inputAt: "2026-04-20T10:00:00.000Z" }],
        },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: "student-1", identityNumber: "2211522001" }])
        .mockResolvedValueOnce([
          { id: "student-1", identityNumber: "2211522001", fullName: "Alice Putri" },
        ]);
      mockPrisma.student.findMany.mockResolvedValueOnce([{ id: "student-1" }]);
      mockPrisma.cpl.findMany.mockResolvedValueOnce([{ id: "cpl-1", code: "CPL-01" }]);
      mockPrisma.studentCplScore.findMany.mockResolvedValueOnce([]);

      const summary = await runSiaSync();

      expect(mockPrisma.studentCplScore.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: "student-1",
          cplId: "cpl-1",
          score: 84,
          source: "SIA",
          status: "calculated",
          inputAt: expect.any(Date),
        }),
      });
      expect(summary).toMatchObject({ cplCreated: 1, cplUpdated: 0 });
    });

    it("overwrites score/inputAt when existing record is SIA + calculated", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211522002",
          name: "Beni Putra",
          sksCompleted: 130,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-02", score: 90, inputAt: "2026-04-20T11:00:00.000Z" }],
        },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: "student-2", identityNumber: "2211522002" }])
        .mockResolvedValueOnce([
          { id: "student-2", identityNumber: "2211522002", fullName: "Beni Putra" },
        ]);
      mockPrisma.student.findMany.mockResolvedValueOnce([{ id: "student-2" }]);
      mockPrisma.cpl.findMany.mockResolvedValueOnce([{ id: "cpl-2", code: "CPL-02" }]);
      mockPrisma.studentCplScore.findMany.mockResolvedValueOnce([
        { studentId: "student-2", cplId: "cpl-2", source: "SIA", status: "calculated" },
      ]);

      const summary = await runSiaSync();

      expect(mockPrisma.studentCplScore.update).toHaveBeenCalledWith({
        where: {
          studentId_cplId: {
            studentId: "student-2",
            cplId: "cpl-2",
          },
        },
        data: expect.objectContaining({
          score: 90,
          source: "SIA",
          status: "calculated",
          inputAt: expect.any(Date),
        }),
      });
      expect(summary).toMatchObject({ cplCreated: 0, cplUpdated: 1 });
    });

    it("skips protected scores (manual/verified/finalized) and tallies skippedProtected", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211522003",
          name: "Citra Dewi",
          sksCompleted: 134,
          ...STUDENT_BASE,
          cplScores: [
            { code: "CPL-MANUAL", score: 76, inputAt: "2026-04-20T12:00:00.000Z" },
            { code: "CPL-VERIFIED", score: 80, inputAt: "2026-04-20T12:01:00.000Z" },
            { code: "CPL-FINAL", score: 85, inputAt: "2026-04-20T12:02:00.000Z" },
          ],
        },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: "student-3", identityNumber: "2211522003" }])
        .mockResolvedValueOnce([
          { id: "student-3", identityNumber: "2211522003", fullName: "Citra Dewi" },
        ]);
      mockPrisma.student.findMany.mockResolvedValueOnce([{ id: "student-3" }]);
      mockPrisma.cpl.findMany.mockResolvedValueOnce([
        { id: "cpl-m", code: "CPL-MANUAL" },
        { id: "cpl-v", code: "CPL-VERIFIED" },
        { id: "cpl-f", code: "CPL-FINAL" },
      ]);
      mockPrisma.studentCplScore.findMany.mockResolvedValueOnce([
        { studentId: "student-3", cplId: "cpl-m", source: "manual", status: "calculated" },
        { studentId: "student-3", cplId: "cpl-v", source: "SIA", status: "verified" },
        { studentId: "student-3", cplId: "cpl-f", source: "SIA", status: "finalized" },
      ]);

      const summary = await runSiaSync();

      expect(mockPrisma.studentCplScore.create).not.toHaveBeenCalled();
      expect(mockPrisma.studentCplScore.update).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ cplSkippedProtected: 3, cplCreated: 0, cplUpdated: 0 });
    });

    it("increments skippedUnknownCode when CPL code does not match active CPL records", async () => {
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211522004",
          name: "Dimas Putra",
          sksCompleted: 120,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-UNKNOWN", score: 70, inputAt: "2026-04-20T13:00:00.000Z" }],
        },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: "student-4", identityNumber: "2211522004" }])
        .mockResolvedValueOnce([
          { id: "student-4", identityNumber: "2211522004", fullName: "Dimas Putra" },
        ]);
      mockPrisma.student.findMany.mockResolvedValueOnce([{ id: "student-4" }]);
      mockPrisma.cpl.findMany.mockResolvedValueOnce([{ id: "cpl-other", code: "CPL-OTHER" }]);

      const summary = await runSiaSync();

      expect(summary).toMatchObject({
        cplSkippedUnknownCode: 1,
        cplUnmatchedCodes: 1,
        cplCreated: 0,
        cplUpdated: 0,
      });
    });
  });

  describe("Test Case 3: Summary Integrity & Mixed Batch", () => {
    it("returns correct summary counts for mixed valid/protected/unmatched sync payload", async () => {
      mockSiaStore.saveStudents.mockResolvedValue({ updated: 3, skipped: 0 });
      mockSiaClient.fetchStudentsFull.mockResolvedValue([
        {
          nim: "2211523001",
          name: "Eka Valid",
          sksCompleted: 140,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-10", score: 88, inputAt: "2026-04-20T14:00:00.000Z" }],
        },
        {
          nim: "2211523002",
          name: "Fajar Protected",
          sksCompleted: 142,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-11", score: 91, inputAt: "2026-04-20T14:01:00.000Z" }],
        },
        {
          nim: "9990000000",
          name: "Ghost Student",
          sksCompleted: 115,
          ...STUDENT_BASE,
          cplScores: [{ code: "CPL-10", score: 77, inputAt: "2026-04-20T14:02:00.000Z" }],
        },
      ]);

      mockPrisma.user.findMany
        .mockResolvedValueOnce([
          { id: "student-5", identityNumber: "2211523001" },
          { id: "student-6", identityNumber: "2211523002" },
        ])
        .mockResolvedValueOnce([
          { id: "student-5", identityNumber: "2211523001", fullName: "Eka Valid" },
          { id: "student-6", identityNumber: "2211523002", fullName: "Fajar Protected" },
        ]);
      mockPrisma.student.findMany.mockResolvedValueOnce([{ id: "student-5" }, { id: "student-6" }]);
      mockPrisma.cpl.findMany.mockResolvedValueOnce([
        { id: "cpl-10", code: "CPL-10" },
        { id: "cpl-11", code: "CPL-11" },
      ]);
      mockPrisma.studentCplScore.findMany.mockResolvedValueOnce([
        { studentId: "student-6", cplId: "cpl-11", source: "manual", status: "calculated" },
      ]);
      mockPrisma.student.updateMany.mockResolvedValue({ count: 1 });

      const summary = await runSiaSync();

      expect(summary).toMatchObject({
        fetched: 3,
        dbUpdated: 2,
        cplCreated: 1,
        cplSkippedProtected: 1,
        cplSkippedNoStudent: 1,
      });
    });
  });
});
