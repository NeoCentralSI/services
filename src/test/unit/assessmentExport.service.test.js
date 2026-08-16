import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const exportRepoMock = {
  findLatestAttendanceImportForExport: vi.fn(),
  findAttendanceImportForExport: vi.fn(),
  findResearchMethodScoresForPeriodExport: vi.fn(),
  findMetopenRubricConfigForExport: vi.fn(),
};

vi.mock("../../repositories/assessmentExport.repository.js", () => exportRepoMock);

const assessmentExportService = await import("../../services/assessmentExport.service.js");
const { __test } = assessmentExportService;
const exportMetopenScoresXlsx = (options = {}) =>
  assessmentExportService.exportMetopenScoresXlsx({
    academicYearId: "ay-1",
    ...options,
  });

const CRITERIA = Object.freeze({
  PRESENTASI: "crit-presentasi",
  KONTEN: "crit-konten",
  STRUKTUR: "crit-struktur",
  RESPON: "crit-respon",
});

/**
 * Konfigurasi rubrik periode: CPMK 1 (supervisor), CPMK 2 (supervisor +
 * default), CPMK 3 (supervisor). Kode CPMK bisa apa saja — pemetaan kolom
 * mengikuti urutan kode + role, bukan substring.
 */
function makeRubricConfig({
  weights = [20, 40, 25, 15],
  codes = ["CPMK-01", "CPMK-02", "CPMK-03"],
} = {}) {
  const [presentasi, konten, struktur, respon] = weights;
  const [codeOne, codeTwo, codeThree] = codes;
  return [
    {
      id: "cpmk-1",
      code: codeOne,
      description: "Presentasi proposal",
      metopenAssessmentCriterias: [
        {
          id: CRITERIA.PRESENTASI,
          name: "Kualitas presentasi",
          role: "supervisor",
          maxScore: presentasi,
          displayOrder: 1,
        },
      ],
    },
    {
      id: "cpmk-2",
      code: codeTwo,
      description: "Isi proposal",
      metopenAssessmentCriterias: [
        {
          id: CRITERIA.KONTEN,
          name: "Kedalaman konten",
          role: "supervisor",
          maxScore: konten,
          displayOrder: 1,
        },
        {
          id: CRITERIA.STRUKTUR,
          name: "Kesesuaian struktur",
          role: "default",
          maxScore: struktur,
          displayOrder: 1,
        },
      ],
    },
    {
      id: "cpmk-3",
      code: codeThree,
      description: "Kemampuan merespon",
      metopenAssessmentCriterias: [
        {
          id: CRITERIA.RESPON,
          name: "Respon pertanyaan",
          role: "supervisor",
          maxScore: respon,
          displayOrder: 1,
        },
      ],
    },
  ];
}

function makeAttendanceImport(overrides = {}) {
  return {
    id: "attendance-import-1",
    academicYearId: "ay-1",
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

function makeScoreRow({
  thesisId,
  studentId,
  details = [],
  identityNumber = null,
  fullName = null,
  ...rest
}) {
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
    thesis: {
      id: thesisId,
      studentId,
      student: identityNumber || fullName
        ? { user: { identityNumber, fullName } }
        : null,
    },
    researchMethodScoreDetails: details,
    ...rest,
  };
}

function detail({ criteriaId, score, role = "supervisor", cpmkCode = "CPMK-01" }) {
  return {
    score,
    criteria: {
      id: criteriaId,
      name: `Kriteria ${criteriaId}`,
      role,
      maxScore: null,
      metopenCpmk: { code: cpmkCode },
    },
  };
}

function readSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return {
    workbook,
    sheet,
    rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }),
  };
}

function readRowNote(sheet, rowOffset = 0) {
  const address = XLSX.utils.encode_cell({
    c: 2,
    r: __test.FIRST_DATA_ROW + rowOffset,
  });
  return sheet[address]?.c?.[0]?.t ?? null;
}

