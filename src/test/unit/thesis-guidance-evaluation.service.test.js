/**
 * E5 — Evaluasi Bimbingan (formulir TA-17).
 *
 * The real service, the real supervision clock and the real lifecycle rules run against a
 * small in-memory world, so stages, allowed decisions and what an approval does to the
 * thesis are checked on actual state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const world = vi.hoisted(() => ({ state: null, notifications: [] }));

const DAY = 24 * 60 * 60 * 1000;
const monthsAgo = (months, extraDays = 0) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return new Date(date.getTime() - extraDays * DAY);
};
const daysAgo = (days) => new Date(Date.now() - days * DAY);

const user = (id) => ({ id, fullName: world.state.users[id] ?? id, identityNumber: `ID-${id}` });
const evaluations = () => world.state.evaluations;

function thesisView(thesis) {
  if (!thesis) return null;
  return {
    ...thesis,
    academicYear: { id: "ay-1", year: "2026/2027", semester: "ganjil" },
    student: { id: thesis.studentId, user: user(thesis.studentId) },
    // Activity comes from the completed sessions, not from the thesis row.
    thesisGuidances: world.state.guidances
      .filter((g) => g.thesisId === thesis.id && g.status === "completed")
      .map((g) => ({ status: g.status, approvedDate: g.approvedDate ?? null, completedAt: g.approvedDate ?? null })),
    thesisMilestones: [],
    thesisSeminars: world.state.seminars.filter((s) => s.thesisId === thesis.id),
    thesisGuidanceEvaluations: evaluations().filter((e) => e.thesisId === thesis.id),
    thesisSupervisors: world.state.supervisors
      .filter((s) => s.thesisId === thesis.id && s.status === "active")
      .map((s) => ({ ...s, role: { name: s.roleName }, lecturer: { user: user(s.lecturerId) } })),
  };
}

function evaluationView(evaluation) {
  if (!evaluation) return null;
  const thesis = world.state.theses.find((t) => t.id === evaluation.thesisId);
  const supervisor = world.state.supervisors.find((s) => s.id === evaluation.thesisSupervisorId);
  return {
    ...evaluation,
    thesis: { id: thesis.id, title: thesis.title, status: thesis.status, student: { id: thesis.studentId, user: user(thesis.studentId) } },
    thesisSupervisor: { id: supervisor.id, lecturerId: supervisor.lecturerId, lecturer: { user: user(supervisor.lecturerId) } },
    kadepApprover: evaluation.kadepApprovedBy ? user(evaluation.kadepApprovedBy) : null,
  };
}

vi.mock("../../repositories/thesis-guidance-evaluation.repository.js", () => ({
  findThesisForEvaluation: async (thesisId) => thesisView(world.state.theses.find((t) => t.id === thesisId)),
  findStudentThesisId: async (studentId) => world.state.theses.find((t) => t.studentId === studentId)?.id ?? null,
  countCompletedGuidances: async (thesisId) => world.state.guidances.filter((g) => g.thesisId === thesisId && g.status === "completed").length,
  findById: async (id) => evaluationView(evaluations().find((e) => e.id === id)),
  findByThesisId: async (thesisId) => evaluations().filter((e) => e.thesisId === thesisId).slice().reverse().map(evaluationView),
  findForDepartment: async ({ scope }) => {
    const rows = evaluations()
      .filter((e) => (scope === "pending" ? e.status === "pending" : e.status !== "pending" && e.recommendation !== "continue"))
      .map(evaluationView);
    return { rows, total: rows.length };
  },
  countPending: async () => evaluations().filter((e) => e.status === "pending").length,
  findSupervisedThesesForEvaluation: async (lecturerId) =>
    world.state.theses
      .filter((t) => t.status === "research" && world.state.supervisors.some((s) => s.thesisId === t.id && s.lecturerId === lecturerId && s.status === "active"))
      .map(thesisView),
  findForSupervisor: async (lecturerId) =>
    evaluations()
      .filter((e) =>
        world.state.supervisors.some((s) => s.id === e.thesisSupervisorId && s.lecturerId === lecturerId) ||
        world.state.supervisors.some((s) => s.thesisId === e.thesisId && s.lecturerId === lecturerId && s.status === "active"))
      .slice()
      .reverse()
      .map(evaluationView),
  findUsersByActiveRole: async () => [{ id: "kadep" }],
}));

const tx = {
  thesisGuidanceEvaluation: {
    create: async ({ data }) => {
      const row = { id: `eval-${evaluations().length + 1}`, createdAt: new Date(), extensionUntil: null, kadepApprovedBy: null, kadepApprovedAt: null, kadepNotes: null, ...data };
      evaluations().push(row);
      return { id: row.id };
    },
    update: async ({ where, data }) => Object.assign(evaluations().find((e) => e.id === where.id), data),
  },
  thesis: {
    findUnique: async ({ where }) => world.state.theses.find((t) => t.id === where.id) ?? null,
    update: async ({ where, data }) => Object.assign(world.state.theses.find((t) => t.id === where.id), data),
  },
  thesisSupervisors: {
    findMany: async ({ where }) => world.state.supervisors.filter((s) => s.thesisId === where.thesisId && (!where.status || s.status === where.status)),
    updateMany: async ({ where, data }) => {
      const hit = world.state.supervisors.filter((s) => where.id.in.includes(s.id));
      hit.forEach((s) => Object.assign(s, data));
      return { count: hit.length };
    },
  },
  thesisGuidance: {
    updateMany: async ({ where, data }) => {
      const hit = world.state.guidances.filter((g) => g.thesisId === where.thesisId && where.status.in.includes(g.status));
      hit.forEach((g) => Object.assign(g, data));
      return { count: hit.length };
    },
  },
  auditLog: { create: async ({ data }) => world.state.audit.push(data) },
};

vi.mock("../../config/prisma.js", () => ({ default: { $transaction: async (fn) => fn(tx), thesisSupervisors: tx.thesisSupervisors } }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn(async (userIds, payload) => {
    world.notifications.push({ userIds: [...userIds].sort(), title: payload.title, message: payload.message });
    return { count: userIds.length };
  }),
}));

const service = await import("../../services/thesis-guidance-evaluation.service.js");

const STUDENT = "stu-1";
const P1 = "lec-p1";
const P2 = "lec-p2";
const KADEP = "kadep";

function buildState({ startedMonthsAgo = 7 } = {}) {
  return {
    users: { [STUDENT]: "Mahasiswa Uji", [P1]: "Pembimbing Satu", [P2]: "Pembimbing Dua", [KADEP]: "Ketua Departemen" },
    theses: [{
      id: "T1", studentId: STUDENT, status: "research", title: "Judul TA", academicYearId: null,
      startDate: monthsAgo(startedMonthsAgo, 1), totalLeaveDays: 0, createdAt: monthsAgo(startedMonthsAgo, 1),
    }],
    supervisors: [
      { id: "sup-1", thesisId: "T1", lecturerId: P1, roleName: "Pembimbing 1", status: "active", activeRoleKey: "T1:p1" },
      { id: "sup-2", thesisId: "T1", lecturerId: P2, roleName: "Pembimbing 2", status: "active", activeRoleKey: "T1:p2" },
    ],
    seminars: [],
    guidances: [
      { id: "g1", thesisId: "T1", status: "completed", approvedDate: daysAgo(20) },
      { id: "g2", thesisId: "T1", status: "completed", approvedDate: daysAgo(3) },
      { id: "g-open", thesisId: "T1", status: "accepted" },
      { id: "g-summary", thesisId: "T1", status: "summary_pending" },
    ],
    evaluations: [],
    audit: [],
  };
}

const thesis = () => world.state.theses[0];
const submit = (recommendation, extra = {}) => service.submitEvaluation(P1, { thesisId: "T1", recommendation, ...extra });
const guidanceStatus = (id) => world.state.guidances.find((g) => g.id === id).status;

/** Stores an already-decided evaluation, e.g. an extension that ended. */
function addEvaluation(row) {
  evaluations().push({
    id: `eval-${evaluations().length + 1}`, thesisId: "T1", thesisSupervisorId: "sup-1", evaluationType: "six_month", isFollowUp: false,
    recommendation: "continue", status: "approved", notes: null, guidanceCount: 2, supervisionStartedAt: thesis().startDate, elapsedDays: 200,
    extensionUntil: null, kadepApprovedBy: null, kadepApprovedAt: null, kadepNotes: null, createdAt: daysAgo(40), ...row,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  world.state = buildState();
  world.notifications = [];
});

describe("what is due and who may fill it", () => {
  it("six months: Pembimbing 1 may fill, with the basis filled by the system", async () => {
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context).toMatchObject({
      viewerRole: "pembimbing_1",
      stage: "six_month",
      allowedRecommendations: ["continue", "extend_1_month"],
      canSubmit: true,
      blockReason: null,
      openEvaluation: null,
      history: [],
      academicWarning: null,
    });
    expect(context.basis).toMatchObject({ guidanceCount: 2, elapsedLabel: "7 bulan 1 hari", startSemester: "2026/2027 Ganjil", activityLevel: "active" });
  });

  it("Pembimbing 2 and the student only read", async () => {
    for (const [viewer, role] of [[P2, "pembimbing_2"], [STUDENT, "student"]]) {
      const context = await service.getEvaluationContext(viewer, viewer === STUDENT ? null : "T1");
      expect(context).toMatchObject({ viewerRole: role, canSubmit: false, blockReason: "Evaluasi bimbingan diisi oleh Pembimbing 1.", stage: "six_month" });
    }
    await expect(service.submitEvaluation(P2, { thesisId: "T1", recommendation: "continue" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.submitEvaluation(STUDENT, { thesisId: "T1", recommendation: "continue" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.getEvaluationContext("stranger", "T1")).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.getEvaluationContext(KADEP, "T1", { asDepartment: true })).viewerRole).toBe("department");
  });

  it("is not available before six months, and names the date", async () => {
    world.state = buildState({ startedMonthsAgo: 2 });
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context).toMatchObject({ stage: null, canSubmit: false, allowedRecommendations: [] });
    expect(context.blockReason).toMatch(/^Belum waktunya: evaluasi 6 bulan dapat diisi mulai \d+ \w+ \d{4}/);
    await expect(submit("continue")).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([
    ["on leave", () => { thesis().status = "on_leave"; thesis().leaveStartedAt = daysAgo(5); }, "Berhenti Studi Sementara (BSS)"],
    ["after a passed results seminar", () => { world.state.seminars.push({ thesisId: "T1", status: "passed" }); }, "belum lulus seminar hasil"],
  ])("is not available %s", async (_label, arrange, text) => {
    arrange();
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context.canSubmit).toBe(false);
    expect(context.blockReason).toContain(text);
    await expect(submit("continue")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a decision that does not belong to the stage", async () => {
    await expect(submit("terminate_supervision")).rejects.toThrow('Keputusan untuk tahap ini harus "Lanjut Bimbingan" atau "Peringatan dan Perpanjangan 1 Bulan".');
    await expect(submit("continue", { stage: "one_year" })).rejects.toThrow("Tahap evaluasi sudah berubah");
    expect(evaluations()).toHaveLength(0);
  });
});

describe("six-month evaluation", () => {
  it("Lanjut Bimbingan is recorded at once, without the Ketua Departemen", async () => {
    const dto = await submit("continue", { observations: { noProgress: true }, notes: "Kemajuan cukup." });

    expect(dto).toMatchObject({
      evaluationType: "six_month",
      stage: "six_month",
      recommendation: "continue",
      status: "approved",
      requiresKadep: false,
      decision: null,
      observations: { noGuidance: false, noProgress: true, noResponse: false, noRevision: false },
      basis: { guidanceCount: 2 },
    });
    expect(dto.basis.elapsedDays).toBeGreaterThan(200);
    expect((await service.listForDepartment({ scope: "pending" })).data).toHaveLength(0);
    expect((await service.listForDepartment({ scope: "history" })).data).toHaveLength(0);
    // Recorded: the six-month evaluation is no longer due.
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context.stage).toBeNull();
    expect(context.blockReason).toMatch(/Evaluasi untuk tahap ini sudah tercatat\. Evaluasi 1 tahun dapat diisi mulai/);
    expect(world.notifications.map((n) => n.userIds)).toEqual([[P2, STUDENT].sort()]);
  });

  it("warning and extension: waits for the Ketua Departemen, then the extension runs for one month", async () => {
    const dto = await submit("extend_1_month", { observations: { noGuidance: true, noResponse: true }, notes: "Jarang bimbingan." });
    expect(dto).toMatchObject({ status: "pending", requiresKadep: true, extensionUntil: null });
    expect(world.notifications[0]).toMatchObject({ userIds: [KADEP], message: expect.stringContaining("menunggu keputusan Ketua Departemen") });

    // One open evaluation per thesis.
    const waiting = await service.getEvaluationContext(P1, "T1");
    expect(waiting).toMatchObject({ canSubmit: false, blockReason: "Masih ada evaluasi yang menunggu keputusan Ketua Departemen.", openEvaluation: { id: dto.id } });
    await expect(submit("continue")).rejects.toMatchObject({ statusCode: 400 });
    expect((await service.listForDepartment({ scope: "pending" })).data).toHaveLength(1);

    world.notifications = [];
    const before = Date.now();
    const approved = await service.decideAsKadep(KADEP, dto.id, { approve: true, notes: "Setuju." });

    expect(approved).toMatchObject({ status: "approved", decision: { by: { id: KADEP }, notes: "Setuju." } });
    const until = new Date(approved.extensionUntil).getTime();
    expect(until).toBeGreaterThan(before + 27 * DAY);
    expect(until).toBeLessThan(before + 32 * DAY);
    expect(thesis().status).toBe("research");
    // The student receives an academic warning.
    expect(world.notifications[0]).toMatchObject({ userIds: [STUDENT], title: "Peringatan Akademik" });

    const context = await service.getEvaluationContext(STUDENT);
    expect(context.academicWarning).toMatchObject({ followUpDue: false });
    expect(new Date(context.academicWarning.extensionUntil).getTime()).toBe(until);
    expect((await service.getEvaluationContext(P1, "T1")).blockReason).toMatch(/^Belum waktunya: perpanjangan berlaku sampai/);
  });

  it("rejected by the Ketua Departemen: notes required, nothing happens, a new evaluation may be filled", async () => {
    const dto = await submit("extend_1_month");
    await expect(service.decideAsKadep(KADEP, dto.id, { approve: false, notes: " " })).rejects.toThrow("Catatan wajib diisi saat menolak evaluasi.");

    const rejected = await service.decideAsKadep(KADEP, dto.id, { approve: false, notes: "Data bimbingan belum lengkap." });
    expect(rejected).toMatchObject({ status: "rejected", extensionUntil: null, decision: { notes: "Data bimbingan belum lengkap." } });
    expect(thesis().status).toBe("research");
    await expect(service.decideAsKadep(KADEP, dto.id, { approve: true })).rejects.toThrow("Evaluasi ini sudah diputuskan.");

    const context = await service.getEvaluationContext(P1, "T1");
    expect(context).toMatchObject({ stage: "six_month", canSubmit: true, academicWarning: null });
    expect(context.history).toHaveLength(1);
    expect((await service.listForDepartment({ scope: "history" })).data).toHaveLength(1);
  });
});

describe("follow-up after the extension", () => {
  beforeEach(() => {
    addEvaluation({ recommendation: "extend_1_month", extensionUntil: daysAgo(2), kadepApprovedBy: KADEP, kadepApprovedAt: daysAgo(33) });
  });

  it("is due once the extension has ended", async () => {
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context).toMatchObject({
      stage: "extension_follow_up",
      allowedRecommendations: ["continue", "revise_proposal"],
      canSubmit: true,
      academicWarning: { followUpDue: true },
    });
  });

  it("Lanjut Bimbingan closes the follow-up", async () => {
    const dto = await submit("continue");
    expect(dto).toMatchObject({ evaluationType: "six_month", stage: "extension_follow_up", status: "approved" });
    expect((await service.getEvaluationContext(P1, "T1")).stage).toBeNull();
  });

  it("Mengulang Proposal: research -> proposal, sessions cancelled, clock cleared, supervisors and title kept", async () => {
    const dto = await submit("revise_proposal", { notes: "Tidak ada kemajuan setelah perpanjangan." });
    expect(dto).toMatchObject({ status: "pending", stage: "extension_follow_up" });
    await service.decideAsKadep(KADEP, dto.id, { approve: true });

    expect(thesis()).toMatchObject({ status: "proposal", startDate: null, totalLeaveDays: 0, title: "Judul TA" });
    expect(world.state.supervisors.map((s) => s.status)).toEqual(["active", "active"]);
    expect(world.state.guidances.find((g) => g.id === "g-open")).toMatchObject({
      status: "cancelled",
      cancelledBy: "system",
      cancelReason: "Dibatalkan otomatis: mengulang proposal berdasarkan evaluasi bimbingan.",
    });
    expect(guidanceStatus("g-summary")).toBe("cancelled");
    expect(guidanceStatus("g1")).toBe("completed");
    expect(world.state.audit.map((entry) => entry.action)).toContain("THESIS_STATUS_CHANGED");

    // No longer in research: nothing is due and nothing can be filled.
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context).toMatchObject({ stage: null, canSubmit: false, academicWarning: null });
    expect(context.blockReason).toContain('Status saat ini: "Proposal"');
  });
});

