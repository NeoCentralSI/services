import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const repoMock = vi.hoisted(() => ({
  findLatestAttendanceImport: vi.fn(),
  findAcademicYearById: vi.fn(),
  findThesisAcademicYear: vi.fn(),
  findAttendanceRecordForThesis: vi.fn(),
  findStudentsByIdentityNumbers: vi.fn(),
  createAttendanceImportWithRecords: vi.fn(),
  updateAttendanceImportCounts: vi.fn(),
  findIneligibleRecordsForImport: vi.fn(),
  findEligibleRecordsForImport: vi.fn(),
  findScoreableThesesByStudentIds: vi.fn(),
  findThesisForAttendanceReconcile: vi.fn(),
  clearAttendanceAutoZeroForTheses: vi.fn(),
  autoZeroResearchMethodScore: vi.fn(),
  findThesisAutoZeroNotificationTargets: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  createNotificationEventForUsers: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: fsMock,
}));

vi.mock("../../repositories/metopenAttendance.repository.js", () => repoMock);

vi.mock("../notification.service.js", () => notificationMock);

const attendanceService = await import("../metopenAttendance.service.js");
const {
  mergeAttendanceParsedWorkbooks,
  reconcileAttendanceForThesis,
  assertAttendanceEligibleForManualReview,
  getAttendanceEligibilityForThesis,
} = attendanceService;
const uploadMetopenAttendance = (files, actor, options = {}) =>
  attendanceService.uploadMetopenAttendance(
    files,
    actor,
    { academicYearId: "ay-1", ...options },
  );
const previewMetopenAttendance = (files, academicYearId = "ay-1") =>
  attendanceService.previewMetopenAttendance(files, academicYearId);

