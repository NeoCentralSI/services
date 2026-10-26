/**
 * The monitoring progress report: what it prints (labels instead of enum
 * values, a period title that says what the semester filter means, lecturers' degrees left
 * as written) and what it answers when the PDF converter is not running.
 */
import PizZip from "pizzip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, axiosGet, convertDocxToPdf, templateBuffer } = vi.hoisted(() => ({
  repo: {
    getAcademicYearById: vi.fn(),
    getThesesForReport: vi.fn(),
    getStatusDistribution: vi.fn(),
    getActivityDistribution: vi.fn(),
  },
  axiosGet: vi.fn(),
  convertDocxToPdf: vi.fn(),
  templateBuffer: { value: null },
}));

vi.mock("../../repositories/thesisGuidance/monitoring.repository.js", () => repo);
vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn() }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn() }));
vi.mock("../../helpers/academicYear.helper.js", () => ({ getActiveAcademicYearId: vi.fn() }));
vi.mock("../../utils/pdf.util.js", () => ({ convertDocxToPdf }));
vi.mock("axios", () => ({ default: { get: axiosGet } }));
// Only the letterhead template is replaced; every other file is read from disk as usual.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  const isTemplate = (file) => String(file).endsWith("logcatatantemplate.docx");
  const fs = {
    ...actual.default,
    existsSync: (file) => (isTemplate(file) ? templateBuffer.value !== null : actual.default.existsSync(file)),
    readFile: (file, ...rest) =>
      isTemplate(file) ? rest[rest.length - 1](null, templateBuffer.value) : actual.default.readFile(file, ...rest),
  };
  return { ...actual, ...fs, default: fs };
});

const { convertReportToPdf, generateProgressReportPdfService, getProgressReportService } = await import(
  "../../services/thesisGuidance/monitoring.service.js"
);

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY);
const PDF_DOWN = "Layanan pembuat PDF sedang tidak aktif. Hubungi admin sistem.";
const SEMESTER = { id: "ay-now", semester: "ganjil", year: "2026/2027" };

/** A letterhead template: one paragraph, then the body the service replaces. */
function buildTemplate() {
  const zip = new PizZip();
  zip.file(
    "word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      "<w:p><w:r><w:t>KOP DEPARTEMEN</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Identitas Mahasiswa</w:t></w:r></w:p>" +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>' +
      "</w:body></w:document>",
  );
  return zip.generate({ type: "nodebuffer" });
}

const supervisor = (roleName, fullName) => ({ role: { name: roleName }, lecturer: { user: { fullName } } });

