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
  researchMethodScoreDetail: { upsert: vi.fn() },
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
  getMetopenScoringQueue,
  submitSupervisorScore,
  submitMetopenScore,
  coSignSupervisorScore,
  coSignSupervisorScoreAndSync,
  publishFinalScore,
  getScoresByThesisForSupervisor,
  getScoresByThesisForMetopenLecturer,
  getSupervisorContextForThesis,
} = await import("../assessment.service.js");

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
  });

  it("lists TA-03A queue only for active theses with a final proposal and open thesis status", async () => {
    prisma.thesisParticipant.findMany.mockResolvedValue([
      {
        thesis: {
          id: "thesis-active",
          title: "Optimasi SIMPTA",
          finalProposalVersionId: "proposal-version-1",
          student: {
            status: "active",
            user: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [{ supervisorScore: null }],
        },
      },
      {
        thesis: {
          id: "thesis-inactive",
          title: "Tidak Aktif",
          finalProposalVersionId: "proposal-version-2",
          student: {
            status: "dropout",
            user: { id: "student-2", fullName: "Inactive Student", identityNumber: "2211523002" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [{ supervisorScore: null }],
        },
      },
      {
        thesis: {
          id: "thesis-closed",
          title: "Ditutup",
          finalProposalVersionId: "proposal-version-3",
          student: {
            status: "active",
            user: { id: "student-3", fullName: "Closed Thesis", identityNumber: "2211523003" },
          },
          thesisStatus: { name: "Dibatalkan" },
          researchMethodScores: [{ supervisorScore: null }],
        },
      },
      {
        thesis: {
          id: "thesis-no-final",
          title: "Belum Final",
          finalProposalVersionId: null,
          student: {
            status: "active",
            user: { id: "student-4", fullName: "No Final", identityNumber: "2211523004" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [{ supervisorScore: null }],
        },
      },
      {
        thesis: {
          id: "thesis-scored",
          title: "Sudah Dinilai",
          finalProposalVersionId: "proposal-version-5",
          student: {
            status: "active",
            user: { id: "student-5", fullName: "Already Scored", identityNumber: "2211523005" },
          },
          thesisStatus: { name: "Bimbingan" },
          researchMethodScores: [{ supervisorScore: 70 }],
        },
      },
    ]);

    const result = await getSupervisorScoringQueue("supervisor-1");

    expect(result).toEqual([
      {
        thesisId: "thesis-active",
        thesisTitle: "Optimasi SIMPTA",
        student: { id: "student-1", fullName: "Ilham", identityNumber: "2211523001" },
        supervisorScore: null,
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

  it("blocks supervisor score detail for inactive students", async () => {
    prisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      finalProposalVersionId: "proposal-version-1",
      student: { status: "dropout" },
      thesisStatus: { name: "Bimbingan" },
      thesisSupervisors: [{ id: "participant-1" }],
    });

    await expect(
      getScoresByThesisForSupervisor("thesis-1", "lecturer-1"),
    ).rejects.toThrow("TA-03A aktif");
    expect(prisma.researchMethodScore.findUnique).not.toHaveBeenCalled();
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
