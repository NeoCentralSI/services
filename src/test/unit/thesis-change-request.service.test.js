/**
 * E4 — Pengajuan Perubahan Tugas Akhir.
 *
 * The real service runs against a small in-memory world: the repository module and the
 * transaction client are replaced by functions that read and write the same plain rows, so
 * the approval chain, the rules and what an approval applies to the thesis are checked on
 * actual state rather than on mock call counts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const world = vi.hoisted(() => ({ state: null, notifications: [] }));

// ── In-memory world ──────────────────────────────────────────────────────────────────

const ROLE = { P1: "role-p1", P2: "role-p2" };
const ROLE_NAME = { [ROLE.P1]: "Pembimbing 1", [ROLE.P2]: "Pembimbing 2" };
const user = (id) => ({ id, fullName: world.state.users[id]?.fullName ?? id, identityNumber: `ID-${id}` });

function thesisView(thesis) {
  if (!thesis) return null;
  return {
    ...thesis,
    thesisTopic: thesis.thesisTopicId ? { id: thesis.thesisTopicId, name: `Topik ${thesis.thesisTopicId}` } : null,
    student: { id: thesis.studentId, user: user(thesis.studentId) },
    thesisSeminars: world.state.seminars.filter((s) => s.thesisId === thesis.id),
    thesisDefences: world.state.defences.filter((d) => d.thesisId === thesis.id),
    thesisSupervisors: world.state.supervisors
      .filter((s) => s.thesisId === thesis.id && s.status === "active")
      .map((s) => ({ ...s, role: { id: s.roleId, name: ROLE_NAME[s.roleId] }, lecturer: { user: user(s.lecturerId) } })),
  };
}

function requestView(request) {
  if (!request) return null;
  return {
    ...request,
    thesis: thesisView(world.state.theses.find((t) => t.id === request.thesisId)),
    newTopic: request.newTopicId ? { id: request.newTopicId, name: `Topik ${request.newTopicId}` } : null,
    newSupervisor: request.newSupervisorId ? { id: request.newSupervisorId, user: user(request.newSupervisorId) } : null,
    replacedSupervisor: request.replacedSupervisorLecturerId
      ? { id: request.replacedSupervisorLecturerId, user: user(request.replacedSupervisorLecturerId) }
      : null,
    requestedBy: request.requestedByUserId ? user(request.requestedByUserId) : null,
    decidedBy: request.decidedByUserId ? user(request.decidedByUserId) : null,
    approvals: world.state.approvals
      .filter((a) => a.requestId === request.id)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((a) => ({ ...a, lecturer: { id: a.lecturerId, user: user(a.lecturerId) } })),
  };
}

const requests = () => world.state.requests;
const isPending = (r) => r.status === "pending";

vi.mock("../../repositories/thesis-change-request.repository.js", () => ({
  findById: async (id) => requestView(requests().find((r) => r.id === id)),
  findOpenByThesisId: async (thesisId) => requestView(requests().find((r) => r.thesisId === thesisId && isPending(r))),
  findByThesisId: async (thesisId) => requests().filter((r) => r.thesisId === thesisId).reverse().map(requestView),
  // The Kadep's batch view (Tugas Akhir > Perubahan) reads by status and batch.
  findPage: async (where, _orderBy, { skip, take }) => {
    const rows = requests()
      .filter((r) => (!where.status || r.status === where.status) && (!where.batchId || r.batchId === where.batchId))
      .map(requestView);
    return { rows: rows.slice(skip, skip + take), total: rows.length };
  },
  countWhere: async () => requests().filter(isPending).length,
  findIdsAtLecturerStep: async (lecturerId) =>
    requests()
      .filter((r) => isPending(r) && world.state.approvals.filter((a) => a.requestId === r.id).sort((a, b) => a.stepOrder - b.stepOrder).find((a) => a.status === "pending")?.lecturerId === lecturerId)
      .map((r) => r.id),
  findPendingByBatchId: async (batchId) => requests().filter((r) => r.batchId === batchId && isPending(r)).map(requestView),
  countPending: async () => requests().filter(isPending).length,
  findThesisForChange: async (thesisId) => thesisView(world.state.theses.find((t) => t.id === thesisId)),
  findStudentThesisId: async (studentId) => world.state.theses.find((t) => t.studentId === studentId)?.id ?? null,
  findUsersWithRole: async (roleName) =>
    Object.entries(world.state.users)
      .filter(([, u]) => u.roles.includes(roleName))
      .map(([id, u]) => ({ id, fullName: u.fullName, identityNumber: `ID-${id}` })),
  userHasActiveRole: async (userId, roleName) => !!world.state.users[userId]?.roles.includes(roleName),
  getSupervisorLoad: async (lecturerId) => ({
    activeCount: world.state.supervisors.filter((s) => s.lecturerId === lecturerId && s.status === "active").length,
    quotaMax: world.state.users[lecturerId]?.quotaMax ?? null,
  }),
  getSupervisorLoads: async (lecturerIds) =>
    new Map(lecturerIds.map((id) => [id, {
      activeCount: world.state.supervisors.filter((s) => s.lecturerId === id && s.status === "active").length,
      quotaMax: world.state.users[id]?.quotaMax ?? 10,
    }])),
}));

const tx = {
  thesisChangeRequest: {
    create: async ({ data }) => {
      const { approvals, ...columns } = data;
      const row = { id: `req-${requests().length + 1}`, status: "pending", createdAt: new Date(), ...columns };
      requests().push(row);
      for (const approval of approvals.create) {
        world.state.approvals.push({ id: `apr-${world.state.approvals.length + 1}`, requestId: row.id, status: "pending", notes: null, ...approval });
      }
      return { id: row.id };
    },
    update: async ({ where, data }) => Object.assign(requests().find((r) => r.id === where.id), data),
  },
  thesisChangeRequestApproval: {
    update: async ({ where, data }) => Object.assign(world.state.approvals.find((a) => a.id === where.id), data),
  },
  auditLog: { create: async ({ data }) => world.state.audit.push(data) },
  thesisTopic: { findUnique: async ({ where }) => (world.state.topics.includes(where.id) ? { id: where.id } : null) },
  lecturer: { findUnique: async ({ where }) => (world.state.users[where.id]?.lecturer ? { id: where.id } : null) },
  userRole: { findMany: async () => [{ id: ROLE.P1, name: "Pembimbing 1" }, { id: ROLE.P2, name: "Pembimbing 2" }] },
  thesis: { update: async ({ where, data }) => Object.assign(world.state.theses.find((t) => t.id === where.id), data) },
  thesisSupervisors: {
    updateMany: async ({ where, data }) => {
      const hit = world.state.supervisors.filter((s) => where.id.in.includes(s.id));
      hit.forEach((s) => Object.assign(s, data));
      return { count: hit.length };
    },
    create: async ({ data }) => {
      const row = { id: `sup-${world.state.supervisors.length + 1}`, status: "active", ...data };
      world.state.supervisors.push(row);
      return row;
    },
  },
  thesisGuidance: {
    updateMany: async ({ where, data }) => {
      const hit = world.state.guidances.filter(
        (g) => g.thesisId === where.thesisId && where.supervisorId.in.includes(g.supervisorId) && where.status.in.includes(g.status),
      );
      hit.forEach((g) => Object.assign(g, data));
      return { count: hit.length };
    },
  },
};

vi.mock("../../config/prisma.js", () => ({ default: { $transaction: async (fn) => fn(tx) } }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn(async (userIds, payload) => {
    world.notifications.push({ userIds: [...userIds].sort(), title: payload.title, message: payload.message });
    return { count: userIds.length };
  }),
}));

const service = await import("../../services/thesis-change-request.service.js");

// People: one student per thesis, lecturers with their supervisor roles.
const STUDENT = "stu-1";
const HUSNIL = "lec-husnil"; // Pembimbing 1 of T1
const AFRI = "lec-afri"; // Pembimbing 2 of T1
const AINA = "lec-aina"; // may be Pembimbing 1 or 2
const ULLYA = "lec-ullya"; // Pembimbing 2 only
const KADEP = "kadep";

function buildState() {
  const lecturerRoles = ["Pembimbing 1", "Pembimbing 2"];
  return {
    users: {
      [STUDENT]: { fullName: "Mahasiswa Satu", roles: ["Mahasiswa"] },
      "stu-2": { fullName: "Mahasiswa Dua", roles: ["Mahasiswa"] },
      "stu-3": { fullName: "Mahasiswa Tiga", roles: ["Mahasiswa"] },
      [HUSNIL]: { fullName: "Husnil", roles: lecturerRoles, lecturer: true },
      [AFRI]: { fullName: "Afriyanti", roles: lecturerRoles, lecturer: true },
      [AINA]: { fullName: "Aina", roles: lecturerRoles, lecturer: true, quotaMax: 1 },
      [ULLYA]: { fullName: "Ullya", roles: ["Pembimbing 2"], lecturer: true },
      [KADEP]: { fullName: "Ketua Departemen", roles: ["Ketua Departemen"], lecturer: true },
    },
    topics: ["topic-a", "topic-b"],
    theses: [
      { id: "T1", studentId: STUDENT, status: "research", title: "Judul Lama", thesisTopicId: "topic-a", academicYearId: "ay-1", startDate: new Date("2026-01-01") },
      { id: "T2", studentId: "stu-2", status: "research", title: "Judul Dua", thesisTopicId: "topic-a", academicYearId: "ay-1" },
      { id: "T3", studentId: "stu-3", status: "research", title: "Judul Tiga", thesisTopicId: "topic-a", academicYearId: "ay-1" },
    ],
    supervisors: [
      { id: "sup-1", thesisId: "T1", lecturerId: HUSNIL, roleId: ROLE.P1, status: "active", activeRoleKey: "T1:role-p1", seminarReady: true },
      { id: "sup-2", thesisId: "T1", lecturerId: AFRI, roleId: ROLE.P2, status: "active", activeRoleKey: "T1:role-p2" },
      { id: "sup-3", thesisId: "T2", lecturerId: HUSNIL, roleId: ROLE.P1, status: "active", activeRoleKey: "T2:role-p1" },
      { id: "sup-4", thesisId: "T3", lecturerId: HUSNIL, roleId: ROLE.P1, status: "active", activeRoleKey: "T3:role-p1" },
    ],
    seminars: [],
    defences: [],
    guidances: [
      { id: "g-requested", thesisId: "T1", supervisorId: HUSNIL, status: "requested" },
      { id: "g-accepted", thesisId: "T1", supervisorId: HUSNIL, status: "accepted" },
      { id: "g-summary", thesisId: "T1", supervisorId: HUSNIL, status: "summary_pending" },
      { id: "g-completed", thesisId: "T1", supervisorId: HUSNIL, status: "completed" },
      { id: "g-p2-requested", thesisId: "T1", supervisorId: AFRI, status: "requested" },
    ],
    requests: [],
    approvals: [],
    audit: [],
  };
}

const REASON = "Alasan perubahan yang cukup panjang.";
const titleRequest = (extra = {}) => ({ requestType: "title", reason: REASON, newTitle: "Judul Baru", ...extra });
const supervisorRequest = (extra = {}) => ({ requestType: "supervisor", reason: REASON, supervisorRole: "pembimbing_1", newSupervisorId: AINA, ...extra });

const thesis = (id) => world.state.theses.find((t) => t.id === id);
const activeSupervisors = (thesisId) =>
  world.state.supervisors
    .filter((s) => s.thesisId === thesisId && s.status === "active")
    .map((s) => [ROLE_NAME[s.roleId], s.lecturerId])
    .sort();
const guidanceStatus = (id) => world.state.guidances.find((g) => g.id === id).status;
const stepKeys = (dto) => dto.steps.map((step) => `${step.key}:${step.status}`);

beforeEach(() => {
  vi.clearAllMocks();
  world.state = buildState();
  world.notifications = [];
});

describe("who may ask, and when", () => {
  it("lets the student ask and tells why the button is disabled otherwise", async () => {
    expect(await service.getThesisChangeContext(STUDENT)).toMatchObject({
      viewerRole: "student",
      canSubmit: true,
      blockReason: null,
      openRequest: null,
      history: [],
      thesis: { id: "T1", supervisors: [{ lecturerId: HUSNIL, position: "pembimbing_1" }, { lecturerId: AFRI, position: "pembimbing_2" }] },
    });

    thesis("T1").status = "on_leave";
    expect((await service.getThesisChangeContext(STUDENT)).blockReason).toContain("Berhenti Studi Sementara (BSS)");
  });

  it.each(["registered", "verified", "examiner_assigned", "scheduled", "passed", "passed_with_revision"])(
    "closes a supervisor change once the results seminar is %s (K8, kept by K34)",
    async (status) => {
      world.state.seminars.push({ id: "sem-1", thesisId: "T1", status });
      const context = await service.getThesisChangeContext(STUDENT);
      expect(context.typeBlocks.supervisor).toContain("sebelum pendaftaran seminar hasil");
      expect(context.typeBlocks.both).toContain("sebelum pendaftaran seminar hasil");
      await expect(service.submitRequest(STUDENT, supervisorRequest())).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it.each(["failed", "cancelled"])("stays open after a %s seminar", async (status) => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status });
    expect((await service.getThesisChangeContext(STUDENT)).canSubmit).toBe(true);
  });
});

describe("K34 (Paket E6): a title-only change by stage", () => {
  const blocksOf = async () => (await service.getThesisChangeContext(STUDENT)).typeBlocks;
  const SEMINAR_IN_PROCESS = "Perubahan judul tidak dapat diajukan selama seminar hasil sedang berproses.";
  const DEFENCE_IN_PROCESS = "Perubahan judul tidak dapat diajukan selama sidang tugas akhir sedang berproses.";

  it("before the seminar: every kind is open", async () => {
    expect(await blocksOf()).toEqual({ title: null, supervisor: null, both: null });
  });

  it.each(["registered", "verified", "examiner_assigned", "scheduled"])("seminar in process (%s): the title waits", async (status) => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status });
    const blocks = await blocksOf();
    expect(blocks.title).toBe(SEMINAR_IN_PROCESS);
    expect(blocks.supervisor).toContain("sebelum pendaftaran seminar hasil");
    const context = await service.getThesisChangeContext(STUDENT);
    expect(context.canSubmit).toBe(false);
    expect(context.blockReason).toContain(SEMINAR_IN_PROCESS);
    await expect(service.submitRequest(STUDENT, titleRequest())).rejects.toThrow(SEMINAR_IN_PROCESS);
  });

  it.each(["passed", "passed_with_revision"])("after the seminar (%s): the title may change, the supervisors may not", async (status) => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status });
    const blocks = await blocksOf();
    expect(blocks.title).toBeNull();
    expect(blocks.supervisor).not.toBeNull();
    expect(blocks.both).not.toBeNull();
    expect((await service.getThesisChangeContext(STUDENT)).canSubmit).toBe(true);
    // Pembimbing 1 -> Ketua Departemen, as before.
    const created = await service.submitRequest(STUDENT, titleRequest({ newTitle: "Judul Setelah Seminar" }));
    expect(stepKeys(created)).toEqual(["main_supervisor:pending", "kadep:pending"]);
    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });
    await service.decideAsKadep(KADEP, created.id, { approve: true });
    expect(thesis("T1").title).toBe("Judul Setelah Seminar");
  });

  it.each(["registered", "verified", "examiner_assigned", "scheduled"])("defence in process (%s): the title waits", async (status) => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "passed" });
    world.state.defences.push({ id: "def-1", thesisId: "T1", status });
    expect((await blocksOf()).title).toBe(DEFENCE_IN_PROCESS);
    await expect(service.submitRequest(STUDENT, titleRequest())).rejects.toThrow(DEFENCE_IN_PROCESS);
  });

  it.each(["passed", "passed_with_revision", "failed"])("after the defence result (%s), while still in research: the title may change", async (status) => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "passed" });
    world.state.defences.push({ id: "def-1", thesisId: "T1", status });
    expect((await blocksOf()).title).toBeNull();
    await expect(service.submitRequest(STUDENT, titleRequest())).resolves.toMatchObject({ requestType: "title" });
  });

  it("a completed thesis: nothing may change", async () => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "passed" });
    world.state.defences.push({ id: "def-1", thesisId: "T1", status: "passed" });
    thesis("T1").status = "completed";
    const blocks = await blocksOf();
    expect(Object.values(blocks).every((reason) => reason?.includes("berstatus \"Penelitian\""))).toBe(true);
    await expect(service.submitRequest(STUDENT, titleRequest())).rejects.toMatchObject({ statusCode: 400 });
  });

  it("Paket E6: a title request sent before the seminar cannot be approved once the seminar is registered; it stays pending", async () => {
    const created = await service.submitRequest(STUDENT, titleRequest());
    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "registered" });

    await expect(service.decideAsKadep(KADEP, created.id, { approve: true })).rejects.toThrow(SEMINAR_IN_PROCESS);
    const open = (await service.getThesisChangeContext(STUDENT)).openRequest;
    expect(open).toMatchObject({ id: created.id, status: "pending" });
    expect(open.applyBlockReason).toContain(SEMINAR_IN_PROCESS);
    expect(thesis("T1").title).toBe("Judul Lama");
    // The Ketua Departemen can still reject it.
    await expect(service.decideAsKadep(KADEP, created.id, { approve: false, notes: "Seminar sudah didaftarkan." })).resolves.toMatchObject({ status: "rejected" });
  });

  it("Paket E6 (lanjutan): Pembimbing 1 cannot approve a title step once the seminar is registered, but may reject it", async () => {
    const created = await service.submitRequest(STUDENT, titleRequest());
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "scheduled" });

    await expect(service.decideAsLecturer(HUSNIL, created.id, { approve: true })).rejects.toThrow(SEMINAR_IN_PROCESS);
    const approval = world.state.approvals.find((a) => a.requestId === created.id);
    expect(approval.status).toBe("pending");
    expect(world.state.requests.find((r) => r.id === created.id).status).toBe("pending");

    const rejected = await service.decideAsLecturer(HUSNIL, created.id, { approve: false, notes: "Seminar sudah dijadwalkan." });
    expect(rejected).toMatchObject({ status: "rejected" });
  });

  it("Paket E6 (lanjutan): the previous supervisor cannot approve a supervisor step once the seminar is registered", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest());
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "registered" });

    await expect(service.decideAsLecturer(HUSNIL, created.id, { approve: true })).rejects.toThrow(/Perubahan pembimbing hanya dapat diajukan sampai sebelum pendaftaran seminar hasil/);
    expect(world.state.approvals.filter((a) => a.requestId === created.id).map((a) => a.status)).toEqual(["pending", "pending"]);
    // Only the step's own lecturer is told about the rule; others still get 403.
    await expect(service.decideAsLecturer(AINA, created.id, { approve: true })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("Paket E6: a supervisor request sent before the seminar cannot be approved once the seminar is registered", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest());
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "verified" });

    await expect(service.decideAsKadep(KADEP, created.id, { approve: true, notes: "Langsung" })).rejects.toThrow(/Perubahan pembimbing hanya dapat diajukan sampai sebelum pendaftaran seminar hasil/);
    expect(world.state.requests.find((r) => r.id === created.id).status).toBe("pending");
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", HUSNIL], ["Pembimbing 2", AFRI]]);
  });

  it("Paket E6: a defence registered after a title request blocks its approval too", async () => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "passed" });
    const created = await service.submitRequest(STUDENT, titleRequest());
    world.state.defences.push({ id: "def-1", thesisId: "T1", status: "registered" });
    await expect(service.decideAsKadep(KADEP, created.id, { approve: true, notes: "Langsung" })).rejects.toThrow(DEFENCE_IN_PROCESS);
  });

  it("an open request blocks every kind", async () => {
    world.state.seminars.push({ id: "sem-1", thesisId: "T1", status: "passed" });
    await service.submitRequest(STUDENT, titleRequest());
    const blocks = await blocksOf();
    expect(Object.values(blocks).every((reason) => reason?.includes("Masih ada pengajuan perubahan yang berjalan") || reason?.includes("seminar hasil"))).toBe(true);
    expect(blocks.title).toContain("Masih ada pengajuan perubahan yang berjalan");
  });

  it("allows one open request per thesis", async () => {
    await service.submitRequest(STUDENT, titleRequest());
    const context = await service.getThesisChangeContext(STUDENT);
    expect(context.canSubmit).toBe(false);
    expect(context.blockReason).toContain("Masih ada pengajuan perubahan yang berjalan");
    await expect(service.submitRequest(STUDENT, titleRequest({ newTitle: "Lain" }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects strangers, and lets Pembimbing 2 only hand over their own position", async () => {
    await expect(service.submitRequest("stu-2", titleRequest({ thesisId: "T1" }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.submitRequest(AINA, titleRequest({ thesisId: "T1" }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.submitRequest(AFRI, titleRequest({ thesisId: "T1" }))).rejects.toMatchObject({ statusCode: 403 });
    // Paket E5 (3.3): "Alihkan" is a bulk action of the Mahasiswa Bimbingan table.
    expect((await service.getThesisChangeContext(AFRI, "T1")).blockReason).toContain("aksi Alihkan di tabel Mahasiswa Bimbingan");
    await expect(service.getThesisChangeContext(AINA, "T1")).rejects.toMatchObject({ statusCode: 403 });

    const handover = await service.submitRequest(AFRI, supervisorRequest({ thesisId: "T1", supervisorRole: "pembimbing_2", newSupervisorId: ULLYA }));
    expect(handover.supervisor).toMatchObject({ position: "pembimbing_2", replaced: { id: AFRI }, next: { id: ULLYA } });
  });

  it("validates the content of a request", async () => {
    const submit = (input) => service.submitRequest(STUDENT, input);
    await expect(submit(titleRequest({ newTitle: "Judul Lama" }))).rejects.toThrow("Judul baru sama dengan judul saat ini.");
    await expect(submit(titleRequest({ newTopicId: "topic-x" }))).rejects.toThrow("Topik tugas akhir tidak ditemukan.");
    await expect(submit(supervisorRequest({ newSupervisorId: HUSNIL }))).rejects.toThrow("sudah menjadi Pembimbing 1");
    await expect(submit(supervisorRequest({ newSupervisorId: ULLYA }))).rejects.toThrow("tidak memiliki peran Pembimbing 1");
    await expect(submit(supervisorRequest({ supervisorRole: "pembimbing_2", newSupervisorId: HUSNIL }))).rejects.toThrow(
      "Pembimbing 1 tidak dapat dipindahkan menjadi Pembimbing 2",
    );
    await expect(submit(supervisorRequest({ newSupervisorId: STUDENT }))).rejects.toThrow("Dosen yang dipilih tidak ditemukan.");
    expect(world.state.requests).toHaveLength(0);
  });
});

describe("approval chain", () => {
  it("title only: Pembimbing 1 -> Ketua Departemen, Pembimbing 2 is informed", async () => {
    const created = await service.submitRequest(STUDENT, titleRequest({ newTopicId: "topic-b" }));

    expect(stepKeys(created)).toEqual(["main_supervisor:pending", "kadep:pending"]);
    expect(created).toMatchObject({
      currentStep: "main_supervisor",
      requestedByStudent: true,
      title: { previous: "Judul Lama", next: "Judul Baru", newTopic: { id: "topic-b" } },
      supervisor: null,
      viewer: { canCancel: true, canDecideAsLecturer: false },
    });
    expect(world.notifications).toEqual([
      expect.objectContaining({ userIds: [HUSNIL], message: expect.stringContaining("menunggu persetujuan Anda") }),
      expect.objectContaining({ userIds: [AFRI], message: expect.stringContaining("telah diajukan") }),
    ]);

    // Not the step owner.
    await expect(service.decideAsLecturer(AFRI, created.id, { approve: true })).rejects.toMatchObject({ statusCode: 403 });

    world.notifications = [];
    const afterP1 = await service.decideAsLecturer(HUSNIL, created.id, { approve: true, notes: "Setuju" });
    expect(afterP1.currentStep).toBe("kadep");
    expect(world.notifications[0]).toMatchObject({ userIds: [KADEP], message: expect.stringContaining("menunggu keputusan Ketua Departemen") });
    // Nothing is applied before the Ketua Departemen decides.
    expect(thesis("T1")).toMatchObject({ title: "Judul Lama", thesisTopicId: "topic-a" });

    const approved = await service.decideAsKadep(KADEP, created.id, { approve: true });
    expect(approved.status).toBe("approved");
    expect(stepKeys(approved)).toEqual(["main_supervisor:approved", "kadep:approved"]);
    expect(approved.appliedAt).toBeInstanceOf(Date);
    expect(thesis("T1")).toMatchObject({ title: "Judul Baru", thesisTopicId: "topic-b", startDate: new Date("2026-01-01") });
    // Supervisors and their sessions are untouched by a title change.
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", HUSNIL], ["Pembimbing 2", AFRI]]);
    expect(guidanceStatus("g-requested")).toBe("requested");
    expect(world.state.audit.map((entry) => entry.action)).toEqual([
      "CHANGE_REQUEST_CREATED",
      "CHANGE_REQUEST_REVIEWED",
      "CHANGE_REQUEST_APPROVED",
    ]);
  });

  it("replace Pembimbing 1 with Pembimbing 2 moving up: previous -> new -> Ketua Departemen", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest({ newSupervisorId: AFRI }));
    expect(stepKeys(created)).toEqual(["previous_supervisor:pending", "new_supervisor:pending", "kadep:pending"]);
    expect(created.steps[0].lecturer.id).toBe(HUSNIL);
    expect(created.steps[1].lecturer.id).toBe(AFRI);

    // The new supervisor cannot act before the previous supervisor.
    await expect(service.decideAsLecturer(AFRI, created.id, { approve: true })).rejects.toMatchObject({ statusCode: 403 });
    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });
    // Paket E5: the new supervisor's step is "Menunggu Persetujuan Anda" in Permohonan, with their load.
    const forNew = await service.toLecturerStepRow(requestView(world.state.requests.find((r) => r.id === created.id)), AFRI);
    expect(forNew).toMatchObject({ viewStatus: "awaiting_me", viewer: { canDecideAsLecturer: true } });
    expect(forNew.newSupervisorLoad).toEqual({ activeCount: 1, quotaMax: 10, isFull: false });
    await service.decideAsLecturer(AFRI, created.id, { approve: true });

    await service.decideAsKadep(KADEP, created.id, { approve: true });

    // Afriyanti is Pembimbing 1 now; her Pembimbing 2 relation ended, so that position is empty.
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", AFRI]]);
    const rows = world.state.supervisors.filter((s) => s.thesisId === "T1");
    expect(rows.find((s) => s.id === "sup-1")).toMatchObject({ status: "released", activeRoleKey: null });
    expect(rows.find((s) => s.id === "sup-2")).toMatchObject({ status: "released", activeRoleKey: null });
    expect(rows.at(-1)).toMatchObject({ lecturerId: AFRI, roleId: ROLE.P1, status: "active", activeRoleKey: "T1:role-p1", seminarReady: false, defenceReady: false });

    // Open sessions of the released supervisor are cancelled by the system; the rest stay.
    expect(world.state.guidances.find((g) => g.id === "g-requested")).toMatchObject({
      status: "cancelled",
      cancelledBy: "system",
      cancelReason: expect.stringContaining("pembimbing diganti"),
    });
    expect(guidanceStatus("g-accepted")).toBe("cancelled");
    expect(guidanceStatus("g-summary")).toBe("summary_pending");
    expect(guidanceStatus("g-completed")).toBe("completed");
    // Afriyanti still supervises the thesis, so her own session is kept.
    expect(guidanceStatus("g-p2-requested")).toBe("requested");
    // The supervision clock is not restarted.
    expect(thesis("T1").startDate).toEqual(new Date("2026-01-01"));
  });

  it("add Pembimbing 2: Pembimbing 1 -> new -> Ketua Departemen", async () => {
    const created = await service.submitRequest("stu-2", supervisorRequest({ supervisorRole: "pembimbing_2", newSupervisorId: ULLYA }));
    expect(stepKeys(created)).toEqual(["main_supervisor:pending", "new_supervisor:pending", "kadep:pending"]);
    expect(created.supervisor).toMatchObject({ position: "pembimbing_2", replaced: null, next: { id: ULLYA } });

    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });
    await service.decideAsLecturer(ULLYA, created.id, { approve: true });
    await service.decideAsKadep(KADEP, created.id, { approve: true });

    expect(activeSupervisors("T2")).toEqual([["Pembimbing 1", HUSNIL], ["Pembimbing 2", ULLYA]]);
    // Nobody was released, so no session is cancelled.
    expect(world.state.guidances.filter((g) => g.status === "cancelled")).toHaveLength(0);
  });

  it("title and supervisor: same chain as the supervisor change, both applied together", async () => {
    const created = await service.submitRequest(
      STUDENT,
      { requestType: "both", reason: REASON, newTitle: "Judul Baru", supervisorRole: "pembimbing_2", newSupervisorId: ULLYA },
    );
    expect(stepKeys(created)).toEqual(["previous_supervisor:pending", "new_supervisor:pending", "kadep:pending"]);
    // Pembimbing 1 has no step here and is informed.
    expect(world.notifications.at(-1)).toMatchObject({ userIds: [HUSNIL] });

    await service.decideAsLecturer(AFRI, created.id, { approve: true });
    await service.decideAsLecturer(ULLYA, created.id, { approve: true });
    await service.decideAsKadep(KADEP, created.id, { approve: true });

    expect(thesis("T1").title).toBe("Judul Baru");
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", HUSNIL], ["Pembimbing 2", ULLYA]]);
    expect(guidanceStatus("g-p2-requested")).toBe("cancelled");
    expect(guidanceStatus("g-requested")).toBe("requested");
  });

  it("approves the requester's own step on submission", async () => {
    const created = await service.submitRequest(HUSNIL, titleRequest({ thesisId: "T1" }));
    expect(stepKeys(created)).toEqual(["main_supervisor:approved", "kadep:pending"]);
    expect(created).toMatchObject({ currentStep: "kadep", requestedByStudent: false });
    expect(created.steps[0].notes).toContain("langkah milik pengaju");
    // Waiting for the Ketua Departemen right away; the student is informed.
    expect(world.notifications.map((n) => n.userIds)).toEqual([[KADEP], [AFRI, STUDENT].sort()]);
  });

  it("a rejection at any step closes the request and needs a reason", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest());
    await expect(service.decideAsLecturer(HUSNIL, created.id, { approve: false, notes: "  " })).rejects.toThrow("Alasan penolakan wajib diisi.");
    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });

    const rejected = await service.decideAsLecturer(AINA, created.id, { approve: false, notes: "Beban bimbingan penuh" });
    expect(rejected).toMatchObject({ status: "rejected", currentStep: null, decision: { by: { id: AINA }, notes: "Beban bimbingan penuh" } });
    expect(rejected.steps.map((step) => [step.key, step.status, step.skipped])).toEqual([
      ["previous_supervisor", "approved", false],
      ["new_supervisor", "rejected", false],
      ["kadep", "pending", true],
    ]);
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", HUSNIL], ["Pembimbing 2", AFRI]]);
    await expect(service.decideAsKadep(KADEP, created.id, { approve: true })).rejects.toThrow("sudah ditutup");
    // A new request can be made afterwards.
    expect((await service.getThesisChangeContext(STUDENT)).canSubmit).toBe(true);
  });

  it("the requester may cancel until the Ketua Departemen decides; nobody else may", async () => {
    const created = await service.submitRequest(STUDENT, titleRequest());
    await expect(service.cancelRequest(HUSNIL, created.id)).rejects.toMatchObject({ statusCode: 403 });
    await service.decideAsLecturer(HUSNIL, created.id, { approve: true });

    const cancelled = await service.cancelRequest(STUDENT, created.id);
    expect(cancelled).toMatchObject({ status: "cancelled", viewer: { canCancel: false } });
    expect(thesis("T1").title).toBe("Judul Lama");
    await expect(service.cancelRequest(STUDENT, created.id)).rejects.toThrow("sudah ditutup");
    expect(world.state.audit.at(-1).action).toBe("CHANGE_REQUEST_CANCELLED");
  });
});

describe("Ketua Departemen", () => {
  it("may decide directly while lecturer steps are open, with a reason", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest());
    await expect(service.decideAsKadep(KADEP, created.id, { approve: true })).rejects.toThrow(
      "Langkah persetujuan dosen belum selesai. Alasan wajib diisi untuk memutuskan langsung.",
    );

    const approved = await service.decideAsKadep(KADEP, created.id, { approve: true, notes: "Pembimbing sebelumnya sedang tugas belajar." });
    expect(approved.status).toBe("approved");
    expect(approved.steps.map((step) => [step.key, step.status, step.skipped])).toEqual([
      ["previous_supervisor", "pending", true],
      ["new_supervisor", "pending", true],
      ["kadep", "approved", false],
    ]);
    expect(approved.steps.at(-1).notes).toBe("Pembimbing sebelumnya sedang tugas belajar.");
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", AINA], ["Pembimbing 2", AFRI]]);
  });

  it("must give a reason to reject, and a rejection changes nothing", async () => {
    const created = await service.submitRequest(HUSNIL, titleRequest({ thesisId: "T1" }));
    await expect(service.decideAsKadep(KADEP, created.id, { approve: false })).rejects.toThrow("Alasan penolakan wajib diisi.");

    const rejected = await service.decideAsKadep(KADEP, created.id, { approve: false, notes: "Judul terlalu luas" });
    expect(stepKeys(rejected)).toEqual(["main_supervisor:approved", "kadep:rejected"]);
    expect(rejected.appliedAt).toBeNull();
    expect(thesis("T1").title).toBe("Judul Lama");
  });

  it("refuses to apply a supervisor change when the supervisors changed after submission", async () => {
    const created = await service.submitRequest(STUDENT, supervisorRequest());
    // Pembimbing 1 was replaced through another path in the meantime.
    Object.assign(world.state.supervisors.find((s) => s.id === "sup-1"), { status: "released", activeRoleKey: null });
    world.state.supervisors.push({ id: "sup-x", thesisId: "T1", lecturerId: KADEP, roleId: ROLE.P1, status: "active" });

    await expect(service.decideAsKadep(KADEP, created.id, { approve: true, notes: "Langsung" })).rejects.toThrow(
      "Susunan pembimbing sudah berubah sejak pengajuan dibuat",
    );
  });

  it("sees an Alihkan batch with the new supervisor's load, and decides it", async () => {
    world.state.supervisors.push({ id: "sup-aina", thesisId: "T3", lecturerId: AINA, roleId: ROLE.P2, status: "active" });
    const { batchId, requests: created } = await service.submitTransfer(HUSNIL, { thesisIds: ["T1"], newSupervisorId: AINA, reason: REASON });

    // Tugas Akhir > Perubahan, the batch modal (Paket E5): read through the Kadep's inbox.
    const batch = await service.listInbox(KADEP, { batchId });
    expect(batch.meta).toMatchObject({ total: 1, page: 1 });
    // Aina's quota is 1 and she already supervises one thesis: full, but not blocked.
    expect(batch.data[0]).toMatchObject({ id: created[0].id, viewStatus: "in_progress", newSupervisorLoad: { activeCount: 1, quotaMax: 1, isFull: true } });
    expect(await service.countPending()).toBe(1);

    await service.decideAsKadep(KADEP, created[0].id, { approve: false, notes: "Kuota penuh" });
    expect((await service.listInbox(KADEP, { batchId })).data).toHaveLength(0);
    expect(world.state.requests[0]).toMatchObject({ id: created[0].id, status: "rejected" });
  });
});

describe("Alihkan Mahasiswa", () => {
  const transfer = (thesisIds, extra = {}) =>
    service.submitTransfer(HUSNIL, { thesisIds, newSupervisorId: AINA, reason: REASON, ...extra });

  it("creates one request per student with one batch id, the requester's step already approved", async () => {
    const { batchId, requests: created } = await transfer(["T1", "T2", "T3"]);

    expect(created).toHaveLength(3);
    expect(new Set(world.state.requests.map((r) => r.batchId))).toEqual(new Set([batchId]));
    for (const dto of created) {
      expect(stepKeys(dto)).toEqual(["previous_supervisor:approved", "new_supervisor:pending", "kadep:pending"]);
      expect(dto.supervisor).toMatchObject({ position: "pembimbing_1", replaced: { id: HUSNIL }, next: { id: AINA } });
    }
    // Permohonan: the target lecturer's steps wait for her; the requester (whose own step was
    // approved on submission) does not see the batch there (Paket E6).
    const forAina = await Promise.all(world.state.requests.map((r) => service.toLecturerStepRow(requestView(r), AINA)));
    expect(forAina.map((row) => row.viewStatus)).toEqual(["awaiting_me", "awaiting_me", "awaiting_me"]);
    const husnil = await service.lecturerStepFilters(HUSNIL);
    expect(husnil.in_progress.AND[1]).toEqual({ approvals: { some: { lecturerId: HUSNIL } }, NOT: { requestedByUserId: HUSNIL } });
    expect(husnil.awaiting_me).toEqual({ id: { in: [] } });
  });

  it("one student rejected by the target lecturer; the Ketua Departemen decides the rest together", async () => {
    const { batchId, requests: created } = await transfer(["T1", "T2", "T3"]);
    await service.decideAsLecturer(AINA, created[0].id, { approve: true });
    await service.decideAsLecturer(AINA, created[1].id, { approve: false, notes: "Topik di luar bidang saya" });
    await service.decideAsLecturer(AINA, created[2].id, { approve: true });

    const result = await service.decideBatchAsKadep(KADEP, batchId, { approve: true });

    expect(result).toMatchObject({ decided: 2, failed: 0 });
    expect(result.results.map((r) => r.requestId)).toEqual([created[0].id, created[2].id]);
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", AINA], ["Pembimbing 2", AFRI]]);
    expect(activeSupervisors("T2")).toEqual([["Pembimbing 1", HUSNIL]]);
    expect(activeSupervisors("T3")).toEqual([["Pembimbing 1", AINA]]);
    expect(world.state.requests.map((r) => r.status)).toEqual(["approved", "rejected", "approved"]);
    await expect(service.decideBatchAsKadep(KADEP, batchId, { approve: true })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("creates nothing when one of the students cannot be handed over", async () => {
    world.state.seminars.push({ id: "sem-2", thesisId: "T2", status: "scheduled" });

    await expect(transfer(["T1", "T2", "T3"])).rejects.toThrow(/Mahasiswa Dua: Perubahan pembimbing hanya dapat diajukan sampai sebelum pendaftaran seminar hasil/);
    // The transaction is rolled back by the database; here the point is the error itself.
    await expect(transfer(["T1"], { newSupervisorId: HUSNIL })).rejects.toThrow("tidak dapat dialihkan kepada diri sendiri");
    await expect(service.submitTransfer(AINA, { thesisIds: ["T2"], newSupervisorId: AFRI, reason: REASON })).rejects.toThrow(
      "Anda bukan pembimbing aktif tugas akhir ini",
    );
  });

  it("Paket E6: a batch reports a request blocked by a seminar registered meanwhile, and decides the others", async () => {
    const { batchId, requests: created } = await transfer(["T1", "T2"]);
    world.state.seminars.push({ id: "sem-2", thesisId: "T2", status: "registered" });

    const result = await service.decideBatchAsKadep(KADEP, batchId, { approve: true, notes: "Diputuskan langsung" });

    expect(result).toMatchObject({ decided: 1, failed: 1 });
    expect(result.results.find((r) => r.requestId === created[1].id)).toMatchObject({
      success: false,
      message: expect.stringContaining("Perubahan pembimbing hanya dapat diajukan sampai sebelum pendaftaran seminar hasil"),
    });
    expect(world.state.requests.find((r) => r.id === created[1].id).status).toBe("pending");
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", AINA], ["Pembimbing 2", AFRI]]);
  });

  it("batch decision reports a request that cannot be applied without blocking the others", async () => {
    const { batchId, requests: created } = await transfer(["T1", "T2"]);
    thesis("T2").status = "on_leave";

    const result = await service.decideBatchAsKadep(KADEP, batchId, { approve: true, notes: "Diputuskan langsung" });

    expect(result).toMatchObject({ decided: 1, failed: 1 });
    expect(result.results.find((r) => r.requestId === created[1].id)).toMatchObject({
      success: false,
      message: expect.stringContaining("Berhenti Studi Sementara (BSS)"),
    });
    expect(activeSupervisors("T1")).toEqual([["Pembimbing 1", AINA], ["Pembimbing 2", AFRI]]);
  });
});

describe("supervisor options", () => {
  it("lists lecturers with the positions their roles allow", async () => {
    const all = await service.getSupervisorOptions();
    expect(all.find((option) => option.id === ULLYA).positions).toEqual(["pembimbing_2"]);
    expect(all.find((option) => option.id === AINA).positions).toEqual(["pembimbing_1", "pembimbing_2"]);
    expect((await service.getSupervisorOptions("pembimbing_1")).map((option) => option.id)).not.toContain(ULLYA);
    // Paket E6: the load beside each option of the searchable picker.
    expect(all.find((option) => option.id === HUSNIL).load).toEqual({ activeCount: 3, quotaMax: 10, isFull: false });
  });
});

describe("Paket E5: the change actions of a Mahasiswa Bimbingan row", () => {
  const research = { status: "research", thesisSeminars: [], hasOpenRequest: false };

  it("Pembimbing 1 may ask and hand over; Pembimbing 2 only hands over", () => {
    expect(service.changeActionsForLecturerRow({ position: "pembimbing_1", active: true, thesis: research })).toEqual({
      hasOpenRequest: false, canSubmit: true, blockReason: null, canTransfer: true, transferBlockReason: null,
    });
    const p2 = service.changeActionsForLecturerRow({ position: "pembimbing_2", active: true, thesis: research });
    expect(p2).toMatchObject({ canSubmit: false, canTransfer: true });
    expect(p2.blockReason).toContain("aksi Alihkan");
  });

  it("an open request, a registered seminar or another status blocks both, with the reason", () => {
    const open = service.changeActionsForLecturerRow({ position: "pembimbing_1", active: true, thesis: { ...research, hasOpenRequest: true } });
    expect(open).toMatchObject({ hasOpenRequest: true, canSubmit: false, canTransfer: false });
    expect(open.transferBlockReason).toContain("Masih ada pengajuan perubahan yang berjalan");
    const seminar = service.changeActionsForLecturerRow({ position: "pembimbing_1", active: true, thesis: { ...research, thesisSeminars: [{ status: "registered" }] } });
    expect(seminar.transferBlockReason).toContain("sebelum pendaftaran seminar hasil");
    const proposal = service.changeActionsForLecturerRow({ position: "pembimbing_1", active: true, thesis: { ...research, status: "proposal" } });
    expect(proposal.blockReason).toContain("hanya untuk tugas akhir berstatus");
  });

  it("K34 (Paket E6): after the seminar a title change may still be asked, Alihkan may not", () => {
    const afterSeminar = service.changeActionsForLecturerRow({ position: "pembimbing_1", active: true, thesis: { ...research, thesisSeminars: [{ status: "passed" }] } });
    expect(afterSeminar).toMatchObject({ canSubmit: true, blockReason: null, canTransfer: false });
    const defenceRunning = service.changeActionsForLecturerRow({
      position: "pembimbing_1", active: true, thesis: { ...research, thesisSeminars: [{ status: "passed" }], thesisDefences: [{ status: "scheduled" }] },
    });
    expect(defenceRunning.canSubmit).toBe(false);
    expect(defenceRunning.blockReason).toContain("Perubahan judul tidak dapat diajukan selama sidang tugas akhir sedang berproses.");
  });

  it("a released relation may do neither", () => {
    const released = service.changeActionsForLecturerRow({ position: "pembimbing_1", active: false, thesis: research });
    expect(released).toMatchObject({ canSubmit: false, canTransfer: false, transferBlockReason: "Anda bukan pembimbing aktif tugas akhir ini." });
  });
});
