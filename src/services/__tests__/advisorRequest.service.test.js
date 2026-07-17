import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => {
  const mock = {
    thesis: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (arg) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg(mock);
  });
  return mock;
});

vi.mock("../../config/prisma.js", () => ({
  default: prismaMock,
}));

vi.mock("../../repositories/advisorRequest.repository.js", () => ({
  findById: vi.fn(),
  findAlternativeLecturers: vi.fn(),
  findActiveAcademicYear: vi.fn(),
  findStudentByUserId: vi.fn(),
  findStudentAdvisorAccessContext: vi.fn(),
  findBlockingByStudent: vi.fn(),
  findLatestByStudent: vi.fn(),
  findDraftByStudent: vi.fn(),
  executeTransaction: vi.fn(),
  lockStudentRow: vi.fn(),
  lockAdvisorRequestRow: vi.fn(),
  findBlockingConflictByStudent: vi.fn(),
  upsertDraftByStudentWithClient: vi.fn(),
  findDraftByStudentWithClient: vi.fn(),
  findTopicByIdWithClient: vi.fn(),
  findAllTopicsWithScienceGroup: vi.fn(),
  findAllTopicsWithScienceGroupWithClient: vi.fn(),
  findLecturerForValidationWithClient: vi.fn(),
  findLecturerForAssignment: vi.fn(),
  createWithClient: vi.fn(),
  createAuditLogWithClient: vi.fn(),
  findByIdWithClient: vi.fn(),
  findThesisProcessLockState: vi.fn(),
  terminateSupervisorAssignmentByLecturerAndThesis: vi.fn(),
  findThesisByIdWithClient: vi.fn(),
  findThesisByStudentWithClient: vi.fn(),
  createThesisWithClient: vi.fn(),
  updateThesisWithClient: vi.fn(),
  findSupervisorAssignmentByLecturerAndThesis: vi.fn(),
  updateStatusWithClient: vi.fn(),
  findAcademicYearById: vi.fn(),
  findThesesWithSupervisors: vi.fn(),
  findActiveKaDep: vi.fn(),
  updateThesisDocuments: vi.fn(),
}));

vi.mock("../../repositories/ta04Batch.repository.js", () => ({
  findCurrentTa04BatchByAcademicYear: vi.fn(),
  createTa04BatchWithDocument: vi.fn(),
}));

vi.mock("../metopenEligibility.service.js", () => ({
  resolveMetopenEligibilityState: vi.fn(),
}));

vi.mock("../advisorQuota.service.js", () => ({
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
  lockLecturerQuotaForUpdate: vi.fn(),
  syncLecturerQuotaCurrentCount: vi.fn(),
}));

vi.mock("../notification.service.js", () => ({
  createNotificationsForUsers: vi.fn(),
  createNotificationEventForUsers: vi.fn(),
}));

vi.mock("../push.service.js", () => ({
  sendFcmToUsers: vi.fn(),
}));

