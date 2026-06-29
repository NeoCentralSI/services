import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const exportRepoMock = {
  findLatestAttendanceImportForExport: vi.fn(),
  findAttendanceImportForExport: vi.fn(),
  findResearchMethodScoresForStudentExport: vi.fn(),
};

vi.mock("../../repositories/assessmentExport.repository.js", () => exportRepoMock);

const { exportMetopenScoresXlsx, __test } = await import(
  "../assessmentExport.service.js"
);

function makeAttendanceImport(overrides = {}) {
  return {
    id: "attendance-import-1",
    classCode: "JSI60143/SI/Kuliah/A",
    courseName: "Metode Penelitian",
    semesterLabel: "Genap 2025/2026",
    thresholdPercent: 0.75,
    uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
    totalRows: 0,
    matchedRows: 0,
    eligibleRows: 0,
    ineligibleRows: 0,
    records: [],
    ...overrides,
  };
}

function makeRecord(overrides = {}) {
  return {
    id: `attendance-record-${overrides.identityNumber ?? Math.random()}`,
    studentId: overrides.studentId ?? null,
    identityNumber: overrides.identityNumber ?? "2211523000",
    studentName: overrides.studentName ?? "Test Student",
    presentCount: 8,
    totalMeetings: 9,
    attendancePercentage: 0.8889,
    isEligible: true,
    ...overrides,
  };
}

function makeScoreRow({ thesisId, studentId, details, ...rest }) {
  return {
    id: `score-${thesisId}`,
    thesisId,
    supervisorScore: 70,
    lecturerScore: 20,
    finalScore: 90,
    isFinalized: false,
    attendanceRecordId: null,
    attendanceAutoZeroedAt: null,
    attendanceAutoZeroReason: null,
    thesis: { id: thesisId, studentId },
    researchMethodScoreDetails: details,
    ...rest,
  };
}

function detail({ score, cpmkCode, role, criteriaName = "Kriteria" }) {
  return {
    score,
    criteria: {
      id: `crit-${cpmkCode}-${role}`,
      name: criteriaName,
      role,
      maxScore: score,
      metopenCpmk: { code: cpmkCode },
    },
  };
}

