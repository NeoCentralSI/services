import { describe, it, expect, vi, beforeEach } from "vitest";

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
  findLecturerForValidationWithClient: vi.fn(),
  createWithClient: vi.fn(),
  createAuditLogWithClient: vi.fn(),
  findByIdWithClient: vi.fn(),
  updateStatusWithClient: vi.fn(),
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

const repo = await import("../../repositories/advisorRequest.repository.js");
const metopenEligibility = await import("../metopenEligibility.service.js");
const advisorQuota = await import("../advisorQuota.service.js");
const {
  getLecturerCatalog,
  getRecommendations,
  getMyAccessState,
  getMyDraft,
  respondByLecturer,
  submitRequest,
} = await import("../advisorRequest.service.js");

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

describe("advisorRequest.service — getMyAccessState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    repo.findTopicByIdWithClient.mockResolvedValue({ id: "topic-1" });
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
  });

  it("requires lecturerOverquotaReason before forwarding Path C to KaDep", async () => {
    repo.findById.mockResolvedValue({
      id: "req-1",
      studentId: "student-1",
      lecturerId: "lecturer-1",
      academicYearId: "ay-1",
      status: "pending",
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
  });
});