vi.mock("../../utils/ta04.pdf.js", () => ({
  generateTA04Pdf: vi.fn().mockResolvedValue(Buffer.from("PDF")),
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const repo = await import("../../repositories/advisorRequest.repository.js");
const ta04BatchRepo = await import("../../repositories/ta04Batch.repository.js");
const metopenEligibility = await import("../metopenEligibility.service.js");
const advisorQuota = await import("../advisorQuota.service.js");
const notificationService = await import("../notification.service.js");
const {
  getLecturerCatalog,
  getRecommendations,
  getMyAccessState,
  getMyDraft,
  finalizeBatchTA04,
  respondByLecturer,
  decideByKadep,
  submitRequest,
  withdrawRequest,
} = await import("../advisorRequest.service.js");

describe("advisorRequest.service — withdraw booking before TA-04", () => {
  const bookingRequest = {
    id: "req-booking",
    studentId: "student-1",
    lecturerId: "lecturer-1",
    academicYearId: "ay-1",
    status: "booking_approved",
    thesisId: "thesis-1",
    thesis: { id: "thesis-1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findStudentByUserId.mockResolvedValue({ id: "student-1" });
    repo.findById.mockResolvedValue(bookingRequest);
    repo.findByIdWithClient.mockResolvedValue(bookingRequest);
    repo.executeTransaction.mockImplementation(async (callback) => callback({}));
    repo.updateStatusWithClient.mockResolvedValue({ ...bookingRequest, status: "canceled" });
  });

  it("allows booking withdrawal before TA-04 is issued", async () => {
    repo.findThesisProcessLockState.mockResolvedValue({
      ta04AssignmentIssuedAt: null,
      proposalStatus: "submitted",
      finalProposalVersionId: null,
      _count: { thesisGuidances: 0, researchMethodScores: 0 },
    });

    await expect(withdrawRequest("req-booking", "student-1")).resolves.toMatchObject({
      status: "canceled",
    });
    expect(repo.terminateSupervisorAssignmentByLecturerAndThesis).toHaveBeenCalled();
  });

  it("rejects booking withdrawal after TA-04 is issued", async () => {
    repo.findThesisProcessLockState.mockResolvedValue({
      ta04AssignmentIssuedAt: new Date("2026-07-13T00:00:00.000Z"),
      proposalStatus: "submitted",
      finalProposalVersionId: null,
      _count: { thesisGuidances: 0, researchMethodScores: 0 },
    });

    await expect(withdrawRequest("req-booking", "student-1")).rejects.toThrow(
      "TA-04 sudah diterbitkan",
    );
    expect(repo.updateStatusWithClient).not.toHaveBeenCalled();
    expect(repo.terminateSupervisorAssignmentByLecturerAndThesis).not.toHaveBeenCalled();
  });
});

describe("advisorRequest.service — getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metopenEligibility.resolveMetopenEligibilityState.mockResolvedValue({
      studentId: "student-1",
      eligibleMetopen: true,
      hasExternalStatus: true,
      canAccess: true,
      canSubmit: true,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: "sia",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("uses topic.scienceGroupId (not lecturer.scienceGroupId) for KBK matching", async () => {
    const topicScienceGroupId = "kbk-from-topic";
    const lecturerScienceGroupId = "kbk-from-lecturer";

    repo.findById.mockResolvedValue({
      id: "req-1",
      topicId: "topic-1",
      lecturerId: "lect-1",
      topic: { id: "topic-1", scienceGroupId: topicScienceGroupId },
      lecturer: {
        id: "lect-1",
        scienceGroupId: lecturerScienceGroupId,
        user: { fullName: "Dr. Target" },
      },
    });

    repo.findActiveAcademicYear.mockResolvedValue({ id: "ay-1" });
    repo.findAlternativeLecturers.mockResolvedValue([]);

    await getRecommendations("req-1");

    expect(repo.findAlternativeLecturers).toHaveBeenCalledWith(
      topicScienceGroupId,
      "ay-1",
      "lect-1"
    );
  });

  it("returns clear message when topic has no scienceGroupId", async () => {
    repo.findById.mockResolvedValue({
      id: "req-1",
      topicId: "topic-1",
      lecturerId: "lect-1",
      topic: { id: "topic-1", scienceGroupId: null },
      lecturer: {
        id: "lect-1",
        scienceGroupId: "kbk-from-lecturer",
      },
    });

    const result = await getRecommendations("req-1");

    expect(result.alternatives).toEqual([]);
    expect(result.message).toContain("KBK topik belum dipetakan");
    expect(repo.findAlternativeLecturers).not.toHaveBeenCalled();
  });

  it("does not exclude any lecturer when TA-02 has no preselected target lecturer", async () => {
    repo.findById.mockResolvedValue({
      id: "req-2",
      topicId: "topic-2",
      lecturerId: null,
      topic: { id: "topic-2", scienceGroupId: "kbk-ta02" },
      lecturer: null,
    });

    repo.findActiveAcademicYear.mockResolvedValue({ id: "ay-1" });
    repo.findAlternativeLecturers.mockResolvedValue([]);

    await getRecommendations("req-2");

    expect(repo.findAlternativeLecturers).toHaveBeenCalledWith(
      "kbk-ta02",
      "ay-1",
      null,
    );
  });
});

describe("advisorRequest.service — finalizeBatchTA04", () => {
  const academicYear = {
    id: "ay-1",
    year: "2025/2026",
    semester: "genap",
  };

  const theses = [
    {
      id: "thesis-1",
      title: "Judul A",
      student: {
        user: {
          id: "student-1",
          fullName: "Mahasiswa A",
          identityNumber: "2200000001",
        },
      },
      thesisSupervisors: [
        {
          status: "active",
          role: { name: "Pembimbing 1" },
          lecturer: { user: { fullName: "Dr. P1" } },
        },
      ],
    },
    {
      id: "thesis-2",
      title: "Judul B",
      student: {
        user: {
          id: "student-2",
          fullName: "Mahasiswa B",
          identityNumber: "2200000002",
        },
      },
      thesisSupervisors: [
        {
          status: "active",
          role: { name: "Pembimbing 1" },
          lecturer: { user: { fullName: "Dr. P1" } },
        },
        {
          status: "active",
          role: { name: "Pembimbing 2" },
          lecturer: { user: { fullName: "Dr. P2" } },
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (arg) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prismaMock);
    });
    repo.findAcademicYearById.mockResolvedValue(academicYear);
    repo.findThesesWithSupervisors.mockResolvedValue(theses);
    repo.findActiveKaDep.mockResolvedValue({
      fullName: "Ketua Departemen",
      identityNumber: "198000000000000001",
    });
    repo.findAllTopicsWithScienceGroup.mockResolvedValue([]);
    repo.updateThesisDocuments.mockResolvedValue({ count: 2 });
  });

  it("reuses current batch only when booking cohort hash and membership match exactly", async () => {
    ta04BatchRepo.findCurrentTa04BatchByAcademicYear.mockResolvedValue(null);
    ta04BatchRepo.createTa04BatchWithDocument.mockResolvedValue({
      document: {
        id: "doc-1",
        fileName: "TA04_BATCH_2025-2026_Genap_test.pdf",
        filePath: "uploads/documents/ta04/TA04_BATCH_2025-2026_Genap_test.pdf",
      },
      batch: {
        id: "batch-1",
      },
    });

    const first = await finalizeBatchTA04("ay-1", "kadep-1");
    expect(first.alreadyFinalized).toBe(false);
    expect(first.cohortHash).toMatch(/^[a-f0-9]{64}$/);
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["student-1", "student-2"],
      expect.objectContaining({
        type: "simpta_ta04_batch_finalized",
        data: expect.objectContaining({
          route: "/metopel",
          batchId: "batch-1",
          documentId: "doc-1",
        }),
      }),
      { push: true },
    );

    ta04BatchRepo.createTa04BatchWithDocument.mockClear();
    ta04BatchRepo.findCurrentTa04BatchByAcademicYear.mockResolvedValue({
      id: "batch-1",
      cohortHash: first.cohortHash,
      document: {
        id: "doc-1",
        fileName: "TA04_BATCH_2025-2026_Genap_test.pdf",
        filePath: "uploads/documents/ta04/TA04_BATCH_2025-2026_Genap_test.pdf",
      },
      members: [{ thesisId: "thesis-1" }, { thesisId: "thesis-2" }],
    });

    const second = await finalizeBatchTA04("ay-1", "kadep-1");

    expect(second.alreadyFinalized).toBe(true);
    expect(second.documentId).toBe("doc-1");
    expect(repo.updateThesisDocuments).toHaveBeenLastCalledWith(["thesis-1", "thesis-2"], "doc-1");
    expect(ta04BatchRepo.createTa04BatchWithDocument).not.toHaveBeenCalled();
  });

  it("does not treat partial current batch membership as already finalized", async () => {
    ta04BatchRepo.findCurrentTa04BatchByAcademicYear.mockResolvedValue({
      id: "batch-old",
      cohortHash: "a".repeat(64),
      document: {
        id: "doc-old",
        fileName: "TA04_BATCH_2025-2026_Genap_old.pdf",
        filePath: "uploads/documents/ta04/TA04_BATCH_2025-2026_Genap_old.pdf",
      },
      members: [{ thesisId: "thesis-1" }],
    });
    ta04BatchRepo.createTa04BatchWithDocument.mockResolvedValue({
      document: {
        id: "doc-new",
        fileName: "TA04_BATCH_2025-2026_Genap_new.pdf",
        filePath: "uploads/documents/ta04/TA04_BATCH_2025-2026_Genap_new.pdf",
      },
      batch: { id: "batch-new" },
    });

    const result = await finalizeBatchTA04("ay-1", "kadep-1");

    expect(result.alreadyFinalized).toBe(false);
    expect(result.documentId).toBe("doc-new");
    expect(ta04BatchRepo.createTa04BatchWithDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        academicYearId: "ay-1",
        thesisIds: ["thesis-1", "thesis-2"],
        generatedByUserId: "kadep-1",
        members: [
          expect.objectContaining({ thesisId: "thesis-1", studentNim: "2200000001" }),
          expect.objectContaining({ thesisId: "thesis-2", supervisorNames: "Dr. P1, Dr. P2" }),
        ],
      }),
    );
  });

  it("uses frozen TA-04 title and supervisor snapshots when present", async () => {
    repo.findThesesWithSupervisors.mockResolvedValue([
      {
        ...theses[0],
        title: "Judul Berubah Setelah Batch",
        ta04AssignmentIssuedAt: new Date("2026-07-01T00:00:00.000Z"),
        ta04AssignmentTitle: "Judul Frozen TA-04",
        ta04AssignmentSupervisorNames: "Dr. Frozen",
      },
    ]);
    ta04BatchRepo.findCurrentTa04BatchByAcademicYear.mockResolvedValue(null);
    ta04BatchRepo.createTa04BatchWithDocument.mockResolvedValue({
      document: {
        id: "doc-frozen",
        fileName: "TA04_BATCH_2025-2026_Genap_frozen.pdf",
        filePath: "uploads/documents/ta04/TA04_BATCH_2025-2026_Genap_frozen.pdf",
      },
      batch: { id: "batch-frozen" },
    });

    await finalizeBatchTA04("ay-1", "kadep-1");

    expect(ta04BatchRepo.createTa04BatchWithDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [
          expect.objectContaining({
            thesisId: "thesis-1",
            title: "Judul Frozen TA-04",
            supervisorNames: "Dr. Frozen",
            needsAssignmentSnapshot: false,
          }),
        ],
      }),
    );
  });
});

