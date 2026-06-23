import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  assessmentCriteria: { findMany: vi.fn() },
  // BR-20 v2.0: thesisParticipant.findFirst dipakai oleh
  // `thesisHasActivePembimbing2` untuk menentukan apakah co-sign P2
  // diperlukan sebelum auto-finalize.
  thesisParticipant: { findMany: vi.fn(), findFirst: vi.fn() },
  thesisSupervisors: { findMany: vi.fn() },
  thesis: { findMany: vi.fn(), findUnique: vi.fn() },
  researchMethodScore: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  researchMethodScoreDetail: { upsert: vi.fn(), deleteMany: vi.fn() },
  metopenAttendanceImport: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  metopenAttendanceRecord: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  documentType: { findFirst: vi.fn(), create: vi.fn() },
  document: { create: vi.fn() },
  $transaction: vi.fn(),
};

prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));

vi.mock("../../config/prisma.js", () => ({
  default: prismaMock,
}));

vi.mock("../metopen.service.js", () => ({
  syncKadepProposalQueueByThesisId: vi.fn(),
}));

const prisma = (await import("../../config/prisma.js")).default;
const {
  getSupervisorScoringQueue,
  getSupervisorScoringHistory,
  getMetopenScoringQueue,
  getMetopenScoringHistory,
  submitSupervisorScore,
  submitMetopenScore,
  coSignSupervisorScore,
  coSignSupervisorScoreAndSync,
  publishFinalScore,
  getScoresByThesisForSupervisor,
  getScoresByThesisForMetopenLecturer,
  getSupervisorContextForThesis,
} = await import("../assessment.service.js");

function mockEligibleAttendance() {
  const attendanceImport = {
    id: "attendance-import-1",
    academicYearId: null,
    documentId: "document-1",
    uploadedByUserId: "koord-1",
    classCode: "JSI60143/SI/Kuliah/A",
    courseName: "Metode Penelitian",
    semesterLabel: "Genap 2025/2026",
    filterLabel: "Teori",
    lecturerNames: [],
    thresholdPercent: 0.75,
    totalRows: 1,
    matchedRows: 1,
    eligibleRows: 1,
    ineligibleRows: 0,
    autoZeroedCount: 0,
    skippedFinalizedCount: 0,
    uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
    createdAt: new Date("2026-05-12T08:31:20.000Z"),
    updatedAt: new Date("2026-05-12T08:31:20.000Z"),
    document: null,
    uploadedBy: null,
    records: [],
  };
  prisma.metopenAttendanceImport.findFirst.mockResolvedValue(attendanceImport);
  prisma.metopenAttendanceRecord.findFirst.mockResolvedValue({
    id: "attendance-record-1",
    importId: attendanceImport.id,
    studentId: "student-1",
    identityNumber: "2211523001",
    studentName: "Ilham",
    presentCount: 8,
    absentCount: 1,
    sickCount: 0,
    permitCount: 0,
    totalMeetings: 9,
    attendancePercentage: 0.8889,
    isEligible: true,
    import: attendanceImport,
  });
}

