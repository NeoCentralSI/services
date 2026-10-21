import { beforeEach, describe, expect, it, vi } from "vitest";
const { prisma, convert } = vi.hoisted(() => ({
  prisma: { student: { findUnique: vi.fn() }, thesisSeminarAudience: { findMany: vi.fn() } },
  convert: vi.fn(),
}));
vi.mock("../../../../config/prisma.js", () => ({ default: prisma }));
vi.mock("../../../../utils/pdf.util.js", () => ({ convertHtmlToPdf: convert }));
import { generateAttendanceLog } from "../../../../services/thesis-seminar/attendance-log.service.js";
import { attendanceLogSchema } from "../../../../validators/thesis-seminar.validator.js";

describe("Student attendance PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.student.findUnique.mockResolvedValue({ id: "student-1", user: { fullName: "Nama <Mahasiswa>", identityNumber: "2211520001" } });
    convert.mockResolvedValue(Buffer.from("PDF"));
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
    const html = convert.mock.calls[0][0];
    expect(html).toContain("Nama &lt;Mahasiswa&gt;");
    expect(html).toContain("Judul &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(result.buffer.toString()).toBe("PDF");
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
