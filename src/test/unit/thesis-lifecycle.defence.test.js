/**
 * A passed defence makes the thesis Selesai, in the transaction of the
 * finalization; undoing it returns the thesis to research. The lifecycle rules live in
 * `thesisLifecycle.service.js`; the defence module only calls them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCoreRepo, mockExaminerRepo, mockRevisionRepo, mockPrisma, mockStatusUtil, notifications } = vi.hoisted(() => ({
  mockCoreRepo: {
    findDefenceById: vi.fn(),
    findDefenceBasicById: vi.fn(),
    findDefenceSupervisorRole: vi.fn(),
    finalizeDefenceResult: vi.fn(),
    updateDefence: vi.fn(),
  },
  mockExaminerRepo: { findActiveExaminersWithAssessments: vi.fn(), findDefenceMinimumScore: vi.fn() },
  mockRevisionRepo: { findRevisionsByDefenceId: vi.fn() },
  mockPrisma: {},
  mockStatusUtil: { computeEffectiveDefenceStatus: vi.fn() },
  notifications: [],
}));

vi.mock("../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../repositories/thesis-defence/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../repositories/thesis-defence/revision.repository.js", () => mockRevisionRepo);
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../utils/defenceStatus.util.js", () => mockStatusUtil);
vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn(async (userIds, payload) => notifications.push({ userIds, ...payload })),
}));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn(async () => ({})) }));

const lifecycle = await import("../../services/thesisLifecycle.service.js");
const { finalizeDefence } = await import("../../services/thesis-defence/examiner.service.js");
const { finalizeRevisions, unfinalizeRevisions } = await import("../../services/thesis-defence/revision.service.js");
const { cancelDefence } = await import("../../services/thesis-defence/core.service.js");

/** A transaction client over one thesis and the rows that close with it. */
function fakeTx({ status = "research" } = {}) {
  const state = { thesis: { id: "t1", status, student: { user: { id: "stu-user" } }, thesisSupervisors: [{ lecturerId: "p1" }, { lecturerId: "p2" }] } };
  const tx = {
    state,
    thesis: {
      findUnique: vi.fn(async () => ({ ...state.thesis })),
      update: vi.fn(async ({ data }) => Object.assign(state.thesis, data)),
    },
    thesisGuidance: { updateMany: vi.fn(async () => ({ count: 2 })) },
    thesisChangeRequest: { updateMany: vi.fn(async () => ({ count: 1 })) },
    thesisGuidanceEvaluation: { updateMany: vi.fn(async () => ({ count: 1 })) },
    thesisSupervisors: { updateMany: vi.fn(async () => ({ count: 0 })) },
    thesisDefence: { update: vi.fn(async ({ data }) => ({ id: "d1", ...data })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  notifications.length = 0;
});

describe("completeThesisFromDefence", () => {
  it("research → Selesai in one transaction: sessions, change requests and the waiting evaluation closed; supervisors stay", async () => {
    const tx = fakeTx();
    const now = new Date("2026-10-17T03:00:00.000Z");
    const result = await lifecycle.completeThesisFromDefence(tx, "t1", { defenceId: "d1", actorUserId: "p1", now });

    expect(tx.thesis.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { status: "completed", statusChangedAt: now } });
    expect(tx.thesisGuidance.updateMany).toHaveBeenCalledWith({
      where: { thesisId: "t1", status: { in: expect.arrayContaining(["requested", "accepted"]) } },
      data: { status: "cancelled", cancelReason: "Dibatalkan otomatis: tugas akhir selesai.", cancelledAt: now, cancelledBy: "system" },
    });
    expect(tx.thesisChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { thesisId: "t1", status: "pending" },
      data: { status: "cancelled", decisionNotes: "Dibatalkan otomatis: tugas akhir selesai.", decidedAt: now, decidedByUserId: null },
    });
    expect(tx.thesisGuidanceEvaluation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { thesisId: "t1", status: "pending" } }));
    // The supervisor relations stay active as history.
    expect(tx.thesisSupervisors.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "THESIS_STATUS_CHANGED",
        entityId: "t1",
        changes: expect.objectContaining({ newValues: { status: "completed" }, metadata: expect.objectContaining({ source: "defence", defenceId: "d1", cancelledGuidances: 2 }) }),
      }),
    }));
    expect(result).toMatchObject({ changed: true, cancelledGuidances: 2, cancelledChangeRequests: 1, closedEvaluations: 1 });
    expect(result.recipients.sort()).toEqual(["p1", "p2", "stu-user"]);

    await lifecycle.announceThesisLifecycle(result);
    expect(notifications).toEqual([expect.objectContaining({ title: "Tugas Akhir Selesai", message: "Tugas akhir dinyatakan selesai." })]);
    expect(notifications[0].userIds.sort()).toEqual(["p1", "p2", "stu-user"]);
  });

  it.each(["proposal", "on_leave", "completed", "failed"])("leaves a thesis in %s as it is", async (status) => {
    const tx = fakeTx({ status });
    const result = await lifecycle.completeThesisFromDefence(tx, "t1", { defenceId: "d1" });
    expect(result.changed).toBe(false);
    expect(tx.thesis.update).not.toHaveBeenCalled();
    expect(tx.thesisGuidance.updateMany).not.toHaveBeenCalled();
    await lifecycle.announceThesisLifecycle(result);
    expect(notifications).toHaveLength(0);
  });
});