describe("assessment.service — TA-03B active flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "crit-1", name: "Kriteria 1", maxScore: 10, displayOrder: 1 },
      { id: "crit-2", name: "Kriteria 2", maxScore: 10, displayOrder: 2 },
    ]);
    // Default: thesis tidak punya P2 → tidak butuh co-sign.
    // Test yang butuh P2 wajib override mock ini ke return value object.
    prisma.thesisParticipant.findFirst.mockResolvedValue(null);
    prisma.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
    mockEligibleAttendance();
  });

  it("lists TA-03A queue dengan kontrak BR-20 baru (P1 + P2 + actorRole + actionStatus)", async () => {
    // BR-20 (canon §5.7.1): antrean TA-03A meliputi BAIK P1 (master pengisi)
    // MAUPUN P2 (co-sign konsensus). Filter wajib: thesis aktif, finalProposal
    // ada, status thesis terbuka, dan score belum isFinalized.
    prisma.thesisParticipant.findMany.mockResolvedValue([
      // P1 perlu input rubrik → MUNCUL dengan status p1_pending
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-active",
          title: "Optimasi SIMPTA",
          finalProposalVersionId: "proposal-version-1",
          student: {
            status: "active",
            user: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [
            {
              id: "score-1",
              supervisorScore: null,
              lecturerScore: null,
              finalScore: null,
              isFinalized: false,
              coSignedAt: null,
              coSignedByLecturerId: null,
              attendanceAutoZeroedAt: null,
              attendanceAutoZeroReason: null,
            },
          ],
          thesisSupervisors: [
            {
              role: { name: "Pembimbing 2" },
              lecturer: { user: { id: "lect-2", fullName: "Dr. Partner P2" } },
            },
          ],
        },
      },
      // Dropout student → DIFILTER
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-inactive",
          title: "Tidak Aktif",
          finalProposalVersionId: "proposal-version-2",
          student: {
            status: "dropout",
            user: { id: "student-2", fullName: "Inactive Student", identityNumber: "2211523002" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [],
          thesisSupervisors: [],
        },
      },
      // Closed thesis status → DIFILTER
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-closed",
          title: "Ditutup",
          finalProposalVersionId: "proposal-version-3",
          student: {
            status: "active",
            user: { id: "student-3", fullName: "Closed Thesis", identityNumber: "2211523003" },
          },
          thesisStatus: { name: "Dibatalkan" },
          researchMethodScores: [],
          thesisSupervisors: [],
        },
      },
      // No final proposal → DIFILTER
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-no-final",
          title: "Belum Final",
          finalProposalVersionId: null,
          student: {
            status: "active",
            user: { id: "student-4", fullName: "No Final", identityNumber: "2211523004" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [],
          thesisSupervisors: [],
        },
      },
      // Already finalized (cycle complete) → DIFILTER (BR-21)
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-finalized",
          title: "Sudah Final",
          finalProposalVersionId: "proposal-version-5",
          student: {
            status: "active",
            user: { id: "student-5", fullName: "Final Already", identityNumber: "2211523005" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [
            {
              id: "score-final",
              supervisorScore: 70,
              lecturerScore: 20,
              finalScore: 90,
              isFinalized: true,
              coSignedAt: new Date("2026-05-10T08:00:00Z"),
              coSignedByLecturerId: "supervisor-2",
              attendanceAutoZeroedAt: null,
              attendanceAutoZeroReason: null,
            },
          ],
          thesisSupervisors: [],
        },
      },
      // P2 co-sign queue: P1 sudah submit, P2 belum co-sign → MUNCUL p2_pending_cosign
      {
        role: { name: "Pembimbing 2" },
        thesis: {
          id: "thesis-cosign-needed",
          title: "Menunggu Co-sign",
          finalProposalVersionId: "proposal-version-6",
          student: {
            status: "active",
            user: { id: "student-6", fullName: "Bu Cosign", identityNumber: "2211523006" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [
            {
              id: "score-cosign",
              supervisorScore: 70,
              lecturerScore: null,
              finalScore: null,
              isFinalized: false,
              coSignedAt: null,
              coSignedByLecturerId: null,
              attendanceAutoZeroedAt: null,
              attendanceAutoZeroReason: null,
            },
          ],
          thesisSupervisors: [
            {
              role: { name: "Pembimbing 1" },
              lecturer: { user: { id: "lect-1", fullName: "Dr. Partner P1" } },
            },
          ],
        },
      },
    ]);

    const result = await getSupervisorScoringQueue("supervisor-1");

    expect(result).toEqual([
      {
        thesisId: "thesis-active",
        thesisTitle: "Optimasi SIMPTA",
        student: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
        actorRole: "P1",
        actionStatus: "p1_pending",
        partnerName: "Dr. Partner P2",
        supervisorScore: null,
        lecturerScore: null,
        finalScore: null,
        coSignedAt: null,
        attendanceAutoZeroedAt: null,
        attendanceAutoZeroReason: null,
      },
      {
        thesisId: "thesis-cosign-needed",
        thesisTitle: "Menunggu Co-sign",
        student: { id: "student-6", fullName: "Bu Cosign", identityNumber: "2211523006" },
        actorRole: "P2",
        actionStatus: "p2_pending_cosign",
        partnerName: "Dr. Partner P1",
        supervisorScore: 70,
        lecturerScore: null,
        finalScore: null,
        coSignedAt: null,
        attendanceAutoZeroedAt: null,
        attendanceAutoZeroReason: null,
      },
    ]);
  });

  it("lists TA-03A history for scored/finalized proposals after they leave active queue", async () => {
    const finalizedAt = new Date("2026-05-15T08:00:00.000Z");
    const coSignedAt = new Date("2026-05-14T08:00:00.000Z");
    prisma.thesisParticipant.findMany.mockResolvedValue([
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-history",
          title: "Riwayat Proposal",
          finalProposalVersionId: "proposal-version-final",
          student: {
            user: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
          },
          researchMethodScores: [
            {
              id: "score-history",
              supervisorScore: 70,
              lecturerScore: 20,
              finalScore: 90,
              isFinalized: true,
              finalizedAt,
              coSignedAt,
              coSignedByLecturerId: "supervisor-2",
              coSignNote: "Setuju",
              attendanceAutoZeroedAt: null,
              attendanceAutoZeroReason: null,
            },
          ],
          thesisSupervisors: [
            {
              role: { name: "Pembimbing 2" },
              lecturer: { user: { id: "supervisor-2", fullName: "Dr. Partner" } },
            },
          ],
        },
      },
      {
        role: { name: "Pembimbing 1" },
        thesis: {
          id: "thesis-unscored",
          title: "Belum Dinilai",
          finalProposalVersionId: "proposal-version-2",
          student: {
            user: { id: "student-2", fullName: "Belum Dinilai", identityNumber: "2211523002" },
          },
          researchMethodScores: [],
          thesisSupervisors: [],
        },
      },
    ]);

    const result = await getSupervisorScoringHistory("supervisor-1");

    expect(result).toEqual([
      {
        thesisId: "thesis-history",
        thesisTitle: "Riwayat Proposal",
        student: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
        actorRole: "P1",
        actionStatus: "finalized",
        partnerName: "Dr. Partner",
        supervisorScore: 70,
        lecturerScore: 20,
        finalScore: 90,
        isFinalized: true,
        finalizedAt,
        coSignedAt,
        coSignNote: "Setuju",
        attendanceAutoZeroedAt: null,
        attendanceAutoZeroReason: null,
      },
    ]);
  });

  it("lists TA-03B queue from active theses without depending on MetopenClass enrollment", async () => {
    prisma.thesis.findMany.mockResolvedValue([
      {
        id: "thesis-1",
        title: "Optimasi SIMPTA",
        finalProposalVersionId: "proposal-version-1",
        student: {
          user: {
            id: "student-1",
            fullName: "Ilham",
            identityNumber: "2211523001",
          },
        },
        researchMethodScores: [
          {
            id: "score-1",
            supervisorScore: 68,
            lecturerScore: null,
            finalScore: null,
          },
        ],
        thesisSupervisors: [
          {
            lecturer: {
              user: {
                fullName: "Dr. Pembimbing",
              },
            },
          },
        ],
      },
    ]);

    const result = await getMetopenScoringQueue("lecturer-1");

    expect(prisma.thesis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          finalProposalVersionId: { not: null },
          student: { status: "active" },
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { researchMethodScores: { none: {} } },
                { researchMethodScores: { some: { lecturerScore: null } } },
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(result).toEqual([
      {
        thesisId: "thesis-1",
        thesisTitle: "Optimasi SIMPTA",
        student: {
          id: "student-1",
          fullName: "Ilham",
          identityNumber: "2211523001",
        },
        supervisorName: "Dr. Pembimbing",
        supervisorScore: 68,
        lecturerScore: null,
      },
    ]);
  });

  it("lists TA-03B history for scored and auto-zeroed proposals", async () => {
    const finalizedAt = new Date("2026-05-15T08:00:00.000Z");
    prisma.thesis.findMany.mockResolvedValue([
      {
        id: "thesis-scored",
        title: "Proposal Dinilai",
        student: {
          user: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
        },
        researchMethodScores: [
          {
            id: "score-1",
            supervisorScore: 70,
            lecturerScore: 20,
            finalScore: 90,
            isFinalized: true,
            finalizedAt,
            coSignedAt: null,
            attendanceAutoZeroedAt: null,
            attendanceAutoZeroReason: null,
          },
        ],
        thesisSupervisors: [
          { lecturer: { user: { fullName: "Dr. Pembimbing" } } },
        ],
      },
      {
        id: "thesis-auto-zero",
        title: "Proposal Auto Zero",
        student: {
          user: { id: "student-2", fullName: "Auto Zero", identityNumber: "2211523002" },
        },
        researchMethodScores: [
          {
            id: "score-2",
            supervisorScore: 0,
            lecturerScore: 0,
            finalScore: 0,
            isFinalized: true,
            finalizedAt,
            coSignedAt: null,
            attendanceAutoZeroedAt: finalizedAt,
            attendanceAutoZeroReason: "Presensi Metopel kurang dari 75%",
          },
        ],
        thesisSupervisors: [],
      },
    ]);

    const result = await getMetopenScoringHistory("lecturer-1");

    expect(prisma.thesis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          finalProposalVersionId: { not: null },
          student: { status: "active" },
          researchMethodScores: {
            some: {
              OR: [
                { lecturerId: "lecturer-1", lecturerScore: { not: null } },
                { attendanceAutoZeroedAt: { not: null } },
              ],
            },
          },
        }),
      }),
    );
    expect(result).toEqual([
      {
        thesisId: "thesis-scored",
        thesisTitle: "Proposal Dinilai",
        student: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
        supervisorName: "Dr. Pembimbing",
        supervisorScore: 70,
        lecturerScore: 20,
        finalScore: 90,
        isFinalized: true,
        finalizedAt,
        coSignedAt: null,
        attendanceAutoZeroedAt: null,
        attendanceAutoZeroReason: null,
      },
      {
        thesisId: "thesis-auto-zero",
        thesisTitle: "Proposal Auto Zero",
        student: { id: "student-2", fullName: "Auto Zero", identityNumber: "2211523002" },
        supervisorName: null,
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        finalizedAt,
        coSignedAt: null,
        attendanceAutoZeroedAt: finalizedAt,
        attendanceAutoZeroReason: "Presensi Metopel kurang dari 75%",
      },
    ]);
  });

  it("accepts TA-03B submission once TA-03A exists, without checking legacy class enrollment", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      researchMethodScores: [
        {
          id: "score-1",
          supervisorScore: 70,
          lecturerId: null,
          lecturerScore: null,
          isFinalized: false,
        },
      ],
    });
    prisma.researchMethodScore.update.mockResolvedValue({
      id: "score-1",
      lecturerScore: 20,
      finalScore: 90,
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      supervisorScore: 70,
      lecturerId: null,
      lecturerScore: null,
      isFinalized: false,
    });
    prisma.researchMethodScoreDetail.upsert.mockResolvedValue({});

    await submitMetopenScore("thesis-1", "lecturer-1", {
      scores: [
        { criteriaId: "crit-1", score: 10 },
        { criteriaId: "crit-2", score: 10 },
      ],
    });

    expect(prisma.researchMethodScore.update).toHaveBeenCalledWith({
      where: { id: "score-1" },
      data: expect.objectContaining({
        lecturerId: "lecturer-1",
        lecturerScore: 20,
        finalScore: 90,
        calculatedAt: expect.any(Date),
        isFinalized: true,
        finalizedBy: "lecturer-1",
        finalizedAt: expect.any(Date),
      }),
    });
    expect(prisma.researchMethodScoreDetail.upsert).toHaveBeenCalledTimes(2);
  });

  it("auto-finalizes TA-03 when TA-03A is submitted after TA-03B", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        {
          lecturerId: "supervisor-1",
          status: "active",
          role: { name: "Pembimbing 1" },
        },
      ],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      lecturerId: "lecturer-1",
      lecturerScore: 20,
      supervisorScore: null,
      isFinalized: false,
    });
    prisma.researchMethodScore.update.mockResolvedValue({
      id: "score-1",
      lecturerScore: 20,
      supervisorScore: 20,
      finalScore: 40,
      isFinalized: true,
    });

    await submitSupervisorScore("thesis-1", "supervisor-1", {
      scores: [
        { criteriaId: "crit-1", score: 10 },
        { criteriaId: "crit-2", score: 10 },
      ],
    });

    expect(prisma.researchMethodScore.update).toHaveBeenCalledWith({
      where: { thesisId: "thesis-1" },
      data: expect.objectContaining({
        supervisorId: "supervisor-1",
        supervisorScore: 20,
        finalScore: 40,
        calculatedAt: expect.any(Date),
        isFinalized: true,
        finalizedBy: "supervisor-1",
        finalizedAt: expect.any(Date),
      }),
    });
  });

  it("blocks TA-03A for inactive students even when the supervisor owns the thesis", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "dropout" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        {
          lecturerId: "supervisor-1",
          status: "active",
          role: { name: "Pembimbing 1" },
        },
      ],
    });

    await expect(
      submitSupervisorScore("thesis-1", "supervisor-1", {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toThrow("Mahasiswa tidak aktif");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
  });

  it("blocks TA-03A for closed thesis statuses", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Dibatalkan" },
      thesisSupervisors: [
        {
          lecturerId: "supervisor-1",
          status: "active",
          role: { name: "Pembimbing 1" },
        },
      ],
    });

    await expect(
      submitSupervisorScore("thesis-1", "supervisor-1", {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toThrow("TA-03A aktif");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
  });

  it("accepts TA-03B before TA-03A because scoring is parallel", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      researchMethodScores: [],
    });
    prisma.researchMethodScore.create.mockResolvedValue({
      id: "score-1",
      lecturerScore: 10,
      supervisorScore: null,
      finalScore: null,
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue(null);

    await submitMetopenScore("thesis-1", "lecturer-1", {
      scores: [
        { criteriaId: "crit-1", score: 5 },
        { criteriaId: "crit-2", score: 5 },
      ],
    });

    expect(prisma.researchMethodScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thesisId: "thesis-1",
        lecturerId: "lecturer-1",
        lecturerScore: 10,
        finalScore: null,
      }),
    });
  });

  it("blocks TA-03A scoring when Metopel attendance has not been uploaded", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        {
          lecturerId: "supervisor-1",
          status: "active",
          role: { name: "Pembimbing 1" },
        },
      ],
    });
    prisma.metopenAttendanceImport.findFirst.mockResolvedValueOnce(null);

    await expect(
      submitSupervisorScore("thesis-1", "supervisor-1", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow("presensi Metopel belum diunggah");
    expect(prisma.researchMethodScore.create).not.toHaveBeenCalled();
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("auto-zeroes TA-03 when Metopel attendance is below 75 percent", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.metopenAttendanceRecord.findFirst.mockResolvedValueOnce({
      id: "attendance-record-low",
      importId: "attendance-import-1",
      studentId: "student-1",
      identityNumber: "2211523001",
      studentName: "Ilham",
      presentCount: 6,
      absentCount: 3,
      sickCount: 0,
      permitCount: 0,
      totalMeetings: 9,
      attendancePercentage: 0.6667,
      isEligible: false,
      import: {
        id: "attendance-import-1",
        classCode: "JSI60143/SI/Kuliah/A",
        courseName: "Metode Penelitian",
        semesterLabel: "Genap 2025/2026",
        thresholdPercent: 0.75,
        uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
      },
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue(null);
    prisma.researchMethodScore.create.mockResolvedValue({
      id: "score-zero",
      thesisId: "thesis-1",
      supervisorScore: 0,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      attendanceRecordId: "attendance-record-low",
    });

    const result = await submitMetopenScore("thesis-1", "lecturer-1", {
      scores: [{ criteriaId: "crit-1", score: 10 }],
    });

    expect(result.finalScore).toBe(0);
    expect(prisma.researchMethodScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thesisId: "thesis-1",
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        finalizedBy: "lecturer-1",
        attendanceRecordId: "attendance-record-low",
        attendanceAutoZeroedAt: expect.any(Date),
        attendanceAutoZeroReason: expect.stringContaining("Presensi Metopel kurang dari 75%"),
      }),
    });
    expect(prisma.assessmentCriteria.findMany).not.toHaveBeenCalled();
    expect(prisma.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("blocks TA-03B overwrite by another Metopen lecturer", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      researchMethodScores: [
        {
          id: "score-1",
          supervisorScore: 70,
          lecturerId: "lecturer-owner",
          lecturerScore: 20,
          isFinalized: false,
        },
      ],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      supervisorScore: 70,
      lecturerId: "lecturer-owner",
      lecturerScore: 20,
      isFinalized: false,
    });

    await expect(
      submitMetopenScore("thesis-1", "lecturer-other", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow("Koordinator Metopen yang menginput");
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
    expect(prisma.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("blocks final score publication by a lecturer who did not submit TA-03B", async () => {
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      thesisId: "thesis-1",
      supervisorScore: 70,
      lecturerId: "lecturer-owner",
      lecturerScore: 20,
      isFinalized: false,
    });

    await expect(
      publishFinalScore("thesis-1", "lecturer-other"),
    ).rejects.toThrow("Koordinator Metopen yang menginput TA-03B");
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("blocks TA-03B when proposal final has not been submitted yet", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: null,
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      researchMethodScores: [
        {
          id: "score-1",
          supervisorScore: 70,
          lecturerScore: null,
        },
      ],
    });

    await expect(
      submitMetopenScore("thesis-1", "lecturer-1", {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toThrow("proposal final");
  });

  it("blocks TA-03B for inactive students even when proposal final exists", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "dropout" },
      thesisStatus: { name: "Bimbingan" },
    });

    await expect(
      submitMetopenScore("thesis-1", "lecturer-1", {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toThrow("Mahasiswa tidak aktif");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
  });

  it("blocks supervisor score detail when lecturer is not an active thesis supervisor", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      thesisSupervisors: [],
    });

    await expect(
      getScoresByThesisForSupervisor("thesis-1", "lecturer-other"),
    ).rejects.toThrow("bukan pembimbing aktif");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
  });

  it("returns supervisor score detail after active supervisor relation is proven", async () => {
    const scoreRecord = {
      id: "score-1",
      thesisId: "thesis-1",
      supervisorScore: 70,
      lecturerScore: null,
      researchMethodScoreDetails: [],
    };
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [{ id: "participant-1" }],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue(scoreRecord);

    const result = await getScoresByThesisForSupervisor("thesis-1", "lecturer-1");

    expect(result).toBe(scoreRecord);
    expect(prisma.researchMethodScore.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { thesisId: "thesis-1" } }),
    );
  });

  it("allows supervisor to READ score detail even when student inactive / thesis closed (Opsi C arsip read-only, OQ-2.3)", async () => {
    const scoreRecord = {
      id: "score-1",
      thesisId: "thesis-1",
      supervisorScore: 70,
      lecturerScore: 20,
      researchMethodScoreDetails: [],
    };
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      thesisSupervisors: [{ id: "participant-1" }],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue(scoreRecord);

    // Jalur BACA tidak lagi menolak student non-aktif / thesis selesai —
    // keanggotaan pembimbing aktif tetap jadi gerbang; immutability tulis
    // (BR-21) ditegakkan terpisah di jalur submit/co-sign/publish.
    const result = await getScoresByThesisForSupervisor("thesis-1", "lecturer-1");
    expect(result).toBe(scoreRecord);
  });

  it("blocks metopen score detail after another lecturer submitted TA-03B", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      researchMethodScores: [
        {
          lecturerId: "lecturer-owner",
          lecturerScore: 20,
        },
      ],
    });

    await expect(
      getScoresByThesisForMetopenLecturer("thesis-1", "lecturer-other"),
    ).rejects.toThrow("Koordinator Metopen yang menginput");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
  });
});