describe("assessmentExport.service — template SIA structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue(makeRubricConfig());
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([]);
  });

  it("throws NotFoundError when no attendance import is available", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(null);

    await expect(exportMetopenScoresXlsx({})).rejects.toThrow(
      /Belum ada import presensi/i,
    );
  });

  it("mirrors the 7-column SIA template header without extra NeoCentral columns", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [makeRecord({ identityNumber: "2211523001", studentName: "ALPHA" })],
      }),
    );

    const { buffer, filename, classCode } = await exportMetopenScoresXlsx({});

    expect(filename).toMatch(/\.xlsx$/);
    expect(classCode).toBe("JSI60143/SI/Kuliah/A");

    const { workbook, sheet, rows } = readSheet(buffer);
    expect(workbook.SheetNames).toEqual(["JSI60143-SI-Kuliah-A"]);
    // Kolom terakhir template SIA adalah G (index 6).
    expect(XLSX.utils.decode_range(sheet["!ref"]).e.c).toBe(6);
    // Merge header mengikuti template SIA: metadata A1:G1..C5:G5, kolom
    // No/NIM/Nama membentang 4 baris header, CPMK 2 membentang E..F.
    expect(sheet["!merges"]).toEqual([
      { s: { c: 0, r: 0 }, e: { c: 6, r: 0 } },
      { s: { c: 2, r: 1 }, e: { c: 6, r: 1 } },
      { s: { c: 2, r: 2 }, e: { c: 6, r: 2 } },
      { s: { c: 2, r: 3 }, e: { c: 6, r: 3 } },
      { s: { c: 2, r: 4 }, e: { c: 6, r: 4 } },
      { s: { c: 0, r: 5 }, e: { c: 0, r: 8 } },
      { s: { c: 1, r: 5 }, e: { c: 1, r: 8 } },
      { s: { c: 2, r: 5 }, e: { c: 2, r: 8 } },
      { s: { c: 4, r: 5 }, e: { c: 5, r: 5 } },
      { s: { c: 4, r: 6 }, e: { c: 5, r: 6 } },
    ]);
    expect(rows[0][0]).toBe("TEMPLATE NILAI");
    expect(rows[3].slice(0, 3)).toEqual(["Nama Kelas", null, "JSI60143/SI/Kuliah/A"]);
    expect(rows[4].slice(0, 3)).toEqual(["Jumlah Peserta", null, "1 Orang"]);
    expect(rows[5]).toEqual(["No", "NIM", "Nama", "CPMK 1", "CPMK 2", null, "CPMK 3"]);
    expect(rows[7].slice(3, 7)).toEqual([
      "Presentasi",
      "Proposal (konten)",
      "Proposal (struktur)",
      "Kemampuan merespon",
    ]);
    expect(rows[9].slice(0, 3)).toEqual([1, "2211523001", "ALPHA"]);
    expect(rows[9][7]).toBeUndefined();
  });

  it("reads column weights from the period rubric configuration", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ records: [makeRecord()] }),
    );
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue(
      makeRubricConfig({ weights: [30, 25, 30, 15] }),
    );

    const result = await exportMetopenScoresXlsx({});
    const { rows } = readSheet(result.buffer);

    expect(rows[8].slice(3, 7)).toEqual([30, 25, 30, 15]);
    expect(result.criteriaSource).toBe(__test.CRITERIA_SOURCE.CONFIG);
    expect(result.columnWeights.map((column) => column.weightSource)).toEqual([
      __test.WEIGHT_SOURCE.CONFIG,
      __test.WEIGHT_SOURCE.CONFIG,
      __test.WEIGHT_SOURCE.CONFIG,
      __test.WEIGHT_SOURCE.CONFIG,
    ]);
  });

  it("labels the canon default weights explicitly when configuration is missing", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ records: [makeRecord()] }),
    );
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue([]);

    const result = await exportMetopenScoresXlsx({});
    const { rows } = readSheet(result.buffer);

    expect(rows[8].slice(3, 7)).toEqual([20, 40, 25, 15]);
    expect(result.criteriaSource).toBe(__test.CRITERIA_SOURCE.UNAVAILABLE);
    expect(
      result.columnWeights.every(
        (column) => column.weightSource === __test.WEIGHT_SOURCE.CANON_DEFAULT,
      ),
    ).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("default canon"),
      expect.any(String),
    );
  });
});