describe("advisorRequest.service — getMyAccessState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metopenEligibility.resolveMetopenEligibilityState.mockResolvedValue({
      studentId: "student-1",
      eligibleMetopen: true,
      hasExternalStatus: true,
      canAccess: true,
      canSubmit: true,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: "sia",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("allows direct TA-01 access even when thesis draft has not been created yet", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [],
    });
    repo.findBlockingByStudent.mockResolvedValue(null);
    repo.findLatestByStudent.mockResolvedValue(null);

    const result = await getMyAccessState("user-1");

    expect(result.thesisId).toBeNull();
    expect(result.canViewCatalog).toBe(true);
    expect(result.canBrowseCatalog).toBe(true);
    expect(result.canSubmitRequest).toBe(true);
    expect(result.gateConfigured).toBe(false);
    expect(result.gateOpen).toBe(true);
    expect(result.reason).toContain("TA-01");
  });

  it("still blocks new browsing when the student already has an active advisor request", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [{ id: "thesis-1", title: null, proposalStatus: null, thesisStatus: null, thesisSupervisors: [] }],
    });
    repo.findBlockingByStudent.mockResolvedValue({
      id: "req-1",
      status: "pending",
      lecturer: { user: { fullName: "Dr. Pembimbing" } },
    });
    repo.findLatestByStudent.mockResolvedValue({
      id: "req-1",
      status: "pending",
      lecturer: { user: { fullName: "Dr. Pembimbing" } },
    });

    const result = await getMyAccessState("user-1");

    expect(result.canBrowseCatalog).toBe(false);
    expect(result.canSubmitRequest).toBe(false);
    expect(result.hasBlockingRequest).toBe(true);
    expect(result.reason).toContain("sedang diproses");
  });

  it("opens official-supervisor access after TA-04 is issued, before active promotion", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [
        {
          id: "thesis-1",
          title: "Rancang Bangun SIMPTA",
          proposalStatus: null,
          ta04AssignmentIssuedAt: new Date("2026-07-10T00:00:00.000Z"),
          thesisStatus: null,
          thesisSupervisors: [
            {
              id: "participant-1",
              lecturerId: "lecturer-1",
              status: "active",
              role: { id: "role-1", name: "Pembimbing 1" },
              lecturer: {
                id: "lecturer-1",
                user: {
                  id: "lecturer-user-1",
                  fullName: "Dr. Pembimbing",
                  email: "dosen@example.com",
                  avatarUrl: null,
                },
              },
            },
          ],
        },
      ],
    });
    repo.findBlockingByStudent.mockResolvedValue({ id: "req-1", status: "assigned" });
    repo.findLatestByStudent.mockResolvedValue({ id: "req-1", status: "assigned" });

    const result = await getMyAccessState("user-1");

    expect(result.hasOfficialSupervisor).toBe(true);
    expect(result.ta04AssignmentIssued).toBe(true);
    expect(result.hasBlockingRequest).toBe(true);
    expect(result.canOpenLogbook).toBe(true);
    expect(result.canBrowseCatalog).toBe(false);
    expect(result.nextStep).toBe("open_logbook");
    expect(result.supervisors).toEqual([
      expect.objectContaining({
        lecturerId: "lecturer-1",
        name: "Dr. Pembimbing",
        role: "Pembimbing 1",
      }),
    ]);
  });

  it("exposes TA-04 issuance independently from P1 integrity", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [
        {
          id: "thesis-1",
          title: "Rancang Bangun SIMPTA",
          ta04AssignmentIssuedAt: new Date("2026-07-10T00:00:00.000Z"),
          thesisStatus: null,
          thesisSupervisors: [],
          advisorRequests: [],
        },
      ],
    });
    repo.findBlockingByStudent.mockResolvedValue({ id: "req-1", status: "booking_approved" });
    repo.findLatestByStudent.mockResolvedValue({ id: "req-1", status: "booking_approved" });

    const result = await getMyAccessState("user-1");

    expect(result.ta04AssignmentIssued).toBe(true);
    expect(result.hasOfficialSupervisor).toBe(false);
  });
});

