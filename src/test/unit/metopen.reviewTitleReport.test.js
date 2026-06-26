// Test untuk BR-18 (KONTEKS_KANONIS_SIMPTA.md §5.8 / PRD FR-TA04-05).
//
// Saat KaDep accept TA-04 lewat reviewTitleReport, semua 5 syarat kanonik
// HARUS divalidasi ulang di server. Tidak cukup mengandalkan gate enqueue,
// karena snapshot SIA, penambahan P2, dan auto-zero bisa berubah antara
// enqueue dan keputusan KaDep (audit F-5.1 + F-4.4 follow-up).

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
    researchMethodScore: {
      findUnique: vi.fn(),
    },
    thesisParticipant: {
      findMany: vi.fn(),
    },
    thesisStatus: {
      findFirst: vi.fn(),
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

vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock("../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue({ success: true, sent: 0 }),
}));

let prisma;
let reviewTitleReport;
let createNotificationsForUsers;
let sendFcmToUsers;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ default: prisma } = await import("../../config/prisma.js"));
  ({ reviewTitleReport } = await import("../../services/metopen.service.js"));
  ({ createNotificationsForUsers } = await import("../../services/notification.service.js"));
  ({ sendFcmToUsers } = await import("../../services/push.service.js"));
});

// Helper: mock prisma return untuk skenario "semua 5 syarat terpenuhi" (P1-only).
// `reviewTitleReport` memanggil `thesis.findUnique` 2x: (1) validasi awal dengan
// select finalProposalVersionId, (2) getThesisNotificationContext tanpa select tsb.
// Karena mock tidak bisa bedakan select, kita pakai call counter.
function mockAllPrerequisitesMet(overrides = {}) {
  let findUniqueCallCount = 0;
  prisma.thesis.findUnique.mockImplementation(({ where }) => {
    findUniqueCallCount += 1;
    if (where?.id === "thesis-1" && findUniqueCallCount > 1 && !overrides.skipNotifContext) {
      // Panggilan kedua = getThesisNotificationContext.
      return Promise.resolve({
        id: "thesis-1",
        title: "Judul TA",
        studentId: "student-1",
        academicYear: { year: "2025/2026", semester: "genap" },
        ...overrides.thesisNotif,
      });
    }
    return Promise.resolve(overrides.thesis ?? {
      id: "thesis-1",
      studentId: "student-1",
      title: "Judul TA",
      proposalStatus: "submitted",
      finalProposalVersionId: "fpv-1",
      academicYearId: "ay-1",
    });
  });
  prisma.thesisParticipant.findMany.mockImplementation(() => {
    // getActiveSupervisorUserIds juga memanggil findMany — return default P1.
    return Promise.resolve(overrides.supervisors ?? [{ role: { name: "Pembimbing 1" } }]);
  });
  // Pakai `in` check agar `null` eksplisit (student record missing) tidak
  // ditimpa default oleh nullish coalescing.
  if ("student" in overrides) {
    prisma.student.findUnique.mockResolvedValue(overrides.student);
  } else {
    prisma.student.findUnique.mockResolvedValue({ takingThesisCourse: true });
  }
  if ("thesisStatus" in overrides) {
    prisma.thesisStatus.findFirst.mockResolvedValue(overrides.thesisStatus);
  } else {
    prisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
  }
  prisma.researchMethodScore.findUnique.mockResolvedValue(
    overrides.score ?? {
      isFinalized: true,
      attendanceAutoZeroedAt: null,
      supervisorScore: 70,
      lecturerScore: 20,
      coSignedAt: null,
      coSignedByLecturerId: null,
    },
  );
}