describe("assessmentExport.service — belum dinilai vs nol sah", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue(makeRubricConfig());
  });

  it("leaves every score cell empty when the student has no score row at all", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [makeRecord({ studentId: "student-belum", identityNumber: "2311523001" })],
      }),
    );
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const { rows } = readSheet(buffer);

    expect(rows[9].slice(3, 7)).toEqual([null, null, null, null]);
  });

  it("leaves the TA-03B cell empty while TA-03A is already graded", async () => {
    const studentId = "student-partial";
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [makeRecord({ studentId, identityNumber: "2211523002" })],
      }),
    );
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([
      makeScoreRow({
        thesisId: "thesis-partial",
        studentId,
        supervisorScore: 65,
        lecturerScore: null,
        finalScore: null,
        details: [
          detail({ criteriaId: CRITERIA.PRESENTASI, score: 18 }),
          detail({ criteriaId: CRITERIA.KONTEN, score: 35, cpmkCode: "CPMK-02" }),
          detail({ criteriaId: CRITERIA.RESPON, score: 12, cpmkCode: "CPMK-03" }),
        ],
      }),
    ]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const { rows } = readSheet(buffer);

    // Kolom Proposal (struktur) milik TA-03B belum disubmit → sel kosong,
    // bukan 0 (0 adalah nilai sah di template SIA).
    expect(rows[9].slice(3, 7)).toEqual([18, 35, null, 12]);
  });

  it("writes a rubric-assessed zero as 0, not as an empty cell", async () => {
    const studentId = "student-zero";
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [makeRecord({ studentId, identityNumber: "2211523003" })],
      }),
    );
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([
      makeScoreRow({
        thesisId: "thesis-zero",
        studentId,
        supervisorScore: 30,
        lecturerScore: 10,
        isFinalized: true,
        details: [
          detail({ criteriaId: CRITERIA.PRESENTASI, score: 0 }),
          detail({ criteriaId: CRITERIA.KONTEN, score: 30, cpmkCode: "CPMK-02" }),
          detail({ criteriaId: CRITERIA.STRUKTUR, score: 10, cpmkCode: "CPMK-02", role: "default" }),
          detail({ criteriaId: CRITERIA.RESPON, score: 0, cpmkCode: "CPMK-03" }),
        ],
      }),
    ]);

    const { buffer } = await exportMetopenScoresXlsx({});
    const { rows } = readSheet(buffer);

    expect(rows[9].slice(3, 7)).toEqual([0, 30, 10, 0]);
  });

  it("writes zeros for an auto-zero row (BR-28) and records the note as a cell comment", async () => {
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
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([
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
    const { sheet, rows } = readSheet(buffer);

    expect(rows[9].slice(3, 7)).toEqual([0, 0, 0, 0]);
    expect(readRowNote(sheet)).toMatch(/Auto-zero presensi Metopel <75%/);
  });

  it("buckets details by criteria id even when CPMK codes carry no ordinal digits", () => {
    const columnPlan = __test.buildColumnPlan({
      rubricConfig: makeRubricConfig({ codes: ["AA-topik", "BB-isi", "CC-respon"] }),
    });
    const cells = __test.resolveScoreCells(
      makeScoreRow({
        thesisId: "thesis-x",
        studentId: "student-x",
        supervisorScore: 50,
        lecturerScore: 20,
        details: [
          detail({ criteriaId: CRITERIA.PRESENTASI, score: 15, cpmkCode: "AA-topik" }),
          detail({ criteriaId: CRITERIA.KONTEN, score: 25, cpmkCode: "BB-isi" }),
          detail({ criteriaId: CRITERIA.STRUKTUR, score: 20, cpmkCode: "BB-isi", role: "default" }),
          detail({ criteriaId: CRITERIA.RESPON, score: 10, cpmkCode: "CC-respon" }),
        ],
      }),
      columnPlan,
    );

    expect(cells).toEqual([15, 25, 20, 10]);
    expect(columnPlan.criteriaSource).toBe(__test.CRITERIA_SOURCE.CONFIG);
  });
});