describe("advisorRequest.service — lecturer catalog visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [],
    });
    repo.findBlockingByStudent.mockResolvedValue(null);
    repo.findLatestByStudent.mockResolvedValue(null);
    metopenEligibility.resolveMetopenEligibilityState.mockResolvedValue({
      studentId: "student-1",
      eligibleMetopen: true,
      hasExternalStatus: true,
      canAccess: true,
      canSubmit: true,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: "sia",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("hides booking, pending KaDep, and overquota internals from mahasiswa catalog", async () => {
    advisorQuota.getLecturerQuotaSnapshots.mockResolvedValue([
      {
        lecturerId: "lecturer-1",
        fullName: "Dr. Aman",
        identityNumber: "19800101",
        email: "aman@example.com",
        avatarUrl: null,
        scienceGroup: { id: "kbk-1", name: "AI" },
        quotaMax: 8,
        activeCount: 6,
        bookingCount: 2,
        pendingKadepCount: 1,
        normalAvailable: 0,
        overquotaAmount: 1,
        trafficLight: "red",
      },
    ]);

    const [item] = await getLecturerCatalog("user-1", "ay-1");

    expect(item).toMatchObject({
      lecturerId: "lecturer-1",
      quotaMax: 8,
      activeCount: 6,
      normalAvailable: 0,
      trafficLight: "red",
    });
    expect(item).not.toHaveProperty("bookingCount");
    expect(item).not.toHaveProperty("pendingKadepCount");
    expect(item).not.toHaveProperty("overquotaAmount");
    expect(item).not.toHaveProperty("currentCount");
  });
});