function makeAttendanceFile(rows, { classCode = "JSI60143/SI/Kuliah/A", fileName = "presensi-metopel.xlsx" } = {}) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Kelas", classCode],
    ["Matakuliah", "Metode Penelitian"],
    ["NIM", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"],
    ...rows,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Presensi");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    buffer,
    originalname: fileName,
    size: buffer.length,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function attendanceImportFixture(overrides = {}) {
  return {
    id: overrides.id ?? "attendance-import-1",
    academicYearId: overrides.academicYearId ?? "ay-1",
    documentId: overrides.documentId ?? "document-1",
    uploadedByUserId: overrides.uploadedByUserId ?? "koord-1",
    classCode: overrides.classCode ?? "JSI60143/SI/Kuliah/A",
    courseName: overrides.courseName ?? "Metode Penelitian",
    semesterLabel: overrides.semesterLabel ?? null,
    filterLabel: overrides.filterLabel ?? null,
    lecturerNames: overrides.lecturerNames ?? null,
    sourceFiles: overrides.sourceFiles ?? null,
    thresholdPercent: overrides.thresholdPercent ?? 0.75,
    totalRows: overrides.totalRows ?? 1,
    matchedRows: overrides.matchedRows ?? 1,
    eligibleRows: overrides.eligibleRows ?? 1,
    ineligibleRows: overrides.ineligibleRows ?? 0,
    autoZeroedCount: overrides.autoZeroedCount ?? 0,
    skippedFinalizedCount: overrides.skippedFinalizedCount ?? 0,
    uploadedAt: overrides.uploadedAt ?? new Date("2026-05-12T08:31:20.000Z"),
    createdAt: overrides.createdAt ?? new Date("2026-05-12T08:31:20.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-05-12T08:31:20.000Z"),
    document: overrides.document ?? null,
    uploadedBy: overrides.uploadedBy ?? null,
    records: overrides.records ?? [],
  };
}

beforeEach(() => {
  repoMock.findAcademicYearById.mockResolvedValue({
    id: "ay-1",
    year: "2025/2026",
    semester: "genap",
    startDate: new Date("2026-01-13T00:00:00.000Z"),
    endDate: new Date("2026-07-31T23:59:59.999Z"),
  });
  repoMock.findThesisAcademicYear.mockResolvedValue({
    id: "thesis-1",
    academicYearId: "ay-1",
    ta04AssignmentAcademicYearId: null,
  });
});

describe("metopenAttendance.service — uploadMetopenAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.mkdir.mockResolvedValue(undefined);
    fsMock.writeFile.mockResolvedValue(undefined);
    repoMock.createAttendanceImportWithRecords.mockImplementation(async ({ importData }) => ({
      import: attendanceImportFixture(importData),
      document: { id: "document-1" },
    }));
    repoMock.updateAttendanceImportCounts.mockImplementation(async (importId, data) =>
      attendanceImportFixture({ id: importId, ...data }),
    );
    repoMock.findIneligibleRecordsForImport.mockResolvedValue([]);
    repoMock.findEligibleRecordsForImport.mockResolvedValue([]);
    repoMock.findScoreableThesesByStudentIds.mockResolvedValue([]);
    repoMock.clearAttendanceAutoZeroForTheses.mockResolvedValue([]);
  });

  it("clears stale attendance auto-zero when re-upload marks the thesis eligible", async () => {
    const file = makeAttendanceFile([
      ["2311523026", "Dimas", 8, 1, 0, 0, 9, "88.89%"],
    ]);
    const eligibleRecord = {
      id: "attendance-record-eligible",
      studentId: "student-1",
      identityNumber: "2311523026",
      studentName: "Dimas",
      attendancePercentage: 0.8889,
      presentCount: 8,
      totalMeetings: 9,
    };

    repoMock.findStudentsByIdentityNumbers.mockResolvedValue([
      {
        id: "student-1",
        user: {
          id: "user-student-1",
          fullName: "Dimas",
          identityNumber: "2311523026",
        },
      },
    ]);
    repoMock.findEligibleRecordsForImport.mockResolvedValue([eligibleRecord]);
    repoMock.findScoreableThesesByStudentIds.mockResolvedValue([
      {
        id: "thesis-1",
        studentId: "student-1",
        title: "Sistem Informasi Pengajuan Proposal",
        isProposal: true,
        activePromotedAt: null,
        advisorRequests: [],
        researchMethodScores: [
          {
            id: "score-auto-zero",
            isFinalized: true,
            attendanceAutoZeroedAt: new Date("2026-05-10T09:00:00.000Z"),
          },
        ],
      },
    ]);

    const result = await uploadMetopenAttendance(file, "koord-1");

    expect(repoMock.autoZeroResearchMethodScore).not.toHaveBeenCalled();
    expect(repoMock.findScoreableThesesByStudentIds).toHaveBeenCalledWith(
      ["student-1"],
      "ay-1",
      expect.any(Array),
    );
    expect(repoMock.clearAttendanceAutoZeroForTheses).toHaveBeenCalledWith([
      {
        thesisId: "thesis-1",
        attendanceRecordId: "attendance-record-eligible",
      },
    ]);
    expect(result.totals.eligibleRows).toBe(1);
    expect(result.totals.autoZeroedCount).toBe(0);
  });

  it("keeps attendance auto-zero permanent after promotion or release lifecycle", async () => {
    const file = makeAttendanceFile([
      ["2311523026", "Dimas", 8, 1, 0, 0, 9, "88.89%"],
    ]);

    repoMock.findStudentsByIdentityNumbers.mockResolvedValue([
      {
        id: "student-1",
        user: {
          id: "user-student-1",
          fullName: "Dimas",
          identityNumber: "2311523026",
        },
      },
    ]);
    repoMock.findEligibleRecordsForImport.mockResolvedValue([
      {
        id: "attendance-record-eligible",
        studentId: "student-1",
        identityNumber: "2311523026",
        studentName: "Dimas",
        attendancePercentage: 0.8889,
        presentCount: 8,
        totalMeetings: 9,
      },
    ]);
    repoMock.findScoreableThesesByStudentIds.mockResolvedValue([
      {
        id: "thesis-promoted",
        studentId: "student-1",
        title: "Sistem Informasi Pengajuan Proposal",
        isProposal: false,
        activePromotedAt: new Date("2026-07-01T00:00:00.000Z"),
        advisorRequests: [{ id: "req-1", status: "active_official" }],
        researchMethodScores: [
          {
            id: "score-auto-zero",
            isFinalized: true,
            attendanceAutoZeroedAt: new Date("2026-05-10T09:00:00.000Z"),
          },
        ],
      },
    ]);

    await uploadMetopenAttendance(file, "koord-1");

    expect(repoMock.clearAttendanceAutoZeroForTheses).toHaveBeenCalledWith([]);
    expect(repoMock.autoZeroResearchMethodScore).not.toHaveBeenCalled();
  });

  it("does not clear manually finalized scores when re-upload attendance is eligible", async () => {
    const file = makeAttendanceFile([
      ["2311523026", "Dimas", 8, 1, 0, 0, 9, "88.89%"],
    ]);

    repoMock.findStudentsByIdentityNumbers.mockResolvedValue([
      {
        id: "student-1",
        user: {
          id: "user-student-1",
          fullName: "Dimas",
          identityNumber: "2311523026",
        },
      },
    ]);
    repoMock.findEligibleRecordsForImport.mockResolvedValue([
      {
        id: "attendance-record-eligible",
        studentId: "student-1",
        identityNumber: "2311523026",
        studentName: "Dimas",
        attendancePercentage: 0.8889,
        presentCount: 8,
        totalMeetings: 9,
      },
    ]);
    repoMock.findScoreableThesesByStudentIds.mockResolvedValue([
      {
        id: "thesis-1",
        studentId: "student-1",
        title: "Sistem Informasi Pengajuan Proposal",
        researchMethodScores: [
          {
            id: "score-final-manual",
            isFinalized: true,
            attendanceAutoZeroedAt: null,
          },
        ],
      },
    ]);

    await uploadMetopenAttendance(file, "koord-1");

    expect(repoMock.clearAttendanceAutoZeroForTheses).toHaveBeenCalledWith([]);
    expect(repoMock.autoZeroResearchMethodScore).not.toHaveBeenCalled();
  });

  it("merges two class files into one active import without wiping either class", async () => {
    const fileA = makeAttendanceFile(
      [["2311523001", "Alice", 8, 1, 0, 0, 9, "88.89%"]],
      { classCode: "Kelas/A", fileName: "kelas-a.xlsx" },
    );
    const fileB = makeAttendanceFile(
      [["2311523002", "Bob", 7, 2, 0, 0, 9, "77.78%"]],
      { classCode: "Kelas/B", fileName: "kelas-b.xlsx" },
    );

    repoMock.findStudentsByIdentityNumbers.mockResolvedValue([
      { id: "student-a", user: { id: "ua", fullName: "Alice", identityNumber: "2311523001" } },
      { id: "student-b", user: { id: "ub", fullName: "Bob", identityNumber: "2311523002" } },
    ]);

    const result = await uploadMetopenAttendance([fileA, fileB], "koord-1");

    expect(result.totals.totalRows).toBe(2);
    expect(result.totals.sourceFileCount).toBe(2);
    expect(result.totals.matchedRows).toBe(2);
    expect(repoMock.createAttendanceImportWithRecords).toHaveBeenCalledTimes(1);
    const created = repoMock.createAttendanceImportWithRecords.mock.calls[0][0];
    expect(created.records).toHaveLength(2);
    expect(created.importData.classCode).toContain("Kelas/A");
    expect(created.importData.classCode).toContain("Kelas/B");
    expect(created.importData.sourceFiles).toHaveLength(2);
    expect(fsMock.writeFile).toHaveBeenCalledTimes(2);
  });

  it("rejects dual upload when the same NIM appears in both class files", async () => {
    const fileA = makeAttendanceFile(
      [["2311523099", "Conflict", 8, 1, 0, 0, 9, "88.89%"]],
      { classCode: "Kelas/A", fileName: "kelas-a.xlsx" },
    );
    const fileB = makeAttendanceFile(
      [["2311523099", "Conflict", 3, 6, 0, 0, 9, "33.33%"]],
      { classCode: "Kelas/B", fileName: "kelas-b.xlsx" },
    );

    await expect(uploadMetopenAttendance([fileA, fileB], "koord-1")).rejects.toMatchObject({
      message: expect.stringMatching(/NIM yang muncul di lebih dari satu file/i),
      details: {
        conflicts: [
          expect.objectContaining({
            identityNumber: "2311523099",
            sources: expect.arrayContaining([
              expect.objectContaining({ fileName: "kelas-a.xlsx" }),
              expect.objectContaining({ fileName: "kelas-b.xlsx" }),
            ]),
          }),
        ],
      },
    });
    expect(repoMock.createAttendanceImportWithRecords).not.toHaveBeenCalled();
  });
});

