/**
 * Pengajuan Pembimbing. Ports the rules covered by the old module's tests
 * to the new service and the two-tier supervision limits.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, prismaMock, flags, loads, notify, createSupervisorAssignments, opYear } = vi.hoisted(() => {
  const opYear = { id: "ay-1", semester: "ganjil", year: "2026/2027", isActive: true };
  const prismaMock = {
    student: { findUnique: vi.fn() },
    thesis: { create: vi.fn(), update: vi.fn() },
    thesisSupervisorRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    opYear,
    prismaMock,
    repo: {
      lockRequest: vi.fn(),
      lockStudent: vi.fn(),
      findRequestById: vi.fn(),
      findRequestsByStudent: vi.fn(),
      findActiveRequestByStudent: vi.fn(),
      findDraftByStudent: vi.fn(),
      upsertDraft: vi.fn(),
      createRequest: vi.fn(),
      updateRequest: vi.fn(),
      findWaitingForLecturer: vi.fn(),
      findLecturerHistory: vi.fn(),
      findWaitingForKadep: vi.fn(),
      findKadepHistory: vi.fn(),
      findTopicWithGroup: vi.fn(),
      findAllTopicsWithGroup: vi.fn(),
      findLecturer: vi.fn(),
      findSupervisingLecturers: vi.fn(),
      findOpenThesisByStudent: vi.fn(),
      hasProposalActivity: vi.fn(),
      releaseSupervisor: vi.fn(),
      findActiveUserIdsByRole: vi.fn(),
      userHasAnyActiveRole: vi.fn(),
      createAuditLog: vi.fn(),
    },
    flags: { getStudentPeriodFlags: vi.fn() },
    loads: {
      getLecturerLoads: vi.fn(),
      getApplicableLimits: vi.fn(),
      classifyLoad: (count, limits) => (count >= limits.totalLimit ? "full" : count >= limits.semesterQuota ? "near_limit" : "available"),
    },
    notify: { createNotificationEventForUsers: vi.fn() },
    createSupervisorAssignments: vi.fn(),
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-proposal/supervisor-request.repository.js", () => repo);
vi.mock("../../services/research-method/eligibility.service.js", () => flags);
vi.mock("../../services/thesis-proposal/supervision-quota.service.js", () => loads);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../utils/supervisorIntegrity.js", () => ({ createSupervisorAssignments }));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => opYear),
  formatAcademicYearLabel: (y) => (y ? `${y.year} ${y.semester}` : "-"),
}));

const service = await import("../../services/thesis-proposal/supervisor-request.service.js");

const HOUR = 60 * 60 * 1000;
const TOPICS = [{ id: "topic-1", name: "Machine Learning", scienceGroupId: "kbk-1", scienceGroup: { id: "kbk-1", name: "Rekayasa Data" } }];
const DRAFT = {
  studentId: "stu-1",
  lecturerId: "lec-1",
  topicId: "topic-1",
  proposedTitle: "Sistem Informasi Pemantauan Proposal Tugas Akhir",
  backgroundSummary: "Latar belakang yang cukup panjang.",
  problemStatement: "Rumusan masalah yang jelas.",
  proposedSolution: "Rencana solusi berbasis web.",
  researchObject: "Departemen SI",
  researchPermitStatus: "in_process",
  studentJustification: null,
};
const LIMITS = { semesterQuota: 8, totalLimit: 10, source: "general" };
const load = (activeCount) => ({ acceptedCount: 0, activeCount, ...LIMITS, level: loads.classifyLoad(activeCount, LIMITS) });

function request(overrides = {}) {
  return {
    id: "req-1",
    studentId: "stu-1",
    lecturerId: "lec-1",
    redirectedTo: null,
    academicYearId: "ay-1",
    topicId: "topic-1",
    topic: TOPICS[0],
    proposedTitle: DRAFT.proposedTitle,
    route: "direct",
    status: "pending",
    createdAt: new Date(),
    studentJustification: null,
    lecturerOverquotaReason: null,
    thesisId: null,
    thesis: null,
    student: { id: "stu-1", user: { fullName: "Budi", identityNumber: "2211" } },
    lecturer: { id: "lec-1", user: { fullName: "Dr. Aina" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
  prismaMock.student.findUnique.mockResolvedValue({ id: "stu-1" });
  prismaMock.thesisSupervisorRequest.findFirst.mockResolvedValue(null);
  prismaMock.thesis.create.mockImplementation(async ({ data }) => ({ id: "thesis-new", ...data }));
  prismaMock.thesis.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  flags.getStudentPeriodFlags.mockResolvedValue({ eligibleResearchMethod: true, eligibilitySource: "sia" });
  repo.findActiveRequestByStudent.mockResolvedValue(null);
  repo.findOpenThesisByStudent.mockResolvedValue(null);
  repo.findDraftByStudent.mockResolvedValue({ ...DRAFT });
  repo.findTopicWithGroup.mockResolvedValue(TOPICS[0]);
  repo.findAllTopicsWithGroup.mockResolvedValue(TOPICS);
  repo.findLecturer.mockResolvedValue({ id: "lec-1", acceptingRequests: true });
  repo.createRequest.mockImplementation(async (data) => request({ ...data, id: "req-new" }));
  repo.updateRequest.mockImplementation(async (id, data) => request({ id, ...data }));
  repo.findActiveUserIdsByRole.mockResolvedValue(["kadep-1"]);
  loads.getLecturerLoads.mockImplementation(async (ids) => new Map(ids.map((id) => [id, load(3)])));
  loads.getApplicableLimits.mockResolvedValue(LIMITS);
});

describe("title rule", () => {
  it("rejects titles shorter than 12 characters and topic or KBK labels", () => {
    expect(() => service.assertTitleIsSpecific("Judul", TOPICS)).toThrow(/terlalu pendek/);
    expect(() => service.assertTitleIsSpecific("Machine Learning", TOPICS)).toThrow(/topik atau kelompok keilmuan/);
    expect(() => service.assertTitleIsSpecific("machine learning - rekayasa data", TOPICS)).toThrow(/topik atau kelompok keilmuan/);
    expect(service.assertTitleIsSpecific("  Prediksi Kelulusan dengan Machine Learning ", TOPICS)).toBe("Prediksi Kelulusan dengan Machine Learning");
  });
});

describe("submitRequest", () => {
  it("needs the course flag of the operational semester (message without SIA)", async () => {
    flags.getStudentPeriodFlags.mockResolvedValue(null);
    await expect(service.submitRequest("stu-1", {})).rejects.toMatchObject({ statusCode: 403, message: "Data perkuliahan Anda semester ini belum tersedia. Hubungi Admin Departemen." });
    flags.getStudentPeriodFlags.mockResolvedValue({ eligibleResearchMethod: false });
    await expect(service.submitRequest("stu-1", {})).rejects.toMatchObject({ statusCode: 403, message: "Anda belum terdaftar mengambil mata kuliah Metode Penelitian semester ini. Hubungi Admin Departemen bila ini keliru." });
  });

  it("allows one active request per student", async () => {
    repo.findActiveRequestByStudent.mockResolvedValue(request());
    await expect(service.submitRequest("stu-1", {})).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/masih memiliki pengajuan/) });
  });

  it("refuses a student who already has a supervisor", async () => {
    repo.findOpenThesisByStudent.mockResolvedValue({ id: "t1", thesisSupervisors: [{ id: "s1" }] });
    await expect(service.submitRequest("stu-1", {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("checks required fields, topic KBK and the lecturer's intake", async () => {
    repo.findDraftByStudent.mockResolvedValue({ ...DRAFT, problemStatement: null });
    await expect(service.submitRequest("stu-1", {})).rejects.toThrow(/Rumusan masalah/);

    repo.findDraftByStudent.mockResolvedValue({ ...DRAFT });
    repo.findTopicWithGroup.mockResolvedValue({ ...TOPICS[0], scienceGroupId: null });
    await expect(service.submitRequest("stu-1", {})).rejects.toThrow(/belum terhubung ke kelompok keilmuan/);

    repo.findTopicWithGroup.mockResolvedValue(TOPICS[0]);
    repo.findLecturer.mockResolvedValue({ id: "lec-1", acceptingRequests: false });
    await expect(service.submitRequest("stu-1", {})).rejects.toThrow(/tidak menerima pengajuan/);
  });

  it("sends a direct request to a lecturer under the hard limit and notifies the lecturer", async () => {
    const result = await service.submitRequest("stu-1", {});
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", route: "direct", academicYearId: "ay-1" }), prismaMock);
    expect(result.status).toBe("pending");
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["lec-1"], expect.objectContaining({ title: "Permohonan Pembimbing Baru" }), { push: true });
  });

  it("over the hard limit: needs the student's justification and becomes Pengajuan di Atas Kuota", async () => {
    loads.getLecturerLoads.mockResolvedValue(new Map([["lec-1", load(10)]]));
    await expect(service.submitRequest("stu-1", {})).rejects.toThrow(/minimal 20 karakter/);

    repo.findDraftByStudent.mockResolvedValue({ ...DRAFT, studentJustification: "Topik saya melanjutkan riset dosen ini." });
    await service.submitRequest("stu-1", {});
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", route: "over_quota" }), prismaMock);
  });

  it("without a lecturer goes to the Head of Department, and closes an earlier revision request", async () => {
    repo.findDraftByStudent.mockResolvedValue({ ...DRAFT, lecturerId: null });
    await service.submitRequest("stu-1", {});
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_kadep", route: "department", lecturerId: null }), prismaMock);
    expect(prismaMock.thesisSupervisorRequest.updateMany).toHaveBeenCalledWith({
      where: { studentId: "stu-1", status: "revision_requested" },
      data: { status: "closed" },
    });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["kadep-1"], expect.objectContaining({ title: "Pengajuan Pembimbing Lewat Departemen" }), { push: true });
  });
});

describe("withdrawRequest", () => {
  it("a waiting request can be pulled back only after 72 hours", async () => {
    repo.findRequestById.mockResolvedValue(request({ createdAt: new Date(Date.now() - 10 * HOUR) }));
    await expect(service.withdrawRequest("req-1", "stu-1")).rejects.toThrow(/Tunggu 62 jam lagi/);

    repo.findRequestById.mockResolvedValue(request({ status: "under_review", createdAt: new Date(Date.now() - 73 * HOUR) }));
    await service.withdrawRequest("req-1", "stu-1");
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "withdrawn", withdrawCount: { increment: 1 } }), prismaMock);
  });

  it("an accepted request can be cancelled before assignment and before proposal work, releasing the supervisor", async () => {
    repo.findRequestById.mockResolvedValue(request({ status: "accepted", thesisId: "t1", thesis: { id: "t1", supervisorAssignedAt: new Date() } }));
    await expect(service.withdrawRequest("req-1", "stu-1")).rejects.toThrow(/sudah ditetapkan/);

    repo.findRequestById.mockResolvedValue(request({ status: "accepted", thesisId: "t1", thesis: { id: "t1", supervisorAssignedAt: null } }));
    repo.hasProposalActivity.mockResolvedValue(true);
    await expect(service.withdrawRequest("req-1", "stu-1")).rejects.toThrow(/sudah dimulai/);

    repo.hasProposalActivity.mockResolvedValue(false);
    repo.findRequestById.mockResolvedValue(request({ status: "redirected", redirectedTo: "lec-2", thesisId: "t1", thesis: { id: "t1", supervisorAssignedAt: null } }));
    await service.withdrawRequest("req-1", "stu-1");
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "cancelled" }), prismaMock);
    expect(repo.releaseSupervisor).toHaveBeenCalledWith("t1", "lec-2", prismaMock);
  });

  it("only the owner may withdraw", async () => {
    repo.findRequestById.mockResolvedValue(request({ studentId: "stu-2" }));
    await expect(service.withdrawRequest("req-1", "stu-1")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("lecturer response", () => {
  it("only the chosen lecturer, only waiting requests", async () => {
    repo.findRequestById.mockResolvedValue(request());
    await expect(service.respondAsLecturer("req-1", "lec-9", { action: "accept" })).rejects.toMatchObject({ statusCode: 403 });
    repo.findRequestById.mockResolvedValue(request({ status: "accepted" }));
    await expect(service.respondAsLecturer("req-1", "lec-1", { action: "accept" })).rejects.toThrow(/sudah diputuskan/);
  });

  it("marks under review only from pending", async () => {
    repo.findRequestById.mockResolvedValue(request({ status: "under_review" }));
    await expect(service.markUnderReview("req-1", "lec-1")).rejects.toThrow(/Hanya pengajuan yang menunggu/);
    repo.findRequestById.mockResolvedValue(request());
    await service.markUnderReview("req-1", "lec-1");
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", { status: "under_review" }, prismaMock);
  });

  it("rejecting needs a reason of 5 characters", async () => {
    repo.findRequestById.mockResolvedValue(request());
    await expect(service.respondAsLecturer("req-1", "lec-1", { action: "reject", rejectionReason: "no" })).rejects.toThrow(/minimal 5 karakter/);
    await service.respondAsLecturer("req-1", "lec-1", { action: "reject", rejectionReason: "Bidang tidak sesuai" });
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "rejected_by_lecturer", rejectionReason: "Bidang tidak sesuai" }), prismaMock);
  });

  it("accepting under the hard limit creates the proposal thesis with Pembimbing 1", async () => {
    repo.findRequestById.mockResolvedValue(request());
    const result = await service.respondAsLecturer("req-1", "lec-1", { action: "accept", approvalNote: "Sesuai" });
    expect(prismaMock.thesis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studentId: "stu-1", status: "proposal", title: DRAFT.proposedTitle, academicYearId: "ay-1", thesisTopicId: "topic-1" }),
    });
    expect(createSupervisorAssignments).toHaveBeenCalledWith(prismaMock, "thesis-new", [{ lecturerId: "lec-1", supervisorRole: "pembimbing_1" }], { requireP1: true });
    expect(result.status).toBe("accepted");
  });

  it("reuses the student's open thesis left without supervisor by a cancelled request", async () => {
    repo.findRequestById.mockResolvedValue(request());
    repo.findOpenThesisByStudent.mockResolvedValue({ id: "t-old", thesisSupervisors: [] });
    await service.respondAsLecturer("req-1", "lec-1", { action: "accept" });
    expect(prismaMock.thesis.create).not.toHaveBeenCalled();
    expect(prismaMock.thesis.update).toHaveBeenCalledWith({ where: { id: "t-old" }, data: expect.objectContaining({ academicYearId: "ay-1" }) });
  });

  it("forwards acceptance when semester quota is reached despite spare total capacity", async () => {
    loads.getLecturerLoads.mockResolvedValue(new Map([["lec-1", { ...load(3), acceptedCount: LIMITS.semesterQuota }]]));
    repo.findRequestById.mockResolvedValue(request({ studentJustification: "Topik melanjutkan proyek riset dosen." }));
    const result = await service.respondAsLecturer("req-1", "lec-1", { action: "accept", lecturerOverquotaReason: "Bidang riset sesuai dengan kepakaran." });
    expect(result.status).toBe("pending_kadep");
    expect(createSupervisorAssignments).not.toHaveBeenCalled();
  });

  it("at the hard limit, forwards to the Head of Department with both justifications", async () => {
    loads.getLecturerLoads.mockResolvedValue(new Map([["lec-1", load(10)]]));
    repo.findRequestById.mockResolvedValue(request());
    await expect(service.respondAsLecturer("req-1", "lec-1", { action: "accept" })).rejects.toThrow(/alasan mahasiswa minimal 20/);

    repo.findRequestById.mockResolvedValue(request({ studentJustification: "Topik melanjutkan proyek riset dosen." }));
    await expect(service.respondAsLecturer("req-1", "lec-1", { action: "accept" })).rejects.toThrow(/minimal 10 karakter/);

    const result = await service.respondAsLecturer("req-1", "lec-1", { action: "accept", lecturerOverquotaReason: "Dua mahasiswa lulus bulan depan." });
    expect(repo.updateRequest).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ status: "pending_kadep", route: "over_quota", forwardedByLecturerId: "lec-1" }),
      prismaMock,
    );
    expect(result.status).toBe("pending_kadep");
    expect(createSupervisorAssignments).not.toHaveBeenCalled();
  });
});

describe("Head of Department decision", () => {
  const overQuota = () => request({
    status: "pending_kadep",
    route: "over_quota",
    studentJustification: "Topik melanjutkan proyek riset dosen.",
    lecturerOverquotaReason: "Dua mahasiswa lulus bulan depan.",
  });
  const department = () => request({ status: "pending_kadep", route: "department", lecturerId: null, lecturer: null });

  it("cannot reject an over-quota request", async () => {
    repo.findRequestById.mockResolvedValue(overQuota());
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "reject" })).rejects.toThrow(/tidak dapat ditolak/);
  });

  it("approves an over-quota request for the chosen lecturer, marked accepted over the normal limit", async () => {
    repo.findRequestById.mockResolvedValue(overQuota());
    await service.decideAsKadep("req-1", "kadep-1", { action: "approve", notes: "Disetujui" });
    expect(createSupervisorAssignments).toHaveBeenCalledWith(prismaMock, "thesis-new", [{ lecturerId: "lec-1", supervisorRole: "pembimbing_1" }], { requireP1: true });
    expect(repo.updateRequest).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ status: "accepted", acceptedOverNormal: true, redirectedTo: null, reviewedBy: "kadep-1" }),
      prismaMock,
    );
  });

  it("redirects to another lecturer, who must accept requests", async () => {
    repo.findRequestById.mockResolvedValue(overQuota());
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "redirect" })).rejects.toThrow(/Pilih dosen tujuan/);
    repo.findLecturer.mockResolvedValue({ id: "lec-2", acceptingRequests: false });
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "redirect", targetLecturerId: "lec-2" })).rejects.toThrow(/tidak menerima/);
    repo.findLecturer.mockResolvedValue({ id: "lec-2", acceptingRequests: true });
    await service.decideAsKadep("req-1", "kadep-1", { action: "redirect", targetLecturerId: "lec-2" });
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "redirected", redirectedTo: "lec-2", acceptedOverNormal: false }), prismaMock);
  });

  it("department route: approve needs a lecturer; revision needs notes of 10 characters; reject is allowed", async () => {
    repo.findRequestById.mockResolvedValue(department());
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "approve" })).rejects.toThrow(/memilih dosen/);
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "request_revision", notes: "Perbaiki" })).rejects.toThrow(/minimal 10 karakter/);

    await service.decideAsKadep("req-1", "kadep-1", { action: "request_revision", notes: "Perjelas objek penelitian." });
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "revision_requested" }), prismaMock);

    await service.decideAsKadep("req-1", "kadep-1", { action: "reject", notes: "Tidak sesuai" });
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "rejected_by_kadep" }), prismaMock);

    repo.findLecturer.mockResolvedValue({ id: "lec-3", acceptingRequests: true });
    loads.getLecturerLoads.mockResolvedValue(new Map([["lec-3", load(10)]]));
    await service.decideAsKadep("req-1", "kadep-1", { action: "approve", targetLecturerId: "lec-3" });
    expect(repo.updateRequest).toHaveBeenCalledWith("req-1", expect.objectContaining({ status: "accepted", redirectedTo: "lec-3", acceptedOverNormal: true }), prismaMock);
  });

  it("only requests waiting for the Head of Department", async () => {
    repo.findRequestById.mockResolvedValue(request());
    await expect(service.decideAsKadep("req-1", "kadep-1", { action: "approve" })).rejects.toThrow(/tidak sedang menunggu/);
  });
});

describe("recommendations and detail access", () => {
  const lecturer = (id, group, activeTopics = []) => ({
    id,
    acceptingRequests: true,
    user: { fullName: id },
    scienceGroup: { id: group, name: group },
    thesisSupervisors: activeTopics.map((topicId) => ({ thesis: { thesisTopicId: topicId, thesisTopic: { name: topicId } } })),
  });

  it("returns up to three same-KBK lecturers that are not full, by score", async () => {
    repo.findRequestById.mockResolvedValue(request());
    repo.findSupervisingLecturers.mockResolvedValue([
      lecturer("lec-1", "kbk-1"),
      lecturer("a", "kbk-1"),
      lecturer("b", "kbk-1", ["topic-1"]),
      lecturer("c", "kbk-1"),
      lecturer("d", "kbk-1"),
      lecturer("full", "kbk-1"),
      lecturer("other", "kbk-2"),
    ]);
    loads.getLecturerLoads.mockResolvedValue(new Map([
      ["lec-1", load(1)], ["a", load(2)], ["b", load(2)], ["c", load(5)], ["d", load(9)], ["full", load(12)], ["other", load(0)],
    ]));
    const { alternatives } = await service.getRecommendations("req-1");
    expect(alternatives.map((a) => a.lecturerId)).toEqual(["b", "a", "c"]);
  });

  it("detail: parties and Kadep/Sekdep/Admin only", async () => {
    repo.findRequestById.mockResolvedValue(request());
    repo.userHasAnyActiveRole.mockResolvedValue(false);
    await expect(service.getRequestDetail("req-1", "stu-9")).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.getRequestDetail("req-1", "lec-1")).resolves.toMatchObject({ id: "req-1" });
    repo.userHasAnyActiveRole.mockResolvedValue(true);
    await expect(service.getRequestDetail("req-1", "kadep-1")).resolves.toMatchObject({ id: "req-1" });
  });
});