describe("advisorRequest.service — getMyDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metopenEligibility.resolveMetopenEligibilityState.mockResolvedValue({
      studentId: "student-1",
      eligibleMetopen: true,
      hasExternalStatus: true,
      canAccess: true,
      canSubmit: true,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: "sia",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("allows eligible students to load the working TA-01/TA-02 draft", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [],
    });
    repo.findBlockingByStudent.mockResolvedValue(null);
    repo.findLatestByStudent.mockResolvedValue(null);
    repo.findStudentByUserId.mockResolvedValue({ id: "student-1" });
    repo.findDraftByStudent.mockResolvedValue(null);

    const result = await getMyDraft("user-1");

    expect(result).toMatchObject({
      studentId: "student-1",
      requestType: "ta_02",
      source: "empty",
    });
    expect(repo.findDraftByStudent).toHaveBeenCalledWith("student-1");
  });
});

describe("advisorRequest.service — dual justification Path C", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.executeTransaction.mockImplementation(async (callback) => callback({}));
    repo.findBlockingConflictByStudent.mockResolvedValue(null);
    repo.createAuditLogWithClient.mockResolvedValue({ id: "audit-1" });
    repo.findAllTopicsWithScienceGroupWithClient.mockResolvedValue([]);
    advisorQuota.lockLecturerQuotaForUpdate.mockResolvedValue(undefined);
    advisorQuota.syncLecturerQuotaCurrentCount.mockResolvedValue(8);
    metopenEligibility.resolveMetopenEligibilityState.mockResolvedValue({
      studentId: "student-1",
      eligibleMetopen: true,
      hasExternalStatus: true,
      canAccess: true,
      canSubmit: true,
      readOnly: false,
      thesisId: null,
      thesisPhase: null,
      source: "sia",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
  });

  it("materializes red-quota TA-01 as lecturer-review Path C with studentJustification", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [],
    });
    repo.findBlockingByStudent.mockResolvedValue(null);
    repo.findLatestByStudent.mockResolvedValue(null);
    repo.findActiveAcademicYear.mockResolvedValue({ id: "ay-1" });
    repo.findTopicByIdWithClient.mockResolvedValue({
      id: "topic-1",
      scienceGroupId: "kbk-1",
    });
    repo.findLecturerForValidationWithClient.mockResolvedValue({
      id: "lecturer-1",
      acceptingRequests: true,
    });
    advisorQuota.getLecturerQuotaSnapshot.mockResolvedValue({
      lecturerId: "lecturer-1",
      trafficLight: "red",
    });
    repo.findDraftByStudentWithClient.mockResolvedValue({
      lecturerId: "lecturer-1",
      topicId: "topic-1",
      proposedTitle: "Sistem Rekomendasi Pembimbing",
      backgroundSummary: "Latar belakang yang cukup panjang untuk validasi.",
      problemStatement: "Masalah akademik yang jelas dan relevan.",
      proposedSolution: "Solusi sistem yang cukup jelas untuk diajukan.",
      researchObject: "Departemen",
      researchPermitStatus: "approved",
      studentJustification: "Saya tetap memilih dosen ini karena risetnya sangat sesuai KBK.",
      justificationText: "Saya tetap memilih dosen ini karena risetnya sangat sesuai KBK.",
      attachmentId: null,
    });
    repo.createWithClient.mockImplementation(async (_tx, data) => ({
      id: "req-1",
      createdAt: new Date("2026-05-11T00:00:00.000Z"),
      updatedAt: new Date("2026-05-11T00:00:00.000Z"),
      ...data,
    }));
    repo.findById.mockResolvedValue({
      id: "req-1",
      studentId: "student-1",
      lecturerId: "lecturer-1",
      thesisId: "thesis-1",
      proposedTitle: "Sistem Rekomendasi Pembimbing",
      routeType: "escalated",
      student: { user: { id: "user-student-1", fullName: "Mahasiswa A" } },
      lecturer: { user: { id: "lecturer-1", fullName: "Dr. Target" } },
      thesis: { id: "thesis-1", title: "Sistem Rekomendasi Pembimbing" },
    });

    const result = await submitRequest("student-1", {
      lecturerId: "lecturer-1",
      topicId: "topic-1",
      proposedTitle: "Sistem Rekomendasi Pembimbing",
      backgroundSummary: "Latar belakang yang cukup panjang untuk validasi.",
      problemStatement: "Masalah akademik yang jelas dan relevan.",
      proposedSolution: "Solusi sistem yang cukup jelas untuk diajukan.",
      researchObject: "Departemen",
      researchPermitStatus: "approved",
      studentJustification: "Saya tetap memilih dosen ini karena risetnya sangat sesuai KBK.",
    });

    expect(result.status).toBe("pending");
    expect(result.routeType).toBe("escalated");
    expect(repo.createWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "pending",
        routeType: "escalated",
        studentJustification: "Saya tetap memilih dosen ini karena risetnya sangat sesuai KBK.",
        justificationText: "Saya tetap memilih dosen ini karena risetnya sangat sesuai KBK.",
      }),
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["lecturer-1"],
      expect.objectContaining({
        type: "simpta_advisor_request_escalated_to_lecturer",
        data: expect.objectContaining({
          route: "/dosen/inbox-pembimbing",
          requestId: "req-1",
          thesisId: "thesis-1",
        }),
      }),
      { push: true },
    );
  });

  it("notifies KaDep when a student submits TA-02 department route", async () => {
    repo.findStudentAdvisorAccessContext.mockResolvedValue({
      id: "student-1",
      thesis: [],
    });
    repo.findBlockingByStudent.mockResolvedValue(null);
    repo.findLatestByStudent.mockResolvedValue(null);
    repo.findActiveAcademicYear.mockResolvedValue({ id: "ay-1" });
    repo.findTopicByIdWithClient.mockResolvedValue({
      id: "topic-1",
      scienceGroupId: "kbk-1",
    });
    repo.findDraftByStudentWithClient.mockResolvedValue({
      lecturerId: null,
      topicId: "topic-1",
      proposedTitle: "Sistem Informasi Monitoring Akademik",
      backgroundSummary: "Latar belakang yang cukup panjang untuk validasi.",
      problemStatement: "Masalah akademik yang jelas dan relevan.",
      proposedSolution: "Solusi sistem yang cukup jelas untuk diajukan.",
      researchObject: "Departemen",
      researchPermitStatus: "approved",
      studentJustification: null,
      justificationText: null,
      attachmentId: null,
    });
    repo.createWithClient.mockImplementation(async (_tx, data) => ({
      id: "req-ta02",
      createdAt: new Date("2026-05-11T00:00:00.000Z"),
      updatedAt: new Date("2026-05-11T00:00:00.000Z"),
      ...data,
    }));
    repo.findById.mockResolvedValue({
      id: "req-ta02",
      studentId: "student-1",
      lecturerId: null,
      thesisId: "thesis-1",
      proposedTitle: "Sistem Informasi Monitoring Akademik",
      routeType: "dept",
      student: { user: { id: "user-student-1", fullName: "Mahasiswa A" } },
      lecturer: null,
      thesis: { id: "thesis-1", title: "Sistem Informasi Monitoring Akademik" },
    });
    repo.findActiveKaDep.mockResolvedValue({
      id: "kadep-user-1",
      fullName: "Ketua Departemen",
      identityNumber: "198000000000000001",
    });

    const result = await submitRequest("student-1", {
      topicId: "topic-1",
      proposedTitle: "Sistem Informasi Monitoring Akademik",
      backgroundSummary: "Latar belakang yang cukup panjang untuk validasi.",
      problemStatement: "Masalah akademik yang jelas dan relevan.",
      proposedSolution: "Solusi sistem yang cukup jelas untuk diajukan.",
      researchObject: "Departemen",
      researchPermitStatus: "approved",
    });

    expect(result.status).toBe("pending_kadep");
    expect(result.routeType).toBe("dept");
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["kadep-user-1"],
      expect.objectContaining({
        type: "simpta_advisor_request_submitted_to_kadep",
        data: expect.objectContaining({
          route: "/kelola/tugas-akhir/kadep/pembimbing",
          requestId: "req-ta02",
          thesisId: "thesis-1",
        }),
      }),
      { push: true },
    );
  });

  it("notifies student when lecturer approves a normal booking", async () => {
    const request = {
      id: "req-normal",
      studentId: "student-1",
      lecturerId: "lecturer-1",
      academicYearId: "ay-1",
      topicId: "topic-1",
      proposedTitle: "Sistem Rekomendasi Pembimbing",
      status: "pending",
      routeType: "normal",
      thesisId: "thesis-1",
      student: { user: { id: "user-student-1", fullName: "Mahasiswa A" } },
      lecturer: { user: { id: "lecturer-1", fullName: "Dr. Target" } },
      thesis: { id: "thesis-1", title: "Sistem Rekomendasi Pembimbing" },
    };
    repo.findById.mockResolvedValue(request);
    repo.findByIdWithClient.mockResolvedValue(request);
    repo.findThesisByIdWithClient.mockResolvedValue({
      id: "thesis-1",
      academicYearId: "ay-1",
      thesisTopicId: "topic-1",
      title: "Sistem Rekomendasi Pembimbing",
    });
    repo.findSupervisorAssignmentByLecturerAndThesis.mockResolvedValue({
      role: { name: "Pembimbing 1" },
    });
    advisorQuota.getLecturerQuotaSnapshot.mockResolvedValue({
      currentCount: 1,
      quotaMax: 8,
    });
    repo.updateStatusWithClient.mockImplementation(async (_tx, _id, data) => ({
      ...request,
      ...data,
    }));

    await respondByLecturer("req-normal", "lecturer-1", {
      action: "accept",
      approvalNote: "Topik sesuai KBK dan siap dibimbing.",
    });

    expect(repo.updateStatusWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "req-normal",
      expect.objectContaining({ status: "booking_approved" }),
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-student-1"],
      expect.objectContaining({
        type: "simpta_advisor_booking_approved",
        data: expect.objectContaining({
          route: "/metopel",
          requestId: "req-normal",
          thesisId: "thesis-1",
        }),
      }),
      { push: true },
    );
  });

  it("requires lecturerOverquotaReason before forwarding Path C to KaDep", async () => {
    repo.findById.mockResolvedValue({
      id: "req-1",
      studentId: "student-1",
      lecturerId: "lecturer-1",
      academicYearId: "ay-1",
      status: "pending",
      proposedTitle: "Sistem Rekomendasi Pembimbing",
      student: { user: { id: "user-student-1", fullName: "Mahasiswa A" } },
      lecturer: { user: { id: "lecturer-1", fullName: "Dr. Target" } },
      thesisId: "thesis-1",
      thesis: { id: "thesis-1", title: "Sistem Rekomendasi Pembimbing" },
    });
    repo.findByIdWithClient.mockResolvedValue({
      id: "req-1",
      studentId: "student-1",
      lecturerId: "lecturer-1",
      academicYearId: "ay-1",
      status: "pending",
      routeType: "escalated",
      requestType: "ta_01",
      thesisId: null,
      thesis: null,
      studentJustification: "Mahasiswa tetap memilih dosen ini karena topiknya sangat spesifik.",
      justificationText: "Mahasiswa tetap memilih dosen ini karena topiknya sangat spesifik.",
    });
    advisorQuota.getLecturerQuotaSnapshot.mockResolvedValue({
      currentCount: 8,
      quotaMax: 8,
    });
    repo.updateStatusWithClient.mockImplementation(async (_tx, _id, data) => ({
      id: "req-1",
      ...data,
    }));
    repo.findActiveKaDep.mockResolvedValue({
      id: "kadep-user-1",
      fullName: "Ketua Departemen",
      identityNumber: "198000000000000001",
    });

    await respondByLecturer("req-1", "lecturer-1", {
      action: "accept",
      lecturerOverquotaReason: "Dua mahasiswa aktif sudah siap sidang bulan ini.",
    });

    expect(repo.updateStatusWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "req-1",
      expect.objectContaining({
        status: "pending_kadep",
        routeType: "escalated",
        lecturerApprovalNote: "Dua mahasiswa aktif sudah siap sidang bulan ini.",
        lecturerOverquotaReason: "Dua mahasiswa aktif sudah siap sidang bulan ini.",
      }),
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-student-1"],
      expect.objectContaining({
        type: "simpta_advisor_request_forwarded_student",
        data: expect.objectContaining({
          route: "/metopel",
          requestId: "req-1",
          thesisId: "thesis-1",
        }),
      }),
      { push: true },
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["kadep-user-1"],
      expect.objectContaining({
        type: "simpta_advisor_request_forwarded_to_kadep",
        data: expect.objectContaining({
          route: "/kelola/tugas-akhir/kadep/pembimbing",
          requestId: "req-1",
          thesisId: "thesis-1",
        }),
      }),
      { push: true },
    );
  });
});

