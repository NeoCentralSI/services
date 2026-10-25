import { beforeEach, describe, expect, it, vi } from "vitest";
const { prisma, issue } = vi.hoisted(() => ({
  prisma: {
    student: { findUnique: vi.fn() },
    thesisSeminarAudience: { findMany: vi.fn() },
    thesis: { findFirst: vi.fn() },
    thesisSupervisors: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  issue: vi.fn(),
}));
vi.mock("../../../../config/prisma.js", () => ({ default: prisma }));
vi.mock("../../../../services/official-document.service.js", () => ({ renderAndIssueOfficialHtmlDocument: issue }));
const convert = issue;
import { generateAttendanceLog } from "../../../../services/thesis-seminar/attendance-log.service.js";
import { attendanceLogSchema } from "../../../../validators/thesis-seminar.validator.js";

describe("Student attendance PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.student.findUnique.mockResolvedValue({ id: "student-1", user: { fullName: "Nama <Mahasiswa>", identityNumber: "2211520001" } });
    issue.mockResolvedValue(Buffer.from("PDF"));
    prisma.thesis.findFirst.mockResolvedValue({
      id: "thesis-1",
      title: "Judul TA Pemilik",
      thesisSupervisors: [
        { role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "Dr. Pembimbing Satu" } } },
        { role: { name: "Pembimbing 2" }, lecturer: { user: { fullName: "Dr. Pembimbing Dua" } } },
      ],
    });
    prisma.thesisSupervisors.findFirst.mockResolvedValue({ role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "Dr. Pembimbing Satu", identityNumber: "198001012005011001" } } });
  });
  it("exports only the selected verified attendance owned by the logged-in student and escapes HTML", async () => {
    prisma.thesisSeminarAudience.findMany.mockResolvedValue([{
      thesisSeminarId: "seminar-1", approvedAt: new Date(),
      seminar: { date: new Date("2026-10-20"), thesis: { title: "Judul <script>alert(1)</script>", student: { user: { fullName: "Presenter", identityNumber: "123" } } } },
      supervisor: { lecturer: { user: { fullName: "Dosen" } } },
    }]);
    const result = await generateAttendanceLog("student-1", ["seminar-1", "seminar-1"]);
    expect(prisma.thesisSeminarAudience.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: "student-1", thesisSeminarId: { in: ["seminar-1"] }, approvedAt: { not: null } },
    }));
    const html = issue.mock.calls[0][0].html;
    expect(html).toContain("Nama &lt;Mahasiswa&gt;");
    expect(html).toContain("Judul &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(result.buffer.toString()).toBe("PDF");
  });
  it("is the TA-07 form: identity, verified rows with verifier and date, Pembimbing I signs with the QR", async () => {
    prisma.thesisSeminarAudience.findMany.mockResolvedValue([{
      thesisSeminarId: "seminar-1", approvedAt: new Date("2026-10-21T03:00:00Z"),
      seminar: { date: new Date("2026-10-20T03:00:00Z"), thesis: { title: "Judul Penyaji", student: { user: { fullName: "Penyaji", identityNumber: "2211520099" } } } },
      supervisor: { lecturer: { user: { fullName: "Dosen Pemverifikasi" } } },
    }]);
    await generateAttendanceLog("student-1", ["seminar-1"]);
    const call = issue.mock.calls[0][0];
    expect(call).toMatchObject({ documentKind: "seminar_attendance_certificate", sourceId: "student-1", title: "Bukti Kehadiran Seminar (TA-07)" });
    expect(call.html).toContain("TA – 07");
    expect(call.html).toContain("FORMULIR BUKTI KEHADIRAN DI SEMINAR TUGAS AKHIR MAHASISWA LAIN");
    expect(call.html).toContain("Judul TA Pemilik");
    expect(call.html).toContain("Dr. Pembimbing Dua");
    expect(call.html).toContain("Diverifikasi oleh");
    expect(call.html).toContain("Penyaji / 2211520099 / Judul Penyaji");
    expect(call.html).toContain("Dosen Pemverifikasi<br /><span class=\"nowrap\">21 Oktober 2026</span>");
    expect(call.html).not.toContain("Tanda Tangan Moderator");
    expect(call.html).toMatch(/Dosen Pembimbing I,[\s\S]*<!--OFFICIAL_DOCUMENT_QR-->[\s\S]*Dr\. Pembimbing Satu[\s\S]*NIP\. 198001012005011001/);
    // One row per verified attendance, no blank rows.
    expect(call.html.match(/<tr>\s*<td class="center">/g)).toHaveLength(1);
  });
  it.each([{ ids: [] }, { ids: ["foreign-seminar"] }, { ids: ["unverified-seminar"] }])("refuses unavailable selections $ids without rendering a PDF", async ({ ids }) => {
    prisma.thesisSeminarAudience.findMany.mockResolvedValue([]);
    await expect(generateAttendanceLog("student-1", ids)).rejects.toMatchObject({ statusCode: 400 });
    expect(convert).not.toHaveBeenCalled();
  });
  it("refuses a mixed selection rather than silently printing a subset", async () => {
    prisma.thesisSeminarAudience.findMany.mockResolvedValue([{}]);
    await expect(generateAttendanceLog("student-1", ["owned", "foreign"])).rejects.toMatchObject({ statusCode: 400 });
    expect(convert).not.toHaveBeenCalled();
  });
  it("rejects non-students", async () => {
    prisma.student.findUnique.mockResolvedValue(null);
    await expect(generateAttendanceLog("other", ["seminar"])).rejects.toMatchObject({ statusCode: 404 });
  });
  it("requires a bounded list of valid seminar IDs", () => {
    expect(attendanceLogSchema.safeParse({ seminarIds: [] }).success).toBe(false);
    expect(attendanceLogSchema.safeParse({ seminarIds: ["invalid"] }).success).toBe(false);
    expect(attendanceLogSchema.safeParse({ seminarIds: Array(201).fill("550e8400-e29b-41d4-a716-446655440000") }).success).toBe(false);
  });
});