describe("reopenThesisFromDefence", () => {
  it("Selesai → research; nothing closed earlier is restored", async () => {
    const tx = fakeTx({ status: "completed" });
    const result = await lifecycle.reopenThesisFromDefence(tx, "t1", { defenceId: "d1", reason: "finalisasi revisi sidang dibatalkan." });
    expect(tx.thesis.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "research" }) }));
    expect(tx.thesisGuidance.updateMany).not.toHaveBeenCalled();
    expect(tx.thesisChangeRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ changes: expect.objectContaining({ newValues: { status: "research" } }) }),
    }));
    await lifecycle.announceThesisLifecycle(result);
    expect(notifications[0]).toMatchObject({ message: "Tugas akhir kembali berstatus Penelitian: finalisasi revisi sidang dibatalkan." });
  });

  it("only a Selesai thesis is reopened", async () => {
    const tx = fakeTx({ status: "research" });
    expect((await lifecycle.reopenThesisFromDefence(tx, "t1", {})).changed).toBe(false);
    expect(tx.thesis.update).not.toHaveBeenCalled();
  });

  it("the data master still cannot leave Selesai (completed stays a final status there)", () => {
    expect(lifecycle.THESIS_STATUS_TRANSITIONS.completed).toEqual([]);
    expect(() => lifecycle.assertStatusTransition({ status: "completed" }, "research")).toThrow(/tidak dapat diubah lagi/);
  });
});