describe("advisorRequest.service — reject notifications (canon v2.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.executeTransaction.mockImplementation(async (cb) => cb({}));
    repo.lockAdvisorRequestRow.mockResolvedValue();
    repo.upsertDraftByStudentWithClient.mockResolvedValue({});
    repo.createAuditLogWithClient.mockResolvedValue({});
    repo.updateStatusWithClient.mockImplementation(async (_tx, _id, data) => ({
      id: "req-1",
      ...data,
    }));
  });

  it("lecturer reject sends notification + FCM to student (canon v2.6 §5.8 / BPMN Task_UpdateRejectedRequest)", async () => {
    const request = {
      id: "req-1",
      lecturerId: "lecturer-1",
      status: "pending",
      studentId: "student-1",
      student: { user: { id: "user-student-1", fullName: "Mhs A" } },
      thesis: { id: "thesis-1" },
    };
    repo.findById.mockResolvedValue(request);
    repo.findByIdWithClient.mockResolvedValue(request);

    await respondByLecturer("req-1", "lecturer-1", {
      action: "reject",
      rejectionReason: "Topik kurang sesuai KBK saya.",
    });

    expect(repo.updateStatusWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "req-1",
      expect.objectContaining({ status: "rejected_by_dosen" }),
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-student-1"],
      expect.objectContaining({
        title: "Pengajuan Pembimbing Ditolak Dosen",
        type: "advisor_request_rejected_by_dosen",
        data: expect.objectContaining({
          route: "/metopel",
          requestId: "req-1",
        }),
      }),
      { push: true },
    );
  });

  it("KaDep reject sends notification + FCM to student (canon v2.6 §5.8 / BPMN Task_UpdateRejectedRequest)", async () => {
    const request = {
      id: "req-1",
      lecturerId: "lecturer-1",
      status: "pending_kadep",
      studentId: "student-1",
      student: { user: { id: "user-student-1", fullName: "Mhs A" } },
      thesis: { id: "thesis-1" },
    };
    repo.findById.mockResolvedValue(request);
    repo.findByIdWithClient.mockResolvedValue(request);

    await decideByKadep("req-1", "kadep-1", {
      action: "reject",
      notes: "Kuota dosen target sudah penuh dan tidak ada proyeksi lulus yang kuat.",
    });

    expect(repo.updateStatusWithClient).toHaveBeenCalledWith(
      expect.anything(),
      "req-1",
      expect.objectContaining({ status: "rejected_by_kadep" }),
    );
    expect(notificationService.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["user-student-1"],
      expect.objectContaining({
        title: "Pengajuan Pembimbing Ditolak KaDep",
        type: "advisor_request_rejected_by_kadep",
        data: expect.objectContaining({
          route: "/metopel",
          requestId: "req-1",
        }),
      }),
      { push: true },
    );
  });
});
