/** Presensi Metode Penelitian (rules kept from the old attendance tests). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const { repo, fileHelper, notify } = vi.hoisted(() => ({
  repo: {
    findAcademicYear: vi.fn(async (id) => ({ id, semester: "ganjil", year: "2026/2027" })),
    findLatestImport: vi.fn(),
    findImports: vi.fn(),
    findImportById: vi.fn(),
    findRecords: vi.fn(),
    findStudentsByIdentityNumbers: vi.fn(async () => []),
    findRecordForStudent: vi.fn(),
    createImport: vi.fn(async ({ importData }) => importData),
    updateImportCounts: vi.fn(async (id, data) => ({ id, totalRows: 0, matchedRows: 0, sourceFiles: [], ...data })),
    findScoreableAttempts: vi.fn(async () => []),
    findAttemptForAttendance: vi.fn(),
    autoZeroAttempt: vi.fn(async () => ({ applied: true })),
    clearAutoZero: vi.fn(async () => []),
    linkAttendanceRecord: vi.fn(),
    findNotificationTargets: vi.fn(async () => ({ title: "Judul", student: { id: "stu-1", user: { fullName: "Mahasiswa" } }, thesisSupervisors: [{ lecturerId: "lec-1" }] })),
    normalizeIdentity: (v) => String(v ?? "").replace(/\s+/g, "").trim(),
  },
  fileHelper: {
    attendanceImportDir: (id) => `uploads/research-method/attendance/${id}`,
    storeFile: vi.fn(async ({ file }) => ({ filePath: `x/${file.originalname}`, fileName: file.originalname, mimeType: "x", fileSize: 1, fileHash: "h" })),
    removeFile: vi.fn(),
  },
  notify: { createNotificationEventForUsers: vi.fn() },
}));

vi.mock("../../repositories/research-method/attendance.repository.js", () => repo);
vi.mock("../../helpers/thesis-proposal-file.helper.js", () => fileHelper);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn(),
  AUDIT_ACTIONS: { RESEARCH_METHOD_ATTENDANCE_IMPORTED: "X" },
  ENTITY_TYPES: { RESEARCH_METHOD_ATTENDANCE_IMPORT: "Y" },
}));
vi.mock("../../helpers/academicYear.helper.js", () => ({ formatAcademicYearLabel: () => "2026/2027 Ganjil" }));

const service = await import("../../services/research-method/attendance.service.js");

function workbook(rows, { header = ["No", "NIM / BP", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"], classCode = "A" } = {}) {
  const aoa = [["REPORT PESERTA KELAS"], ["Matakuliah", ":", "Metodologi Penelitian"], ["Kelas", ":", classCode], ["Dosen", ":", "Dosen A; Dosen B"], [], header, ...rows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
const file = (name, buffer) => ({ originalname: name, buffer, mimetype: "application/vnd.ms-excel", size: buffer.length });
const row = (nim, present, pct) => [1, nim, `Mhs ${nim}`, present, 16 - present, 0, 0, 16, pct];

beforeEach(() => {
  vi.clearAllMocks();
  repo.findAcademicYear.mockImplementation(async (id) => ({ id, semester: "ganjil", year: "2026/2027" }));
  repo.findScoreableAttempts.mockResolvedValue([]);
  repo.autoZeroAttempt.mockResolvedValue({ applied: true });
});

describe("parse and merge", () => {
  it("reads the header, percentages above 1 as percent, `>= 75%` eligible, first row of a NIM wins", () => {
    const parsed = service.parseAttendanceWorkbook(workbook([row("2211528001", 12, "75.00%"), row("2211528002", 11, 68.75), row("2211528003", 15, 0.9375), row("2211528001", 1, "6%")]));
    expect(parsed.metadata).toMatchObject({ classCode: "A", courseName: "Metodologi Penelitian", lecturerNames: ["Dosen A", "Dosen B"] });
    expect(parsed.records.map((r) => [r.identityNumber, r.attendancePercentage, r.isEligible])).toEqual([
      ["2211528001", 0.75, true],
      ["2211528002", 0.6875, false],
      ["2211528003", 0.9375, true],
    ]);
  });

  it("refuses a file without the required header", () => {
    expect(() => service.parseAttendanceWorkbook(workbook([row("1", 1, "1%")], { header: ["NIM", "Nama"] }))).toThrow(/Header presensi tidak ditemukan/);
  });

  it("merges two class files by NIM and refuses a NIM present in both", () => {
    const a = { ...service.parseAttendanceWorkbook(workbook([row("2211528001", 15, "93.75%")], { classCode: "A" })), fileName: "a.xlsx" };
    const b = { ...service.parseAttendanceWorkbook(workbook([row("2211528002", 14, "87.50%")], { classCode: "B" })), fileName: "b.xlsx" };
    const merged = service.mergeParsedFiles([a, b]);
    expect(merged.records.map((r) => r.identityNumber)).toEqual(["2211528001", "2211528002"]);
    expect(merged.metadata.classCode).toBe("A + B");
    expect(merged.sourceFiles).toHaveLength(2);
    try {
      service.mergeParsedFiles([a, { ...a, fileName: "a2.xlsx" }]);
      throw new Error("tidak ditolak");
    } catch (error) {
      expect(error.message).toMatch(/1 NIM yang muncul/);
      expect(error.details.conflicts[0].identityNumber).toBe("2211528001");
    }
  });

  it("accepts at most two distinct files", () => {
    const buf = workbook([row("1", 1, "1%")]);
    expect(service.normalizeUploadFiles([file("a.xlsx", buf), file("a.xlsx", buf)])).toHaveLength(1);
    expect(() => service.normalizeUploadFiles([file("a.xlsx", buf), file("b.xlsx", buf), file("c.xlsx", buf)])).toThrow(/Maksimal 2/);
    expect(() => service.normalizeUploadFiles([])).toThrow(/wajib diunggah/);
  });
});

describe("upload (R19)", () => {
  const attempts = [
    { id: "a1", thesisId: "t1", isFinalized: false, attendanceAutoZeroedAt: null, thesis: { id: "t1", title: "A", status: "proposal", studentId: "s1" } },
    { id: "a2", thesisId: "t2", isFinalized: true, attendanceAutoZeroedAt: null, thesis: { id: "t2", title: "B", status: "proposal", studentId: "s2" } },
    { id: "a3", thesisId: "t3", isFinalized: true, attendanceAutoZeroedAt: new Date(), thesis: { id: "t3", title: "C", status: "proposal", studentId: "s3" } },
    { id: "a4", thesisId: "t4", isFinalized: true, attendanceAutoZeroedAt: new Date(), thesis: { id: "t4", title: "D", status: "research", studentId: "s4" } },
    { id: "a5", thesisId: "t5", isFinalized: false, attendanceAutoZeroedAt: null, thesis: { id: "t5", title: "E", status: "proposal", studentId: "s5" } },
  ];

  it("sets 0 for a non-final attempt, skips a finalized one, reopens 0 only in the proposal phase", async () => {
    repo.findRecords.mockResolvedValue([
      { id: "r1", studentId: "s1", identityNumber: "1", isEligible: false, attendancePercentage: 0.6 },
      { id: "r2", studentId: "s2", identityNumber: "2", isEligible: false, attendancePercentage: 0.6 },
      { id: "r3", studentId: "s3", identityNumber: "3", isEligible: true, attendancePercentage: 0.8 },
      { id: "r4", studentId: "s4", identityNumber: "4", isEligible: true, attendancePercentage: 0.8 },
      { id: "r5", studentId: "s5", identityNumber: "5", isEligible: true, attendancePercentage: 0.9 },
    ]);
    repo.findScoreableAttempts.mockResolvedValue(attempts);
    repo.autoZeroAttempt.mockImplementation(async ({ assessmentId }) => (assessmentId === "a2" ? { skipped: true } : { applied: true }));
    const result = await service.uploadAttendance([file("a.xlsx", workbook([row("1", 9, "56.25%")]))], "ay-1", "coord");

    expect(repo.autoZeroAttempt).toHaveBeenCalledTimes(2);
    expect(result.autoZeroed.map((r) => r.thesisId)).toEqual(["t1"]);
    expect(repo.updateImportCounts).toHaveBeenCalledWith(expect.any(String), { autoZeroedCount: 1, skippedFinalizedCount: 1 });
    expect(repo.clearAutoZero).toHaveBeenCalledWith([{ assessmentId: "a3", attendanceRecordId: "r3" }]);
    expect(repo.linkAttendanceRecord).toHaveBeenCalledWith("a4", "r4");
    expect(repo.linkAttendanceRecord).toHaveBeenCalledWith("a5", "r5");
    // student, supervisors and (without push) the uploader hear about the new 0
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["stu-1"], expect.objectContaining({ type: "research_method_attendance_auto_zero" }), { push: true });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["coord"], expect.anything(), { push: false });
  });

  it("needs a period", async () => {
    await expect(service.uploadAttendance([file("a.xlsx", workbook([row("1", 9, "56%")]))], "", "coord")).rejects.toThrow(/Periode akademik wajib/);
  });
});

describe("scoring gate (R20) and catch-up", () => {
  const attempt = { id: "a1", academicYearId: "ay-1", proposalFilePath: "p.pdf", attendanceAutoZeroedAt: null, thesis: { id: "t1", status: "proposal", student: { id: "s1", user: { identityNumber: "1" } } } };

  it("missing import or row is a 400; below the threshold sets 0 and refuses with 403", async () => {
    repo.findLatestImport.mockResolvedValue(null);
    await expect(service.assertAttendanceAllowsScoring(attempt, "lec")).rejects.toMatchObject({ statusCode: 400 });
    repo.findLatestImport.mockResolvedValue({ id: "imp" });
    repo.findRecordForStudent.mockResolvedValue(null);
    await expect(service.assertAttendanceAllowsScoring(attempt, "lec")).rejects.toThrow(/tidak ditemukan pada presensi/);
    repo.findRecordForStudent.mockResolvedValue({ id: "r1", isEligible: false, attendancePercentage: 0.5 });
    await expect(service.assertAttendanceAllowsScoring(attempt, "lec")).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.autoZeroAttempt).toHaveBeenCalledWith(expect.objectContaining({ assessmentId: "a1", skipFinalized: false }));
    repo.findRecordForStudent.mockResolvedValue({ id: "r1", isEligible: true, attendancePercentage: 0.9 });
    await expect(service.assertAttendanceAllowsScoring(attempt, "lec")).resolves.toMatchObject({ id: "r1" });
  });

  it("after a final proposal: an existing ineligible row sets 0 at once; a repeat does not notify again", async () => {
    repo.findAttemptForAttendance.mockResolvedValue(attempt);
    repo.findLatestImport.mockResolvedValue({ id: "imp" });
    repo.findRecordForStudent.mockResolvedValue({ id: "r1", isEligible: false, attendancePercentage: 0.5 });
    await expect(service.reconcileAttempt("a1", "stu")).resolves.toEqual({ status: "ineligible", applied: "auto_zeroed" });
    repo.autoZeroAttempt.mockResolvedValue({ alreadyAutoZeroed: true });
    notify.createNotificationEventForUsers.mockClear();
    await expect(service.reconcileAttempt("a1", "stu")).resolves.toEqual({ status: "ineligible", applied: "already_auto_zeroed" });
    expect(notify.createNotificationEventForUsers).not.toHaveBeenCalled();
    repo.findRecordForStudent.mockResolvedValue(null);
    await expect(service.reconcileAttempt("a1", "stu")).resolves.toEqual({ status: "not_found" });
  });
});
