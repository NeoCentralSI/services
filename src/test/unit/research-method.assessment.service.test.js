/** Penilaian Proposal (drafts, free order, a pass starts research) and the SIA score template. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, prismaMock, tx, notify, lifecycle, audit } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    researchMethodAssessment: { findUnique: vi.fn(), update: vi.fn() },
    thesis: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    prismaMock: { $transaction: vi.fn(async (fn) => fn(tx)), user: { findUnique: vi.fn(async () => ({ fullName: "Dosen Penilai" })) } },
    repo: {
      findCriteria: vi.fn(),
      findAttempt: vi.fn(),
      findAcademicYear: vi.fn(),
      lockAttempt: vi.fn(),
      replaceDetails: vi.fn(),
      findCoordinatorUserIds: vi.fn(async () => ["coord"]),
      periodHasFinalResult: vi.fn(async () => false),
      updateMinimumScore: vi.fn(async (id, value) => ({ id, researchMethodMinimumScore: value })),
    },
    notify: { createNotificationEventForUsers: vi.fn() },
    lifecycle: { changeThesisStatus: vi.fn(async () => ({ changed: true })) },
    audit: { logAudit: vi.fn(), AUDIT_ACTIONS: { RESEARCH_METHOD_PROMOTED: "RESEARCH_METHOD_PROMOTED" }, ENTITY_TYPES: { THESIS: "THESIS" } },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/research-method/assessment.repository.js", () => repo);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../services/thesisLifecycle.service.js", () => lifecycle);
vi.mock("../../services/auditLog.service.js", () => audit);
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-2" })),
  formatAcademicYearLabel: () => "2026/2027 Ganjil",
}));

const service = await import("../../services/research-method/assessment.service.js");
const { buildColumnPlan, resolveScoreCells, buildParticipants } = await import("../../services/research-method/export.service.js");
const { summarize } = await import("../../services/research-method/monitoring.service.js");

const criteria = [
  { id: "c1", name: "Presentasi", maxScore: 20, researchMethodCpmk: { id: "k-1", code: "CPMK-01", description: "" }, assessmentRubrics: [{ id: "r1", minScore: 0, maxScore: 8 }, { id: "r2", minScore: 9, maxScore: 20 }] },
  { id: "c2", name: "Konten", maxScore: 40, researchMethodCpmk: { id: "k-2", code: "CPMK-02", description: "" }, assessmentRubrics: [] },
];
const coordinatorCriteria = [{ id: "k1", name: "Struktur", maxScore: 25, researchMethodCpmk: { id: "k-2", code: "CPMK-02", description: "" }, assessmentRubrics: [] }];

const attempt = (overrides = {}) => ({
  id: "a1",
  academicYearId: "ay-2",
  academicYear: { id: "ay-2", semester: "ganjil", year: "2026/2027", researchMethodMinimumScore: 60 },
  proposalFilePath: "uploads/thesis/t1/proposal/a1/p.pdf",
  supervisorScore: null,
  coordinatorScore: null,
  isFinalized: false,
  thesis: {
    id: "t1",
    title: "Judul",
    status: "proposal",
    supervisorAssignedAt: new Date("2026-09-01"),
    student: { id: "s1", status: "active", user: { fullName: "Mhs", identityNumber: "1" } },
    thesisSupervisors: [
      { lecturerId: "p1", role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "P1" } } },
      { lecturerId: "p2", role: { name: "Pembimbing 2" }, lecturer: { user: { fullName: "P2" } } },
    ],
  },
  supervisorDetails: [],
  coordinatorDetails: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCriteria.mockImplementation(async (party) => (party === "coordinator" ? coordinatorCriteria : criteria));
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
  tx.thesis.findUnique.mockResolvedValue({ id: "t1", status: "proposal" });
});

describe("scores", () => {
  it("whole numbers within the maximum, each criterion once; the rubric is a reference, not a choice", async () => {
    await expect(service.validateScores("supervisor", [], "ay-2")).rejects.toThrow(/wajib diisi/);
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 21 }, { criteriaId: "c2", score: 1 }], "ay-2")).rejects.toThrow(/melebihi/);
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 1.5 }, { criteriaId: "c2", score: 1 }], "ay-2")).rejects.toThrow(/bilangan bulat/);
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 1 }, { criteriaId: "c1", score: 2 }], "ay-2")).rejects.toThrow(/lebih dari satu/);
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 10 }], "ay-2")).rejects.toThrow(/Belum ada nilai untuk: Konten/);
    const ok = await service.validateScores("supervisor", [{ criteriaId: "c1", score: 15 }, { criteriaId: "c2", score: 30 }], "ay-2");
    expect(ok).toEqual({ total: 45, details: [{ criteriaId: "c1", rubricId: "r2", score: 15 }, { criteriaId: "c2", rubricId: null, score: 30 }] });
  });

  it("a draft may leave criteria empty, and still refuses a score above the maximum", async () => {
    expect(await service.validateScores("supervisor", [{ criteriaId: "c1", score: 5 }], "ay-2", { isDraft: true })).toMatchObject({ total: 5 });
    expect(await service.validateScores("supervisor", [], "ay-2", { isDraft: true })).toEqual({ total: 0, details: [] });
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 30 }], "ay-2", { isDraft: true })).rejects.toThrow(/melebihi/);
  });

  it("explains why a party cannot score; attendance plays no part", () => {
    expect(service.scoringBlockReason(attempt(), "supervisor", "ay-2")).toBeNull();
    expect(service.scoringBlockReason(attempt({ academicYearId: "ay-1" }), "supervisor", "ay-2")).toMatch(/riwayat/);
    expect(service.scoringBlockReason(attempt({ proposalFilePath: null }), "supervisor", "ay-2")).toMatch(/belum mengajukan/);
    expect(service.scoringBlockReason(attempt({ supervisorScore: 40 }), "supervisor", "ay-2")).toMatch(/terkunci/);
    expect(service.scoringBlockReason(attempt({ supervisorScore: 40 }), "coordinator", "ay-2")).toBeNull();
    expect(service.scoringBlockReason(attempt({ isFinalized: true }), "coordinator", "ay-2")).toMatch(/sudah final/);
  });

  it("the result comes from the scores only", () => {
    expect(service.decideResult(60, 60)).toBe("passed");
    expect(service.decideResult(59, 60)).toBe("failed");
    expect(service.minimumScoreOf({ researchMethodMinimumScore: null })).toBe(60);
    expect(service.minimumScoreOf({ researchMethodMinimumScore: 70 })).toBe(70);
  });
});

describe("drafts and free order", () => {
  const scores = [{ criteriaId: "c1", score: 15 }, { criteriaId: "c2", score: 30 }];

  it("a draft replaces the party's details and leaves the score, the result and the other party alone", async () => {
    repo.findAttempt.mockResolvedValue(attempt());
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: null, coordinatorScore: 20 });
    await service.submitScore("a1", "supervisor", "p1", [{ criteriaId: "c1", score: 15 }], { isDraft: true });
    expect(repo.replaceDetails).toHaveBeenCalledWith("supervisor", "a1", [{ criteriaId: "c1", rubricId: "r2", score: 15 }], tx);
    expect(tx.researchMethodAssessment.update).not.toHaveBeenCalled();
    expect(lifecycle.changeThesisStatus).not.toHaveBeenCalled();
    expect(notify.createNotificationEventForUsers).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("a draft is not counted and not shown: the other party sees no details until the score is sent", async () => {
    repo.findAttempt.mockResolvedValue(attempt({
      supervisorDetails: [{ assessmentCriteriaId: "c1", assessmentRubricId: "r2", score: 15 }],
      coordinatorDetails: [{ assessmentCriteriaId: "k1", assessmentRubricId: null, score: 20 }],
      coordinatorScore: 20,
    }));
    const view = await service.getAttemptView("a1");
    expect(view).toMatchObject({ supervisorScore: null, supervisorDetails: [], coordinatorScore: 20 });
    expect(view.coordinatorDetails).toHaveLength(1);

    const coordinatorForm = await service.getScoreForm("a1", "coordinator", "coord");
    expect(coordinatorForm.other).toMatchObject({ party: "supervisor", submitted: false, total: null, criteria: [] });
    expect(coordinatorForm.own).toMatchObject({ status: "submitted", total: 20 });

    const supervisorForm = await service.getScoreForm("a1", "supervisor", "p1");
    expect(supervisorForm.own).toMatchObject({ status: "draft", total: null, name: "Dosen Penilai" });
    expect(supervisorForm.criteria.map((c) => [c.id, c.score])).toEqual([["c1", 15], ["c2", null]]);
    expect(supervisorForm.other).toMatchObject({ submitted: true, total: 20, weight: 25 });
    expect(supervisorForm.other.criteria).toEqual([{ id: "k1", name: "Struktur", cpmkCode: "CPMK-02", maxScore: 25, score: 20 }]);
    expect(supervisorForm.canEdit).toBe(true);
  });

  it("either party may send first; the first send waits for the other", async () => {
    for (const [party, user, data] of [["coordinator", "coord", [{ criteriaId: "k1", score: 20 }]], ["supervisor", "p1", scores]]) {
      vi.clearAllMocks();
      repo.findCriteria.mockImplementation(async (p) => (p === "coordinator" ? coordinatorCriteria : criteria));
      repo.findAttempt.mockResolvedValue(attempt());
      tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: null, coordinatorScore: null });
      tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: false });
      await service.submitScore("a1", party, user, data);
      expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).not.toHaveProperty("isFinalized");
      expect(lifecycle.changeThesisStatus).not.toHaveBeenCalled();
    }
  });

  it("Pembimbing 2 may score as a backup; a lecturer who is not a supervisor may not", async () => {
    repo.findAttempt.mockResolvedValue(attempt());
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: null, coordinatorScore: null });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: false });
    await service.submitScore("a1", "supervisor", "p2", scores);
    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ supervisorId: "p2", supervisorScore: 45 });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["coord"], expect.objectContaining({ type: "research_method_coordinator_pending" }), { push: true });
    await expect(service.submitScore("a1", "supervisor", "someone", scores)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.getScoreForm("a1", "supervisor", "someone")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses a second send of the same party, and a draft after sending, inside the lock", async () => {
    repo.findAttempt.mockResolvedValue(attempt());
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: 40, coordinatorScore: null });
    await expect(service.submitScore("a1", "supervisor", "p1", scores)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/terkunci/) });
    await expect(service.submitScore("a1", "supervisor", "p1", scores, { isDraft: true })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("the second sent score decides, and a pass starts research at once", () => {
  it("a pass moves the thesis to research in the same transaction, with the audit and the notification", async () => {
    repo.findAttempt.mockResolvedValue(attempt({ supervisorScore: 45 }));
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: 45, coordinatorScore: null });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: true, finalScore: 60, result: "passed" });
    await service.submitScore("a1", "coordinator", "coord", [{ criteriaId: "k1", score: 15 }]);

    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ coordinatorScore: 15, finalScore: 60, isFinalized: true, result: "passed" });
    expect(lifecycle.changeThesisStatus).toHaveBeenCalledWith(tx, { id: "t1", status: "proposal" }, "research", expect.objectContaining({ actorUserId: "coord", now: expect.any(Date) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "RESEARCH_METHOD_PROMOTED", entityId: "t1" }) });
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(
      ["s1", "p1", "p2"],
      expect.objectContaining({ message: "Proposal dinyatakan lulus; tugas akhir masuk fase Penelitian.", type: "research_method_promoted" }),
      { push: true },
    );
  });

  it("a fail keeps the thesis in the proposal phase", async () => {
    repo.findAttempt.mockResolvedValue(attempt({ supervisorScore: 45 }));
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: 45, coordinatorScore: null });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: true, finalScore: 59, result: "failed" });
    await service.submitScore("a1", "coordinator", "coord", [{ criteriaId: "k1", score: 14 }]);

    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ finalScore: 59, result: "failed" });
    expect(lifecycle.changeThesisStatus).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["s1"], expect.objectContaining({ type: "research_method_assessment_finalized" }), { push: true });
  });

  it("the supervisor may send second as well", async () => {
    repo.findAttempt.mockResolvedValue(attempt({ coordinatorScore: 20 }));
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: null, coordinatorScore: 20 });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: true, finalScore: 65, result: "passed" });
    await service.submitScore("a1", "supervisor", "p1", [{ criteriaId: "c1", score: 15 }, { criteriaId: "c2", score: 30 }]);
    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ supervisorScore: 45, finalScore: 65, result: "passed" });
    expect(lifecycle.changeThesisStatus).toHaveBeenCalledTimes(1);
  });
});

describe("minimum passing score", () => {
  it("locks once the semester has a final result", async () => {
    repo.findAcademicYear.mockResolvedValue({ id: "ay-2", researchMethodMinimumScore: 60 });
    repo.periodHasFinalResult.mockResolvedValue(true);
    await expect(service.setMinimumScore("ay-2", 70, "sekdep")).rejects.toThrow("Nilai minimum lulus terkunci karena sudah ada hasil penilaian final pada semester ini.");
    expect(repo.updateMinimumScore).not.toHaveBeenCalled();

    repo.periodHasFinalResult.mockResolvedValue(false);
    expect(await service.setMinimumScore("ay-2", 70, "sekdep")).toEqual({ academicYearId: "ay-2", researchMethodMinimumScore: 70 });
  });
});

describe("Monitoring Kelas summary", () => {
  it("counts the stages in order and the results, with not yet final", () => {
    const row = (overrides) => ({ thesis: null, assessment: null, ...overrides });
    const summary = summarize([
      row({}),
      row({ thesis: { supervisors: [{}], supervisorAssignedAt: null } }),
      row({ thesis: { supervisors: [{}], supervisorAssignedAt: "x" }, assessment: { finalProposalAt: "x", isFinalized: false } }),
      row({ thesis: { supervisors: [{}], supervisorAssignedAt: "x" }, assessment: { finalProposalAt: "x", isFinalized: true, result: "passed" } }),
      row({ thesis: { supervisors: [{}], supervisorAssignedAt: "x" }, assessment: { finalProposalAt: "x", isFinalized: true, result: "failed" } }),
    ]);
    expect(summary).toEqual({ total: 5, withSupervisor: 4, assigned: 3, finalProposal: 3, finalized: 2, passed: 1, failed: 1, notFinalized: 3 });
  });
});

describe("SIA score template", () => {
  const cpmks = [
    { code: "CPMK-01", criterias: [{ id: "s1", maxScore: 20, party: "supervisor" }] },
    { code: "CPMK-02", criterias: [{ id: "s2", maxScore: 40, party: "supervisor" }, { id: "k1", maxScore: 25, party: "coordinator" }] },
    { code: "CPMK-03", criterias: [{ id: "s3", maxScore: 15, party: "supervisor" }, { id: "k2", maxScore: 5, party: "coordinator" }] },
  ];

  it("maps slots by CPMK order and assessor, with weights from the semester and the rest reported", () => {
    const plan = buildColumnPlan(cpmks);
    expect(plan.columns.map((c) => [c.label, c.weight, c.weightSource])).toEqual([
      ["Presentasi", 20, "config"],
      ["Proposal (konten)", 40, "config"],
      ["Proposal (struktur)", 25, "config"],
      ["Kemampuan merespon", 15, "config"],
    ]);
    expect(plan.unmapped.map((c) => c.id)).toEqual(["k2"]);
    expect(buildColumnPlan([]).columns.map((c) => c.weightSource)).toEqual(["template-default", "template-default", "template-default", "template-default"]);
  });

  it("empty cell until the party has sent (a draft never counts), the sum of the slot's details otherwise", () => {
    const plan = buildColumnPlan(cpmks);
    expect(resolveScoreCells(null, plan)).toEqual([null, null, null, null]);
    expect(resolveScoreCells({
      supervisorScore: 60,
      coordinatorScore: null,
      supervisorDetails: [{ assessmentCriteriaId: "s1", score: 15 }, { assessmentCriteriaId: "s2", score: 33 }, { assessmentCriteriaId: "s3", score: 12 }],
      coordinatorDetails: [{ assessmentCriteriaId: "k1", score: 20 }],
    }, plan)).toEqual([15, 33, null, 12]);
    expect(resolveScoreCells({
      supervisorScore: null,
      coordinatorScore: null,
      supervisorDetails: [{ assessmentCriteriaId: "s1", score: 15 }],
      coordinatorDetails: [],
    }, plan)).toEqual([null, null, null, null]);
  });

  it("the rows are the class plus any student with an attempt, noted when not flagged", () => {
    const attempt = (studentId, nim) => ({ id: `a-${studentId}`, thesis: { studentId, student: { user: { fullName: `M ${nim}`, identityNumber: nim } } } });
    const rows = buildParticipants(
      [{ id: "s2", user: { fullName: "M 2", identityNumber: "2" } }, { id: "s1", user: { fullName: "M 1", identityNumber: "1" } }],
      [attempt("s1", "1"), attempt("s3", "3")],
    );
    expect(rows.map((r) => [r.identityNumber, r.inClass, Boolean(r.attempt)])).toEqual([["1", true, true], ["2", true, false], ["3", false, true]]);
  });
});
