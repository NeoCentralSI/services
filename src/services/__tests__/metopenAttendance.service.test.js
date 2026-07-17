import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const repoMock = vi.hoisted(() => ({
  findLatestAttendanceImport: vi.fn(),
  findAttendanceRecordForThesis: vi.fn(),
  findStudentsByIdentityNumbers: vi.fn(),
  createAttendanceImportWithRecords: vi.fn(),
  updateAttendanceImportCounts: vi.fn(),
  findIneligibleRecordsForImport: vi.fn(),
  findEligibleRecordsForImport: vi.fn(),
  findScoreableThesesByStudentIds: vi.fn(),
  clearAttendanceAutoZeroForTheses: vi.fn(),
  autoZeroResearchMethodScore: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: fsMock,
}));

vi.mock("../../repositories/metopenAttendance.repository.js", () => repoMock);

const { uploadMetopenAttendance } = await import("../metopenAttendance.service.js");

function makeAttendanceFile(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Kelas", "JSI60143/SI/Kuliah/A"],
    ["Matakuliah", "Metode Penelitian"],
    ["NIM", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"],
    ...rows,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Presensi");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    buffer,
    originalname: "presensi-metopel.xlsx",
    size: buffer.length,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function attendanceImportFixture(overrides = {}) {
  return {
    id: overrides.id ?? "attendance-import-1",
    academicYearId: overrides.academicYearId ?? null,
    documentId: overrides.documentId ?? "document-1",
    uploadedByUserId: overrides.uploadedByUserId ?? "koord-1",
    classCode: overrides.classCode ?? "JSI60143/SI/Kuliah/A",
    courseName: overrides.courseName ?? "Metode Penelitian",
    semesterLabel: overrides.semesterLabel ?? null,
    filterLabel: overrides.filterLabel ?? null,
    lecturerNames: overrides.lecturerNames ?? null,
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
});