describe("mergeAttendanceParsedWorkbooks", () => {
  it("unions disjoint NIMs and keeps source metadata", () => {
    const merged = mergeAttendanceParsedWorkbooks([
      {
        sourceFileName: "a.xlsx",
        metadata: { classCode: "A", courseName: "Metode Penelitian" },
        records: [
          {
            identityNumber: "1",
            studentName: "One",
            presentCount: 8,
            absentCount: 1,
            sickCount: 0,
            permitCount: 0,
            totalMeetings: 9,
            attendancePercentage: 0.89,
            isEligible: true,
            rawRow: {},
          },
        ],
      },
      {
        sourceFileName: "b.xlsx",
        metadata: { classCode: "B", courseName: "Metode Penelitian" },
        records: [
          {
            identityNumber: "2",
            studentName: "Two",
            presentCount: 7,
            absentCount: 2,
            sickCount: 0,
            permitCount: 0,
            totalMeetings: 9,
            attendancePercentage: 0.78,
            isEligible: true,
            rawRow: {},
          },
        ],
      },
    ]);

    expect(merged.records).toHaveLength(2);
    expect(merged.metadata.classCode).toBe("A + B");
    expect(merged.sourceFiles).toHaveLength(2);
  });
});

describe("reconcileAttendanceForThesis — upload-first catch-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-zeros ineligible thesis after final proposal when attendance was uploaded first", async () => {
    repoMock.findLatestAttendanceImport.mockResolvedValue(
      attendanceImportFixture({ uploadedByUserId: "koord-1" }),
    );
    repoMock.findAttendanceRecordForThesis.mockResolvedValue({
      id: "rec-ineligible",
      studentId: "student-1",
      identityNumber: "2399000016",
      studentName: "Edge16",
      attendancePercentage: 0.44,
      isEligible: false,
      presentCount: 4,
      totalMeetings: 9,
      import: attendanceImportFixture(),
    });
    repoMock.autoZeroResearchMethodScore.mockResolvedValue({
      skipped: false,
      blockedFinalized: false,
      alreadyAutoZeroed: false,
      scoreRecord: { id: "score-1", finalScore: 0 },
    });
    repoMock.findThesisAutoZeroNotificationTargets.mockResolvedValue({
      id: "thesis-upload-first",
      title: "Proposal Edge16",
      student: { user: { id: "user-student-16", fullName: "Edge16" } },
      thesisSupervisors: [
        {
          role: { name: "Pembimbing 1" },
          lecturer: { user: { id: "user-p1", fullName: "Dosen P1" } },
        },
      ],
    });

    const result = await reconcileAttendanceForThesis("thesis-upload-first", "student-user");

    expect(result.status).toBe("ineligible");
    expect(result.applied).toBe("auto_zeroed");
    expect(repoMock.autoZeroResearchMethodScore).toHaveBeenCalledWith(
      expect.objectContaining({
        thesisId: "thesis-upload-first",
        attendanceRecordId: "rec-ineligible",
        skipFinalized: true,
      }),
    );
    // SIMPTA-FUN-019: auto-zero baru wajib memberi tahu mahasiswa + pembimbing aktif.
    expect(notificationMock.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-student-16"],
      expect.objectContaining({ type: "simpta_ta03_attendance_auto_zero" }),
      expect.anything(),
    );
    expect(notificationMock.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-p1"],
      expect.objectContaining({ type: "simpta_ta03_attendance_auto_zero_notice" }),
      expect.anything(),
    );
  });

  it("reports already_auto_zeroed without re-notifying on repeated reconcile", async () => {
    repoMock.findLatestAttendanceImport.mockResolvedValue(
      attendanceImportFixture({ uploadedByUserId: "koord-1" }),
    );
    repoMock.findAttendanceRecordForThesis.mockResolvedValue({
      id: "rec-ineligible",
      studentId: "student-1",
      identityNumber: "2399000016",
      studentName: "Edge16",
      attendancePercentage: 0.44,
      isEligible: false,
      presentCount: 4,
      totalMeetings: 9,
      import: attendanceImportFixture(),
    });
    repoMock.autoZeroResearchMethodScore.mockResolvedValue({
      skipped: false,
      blockedFinalized: false,
      alreadyAutoZeroed: true,
      scoreRecord: {
        id: "score-1",
        finalScore: 0,
        attendanceAutoZeroedAt: new Date("2026-05-10T09:00:00.000Z"),
      },
    });

    const result = await reconcileAttendanceForThesis("thesis-upload-first", "student-user");

    expect(result.applied).toBe("already_auto_zeroed");
    expect(notificationMock.createNotificationEventForUsers).not.toHaveBeenCalled();
  });

  it("no-ops when student is not in the latest import", async () => {
    repoMock.findLatestAttendanceImport.mockResolvedValue(attendanceImportFixture());
    repoMock.findAttendanceRecordForThesis.mockResolvedValue(null);

    const result = await reconcileAttendanceForThesis("thesis-missing");

    expect(result).toEqual({ status: "not_found", applied: null });
    expect(repoMock.autoZeroResearchMethodScore).not.toHaveBeenCalled();
  });
});