// ============================================
// BR-20 + BR-21 (canon §5.7.1 + §5.7.2): P1 master + P2 co-sign + immutable
// ============================================

describe("assessment.service — BR-20 P1 master + P2 co-sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "crit-1", name: "Kriteria 1", maxScore: 10, displayOrder: 1 },
      { id: "crit-2", name: "Kriteria 2", maxScore: 10, displayOrder: 2 },
    ]);
    prisma.thesisParticipant.findFirst.mockResolvedValue(null);
    prisma.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
    mockEligibleAttendance();
  });

  it("does NOT auto-finalize TA-03 on TA-03A submit when thesis has Pembimbing 2 and co-sign is missing", async () => {
    // Mock thesis pembimbing 1 (untuk submit guard)
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        { lecturerId: "supervisor-1", status: "active", role: { name: "Pembimbing 1" } },
      ],
    });
    // P2 ada → hasP2 = true → wajib cosign sebelum finalize
    prisma.thesisParticipant.findFirst.mockResolvedValueOnce({ id: "p2-participant" });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      lecturerId: "lecturer-1",
      lecturerScore: 20, // TA-03B sudah masuk
      supervisorScore: null,
      coSignedAt: null,
      coSignedByLecturerId: null,
      isFinalized: false,
    });
    prisma.researchMethodScore.update.mockResolvedValue({ id: "score-1" });

    await submitSupervisorScore("thesis-1", "supervisor-1", {
      scores: [
        { criteriaId: "crit-1", score: 10 },
        { criteriaId: "crit-2", score: 10 },
      ],
    });

    // Validasi update tidak set isFinalized=true karena cosign belum ada
    expect(prisma.researchMethodScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ isFinalized: true }),
      }),
    );
  });

  it("auto-finalizes TA-03 after P1 submit + cosign + TA-03B (when P2 exists)", async () => {
    // Test cosign endpoint yang menjalankan finalize karena P1+TA-03B sudah ada.
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        { id: "p2-supervisors" }, // current user = P2 active
      ],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      supervisorScore: 70,
      lecturerScore: 20,
      coSignedAt: null,
      coSignedByLecturerId: null,
      isFinalized: false,
    });
    prisma.researchMethodScore.update.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      finalScore: 90,
    });

    const result = await coSignSupervisorScore("thesis-1", "supervisor-2", { note: "Setuju konsensus" });

    expect(prisma.researchMethodScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coSignedByLecturerId: "supervisor-2",
          coSignNote: "Setuju konsensus",
          isFinalized: true,
          finalizedBy: "supervisor-2",
        }),
      }),
    );
    expect(result.isFinalized).toBe(true);
  });

  it("blocks co-sign when caller is not Pembimbing 2 active", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [], // bukan P2
    });

    await expect(
      coSignSupervisorScore("thesis-1", "lecturer-other", { note: "halo" }),
    ).rejects.toThrow("Pembimbing 2 yang aktif");
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("blocks co-sign when P1 has not submitted TA-03A yet", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [{ id: "p2-supervisors" }],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue(null);

    await expect(
      coSignSupervisorScore("thesis-1", "supervisor-2"),
    ).rejects.toThrow("Pembimbing 1 belum mengisi TA-03A");
  });
});