/** A thesis as `getThesesForReport` returns it, with the derived progress attached. */
const thesis = (overrides = {}) => ({
  id: "t1",
  title: "Sistem Informasi Arsip Surat Departemen",
  status: "research",
  startDate: daysAgo(220),
  createdAt: daysAgo(220),
  student: { user: { fullName: "UJI TA LAMBAT", identityNumber: "2211529002" } },
  thesisTopic: { name: "Pengembangan Sistem" },
  thesisSupervisors: [supervisor("Pembimbing 1", "HUSNIL KAMIL, M.T"), supervisor("Pembimbing 2", "Fajril Akbar, M.Sc")],
  thesisMilestones: [{ status: "completed" }, { status: "in_progress" }],
  thesisGuidances: [{ status: "completed", completedAt: daysAgo(80) }],
  progress: {
    activityLevel: "slow",
    supervisionClock: { elapsedLabel: "7 bulan 7 hari", evaluationDue: "six_month" },
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  templateBuffer.value = buildTemplate();
  repo.getAcademicYearById.mockResolvedValue(SEMESTER);
  repo.getThesesForReport.mockResolvedValue([
    thesis(),
    thesis({
      id: "t2",
      status: "research",
      // The student is on leave: the thesis stays in research, paused.
      student: { status: "bss", user: { fullName: "UJI TA CUTI", identityNumber: "2211529004" } },
      thesisSupervisors: [supervisor("Pembimbing 1", "prof. ir. surya afnarius, PhD")],
      progress: { activityLevel: null, supervisionClock: { elapsedLabel: "6 bulan 1 hari", evaluationDue: null } },
    }),
    thesis({
      id: "t3",
      status: "completed",
      student: { user: { fullName: "UJI MON SIDANG LULUS", identityNumber: "2211529127" } },
      progress: { activityLevel: null, supervisionClock: { elapsedLabel: "5 bulan", evaluationDue: null } },
    }),
  ]);
  repo.getStatusDistribution.mockResolvedValue([
    { id: "research", name: "research", count: 2 },
    { id: "completed", name: "completed", count: 1 },
    { id: "failed", name: "failed", count: 0 },
  ]);
  repo.getActivityDistribution.mockResolvedValue([
    { id: "active", name: "Lancar", value: "active", count: 0 },
    { id: "slow", name: "Lambat", value: "slow", count: 1 },
    { id: "at_risk", name: "Berisiko", value: "at_risk", count: 0 },
  ]);
  convertDocxToPdf.mockResolvedValue(Buffer.from("%PDF-1.7"));
  axiosGet.mockResolvedValue({ status: 200, data: { status: "up" } });
});

describe("report data", () => {
  it("names every status and activity with its label, not with the enum value", async () => {
    const report = await getProgressReportService({ academicYearId: "ay-now" });

    // The distribution used to carry name: "research".
    expect(report.statusDistribution).toEqual([
      { id: "research", name: "Penelitian", count: 2 },
      { id: "completed", name: "Selesai", count: 1 },
      { id: "failed", name: "Gagal", count: 0 },
    ]);
    expect(report.activityDistribution.map((row) => row.name)).toEqual(["Lancar", "Lambat", "Berisiko"]);
    expect(report.theses.map((row) => [row.statusLabel, row.activityLabel, row.evaluationDueLabel])).toEqual([
      ["Penelitian", "Lambat", "Evaluasi 6 bulan jatuh tempo"],
      ["Penelitian (Cuti)", "-", null],
      ["Selesai", "-", null],
    ]);
    // The codes stay beside the labels for programs that read the data.
    expect(report.theses[0]).toMatchObject({ status: "research", activityLevel: "slow", evaluationDue: "six_month" });
  });

  it("titles the period by what the semester filter means: theses that run in the semester", async () => {
    const report = await getProgressReportService({ academicYearId: "ay-now" });

    expect(report.academicYear).toBe("Ganjil 2026/2027");
    expect(report.periodTitle).toBe("Tugas Akhir yang Berjalan pada Semester Ganjil 2026/2027");
    expect(repo.getThesesForReport).toHaveBeenCalledWith({ academicYearId: "ay-now" });
  });

  it("titles a report of every semester as such", async () => {
    for (const options of [{}, { academicYearId: "all" }]) {
      const report = await getProgressReportService(options);
      expect(report.academicYear).toBe("Semua Semester");
      expect(report.periodTitle).toBe("Tugas Akhir dari Semua Semester");
    }
    expect(repo.getAcademicYearById).not.toHaveBeenCalled();
  });

  it("refuses a semester it cannot name instead of calling it 'Semua Semester'", async () => {
    repo.getAcademicYearById.mockResolvedValue(null);

    await expect(getProgressReportService({ academicYearId: "ay-hilang" })).rejects.toMatchObject({
      statusCode: 404,
      message: "Semester tidak ditemukan",
    });
    expect(repo.getThesesForReport).not.toHaveBeenCalled();
  });

  it("tidies the lecturers' names and leaves their degrees as written", async () => {
    const report = await getProgressReportService({ academicYearId: "ay-now" });

    expect(report.theses[0]).toMatchObject({ name: "Uji Ta Lambat", pembimbing1: "Husnil Kamil, M.T", pembimbing2: "Fajril Akbar, M.Sc" });
    expect(report.theses[1]).toMatchObject({ pembimbing1: "Prof. Ir. Surya Afnarius, PhD", pembimbing2: "-" });
  });
});

describe("report document", () => {
  /** The document.xml the service handed to the PDF converter. */
  async function generatedDocument(options = { academicYearId: "ay-now" }) {
    const result = await generateProgressReportPdfService(options);
    const [docxBuffer, docxFilename] = convertDocxToPdf.mock.calls[0];
    return { result, docxFilename, xml: new PizZip(docxBuffer).file("word/document.xml").asText() };
  }

  it("prints labels, the period title and the degrees, and no enum value", async () => {
    const { xml, result, docxFilename } = await generatedDocument();

    expect(xml).toContain("Laporan Progress Pengerjaan Tugas Akhir Mahasiswa");
    expect(xml).toContain("Tugas Akhir yang Berjalan pada Semester Ganjil 2026/2027");
    expect(xml).not.toContain("Periode Semester");
    for (const label of ["Penelitian", "Penelitian (Cuti)", "Selesai", "Lambat", "Evaluasi 6 bulan jatuh tempo"]) {
      expect(xml).toContain(label);
    }
    for (const raw of ["research", "on_leave", "bss", "completed", "slow", "six_month", "at_risk"]) {
      expect(xml).not.toContain(raw);
    }
    expect(xml).toContain("Husnil Kamil, M.T");
    expect(xml).toContain("Fajril Akbar, M.Sc");
    expect(xml).toContain("Prof. Ir. Surya Afnarius, PhD");
    expect(xml).not.toMatch(/M\.t<|M\.sc<|Phd</);
    // The letterhead of the template stays, its body does not.
    expect(xml).toContain("KOP DEPARTEMEN");
    expect(xml).not.toContain("Identitas Mahasiswa");

    expect(docxFilename).toBe("Laporan_Progress_TA_Ganjil_2026/2027.docx");
    expect(result.buffer.toString()).toBe("%PDF-1.7");
    expect(result.filename).toMatch(/^Laporan_Progress_TA_Ganjil_2026\/2027_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("titles the document for every semester", async () => {
    const { xml } = await generatedDocument({});

    expect(xml).toContain("Tugas Akhir dari Semua Semester");
    expect(xml).not.toContain("yang Berjalan pada Semester");
  });

  it("asks for the template when it has not been uploaded", async () => {
    templateBuffer.value = null;

    await expect(generateProgressReportPdfService({})).rejects.toMatchObject({ statusCode: 404 });
    expect(convertDocxToPdf).not.toHaveBeenCalled();
  });
});

describe("PDF converter that is not running", () => {
  const conversionFailed = new Error("Gagal mengonversi dokumen ke PDF melalui Gotenberg");

  it("returns the PDF without asking the converter anything else when it works", async () => {
    const pdf = await convertReportToPdf(Buffer.from("docx"), "laporan.docx");

    expect(pdf.toString()).toBe("%PDF-1.7");
    expect(convertDocxToPdf).toHaveBeenCalledWith(Buffer.from("docx"), "laporan.docx");
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("answers 503 with the message for the user when the converter cannot be reached", async () => {
    convertDocxToPdf.mockRejectedValue(conversionFailed);
    axiosGet.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3001"), { code: "ECONNREFUSED" }));

    await expect(convertReportToPdf(Buffer.from("docx"), "laporan.docx")).rejects.toMatchObject({
      statusCode: 503,
      message: PDF_DOWN,
    });
    // The converter is asked at the address the conversion itself uses.
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][0]).toMatch(/\/health$/);
    expect(axiosGet.mock.calls[0][1]).toMatchObject({ timeout: 5000 });
  });

  it("answers 503 as well when the converter does not answer in time or reports itself down", async () => {
    convertDocxToPdf.mockRejectedValue(conversionFailed);

    axiosGet.mockRejectedValueOnce(Object.assign(new Error("timeout of 5000ms exceeded"), { code: "ECONNABORTED" }));
    await expect(convertReportToPdf(Buffer.from("docx"), "laporan.docx")).rejects.toMatchObject({ statusCode: 503, message: PDF_DOWN });

    axiosGet.mockResolvedValueOnce({ status: 503, data: { status: "down" } });
    await expect(convertReportToPdf(Buffer.from("docx"), "laporan.docx")).rejects.toMatchObject({ statusCode: 503, message: PDF_DOWN });
  });

  it("passes on a failure of the conversion itself while the converter is up", async () => {
    convertDocxToPdf.mockRejectedValue(conversionFailed);
    axiosGet.mockResolvedValue({ status: 200, data: { status: "up" } });

    const error = await convertReportToPdf(Buffer.from("docx"), "laporan.docx").catch((e) => e);

    expect(error).toBe(conversionFailed);
    expect(error.statusCode).toBeUndefined();
  });

  it("gives the 503 to whoever downloads the report", async () => {
    convertDocxToPdf.mockRejectedValue(conversionFailed);
    axiosGet.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND gotenberg"), { code: "ENOTFOUND" }));

    await expect(generateProgressReportPdfService({ academicYearId: "ay-now" })).rejects.toMatchObject({
      statusCode: 503,
      message: PDF_DOWN,
    });
  });
});