describe("assessmentExport.service — union peserta presensi + peserta bernilai", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue(makeRubricConfig());
  });

  it("exports a scored student who is absent from the attendance import", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({
        records: [
          makeRecord({
            studentId: "student-hadir",
            identityNumber: "2211523004",
            studentName: "HADIR TANPA NILAI",
          }),
        ],
      }),
    );
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([
      makeScoreRow({
        thesisId: "thesis-luar",
        studentId: "student-luar-presensi",
        identityNumber: "2211523005",
        fullName: "BERNILAI TANPA PRESENSI",
        supervisorScore: 70,
        lecturerScore: 22,
        isFinalized: true,
        details: [
          detail({ criteriaId: CRITERIA.PRESENTASI, score: 19 }),
          detail({ criteriaId: CRITERIA.KONTEN, score: 38, cpmkCode: "CPMK-02" }),
          detail({ criteriaId: CRITERIA.STRUKTUR, score: 22, cpmkCode: "CPMK-02", role: "default" }),
          detail({ criteriaId: CRITERIA.RESPON, score: 13, cpmkCode: "CPMK-03" }),
        ],
      }),
    ]);

    const result = await exportMetopenScoresXlsx({});
    const { sheet, rows } = readSheet(result.buffer);

    expect(result.totalRows).toBe(2);
    expect(result.scoreOnlyRows).toBe(1);
    expect(result.attendanceOnlyRows).toBe(1);
    expect(rows[4].slice(0, 3)).toEqual(["Jumlah Peserta", null, "2 Orang"]);
    // Peserta presensi yang belum dinilai tetap ada, dengan sel kosong.
    expect(rows[9].slice(0, 3)).toEqual([1, "2211523004", "HADIR TANPA NILAI"]);
    expect(rows[9].slice(3, 7)).toEqual([null, null, null, null]);
    // Mahasiswa bernilai di luar berkas presensi ikut terekspor.
    expect(rows[10].slice(0, 3)).toEqual([2, "2211523005", "BERNILAI TANPA PRESENSI"]);
    expect(rows[10].slice(3, 7)).toEqual([19, 38, 22, 13]);
    expect(readRowNote(sheet, 1)).toMatch(/Tidak ada pada import presensi/i);
  });

  it("matches a score to an attendance row by NIM when the row has no student link", () => {
    const participants = __test.buildParticipants(
      makeAttendanceImport({
        records: [makeRecord({ studentId: null, identityNumber: "2211523006" })],
      }),
      [
        makeScoreRow({
          thesisId: "thesis-nim",
          studentId: "student-nim",
          identityNumber: "2211523006",
          fullName: "COCOK VIA NIM",
        }),
      ],
    );

    expect(participants).toHaveLength(1);
    expect(participants[0].inAttendanceImport).toBe(true);
    expect(participants[0].scoreRecord?.thesisId).toBe("thesis-nim");
  });

  it("prefers the finalized score when a student has more than one thesis", () => {
    const participants = __test.buildParticipants(
      makeAttendanceImport({
        records: [makeRecord({ studentId: "student-multi", identityNumber: "2211523007" })],
      }),
      [
        makeScoreRow({ thesisId: "newer", studentId: "student-multi", isFinalized: false }),
        makeScoreRow({ thesisId: "older-final", studentId: "student-multi", isFinalized: true }),
      ],
    );

    expect(participants[0].scoreRecord?.thesisId).toBe("older-final");
  });

  it("sorts union rows by NIM ascending", () => {
    const participants = __test.buildParticipants(
      makeAttendanceImport({
        records: [makeRecord({ studentId: "s-b", identityNumber: "2211523020" })],
      }),
      [
        makeScoreRow({
          thesisId: "thesis-a",
          studentId: "s-a",
          identityNumber: "2011523001",
          fullName: "SENIOR",
        }),
      ],
    );

    expect(participants.map((participant) => participant.identityNumber)).toEqual([
      "2011523001",
      "2211523020",
    ]);
  });
});

describe("assessmentExport.service — scope periode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    exportRepoMock.findMetopenRubricConfigForExport.mockResolvedValue(makeRubricConfig());
    exportRepoMock.findResearchMethodScoresForPeriodExport.mockResolvedValue([]);
  });

  it("uses the specific attendanceImportId when provided", async () => {
    exportRepoMock.findAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ id: "custom-import", classCode: "X" }),
    );

    await exportMetopenScoresXlsx({ attendanceImportId: "custom-import" });

    expect(exportRepoMock.findAttendanceImportForExport).toHaveBeenCalledWith("custom-import");
    expect(exportRepoMock.findLatestAttendanceImportForExport).not.toHaveBeenCalled();
  });

  it("rejects an explicitly selected import from another academic period", async () => {
    exportRepoMock.findAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ id: "old-import", academicYearId: "ay-old" }),
    );

    await expect(
      exportMetopenScoresXlsx({ attendanceImportId: "old-import" }),
    ).rejects.toThrow(/tidak berasal dari periode akademik/i);
    expect(exportRepoMock.findResearchMethodScoresForPeriodExport).not.toHaveBeenCalled();
  });

  it("queries scores and rubric config only for the import academic period", async () => {
    exportRepoMock.findLatestAttendanceImportForExport.mockResolvedValue(
      makeAttendanceImport({ records: [makeRecord({ studentId: "student-period" })] }),
    );

    await exportMetopenScoresXlsx({});

    expect(exportRepoMock.findLatestAttendanceImportForExport).toHaveBeenCalledWith("ay-1");
    expect(exportRepoMock.findResearchMethodScoresForPeriodExport).toHaveBeenCalledWith("ay-1");
    expect(exportRepoMock.findMetopenRubricConfigForExport).toHaveBeenCalledWith("ay-1");
  });

  it("requires academicYearId when no import id is supplied", async () => {
    await expect(
      assessmentExportService.exportMetopenScoresXlsx({}),
    ).rejects.toThrow(/academicYearId wajib diisi/i);
  });
});
