/** Penilaian Proposal, kelulusan and the SIA score template. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, attendance, prismaMock, tx, notify } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    researchMethodAssessment: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    prismaMock: { $transaction: vi.fn(async (fn) => fn(tx)) },
    repo: {
      findCriteria: vi.fn(),
      findAttempt: vi.fn(),
      findAcademicYear: vi.fn(),
      lockAttempt: vi.fn(),
      createDetails: vi.fn(),
      findCoordinatorUserIds: vi.fn(async () => ["coord"]),
    },
    attendance: { assertAttendanceAllowsScoring: vi.fn(async () => ({ id: "rec-1", isEligible: true })), getAttendanceForAttempt: vi.fn() },
    notify: { createNotificationEventForUsers: vi.fn() },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/research-method/assessment.repository.js", () => repo);
vi.mock("../../services/research-method/attendance.service.js", () => attendance);
vi.mock("../../services/notification.service.js", () => notify);
vi.mock("../../services/auditLog.service.js", () => ({ logAudit: vi.fn(), AUDIT_ACTIONS: {}, ENTITY_TYPES: {} }));
vi.mock("../../helpers/academicYear.helper.js", () => ({
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-2" })),
  formatAcademicYearLabel: () => "2026/2027 Ganjil",
}));

const service = await import("../../services/research-method/assessment.service.js");
const { decide, isLaterPeriod } = await import("../../services/research-method/promotion.service.js");
const { buildColumnPlan, resolveScoreCells } = await import("../../services/research-method/export.service.js");

const criteria = [
  { id: "c1", name: "Presentasi", maxScore: 20, assessmentRubrics: [{ id: "r1", minScore: 0, maxScore: 8 }, { id: "r2", minScore: 9, maxScore: 20 }] },
  { id: "c2", name: "Konten", maxScore: 40, assessmentRubrics: [] },
];

const attempt = (overrides = {}) => ({
  id: "a1",
  academicYearId: "ay-2",
  academicYear: { id: "ay-2", semester: "ganjil", year: "2026/2027", researchMethodMinimumScore: 60 },
  proposalFilePath: "uploads/thesis/t1/proposal/a1/p.pdf",
  supervisorScore: null,
  coordinatorScore: null,
  isFinalized: false,
  attendanceAutoZeroedAt: null,
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
  repo.findCriteria.mockResolvedValue(criteria);
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
  attendance.assertAttendanceAllowsScoring.mockResolvedValue({ id: "rec-1", isEligible: true });
});

describe("scores (R22)", () => {
  it("validates integers, maxima, rubric choice and range, and that every criterion is scored", async () => {
    const ok = [{ criteriaId: "c1", rubricId: "r2", score: 15 }, { criteriaId: "c2", score: 30 }];
    await expect(service.validateScores("supervisor", ok, "ay-2")).resolves.toEqual({ total: 45, details: [
      { criteriaId: "c1", rubricId: "r2", score: 15 },
      { criteriaId: "c2", rubricId: null, score: 30 },
    ] });
    await expect(service.validateScores("supervisor", [{ criteriaId: "c1", score: 15 }, ok[1]], "ay-2")).rejects.toThrow(/Rubrik penilaian wajib/);
    await expect(service.validateScores("supervisor", [{ ...ok[0], score: 5 }, ok[1]], "ay-2")).rejects.toThrow(/rentang rubrik 9-20/);
    await expect(service.validateScores("supervisor", [ok[0], { criteriaId: "c2", score: 41 }], "ay-2")).rejects.toThrow(/melebihi batas maksimum 40/);
    await expect(service.validateScores("supervisor", [ok[0], { criteriaId: "c2", score: 2.5 }], "ay-2")).rejects.toThrow(/bilangan bulat/);
    await expect(service.validateScores("supervisor", [ok[0]], "ay-2")).rejects.toThrow(/Belum ada nilai untuk: Konten/);
    await expect(service.validateScores("supervisor", [ok[0], ok[0]], "ay-2")).rejects.toThrow(/lebih dari satu kali/);
    repo.findCriteria.mockResolvedValue([]);
    await expect(service.validateScores("coordinator", ok, "ay-2")).rejects.toThrow(/belum dikonfigurasi/);
  });

  it("explains why a party cannot score (R21, R23)", () => {
    expect(service.scoringBlockReason(attempt(), "supervisor", "ay-2")).toBeNull();
    expect(service.scoringBlockReason(attempt(), "supervisor", "ay-3")).toMatch(/periode berjalan/);
    expect(service.scoringBlockReason(attempt({ proposalFilePath: null }), "supervisor", "ay-2")).toMatch(/proposal final/);
    expect(service.scoringBlockReason(attempt({ thesis: { ...attempt().thesis, supervisorAssignedAt: null } }), "supervisor", "ay-2")).toMatch(/Penetapan Pembimbing/);
    expect(service.scoringBlockReason(attempt({ supervisorScore: 50 }), "supervisor", "ay-2")).toMatch(/terkunci/);
    expect(service.scoringBlockReason(attempt({ supervisorScore: 50 }), "coordinator", "ay-2")).toBeNull();
    expect(service.scoringBlockReason(attempt({ attendanceAutoZeroedAt: new Date(), isFinalized: true }), "coordinator", "ay-2")).toMatch(/otomatis 0/);
  });
});

describe("submit", () => {
  const scores = [{ criteriaId: "c1", rubricId: "r2", score: 15 }, { criteriaId: "c2", score: 30 }];

  it("Pembimbing 2 may score as a backup; a lecturer who is not a supervisor may not", async () => {
    repo.findAttempt.mockResolvedValue(attempt());
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: null, coordinatorScore: null });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: false });
    await service.submitScore("a1", "supervisor", "p2", scores);
    expect(tx.researchMethodAssessment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ supervisorId: "p2", supervisorScore: 45, attendanceRecordId: "rec-1" }),
    }));
    expect(notify.createNotificationEventForUsers).toHaveBeenCalledWith(["coord"], expect.objectContaining({ type: "research_method_coordinator_pending" }), { push: true });
    await expect(service.submitScore("a1", "supervisor", "someone", scores)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("the second score finalizes: sum, and passed only at or above the period minimum", async () => {
    repo.findAttempt.mockResolvedValue(attempt({ supervisorScore: 45 }));
    repo.findCriteria.mockResolvedValue([{ id: "k1", name: "Struktur", maxScore: 25, assessmentRubrics: [] }]);
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: 45, coordinatorScore: null });
    tx.researchMethodAssessment.update.mockResolvedValue({ isFinalized: true, finalScore: 60, result: "passed" });
    await service.submitScore("a1", "coordinator", "coord", [{ criteriaId: "k1", score: 15 }]);
    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ coordinatorScore: 15, finalScore: 60, isFinalized: true, result: "passed" });

    tx.researchMethodAssessment.update.mockClear();
    await service.submitScore("a1", "coordinator", "coord", [{ criteriaId: "k1", score: 14 }]);
    expect(tx.researchMethodAssessment.update.mock.calls[0][0].data).toMatchObject({ finalScore: 59, result: "failed" });
  });

  it("refuses a second submit of the same party inside the lock", async () => {
    repo.findAttempt.mockResolvedValue(attempt());
    tx.researchMethodAssessment.findUnique.mockResolvedValue({ isFinalized: false, supervisorScore: 40, coordinatorScore: null });
    await expect(service.submitScore("a1", "supervisor", "p1", scores)).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/terkunci/) });
  });

  it("uses the default minimum (60) when the period has none", () => {
    expect(service.minimumScoreOf({ researchMethodMinimumScore: null })).toBe(60);
    expect(service.minimumScoreOf({ researchMethodMinimumScore: 70 })).toBe(70);
  });
});

describe("Naik ke Penelitian", () => {
  const ganjil26 = { id: "a", year: "2026/2027", semester: "ganjil", startDate: new Date("2026-08-01") };
  const genap25 = { id: "b", year: "2025/2026", semester: "genap", startDate: new Date("2026-02-01") };

  it("compares periods by start date, else year and semester", () => {
    expect(isLaterPeriod(ganjil26, genap25)).toBe(true);
    expect(isLaterPeriod(genap25, ganjil26)).toBe(false);
    expect(isLaterPeriod(ganjil26, ganjil26)).toBe(false);
    expect(isLaterPeriod({ id: "x", year: "2026/2027", semester: "genap" }, { id: "y", year: "2026/2027", semester: "ganjil" })).toBe(true);
  });

  it("promotes only with KRS Tugas Akhir in a period after the Penetapan period; missing SIA data defers", () => {
    expect(decide({ operational: ganjil26, assignmentPeriod: genap25, snapshot: { takingThesisCourse: true } }).decision).toBe("promote");
    expect(decide({ operational: ganjil26, assignmentPeriod: genap25, snapshot: { takingThesisCourse: false } }).decision).toBe("wait_thesis_course");
    expect(decide({ operational: ganjil26, assignmentPeriod: genap25, snapshot: null }).decision).toBe("wait_sia");
    expect(decide({ operational: ganjil26, assignmentPeriod: genap25, snapshot: { takingThesisCourse: null } }).decision).toBe("wait_sia");
    expect(decide({ operational: ganjil26, assignmentPeriod: ganjil26, snapshot: { takingThesisCourse: true } }).decision).toBe("wait_next_period");
  });
});

describe("SIA score template", () => {
  const cpmks = [
    { code: "CPMK-01", criterias: [{ id: "s1", maxScore: 20, party: "supervisor" }] },
    { code: "CPMK-02", criterias: [{ id: "s2", maxScore: 40, party: "supervisor" }, { id: "k1", maxScore: 25, party: "coordinator" }] },
    { code: "CPMK-03", criterias: [{ id: "s3", maxScore: 15, party: "supervisor" }, { id: "k2", maxScore: 5, party: "coordinator" }] },
  ];

  it("maps slots by CPMK order and assessor, with weights from the period and the rest reported", () => {
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

  it("empty cell when not scored, 0 for an automatic 0, the sum of the slot's details otherwise", () => {
    const plan = buildColumnPlan(cpmks);
    expect(resolveScoreCells(null, plan)).toEqual([null, null, null, null]);
    expect(resolveScoreCells({ attendanceAutoZeroedAt: new Date() }, plan)).toEqual([0, 0, 0, 0]);
    expect(resolveScoreCells({
      supervisorScore: 60,
      coordinatorScore: null,
      supervisorDetails: [{ assessmentCriteriaId: "s1", score: 15 }, { assessmentCriteriaId: "s2", score: 33 }, { assessmentCriteriaId: "s3", score: 12 }],
      coordinatorDetails: [],
    }, plan)).toEqual([15, 33, null, 12]);
  });
});