describe("the defence module calls the lifecycle in the transaction of the finalization", () => {
  /** finalizeDefenceResult runs `afterFinalize` with its own transaction client. */
  function wireFinalize(tx, status) {
    mockCoreRepo.finalizeDefenceResult.mockImplementation(async ({ afterFinalize }) => {
      const row = { id: "d1", status, examinerAverageScore: 70, supervisorScore: 15, finalScore: 85, grade: "A", resultFinalizedAt: new Date(), thesis: { id: "t1" } };
      if (afterFinalize) await afterFinalize(tx, row);
      return row;
    });
  }

  beforeEach(() => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", thesisId: "t1", supervisorScore: 15, supervisorAssessmentSubmittedAt: new Date(), thesis: { id: "t1" },
    });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "membership", lecturerId: "p1" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValue(55);
    mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
      { lecturerId: "e1", assessmentSubmittedAt: new Date(), assessmentScore: 70 },
      { lecturerId: "e2", assessmentSubmittedAt: new Date(), assessmentScore: 70 },
    ]);
    mockPrisma.thesisDefence = { findUnique: vi.fn(async () => ({ id: "d1", requirementDocuments: [] })) };
    mockPrisma.academicYear = {
      findUnique: vi.fn(async () => ({ thesisDefenceMinimumScore: 55 })),
      findMany: vi.fn(async () => [{ id: "ay1", isActive: true, startDate: new Date(0), endDate: new Date(4102444800000) }]),
      findFirst: vi.fn(async () => ({ id: "ay1", isActive: true, thesisDefenceMinimumScore: 55 })),
    };
    mockPrisma.thesisDefenceExaminer = { findMany: vi.fn(async () => []) };
    mockPrisma.thesisSupervisors = { updateMany: vi.fn(async () => ({ count: 1 })) };
  });

  it("Lulus without revision → Selesai", async () => {
    const tx = fakeTx();
    wireFinalize(tx, "passed");
    await finalizeDefence("d1", { recommendRevision: false }, "p1");
    expect(tx.state.thesis.status).toBe("completed");
    expect(notifications).toEqual([expect.objectContaining({ message: "Tugas akhir dinyatakan selesai." })]);
  });

  it("Lulus with revision → stays in research until the revision is finalized", async () => {
    const tx = fakeTx();
    wireFinalize(tx, "passed_with_revision");
    mockPrisma.thesisDefenceExaminer.findMany = vi.fn(async () => []);
    await finalizeDefence("d1", { recommendRevision: true }, "p1");
    expect(tx.thesis.update).not.toHaveBeenCalled();
    expect(tx.state.thesis.status).toBe("research");
  });

  it("Tidak Lulus → stays in research (another defence may follow)", async () => {
    const tx = fakeTx();
    wireFinalize(tx, "failed");
    mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
      { lecturerId: "e1", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
      { lecturerId: "e2", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
    ]);
    await finalizeDefence("d1", { recommendRevision: false }, "p1");
    expect(tx.thesis.update).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(0);
  });

  const revisionDefence = (overrides = {}) => ({
    id: "d1", thesisId: "t1", status: "passed_with_revision", registeredAt: new Date(), revisionFinalizedAt: null, revisionFinalizedBy: null,
    thesis: { student: { user: { id: "stu-user" } } }, ...overrides,
  });

  it("revision finalized → Selesai, in the same transaction as the finalization", async () => {
    const tx = fakeTx();
    mockPrisma.$transaction = vi.fn(async (fn) => fn(tx));
    mockCoreRepo.findDefenceBasicById.mockResolvedValue(revisionDefence());
    mockRevisionRepo.findRevisionsByDefenceId.mockResolvedValue([{ id: "r1", studentSubmittedAt: new Date(), supervisorApprovedAt: new Date() }]);
    mockCoreRepo.updateDefence.mockImplementation(async (id, data, client) => client.thesisDefence.update({ where: { id }, data }));

    await finalizeRevisions("d1", "p1");
    expect(mockCoreRepo.updateDefence).toHaveBeenCalledWith("d1", expect.objectContaining({ revisionFinalizedBy: "membership" }), tx);
    expect(tx.state.thesis.status).toBe("completed");
  });

  it("revision finalization undone → back to research", async () => {
    const tx = fakeTx({ status: "completed" });
    mockPrisma.$transaction = vi.fn(async (fn) => fn(tx));
    mockCoreRepo.findDefenceBasicById.mockResolvedValue(revisionDefence({ revisionFinalizedAt: new Date(), revisionFinalizedBy: "membership" }));
    mockCoreRepo.updateDefence.mockImplementation(async (id, data, client) => client.thesisDefence.update({ where: { id }, data }));

    await unfinalizeRevisions("d1", "p1");
    expect(tx.state.thesis.status).toBe("research");
    expect(notifications[0]).toMatchObject({ message: "Tugas akhir kembali berstatus Penelitian: finalisasi revisi sidang dibatalkan." });
  });

  it.each([
    ["passed", null, "research"],
    ["passed_with_revision", new Date(), "research"],
    ["passed_with_revision", null, "completed"],
    ["scheduled", null, "completed"],
  ])("cancelling a %s defence (revision finalized: %s) leaves the Selesai thesis %s", async (status, revisionFinalizedAt, expected) => {
    const tx = fakeTx({ status: "completed" });
    mockPrisma.$transaction = vi.fn(async (fn) => fn(tx));
    mockCoreRepo.findDefenceBasicById.mockResolvedValue({ id: "d1", thesisId: "t1", status, revisionFinalizedAt });
    mockCoreRepo.updateDefence.mockImplementation(async (id, data, client) => client.thesisDefence.update({ where: { id }, data }));

    await cancelDefence("d1", { cancelledReason: "Data uji" });
    expect(mockCoreRepo.updateDefence).toHaveBeenCalledWith("d1", expect.objectContaining({ status: "cancelled" }), tx);
    expect(tx.state.thesis.status).toBe(expected);
  });
});