describe("assessmentExport.service — exportMetopenScoresXlsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when no attendance import is available", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(null);

    await expect(exportMetopenScoresXlsx({})).rejects.toThrow(
      /Belum ada import presensi/i,
    );
  });

  it("emits xlsx with sheet name = classCode and the SIA template header", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [makeRecord({ studentId: null, identityNumber: "2211523001", studentName: "ALPHA" })],
      }),
    );
    exportRepoMock.findResearchMethodScoresForStudentExport.mockResolvedValue([]);

    const { buffer, filename, classCode } = await exportMetopenScoresXlsx({});

    expect(filename).toMatch(/\.xlsx$/);
    expect(classCode).toBe("JSI60143/SI/Kuliah/A");

    const workbook = XLSX.read(buffer, { type: "buffer" });
    // Sheet name harus sudah disanitasi (excel tidak mengizinkan slash).
    expect(workbook.SheetNames).toHaveLength(1);
    expect(workbook.SheetNames[0]).toBe("JSI60143-SI-Kuliah-A");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    expect(rows[0][0]).toBe("TEMPLATE NILAI");
    expect(rows[1].slice(0, 3)).toEqual(["Matakuliah", null, expect.stringContaining("Metode Penelitian")]);
    expect(rows[3].slice(0, 3)).toEqual(["Nama Kelas", null, "JSI60143/SI/Kuliah/A"]);
    expect(rows[4].slice(0, 3)).toEqual(["Jumlah Peserta", null, "1 Orang"]);
    expect(rows[5].slice(0, 8)).toEqual([
      "No",
      "NIM",
      "Nama",
      "CPMK 1",
      "CPMK 2",
      null,
      "CPMK 3",
      "Keterangan",
    ]);
    expect(rows[7].slice(3, 7)).toEqual([
      "Presentasi",
      "Proposal (konten)",
      "Proposal (struktur)",
      "Kemampuan merespon",
    ]);
    expect(rows[8].slice(3, 7)).toEqual([20, 40, 25, 15]);
    expect(rows[9].slice(0, 3)).toEqual([1, "2211523001", "ALPHA"]);
  });

  it("buckets ResearchMethodScoreDetail by CPMK code substring + role", async () => {
    const studentId = "student-1";
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [
          makeRecord({ studentId, identityNumber: "2211523001", studentName: "ILHAM" }),
        ],
      }),
    );
    exportRepoMock.findResearchMethodScoresForStudentExport.mockResolvedValue([
      makeScoreRow({
        thesisId: "thesis-1",
        studentId,
        isFinalized: true,
        details: [
          detail({ score: 18, cpmkCode: "CPMK-01", role: "supervisor" }),
          detail({ score: 35, cpmkCode: "CPMK-02", role: "supervisor" }),
          detail({ score: 22, cpmkCode: "CPMK-02", role: "default" }),
          detail({ score: 12, cpmkCode: "CPMK-03", role: "supervisor" }),
        ],
      }),
    ]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    expect(rows[9].slice(3, 8)).toEqual([18, 35, 22, 12, null]);
  });

  it("writes zeros + note Keterangan for auto-zero student (attendance <75%)", async () => {
    const studentId = "student-auto-zero";
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [
          makeRecord({
            studentId,
            identityNumber: "2211523029",
            studentName: "ALIFIA",
            presentCount: 3,
            totalMeetings: 9,
            attendancePercentage: 0.3333,
            isEligible: false,
          }),
        ],
      }),
    );
    exportRepoMock.findResearchMethodScoresForStudentExport.mockResolvedValue([
      makeScoreRow({
        thesisId: "thesis-az",
        studentId,
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        attendanceAutoZeroedAt: new Date("2026-05-12T09:00:00.000Z"),
        attendanceAutoZeroReason: "Presensi <75%",
        details: [],
      }),
    ]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    expect(rows[9].slice(3, 7)).toEqual([0, 0, 0, 0]);
    expect(rows[9][7]).toMatch(/Auto-zero presensi <75%/);
  });

  it("leaves score cells empty when student belum dinilai (no score record)", async () => {
    const studentId = "student-belum";
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [
          makeRecord({
            studentId,
            identityNumber: "2311523001",
            studentName: "BELUM DINILAI",
          }),
        ],
      }),
    );
    exportRepoMock.findResearchMethodScoresForStudentExport.mockResolvedValue([]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    expect(rows[9].slice(3, 8)).toEqual([null, null, null, null, null]);
  });

  it("uses specific attendanceImportId when provided", async () => {
    exportRepoMock.findAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ id: "custom-import", classCode: "X" }),
    );
    exportRepoMock.findResearchMethodScoresForStudentExport.mockResolvedValue([]);

    await exportMetopenScoresXlsx({ attendanceImportId: "custom-import" });
    expect(exportRepoMock.findAttendanceImportForExport).toHaveBeenCalledWith("custom-import");
    expect(exportRepoMock.findLatestAttendanceImportForExport).not.toHaveBeenCalled();
  });
});

describe("assessmentExport.service — bucket classifier helpers", () => {
  it("classifies CPMK-01 supervisor → presentasi", () => {
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CPMK-01", role: "supervisor" }),
    );
    expect(bucket).toBe(__test.BUCKETS.PRESENTASI);
  });

  it("classifies CPMK-02 supervisor → proposalKonten", () => {
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CPMK-02", role: "supervisor" }),
    );
    expect(bucket).toBe(__test.BUCKETS.PROPOSAL_KONTEN);
  });

  it("classifies CPMK-02 default → proposalStruktur", () => {
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CPMK-02", role: "default" }),
    );
    expect(bucket).toBe(__test.BUCKETS.PROPOSAL_STRUKTUR);
  });

  it("classifies CPMK-03 supervisor → kemampuanRespon", () => {
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CPMK-03", role: "supervisor" }),
    );
    expect(bucket).toBe(__test.BUCKETS.KEMAMPUAN_RESPON);
  });

  it("supports non-prefixed CPMK code by substring match", () => {
    // Admin bisa pakai kode "CP-5 IK05-01" (template SIA) atau "01"
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CP-5 IK05-01", role: "supervisor" }),
    );
    expect(bucket).toBe(__test.BUCKETS.PRESENTASI);
  });

  it("returns null for unknown CPMK code", () => {
    const bucket = __test.classifyDetail(
      detail({ score: 10, cpmkCode: "CPMK-99", role: "supervisor" }),
    );
    expect(bucket).toBeNull();
  });

  it("prefers finalized score when multiple thesis rows exist per student", () => {
    const sid = "student-1";
    const index = __test.buildScoreIndex([
      { id: "newer", isFinalized: false, thesis: { studentId: sid } },
      { id: "older-final", isFinalized: true, thesis: { studentId: sid } },
    ]);
    expect(index.get(sid).id).toBe("older-final");
  });
});
