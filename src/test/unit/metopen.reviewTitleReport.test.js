// Test untuk BR-18 (KONTEKS_KANONIS_SIMPTA.md §5.8 / PRD FR-TA04-05).
//
// Saat KaDep accept TA-04 lewat reviewTitleReport, snapshot
// `students.taking_thesis_course` HARUS divalidasi ulang. Tidak cukup
// mengandalkan gate enqueue, karena snapshot SIA bisa berubah antara
// enqueue dan keputusan KaDep.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  default: {
    thesis: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    student: {
      findUnique: vi.fn(),
    },
    thesisAdvisorRequest: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
    },
    userHasRole: {
      findFirst: vi.fn(),
    },
    document: {
      create: vi.fn().mockResolvedValue({ id: "document-1" }),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      const tx = {
        thesis: { update: vi.fn() },
        thesisAdvisorRequest: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return cb(tx);
    }),
  },
}));

vi.mock("../../repositories/metopen.repository.js", () => ({
  findStudentThesis: vi.fn(),
}));

vi.mock("../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYear: vi.fn(),
}));

vi.mock("../../utils/ta04.pdf.js", () => ({
  generateTA04Pdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
}));

vi.mock("./auditLog.service.js", () => ({
  AUDIT_ACTIONS: { REQUEST_ADVISOR_PROMOTED_TO_ACTIVE: "REQUEST_ADVISOR_PROMOTED_TO_ACTIVE" },
  ENTITY_TYPES: { THESIS_ADVISOR_REQUEST: "THESIS_ADVISOR_REQUEST" },
}));

vi.mock("../../services/auditLog.service.js", () => ({
  AUDIT_ACTIONS: { REQUEST_ADVISOR_PROMOTED_TO_ACTIVE: "REQUEST_ADVISOR_PROMOTED_TO_ACTIVE" },
  ENTITY_TYPES: { THESIS_ADVISOR_REQUEST: "THESIS_ADVISOR_REQUEST" },
}));

vi.mock("../../services/advisorQuota.service.js", () => ({
  syncLecturerQuotaCurrentCount: vi.fn(),
}));

vi.mock("../../services/metopenEligibility.service.js", () => ({
  resolveMetopenEligibilityState: vi.fn(),
}));

let prisma;
let reviewTitleReport;
let generateTitleApprovalLetterMock;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ default: prisma } = await import("../../config/prisma.js"));
  // generateTitleApprovalLetter is internal in metopen.service.js. We can't
  // mock it directly; the function is fired-and-forget after the transaction.
  // Async errors there are swallowed by .catch — safe for unit test.
  ({ reviewTitleReport } = await import("../../services/metopen.service.js"));
});

describe("BR-18 reviewTitleReport — re-validates takingThesisCourse on accept", () => {
  const baseThesis = {
    id: "thesis-1",
    studentId: "student-1",
    proposalStatus: "submitted",
    academicYearId: "ay-1",
  };

  it("throws BadRequestError when takingThesisCourse is false", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    prisma.student.findUnique.mockResolvedValue({ takingThesisCourse: false });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir/i);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws BadRequestError when takingThesisCourse is null/missing", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    prisma.student.findUnique.mockResolvedValue({ takingThesisCourse: null });

    await expect(
      reviewTitleReport("thesis-1", "accept", null, "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws BadRequestError when student record is missing", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    prisma.student.findUnique.mockResolvedValue(null);

    await expect(
      reviewTitleReport("thesis-1", "accept", null, "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("proceeds to transaction when takingThesisCourse is true", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    prisma.student.findUnique.mockResolvedValue({ takingThesisCourse: true });
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        thesis: { update: vi.fn() },
        thesisAdvisorRequest: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return cb(tx);
    });

    const result = await reviewTitleReport("thesis-1", "accept", "ok", "kadep-1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ thesisId: "thesis-1", proposalStatus: "accepted" });
  });

  it("rejects when proposalStatus is not 'submitted'", async () => {
    prisma.thesis.findUnique.mockResolvedValue({ ...baseThesis, proposalStatus: "accepted" });
    await expect(
      reviewTitleReport("thesis-1", "accept", null, "kadep-1"),
    ).rejects.toThrow(/Judul belum diajukan atau sudah diproses/i);
    expect(prisma.student.findUnique).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    await expect(
      reviewTitleReport("thesis-1", "reject", null, "kadep-1"),
    ).rejects.toThrow(/Proposal final tidak ditolak pada scope aktif/i);
  });

  it("rejects when thesis not found", async () => {
    prisma.thesis.findUnique.mockResolvedValue(null);
    await expect(
      reviewTitleReport("missing", "accept", null, "kadep-1"),
    ).rejects.toThrow(/Tugas Akhir tidak ditemukan/i);
  });
});