describe("BR-18 reviewTitleReport — re-validates takingThesisCourse on accept", () => {
  const baseThesis = {
    id: "thesis-1",
    studentId: "student-1",
    title: "Judul TA",
    proposalStatus: "submitted",
    finalProposalVersionId: "fpv-1",
    academicYearId: "ay-1",
  };

  it("throws BadRequestError when takingThesisCourse is false", async () => {
    mockAllPrerequisitesMet({ student: { takingThesisCourse: false } });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir/i);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws BadRequestError when takingThesisCourse is null/missing", async () => {
    mockAllPrerequisitesMet({ student: { takingThesisCourse: null } });

    await expect(
      reviewTitleReport("thesis-1", "accept", null, "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("throws BadRequestError when student record is missing", async () => {
    mockAllPrerequisitesMet({ student: null });

    await expect(
      reviewTitleReport("thesis-1", "accept", null, "kadep-1"),
    ).rejects.toThrow(/SIA mengonfirmasi/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("proceeds to transaction when all 5 prerequisites are met (P1-only thesis)", async () => {
    mockAllPrerequisitesMet();
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

  it("proceeds to transaction when P2 active and co-signed", async () => {
    mockAllPrerequisitesMet({
      supervisors: [
        { role: { name: "Pembimbing 1" } },
        { role: { name: "Pembimbing 2" } },
      ],
      score: {
        isFinalized: true,
        attendanceAutoZeroedAt: null,
        supervisorScore: 70,
        lecturerScore: 20,
        coSignedAt: new Date(),
        coSignedByLecturerId: "lecturer-p2",
      },
    });
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

  // F-5.1: accept TA-04 wajib re-assert kelengkapan penilaian (isFinalized) di server,
  // bukan hanya mengandalkan checklist UI / gate enqueue (menutup bypass konsensus P2).
  it("rejects accept when TA-03 score is not finalized (co-sign P2 pending)", async () => {
    mockAllPrerequisitesMet({
      score: {
        isFinalized: false,
        attendanceAutoZeroedAt: null,
        supervisorScore: 70,
        lecturerScore: 20,
        coSignedAt: null,
        coSignedByLecturerId: null,
      },
    });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/belum final/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // F-4.4 follow-up: P2 ditambah setelah finalize P1-only → isFinalized stale true,
  // tapi coSignedAt null. Accept wajib reject agar KaDep tidak sahkan tanpa konsensus P2.
  it("rejects accept when P2 active but co-sign missing (stale isFinalized)", async () => {
    mockAllPrerequisitesMet({
      supervisors: [
        { role: { name: "Pembimbing 1" } },
        { role: { name: "Pembimbing 2" } },
      ],
      score: {
        isFinalized: true,
        attendanceAutoZeroedAt: null,
        supervisorScore: 70,
        lecturerScore: 20,
        coSignedAt: null,
        coSignedByLecturerId: null,
      },
    });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/Pembimbing 2 belum co-sign/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // §5.7.3 (BR-28): mahasiswa auto-zero presensi <75% gagal Metopel → tidak boleh disahkan TA-04.
  it("rejects accept when student is auto-zeroed by Metopel attendance <75%", async () => {
    mockAllPrerequisitesMet({
      score: {
        isFinalized: true,
        attendanceAutoZeroedAt: new Date(),
        supervisorScore: 70,
        lecturerScore: 20,
        coSignedAt: null,
        coSignedByLecturerId: null,
      },
    });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/presensi Metopel/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // F-4.4 follow-up: syarat 2 (proposal final) re-assert di accept-time.
  it("rejects accept when proposal final not submitted", async () => {
    mockAllPrerequisitesMet({ thesis: { ...baseThesis, finalProposalVersionId: null } });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/Proposal final belum disubmit/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // F-4.4 follow-up: syarat 1 (pembimbing resmi P1) re-assert di accept-time.
  it("rejects accept when no active supervisor (P1 missing)", async () => {
    mockAllPrerequisitesMet({ supervisors: [] });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/Tidak ada pembimbing resmi aktif/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects accept when supervisorScore or lecturerScore missing", async () => {
    mockAllPrerequisitesMet({
      score: {
        isFinalized: true,
        attendanceAutoZeroedAt: null,
        supervisorScore: null,
        lecturerScore: 20,
        coSignedAt: null,
        coSignedByLecturerId: null,
      },
    });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/TA-03A atau TA-03B belum lengkap/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
      reviewTitleReport("thesis-1", "foobar", null, "kadep-1"),
    ).rejects.toThrow(/Aksi tidak valid/i);
  });

  it("requires revision notes when rejecting a title", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);
    await expect(
      reviewTitleReport("thesis-1", "reject", null, "kadep-1"),
    ).rejects.toThrow(/Catatan revisi wajib diisi/i);
  });

  it("rejects when thesis not found", async () => {
    prisma.thesis.findUnique.mockResolvedValue(null);
    await expect(
      reviewTitleReport("missing", "accept", null, "kadep-1"),
    ).rejects.toThrow(/Tugas Akhir tidak ditemukan/i);
  });

  // P0-B: accept wajib set thesisStatus="Bimbingan" supaya modul TA monitoring
  // & eligibility service refleksi fase aktif (canon §5.5 + §5.10).
  it("throws when THESIS_STATUS 'Bimbingan' not configured in DB", async () => {
    mockAllPrerequisitesMet({ thesisStatus: null });

    await expect(
      reviewTitleReport("thesis-1", "accept", "ok", "kadep-1"),
    ).rejects.toThrow(/Status thesis 'Bimbingan' belum dikonfigurasi/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sets thesisStatusId to 'Bimbingan' inside the transaction on accept", async () => {
    mockAllPrerequisitesMet();
    const txThesisUpdate = vi.fn();
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        thesis: { update: txThesisUpdate },
        thesisAdvisorRequest: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return cb(tx);
    });

    await reviewTitleReport("thesis-1", "accept", "ok", "kadep-1");

    expect(txThesisUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proposalStatus: "accepted",
          isProposal: false,
          thesisStatusId: "status-bimbingan",
        }),
      }),
    );
  });

  // P0-C: notifikasi mahasiswa + pembimbing pasca-accept (canon §5.10 + §5.5).
  it("sends notification to mahasiswa and supervisor after accept", async () => {
    mockAllPrerequisitesMet({
      supervisors: [
        { role: { name: "Pembimbing 1" }, lecturer: { userId: "lecturer-p1-user" } },
      ],
    });
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        thesis: { update: vi.fn() },
        thesisAdvisorRequest: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return cb(tx);
    });

    await reviewTitleReport("thesis-1", "accept", "ok", "kadep-1");

    // Notifikasi mahasiswa (studentId = "student-1" dari baseThesis).
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({ type: "ta04_accepted" }),
    );
    // Notifikasi pembimbing P1.
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["lecturer-p1-user"],
      expect.objectContaining({ type: "ta04_accepted_supervisor" }),
    );
    // FCM push juga dipanggil.
    expect(sendFcmToUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({ data: expect.objectContaining({ type: "ta04_accepted" }) }),
    );
  });

  // P0-C: notifikasi failure tidak boleh membatalkan accept yang sudah commit.
  it("does not throw when post-accept notification fails (fire-and-forget)", async () => {
    mockAllPrerequisitesMet();
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        thesis: { update: vi.fn() },
        thesisAdvisorRequest: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return cb(tx);
    });
    createNotificationsForUsers.mockRejectedValueOnce(new Error("DB down"));

    const result = await reviewTitleReport("thesis-1", "accept", "ok", "kadep-1");
    expect(result).toMatchObject({ thesisId: "thesis-1", proposalStatus: "accepted" });
  });

  // P0-D: reject wajib notifikasi mahasiswa dengan catatan KaDep.
  it("sends rejection notification to mahasiswa with KaDep notes on reject", async () => {
    prisma.thesis.findUnique.mockResolvedValue(baseThesis);

    await reviewTitleReport("thesis-1", "reject", "Judul terlalu luas, persempit ke studi kasus", "kadep-1");

    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({
        type: "ta04_rejected",
        message: expect.stringContaining("Judul terlalu luas"),
      }),
    );
    expect(sendFcmToUsers).toHaveBeenCalledWith(
      ["student-1"],
      expect.objectContaining({ data: expect.objectContaining({ type: "ta04_rejected" }) }),
    );
  });
});