describe("assessment.service — BR-21 immutable post-submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "crit-1", name: "Kriteria 1", maxScore: 10, displayOrder: 1 },
      { id: "crit-2", name: "Kriteria 2", maxScore: 10, displayOrder: 2 },
    ]);
    prisma.thesisParticipant.findFirst.mockResolvedValue(null);
    prisma.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
    mockEligibleAttendance();
  });

  it("rejects TA-03A re-submit with 403 when score already finalized", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        { lecturerId: "supervisor-1", status: "active", role: { name: "Pembimbing 1" } },
      ],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      supervisorScore: 70,
      lecturerScore: 20,
    });

    await expect(
      submitSupervisorScore("thesis-1", "supervisor-1", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow(/final dan tidak dapat direvisi/i);
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("rejects TA-03A re-submit even before finalization to prevent silent overwrite", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [
        { lecturerId: "supervisor-1", status: "active", role: { name: "Pembimbing 1" } },
      ],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      isFinalized: false,
      supervisorScore: 65,
      lecturerScore: null,
    });

    await expect(
      submitSupervisorScore("thesis-1", "supervisor-1", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow(/TA-03A sudah disubmit/i);
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
    expect(prisma.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("rejects TA-03B re-submit with 403 when score already finalized", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      supervisorScore: 70,
      lecturerScore: 20,
      lecturerId: "lecturer-1",
    });

    await expect(
      submitMetopenScore("thesis-1", "lecturer-1", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow(/final dan tidak dapat direvisi/i);
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("rejects TA-03B re-submit by the same Koordinator before finalization", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      isFinalized: false,
      supervisorScore: null,
      lecturerId: "lecturer-1",
      lecturerScore: 20,
    });

    await expect(
      submitMetopenScore("thesis-1", "lecturer-1", {
        scores: [
          { criteriaId: "crit-1", score: 10 },
          { criteriaId: "crit-2", score: 10 },
        ],
      }),
    ).rejects.toThrow(/TA-03B sudah disubmit/i);
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalled();
    expect(prisma.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("rejects co-sign with 403 when score already finalized", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [{ id: "p2-supervisors" }],
    });
    prisma.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      supervisorScore: 70,
      lecturerScore: 20,
      coSignedAt: new Date(),
      coSignedByLecturerId: "supervisor-2",
    });

    await expect(
      coSignSupervisorScore("thesis-1", "supervisor-2", { note: "ulang" }),
    ).rejects.toThrow(/final dan tidak dapat direvisi/i);
  });
});