describe("assertAttendanceEligibleForManualReview — NIM fallback gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows scoring when record is matched via NIM even if studentId was backfilled", async () => {
    repoMock.findLatestAttendanceImport.mockResolvedValue(attendanceImportFixture());
    repoMock.findAttendanceRecordForThesis.mockResolvedValue({
      id: "rec-nim",
      studentId: "student-1",
      identityNumber: "2311523026",
      studentName: "Dimas",
      attendancePercentage: 0.9,
      isEligible: true,
      presentCount: 9,
      totalMeetings: 10,
      import: attendanceImportFixture(),
    });

    const gate = await assertAttendanceEligibleForManualReview("thesis-1", "dosen-1");

    expect(gate.allowed).toBe(true);
    expect(gate.eligibility.status).toBe("eligible");
    expect(repoMock.findAttendanceRecordForThesis).toHaveBeenCalled();
  });

  it("getAttendanceEligibilityForThesis surfaces not_found when NIM and studentId miss", async () => {
    repoMock.findLatestAttendanceImport.mockResolvedValue(attendanceImportFixture());
    repoMock.findAttendanceRecordForThesis.mockResolvedValue(null);

    const eligibility = await getAttendanceEligibilityForThesis("thesis-orphan");

    expect(eligibility.status).toBe("not_found");
    expect(eligibility.isEligible).toBe(false);
    expect(repoMock.findLatestAttendanceImport).toHaveBeenCalledWith("ay-1");
  });
});

describe("previewMetopenAttendance — dual file conflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects preview when NIM conflicts across files", async () => {
    const fileA = makeAttendanceFile(
      [["2311523099", "Conflict", 8, 1, 0, 0, 9, "88.89%"]],
      { classCode: "Kelas/A", fileName: "kelas-a.xlsx" },
    );
    const fileB = makeAttendanceFile(
      [["2311523099", "Conflict", 3, 6, 0, 0, 9, "33.33%"]],
      { classCode: "Kelas/B", fileName: "kelas-b.xlsx" },
    );

    await expect(previewMetopenAttendance([fileA, fileB])).rejects.toMatchObject({
      details: { conflicts: [expect.objectContaining({ identityNumber: "2311523099" })] },
    });
  });
});