describe("one-year evaluation", () => {
  beforeEach(() => { world.state = buildState({ startedMonthsAgo: 13 }); });

  it("is due at twelve months whatever happened at six months", async () => {
    expect(await service.getEvaluationContext(P1, "T1")).toMatchObject({
      stage: "one_year",
      allowedRecommendations: ["continue", "terminate_supervision"],
    });
  });

  it("Lanjut Bimbingan needs notes", async () => {
    await expect(submit("continue")).rejects.toThrow("Catatan wajib diisi untuk melanjutkan bimbingan pada evaluasi 1 tahun.");
    const dto = await submit("continue", { notes: "Tinggal pengujian akhir." });
    expect(dto).toMatchObject({ evaluationType: "one_year", stage: "one_year", status: "approved" });
    expect((await service.getEvaluationContext(P1, "T1")).blockReason).toBe("Evaluasi 1 tahun sudah tercatat.");
  });

  it("Dihentikan: thesis failed with reason supervision_evaluation, supervisors released, open sessions cancelled", async () => {
    const dto = await submit("terminate_supervision", { observations: { noGuidance: true, noProgress: true }, notes: "Tidak ada kemajuan selama setahun." });
    expect(dto.status).toBe("pending");
    // Nothing changes before the decision.
    expect(thesis().status).toBe("research");

    await service.decideAsKadep(KADEP, dto.id, { approve: true, notes: "Disetujui." });

    expect(thesis()).toMatchObject({
      status: "failed",
      terminationReason: "supervision_evaluation",
      terminationNote: "Tidak ada kemajuan selama setahun.",
      terminatedByUserId: KADEP,
    });
    expect(world.state.supervisors.map((s) => [s.status, s.activeRoleKey])).toEqual([["released", null], ["released", null]]);
    expect(guidanceStatus("g-open")).toBe("cancelled");
    expect(guidanceStatus("g-summary")).toBe("cancelled");
    expect(guidanceStatus("g1")).toBe("completed");
    // Everyone concerned is told, including the supervisors who were just released.
    expect(world.notifications.at(-1).userIds).toEqual([P1, P2, STUDENT].sort());
  });

  it("an approval is refused when the thesis left research in the meantime", async () => {
    const dto = await submit("terminate_supervision", { notes: "x" });
    thesis().status = "on_leave";
    await expect(service.decideAsKadep(KADEP, dto.id, { approve: true })).rejects.toThrow("Keputusan evaluasi tidak dapat diterapkan");
  });
});

