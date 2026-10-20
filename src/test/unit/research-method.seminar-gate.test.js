/**
 * A passed proposal starts the research phase, but passing the Metode Penelitian course stays SIA's
 * (`research_method_completed`, or the Admin) and stays a requirement of Seminar Hasil. A student
 * whose proposal passed with too little class presence is in Penelitian, may hold guidance, and is
 * refused at seminar registration until the course is passed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { docRepo, coreRepo, prismaMock } = vi.hoisted(() => ({
  docRepo: {
    findRequirementsByAcademicYear: vi.fn(async () => [{ id: "req-1", academicYearId: "ay-2", name: "Laporan", displayOrder: 1 }]),
    findRequirementForAcademicYear: vi.fn(async () => ({ id: "req-1", academicYearId: "ay-2" })),
    findSeminarDocument: vi.fn(async () => null),
    upsertSeminarDocument: vi.fn(),
  },
  coreRepo: {
    getThesisWithSeminar: vi.fn(),
    createThesisSeminar: vi.fn(),
    countSeminarAttendance: vi.fn(async () => 8),
    findUserIdsByRole: vi.fn(async () => []),
  },
  prismaMock: {
    student: { findUnique: vi.fn() },
    thesisGuidance: { count: vi.fn(async () => 8) },
    thesisSupervisors: { findMany: vi.fn(async () => [{ seminarReady: true }]) },
  },
}));

vi.mock("../../repositories/thesis-seminar/doc.repository.js", () => docRepo);
vi.mock("../../repositories/thesis-seminar/thesis-seminar.repository.js", () => coreRepo);
vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn(async () => ({ id: "ay-2", semester: "ganjil", year: "2026" })),
  formatAcademicYearLabel: () => "Ganjil 2026",
}));
vi.mock("fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn() }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn() }));

const { uploadDocument } = await import("../../services/thesis-seminar/doc.service.js");

const pdf = () => ({ originalname: "laporan.pdf", mimetype: "application/pdf", size: 14, buffer: Buffer.from("%PDF-1.4\nbody") });

beforeEach(() => {
  vi.clearAllMocks();
  // In Penelitian since the proposal passed; no seminar attempt yet. Every other item is met.
  coreRepo.getThesisWithSeminar.mockResolvedValue({ id: "t1", studentId: "s1", academicYearId: "ay-2", status: "research", thesisSeminars: [] });
  prismaMock.thesisGuidance.count.mockResolvedValue(8);
  coreRepo.countSeminarAttendance.mockResolvedValue(8);
  prismaMock.thesisSupervisors.findMany.mockResolvedValue([{ seminarReady: true }]);
});

describe("Seminar Hasil after a passed proposal with too little class presence", () => {
  it("is refused while Metode Penelitian (the course) is not passed", async () => {
    prismaMock.student.findUnique.mockResolvedValue({ researchMethodCompleted: false });
    await expect(uploadDocument("active", "s1", pdf(), "req-1")).rejects.toMatchObject({
      statusCode: 403,
      message: "Lengkapi seluruh checklist persyaratan sebelum mengunggah dokumen seminar.",
    });
    expect(coreRepo.createThesisSeminar).not.toHaveBeenCalled();
  });

  it("opens once SIA (or the Admin) marks the course passed", async () => {
    prismaMock.student.findUnique.mockResolvedValue({ researchMethodCompleted: true });
    coreRepo.createThesisSeminar.mockResolvedValue({ id: "sem-1", status: "registered" });
    docRepo.upsertSeminarDocument.mockImplementation(async (_seminarId, _requirementId, data) => ({ ...data, thesisSeminarId: "sem-1", requirement: { id: "req-1" } }));
    await uploadDocument("active", "s1", pdf(), "req-1");
    expect(coreRepo.createThesisSeminar).toHaveBeenCalledWith("t1");
  });
});