// ============================================
// BR-28 (canon v2.2 §5.7.x): Attendance re-check pada co-sign & publish
// ============================================

describe("assessment.service — BR-28 attendance re-check on co-sign & publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    prisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "crit-1", name: "Kriteria 1", maxScore: 10, displayOrder: 1 },
      { id: "crit-2", name: "Kriteria 2", maxScore: 10, displayOrder: 2 },
    ]);
    prisma.thesisParticipant.findFirst.mockResolvedValue(null);
    prisma.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
    mockEligibleAttendance();
  });

  it("returns auto-zero scoreRecord saat co-sign P2 dan presensi <75%", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [{ id: "p2-supervisors" }],
    });
    // Override attendance record menjadi <75% → gate auto-zero diterapkan.
    const lowAttendance = {
      id: "attendance-record-low",
      importId: "attendance-import-1",
      studentId: "student-1",
      identityNumber: "2211523001",
      studentName: "Ilham",
      presentCount: 5,
      absentCount: 4,
      sickCount: 0,
      permitCount: 0,
      totalMeetings: 9,
      attendancePercentage: 0.5556,
      isEligible: false,
      import: {
        id: "attendance-import-1",
        classCode: "JSI60143/SI/Kuliah/A",
        courseName: "Metode Penelitian",
        semesterLabel: "Genap 2025/2026",
        thresholdPercent: 0.75,
        uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
      },
    };
    prisma.metopenAttendanceRecord.findFirst.mockResolvedValueOnce(lowAttendance);
    prisma.researchMethodScore.findUnique.mockResolvedValue(null);
    const zeroedRecord = {
      id: "score-zero",
      thesisId: "thesis-1",
      supervisorScore: 0,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      attendanceRecordId: "attendance-record-low",
    };
    prisma.researchMethodScore.create.mockResolvedValue(zeroedRecord);

    const result = await coSignSupervisorScore("thesis-1", "supervisor-2", { note: "review" });

    expect(result).toEqual(zeroedRecord);
    expect(prisma.researchMethodScore.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coSignedByLecturerId: "supervisor-2" }) }),
    );
  });

  it("returns auto-zero scoreRecord saat publishFinalScore dan presensi <75%", async () => {
    prisma.researchMethodScore.findUnique.mockResolvedValueOnce({
      id: "score-1",
      thesisId: "thesis-1",
      lecturerId: "lecturer-1",
      supervisorScore: 70,
      lecturerScore: 20,
      isFinalized: false,
    });
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      student: { status: "active" },
      thesisStatus: { name: "Bimbingan" },
    });
    const lowAttendance = {
      id: "attendance-record-low",
      importId: "attendance-import-1",
      studentId: "student-1",
      identityNumber: "2211523001",
      studentName: "Ilham",
      presentCount: 5,
      absentCount: 4,
      sickCount: 0,
      permitCount: 0,
      totalMeetings: 9,
      attendancePercentage: 0.5556,
      isEligible: false,
      import: {
        id: "attendance-import-1",
        classCode: "JSI60143/SI/Kuliah/A",
        courseName: "Metode Penelitian",
        semesterLabel: "Genap 2025/2026",
        thresholdPercent: 0.75,
        uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
      },
    };
    prisma.metopenAttendanceRecord.findFirst.mockResolvedValueOnce(lowAttendance);
    // applyAttendanceAutoZeroForThesis -> autoZeroResearchMethodScore
    // memakai findUnique kedua kalinya untuk mengevaluasi existing.
    prisma.researchMethodScore.findUnique.mockResolvedValueOnce({
      id: "score-1",
      thesisId: "thesis-1",
      isFinalized: false,
      attendanceAutoZeroedAt: null,
    });
    const zeroedRecord = {
      id: "score-1",
      thesisId: "thesis-1",
      supervisorScore: 0,
      lecturerScore: 0,
      finalScore: 0,
      isFinalized: true,
      attendanceRecordId: "attendance-record-low",
    };
    prisma.researchMethodScore.update.mockResolvedValue(zeroedRecord);

    const result = await publishFinalScore("thesis-1", "lecturer-1");

    expect(result).toEqual(zeroedRecord);
    expect(prisma.researchMethodScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supervisorScore: 0,
          lecturerScore: 0,
          finalScore: 0,
          isFinalized: true,
          attendanceRecordId: "attendance-record-low",
          attendanceAutoZeroReason: expect.stringContaining("Presensi Metopel kurang dari 75%"),
        }),
      }),
    );
  });
});

// ============================================
// getSupervisorContextForThesis — UI hint
// ============================================

describe("assessment.service — supervisor context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies actor as P1 when active Pembimbing 1 found", async () => {
    prisma.thesisParticipant.findFirst
      .mockResolvedValueOnce({ role: { name: "Pembimbing 1" } })
      .mockResolvedValueOnce({ id: "p2-active" });

    const result = await getSupervisorContextForThesis("thesis-1", "lecturer-1");

    expect(result).toEqual({ role: "P1", hasP2: true });
  });

  it("classifies actor as P2 when active Pembimbing 2 found", async () => {
    prisma.thesisParticipant.findFirst
      .mockResolvedValueOnce({ role: { name: "Pembimbing 2" } })
      .mockResolvedValueOnce({ id: "p2-active" });

    const result = await getSupervisorContextForThesis("thesis-1", "lecturer-2");

    expect(result).toEqual({ role: "P2", hasP2: true });
  });

  it("classifies actor as null (read-only) when not an active supervisor", async () => {
    prisma.thesisParticipant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await getSupervisorContextForThesis("thesis-1", "lecturer-other");

    expect(result).toEqual({ role: null, hasP2: false });
  });
});
