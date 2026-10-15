/**
 * Lanjutan Paket E4: Tugas Akhir > Perubahan and > Evaluasi page, filter and search on the
 * server, with no row limit (more than 100 rows page through the database).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeRepo, evalRepo, prismaMock, roles } = vi.hoisted(() => ({
  roles: { kadep: false, supervisor: false },
  changeRepo: {
    userHasActiveRole: vi.fn(),
    findIdsAtLecturerStep: vi.fn(),
    findPage: vi.fn(),
    countWhere: vi.fn(),
    getSupervisorLoad: vi.fn(async () => ({ activeCount: 3, quotaMax: 10 })),
  },
  evalRepo: {
    userHasAnyActiveRole: vi.fn(),
    supervisorVisibleWhere: (lecturerId) => ({ visibleTo: lecturerId }),
    findSupervisedThesesForEvaluation: vi.fn(),
    findEvaluationPage: vi.fn(),
    countEvaluations: vi.fn(),
  },
  prismaMock: { thesisGuidanceEvaluation: { findMany: vi.fn(async () => []) } },
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesis-change-request.repository.js", () => changeRepo);
vi.mock("../../repositories/thesis-guidance-evaluation.repository.js", () => evalRepo);
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn() }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn(async () => undefined) }));

const changes = await import("../../services/thesis-change-request.service.js");
const evaluations = await import("../../services/thesis-guidance-evaluation.service.js");

const TOTAL = 150;
const request = (n) => ({
  id: `req-${n}`, thesisId: `t-${n}`, batchId: null, requestType: "title", status: "rejected", reason: "Alasan",
  previousTitle: "Lama", newTitle: "Baru", approvals: [], thesis: null, createdAt: new Date(2026, 0, 1), decidedAt: null,
});
const evaluation = (n) => ({
  id: `ev-${n}`, thesisId: `t-${n}`, evaluationType: "six_month", isFollowUp: false, recommendation: "extend_1_month",
  status: "pending", createdAt: new Date(2026, 0, 1),
});

beforeEach(() => {
  vi.clearAllMocks();
  roles.kadep = false;
  roles.supervisor = false;
  changeRepo.userHasActiveRole.mockImplementation(async (_userId, roleName) =>
    roleName === "Ketua Departemen" ? roles.kadep : roles.supervisor);
  changeRepo.findIdsAtLecturerStep.mockResolvedValue([]);
  // A filter with 150 rows: the database returns the requested window.
  changeRepo.findPage.mockImplementation(async (_where, _order, { skip, take }) => ({
    rows: Array.from({ length: Math.max(Math.min(take, TOTAL - skip), 0) }, (_, i) => request(skip + i + 1)),
    total: TOTAL,
  }));
  changeRepo.countWhere.mockResolvedValue(TOTAL);
  evalRepo.userHasAnyActiveRole.mockImplementation(async (_userId, names) =>
    names.includes("Ketua Departemen") ? roles.kadep : roles.supervisor);
  evalRepo.findSupervisedThesesForEvaluation.mockResolvedValue([]);
  evalRepo.findEvaluationPage.mockImplementation(async (_where, _order, { skip, take }) =>
    Array.from({ length: Math.max(Math.min(take, TOTAL - skip), 0) }, (_, i) => evaluation(skip + i + 1)));
  evalRepo.countEvaluations.mockResolvedValue(TOTAL);
});

describe("Perubahan inbox (thesis-change-request listInbox)", () => {
  it("pages past the first hundred rows on the database: page 3 of 50 is rows 101-150", async () => {
    roles.kadep = true;
    const result = await changes.listInbox("kadep-1", { scope: "history", page: 3, pageSize: 50 });

    expect(changeRepo.findPage).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ skip: 100, take: 50 }));
    expect(result.meta).toEqual({ page: 3, pageSize: 50, total: 150, totalPages: 3 });
    expect(result.data).toHaveLength(50);
    expect(result.data[0].id).toBe("req-101");
    expect(result.data.at(-1).id).toBe("req-150");
  });

  it("caps a page at 100 rows but not the list: 150 rows are two pages of 100", async () => {
    roles.kadep = true;
    const result = await changes.listInbox("kadep-1", { scope: "history", page: 2, pageSize: 500 });
    expect(result.meta).toEqual({ page: 2, pageSize: 100, total: 150, totalPages: 2 });
    expect(result.data).toHaveLength(50);
  });

  it("Ketua Departemen: Menunggu Saya is the department step (every lecturer step approved); search by name or NIM", async () => {
    roles.kadep = true;
    const result = await changes.listInbox("kadep-1", { scope: "awaitingMe", search: " 22115 " });
    const where = changeRepo.findPage.mock.calls[0][0];
    expect(JSON.stringify(where)).toContain('"approvals":{"every":{"status":"approved"}}');
    expect(where.AND[1]).toEqual({ thesis: { student: { user: { OR: [{ fullName: { contains: "22115" } }, { identityNumber: { contains: "22115" } }] } } } });
    expect(result.counts).toEqual({ awaitingMe: 150, inProgress: 150 });
  });

  it("a supervisor sees only requests they are part of; Menunggu Saya is their own current step", async () => {
    roles.supervisor = true;
    changeRepo.findIdsAtLecturerStep.mockResolvedValue(["req-7"]);
    await changes.listInbox("lect-1", { scope: "awaitingMe" });
    expect(changeRepo.findPage.mock.calls[0][0].AND[0]).toEqual({ OR: [{ id: { in: ["req-7"] } }] });

    await changes.listInbox("lect-1", { scope: "inProgress" });
    const inProgress = changeRepo.findPage.mock.calls[1][0].AND[0];
    expect(inProgress.AND).toEqual([
      { status: "pending" },
      { OR: [{ approvals: { some: { lecturerId: "lect-1" } } }, { requestedByUserId: "lect-1" }] },
      { NOT: { OR: [{ id: { in: ["req-7"] } }] } },
    ]);
  });

  it("a batch lists its open requests", async () => {
    roles.kadep = true;
    await changes.listInbox("kadep-1", { batchId: "batch-1" });
    expect(changeRepo.findPage.mock.calls[0][0]).toEqual({ AND: [{ AND: [{ status: "pending" }, {}] }, { batchId: "batch-1" }] });
  });
});

describe("Evaluasi inbox (thesis-guidance-evaluation listInbox)", () => {
  it("splits a page between due rows and database rows", () => {
    expect(evaluations.splitPage(30, 0, 50)).toEqual({ dueSkip: 0, dueTake: 30, dbSkip: 0, dbTake: 20 });
    expect(evaluations.splitPage(30, 100, 50)).toEqual({ dueSkip: 30, dueTake: 0, dbSkip: 70, dbTake: 50 });
    expect(evaluations.splitPage(0, 100, 50)).toEqual({ dueSkip: 0, dueTake: 0, dbSkip: 100, dbTake: 50 });
  });

  it("Ketua Departemen: 150 waiting evaluations page through the database (rows 101-150 on page 3)", async () => {
    roles.kadep = true;
    const result = await evaluations.listInbox("kadep-1", { scope: "action", page: 3, pageSize: 50 });

    expect(evalRepo.findEvaluationPage).toHaveBeenCalledWith(expect.anything(), expect.anything(), { skip: 100, take: 50 });
    expect(result.meta).toEqual({ page: 3, pageSize: 50, total: 150, totalPages: 3 });
    expect(result.data.map((row) => row.id)).toEqual(Array.from({ length: 50 }, (_, i) => `ev-${101 + i}`));
    expect(result.data[0]).toMatchObject({ kind: "evaluation", evaluation: { id: "ev-101", status: "pending" } });
    expect(result.viewer).toEqual({ isKadep: true, isSupervisor: false });
  });

  it("a supervisor's Riwayat and Menunggu Kadep read only the evaluations they follow, searched by name or NIM", async () => {
    roles.supervisor = true;
    await evaluations.listInbox("lect-1", { scope: "kadep", search: "Nabil" });
    expect(evalRepo.findEvaluationPage.mock.calls[0][0]).toEqual({
      AND: [
        { AND: [{ status: "pending" }, { visibleTo: "lect-1" }] },
        { thesis: { student: { user: { OR: [{ fullName: { contains: "Nabil" } }, { identityNumber: { contains: "Nabil" } }] } } } },
      ],
    });
    await evaluations.listInbox("lect-1", { scope: "history" });
    expect(evalRepo.findEvaluationPage.mock.calls[1][0].AND[0]).toEqual({ OR: [{ AND: [{ status: { not: "pending" } }, { visibleTo: "lect-1" }] }] });
  });

  it("a supervisor without the department role has no database rows under Perlu Tindakan", async () => {
    roles.supervisor = true;
    const result = await evaluations.listInbox("lect-1", { scope: "action" });
    expect(evalRepo.findEvaluationPage).not.toHaveBeenCalled();
    expect(result.meta.total).toBe(0);
  });
});