describe("clock restart", () => {
  it("evaluations made before the clock restarted do not count", async () => {
    // A thesis that repeated its proposal and is back in research since seven months.
    addEvaluation({ recommendation: "continue", createdAt: monthsAgo(20) });
    const context = await service.getEvaluationContext(P1, "T1");
    expect(context.stage).toBe("six_month");
    expect(context.history).toHaveLength(1);
  });
});


describe("Evaluasi page of a supervisor (Paket E4, 4.3)", () => {
  it("lists the due thesis: Pembimbing 1 may fill it, Pembimbing 2 reads with the reason, others see nothing", async () => {
    const p1 = await service.listForSupervisor(P1);
    expect(p1.due).toHaveLength(1);
    expect(p1.due[0]).toMatchObject({ thesis: { id: "T1", title: "Judul TA" }, viewerRole: "pembimbing_1", stage: "six_month", canSubmit: true, blockReason: null });
    expect(p1.due[0].supervision.elapsedLabel).toBe("7 bulan 1 hari");

    const p2 = await service.listForSupervisor(P2);
    expect(p2.due[0]).toMatchObject({ viewerRole: "pembimbing_2", canSubmit: false, blockReason: "Evaluasi bimbingan diisi oleh Pembimbing 1." });

    expect(await service.listForSupervisor("lec-other")).toEqual({ due: [], evaluations: [] });
  });

  it("once filled, the thesis leaves the due list and the evaluation waits for the Ketua Departemen", async () => {
    await submit("extend_1_month", { observations: { noProgress: true } });
    const p1 = await service.listForSupervisor(P1);
    expect(p1.due).toEqual([]);
    expect(p1.evaluations.map((e) => [e.status, e.recommendation, e.stage])).toEqual([["pending", "extend_1_month", "six_month"]]);
  });

  it("a thesis whose seminar is passed is never due", async () => {
    world.state.seminars.push({ thesisId: "T1", status: "passed", updatedAt: daysAgo(1), revisionFinalizedAt: null });
    expect((await service.listForSupervisor(P1)).due).toEqual([]);
  });
});
