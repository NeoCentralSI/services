/**
 * Paket E5 (and the Lanjutan of E4): Permohonan, Perubahan (Kadep) and Evaluasi (Kadep) are
 * sorted by "what needs attention" on the server, "Semua" by default, and paged by the
 * database past the first hundred rows. The Monitoring Seminar Hasil and Sidang tables use the
 * status priority of the seminar and defence modules.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeRepo, evalRepo, requestRepo } = vi.hoisted(() => ({
  changeRepo: {
    findIdsAtLecturerStep: vi.fn(async () => []),
    findPage: vi.fn(),
    countWhere: vi.fn(),
    getSupervisorLoad: vi.fn(async () => ({ activeCount: 3, quotaMax: 10 })),
  },
  evalRepo: { findEvaluationPage: vi.fn(), countEvaluations: vi.fn() },
  requestRepo: { findRequestPage: vi.fn(), countRequests: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../repositories/thesis-change-request.repository.js", () => changeRepo);
vi.mock("../../repositories/thesis-guidance-evaluation.repository.js", () => evalRepo);
vi.mock("../../repositories/thesis-proposal/supervisor-request.repository.js", () => requestRepo);
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn(), createNotificationEventForUsers: vi.fn() }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn(async () => undefined) }));
vi.mock("../../helpers/academicYear.helper.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-1", year: "2026/2027", semester: "ganjil" })),
}));

const paging = await import("../../helpers/priority-paging.helper.js");
const changes = await import("../../services/thesis-change-request.service.js");
const evaluations = await import("../../services/thesis-guidance-evaluation.service.js");
const requests = await import("../../services/thesis-proposal/supervisor-request.service.js");
const { CHANGE_REQUEST_LECTURER_STATUS_PRIORITY, CHANGE_REQUEST_STATUS_PRIORITY } = await import("../../constants/thesis-change-request.js");
const { EVALUATION_STATUS_PRIORITY } = await import("../../constants/thesis-guidance-evaluation.js");
const { SUPERVISOR_REQUEST_STATUS_PRIORITY } = await import("../../constants/thesis-proposal.js");
const { LECTURER_INBOX_PRIORITY } = await import("../../constants/lecturer-inbox.js");
const { EVENT_STATUS_PRIORITY } = await import("../../constants/thesis-event-monitoring.js");
const { byStatusPriorityThenLatest } = await import("../../services/thesisGuidance/thesis-event-monitoring.service.js");

const range = (n, make) => Array.from({ length: n }, (_, i) => make(i));
const at = (day) => new Date(Date.UTC(2026, 8, day));

/**
 * A fake table: each condition the service builds for one row status is mapped to its rows by
 * value (JSON), so a query with `{ OR: [cond, ...] }` reads the rows of those statuses, in the
 * given order (the tests give them newest first, as the database would).
 */
function fakeTable(rowsByCondition) {
  const entries = rowsByCondition.map(([condition, rows]) => [JSON.stringify(condition), rows]);
  const rowsOf = (where) => {
    const or = where?.AND?.[0]?.OR ?? where?.AND?.[1]?.OR ?? [where];
    return or.flatMap((part) => entries.find(([key]) => key === JSON.stringify(part))?.[1] ?? []);
  };
  return { rowsOf };
}

beforeEach(() => {
  vi.clearAllMocks();
  changeRepo.findIdsAtLecturerStep.mockResolvedValue([]);
});

describe("priority paging helper", () => {
  it("groups a priority map in ascending order and keeps one status when filtered", () => {
    expect(paging.priorityGroups({ a: 1, b: 0, c: 1, d: 2 })).toEqual([["b"], ["a", "c"], ["d"]]);
    expect(paging.priorityGroups({ a: 1, b: 0, c: 1 }, "c")).toEqual([["c"]]);
  });

  it("lays the groups end to end and pages across them, past the first hundred rows", async () => {
    const rows = { first: range(30, (i) => `f${i}`), second: range(120, (i) => `s${i}`) };
    const source = {
      count: async (where) => rows[where.k].length,
      find: async (where, _orderBy, { skip, take }) => rows[where.k].slice(skip, skip + take),
    };
    const groups = [{ key: "first", where: { k: "first" } }, { key: "second", where: { k: "second" } }];

    const page1 = await paging.pageAcrossGroups(groups, { skip: 0, take: 50 }, source);
    expect(page1.total).toBe(150);
    expect(page1.rows.map((r) => r.row)).toEqual([...rows.first, ...rows.second.slice(0, 20)]);

    const page3 = await paging.pageAcrossGroups(groups, { skip: 100, take: 50 }, source);
    expect(page3.rows.map((r) => r.row)).toEqual(rows.second.slice(70, 120));
    expect(page3.totals).toEqual({ first: 30, second: 120 });
  });

  it("caps a page at 100 rows", () => {
    expect(paging.pageWindow({ page: 2, pageSize: 500 })).toEqual({ page: 2, pageSize: 100, skip: 100, take: 100 });
    expect(paging.pageMeta({ page: 2, pageSize: 100 }, 150)).toEqual({ page: 2, pageSize: 100, total: 150, totalPages: 2 });
  });
});

describe("priority maps (one constant per table)", () => {
  it("Permohonan, Pengajuan Pembimbing: Menunggu Dosen / Sedang Ditinjau → Menunggu Kadep → Diterima / Ditetapkan / Dialihkan → closed", () => {
    expect(paging.priorityGroups(SUPERVISOR_REQUEST_STATUS_PRIORITY)).toEqual([
      ["pending", "under_review"],
      ["pending_kadep", "revision_requested"],
      ["accepted", "assigned", "redirected"],
      ["rejected_by_lecturer", "rejected_by_kadep", "withdrawn", "cancelled", "closed"],
    ]);
  });

  it("Permohonan, Perubahan TA: Menunggu Persetujuan Anda → Sedang Berjalan → Disetujui → Ditolak / Dibatalkan", () => {
    expect(paging.priorityGroups(CHANGE_REQUEST_LECTURER_STATUS_PRIORITY)).toEqual([["awaiting_me"], ["in_progress"], ["approved"], ["rejected", "cancelled"]]);
    expect(LECTURER_INBOX_PRIORITY).toEqual({ supervisor_request: SUPERVISOR_REQUEST_STATUS_PRIORITY, change_request: CHANGE_REQUEST_LECTURER_STATUS_PRIORITY });
  });

  it("Perubahan (Kadep): Menunggu Keputusan Anda → Sedang Berjalan → Disetujui → Ditolak / Dibatalkan", () => {
    expect(paging.priorityGroups(CHANGE_REQUEST_STATUS_PRIORITY)).toEqual([["awaiting_decision"], ["in_progress"], ["approved"], ["rejected", "cancelled"]]);
  });

  it("Evaluasi (Kadep): Menunggu Keputusan Anda → Disetujui / Ditolak / Tercatat", () => {
    expect(paging.priorityGroups(EVALUATION_STATUS_PRIORITY)).toEqual([["awaiting_decision"], ["approved", "rejected", "recorded"]]);
  });

  it("Monitoring Seminar Hasil and Sidang mirror the STATUS_PRIORITY maps of the seminar and defence modules", () => {
    const moduleMap = (file) => {
      const source = readFileSync(new URL(`../../services/${file}`, import.meta.url), "utf8");
      const literal = source.match(/const STATUS_PRIORITY = (\{[\s\S]*?\});/)[1];
      return Function(`return (${literal});`)();
    };
    expect(EVENT_STATUS_PRIORITY.seminar).toEqual(moduleMap("thesis-seminar/core.service.js"));
    expect(EVENT_STATUS_PRIORITY.defence).toEqual(moduleMap("thesis-defence/core.service.js"));
  });

  it("Monitoring rows: status priority first, the latest first inside the same priority", () => {
    const rows = [
      { id: "passed-new", status: "passed", date: at(30) },
      { id: "registered-old", status: "registered", registeredAt: at(1) },
      { id: "scheduled", status: "scheduled", date: at(29) },
      { id: "registered-new", status: "registered", registeredAt: at(20) },
      { id: "failed-old", status: "failed", date: at(2) },
    ];
    expect([...rows].sort(byStatusPriorityThenLatest("seminar")).map((row) => row.id)).toEqual([
      "registered-new", "registered-old", "scheduled", "passed-new", "failed-old",
    ]);
  });
});

const changeRequest = (id, status, approvals, day = 1) => ({
  id, thesisId: `t-${id}`, batchId: null, requestType: "title", status, reason: "Alasan",
  previousTitle: "Lama", newTitle: "Baru", approvals, thesis: null, createdAt: at(day), decidedAt: null,
});
const step = (lecturerId, status) => ({ lecturerId, status, role: "main_supervisor", stepOrder: 1 });

describe("Perubahan (Ketua Departemen): status priority on the server", () => {
  const AWAITING = { status: "pending", approvals: { every: { status: "approved" } } };
  const RUNNING = { status: "pending", approvals: { some: { status: { not: "approved" } } } };

  function wire(table) {
    const { rowsOf } = fakeTable(table);
    changeRepo.countWhere.mockImplementation(async (where) => rowsOf(where).length);
    changeRepo.findPage.mockImplementation(async (where, _orderBy, { skip, take }) => {
      const rows = rowsOf(where);
      return { rows: rows.slice(skip, skip + take), total: rows.length };
    });
  }

  it("waiting for the decision first, then running, approved, closed; page 11 of 150 rows", async () => {
    const awaiting = range(2, (i) => changeRequest(`kadep-${i}`, "pending", [step("l1", "approved")]));
    const running = range(3, (i) => changeRequest(`run-${i}`, "pending", [step("l1", "pending")]));
    const approved = range(100, (i) => changeRequest(`ok-${i}`, "approved", []));
    const rejected = range(25, (i) => changeRequest(`no-${i}`, "rejected", []));
    const cancelled = range(20, (i) => changeRequest(`off-${i}`, "cancelled", []));
    wire([
      [AWAITING, awaiting], [RUNNING, running], [{ status: "approved" }, approved],
      [{ status: "rejected" }, rejected], [{ status: "cancelled" }, cancelled],
    ]);

    const first = await changes.listInbox("kadep-1", { page: 1, pageSize: 10 });
    expect(first.meta).toEqual({ page: 1, pageSize: 10, total: 150, totalPages: 15 });
    expect(first.data.map((row) => row.viewStatus)).toEqual([
      "awaiting_decision", "awaiting_decision", "in_progress", "in_progress", "in_progress",
      "approved", "approved", "approved", "approved", "approved",
    ]);
    expect(first.counts).toEqual({ awaitingDecision: 2, inProgress: 3 });

    // 105 open or approved rows before the closed group: page 11 crosses into it.
    const page11 = await changes.listInbox("kadep-1", { page: 11, pageSize: 10 });
    expect(page11.data.map((row) => row.id)).toEqual([...range(5, (i) => `ok-${95 + i}`), ...range(5, (i) => `no-${i}`)]);
    const page15 = await changes.listInbox("kadep-1", { page: 15, pageSize: 10 });
    expect(page15.data.map((row) => row.id)).toEqual(range(10, (i) => `off-${10 + i}`));
  });

  it("the Status filter keeps one group; Jenis Alihkan is a request of a batch; search by name, NIM or title", async () => {
    wire([]);
    await changes.listInbox("kadep-1", { status: "in_progress", kind: "transfer", search: "2211" });
    const [where] = changeRepo.countWhere.mock.calls[0];
    expect(where.AND[0]).toEqual({ OR: [RUNNING] });
    expect(where.AND[1]).toEqual({
      thesis: {
        OR: [
          { title: { contains: "2211" } },
          { student: { user: { OR: [{ fullName: { contains: "2211" } }, { identityNumber: { contains: "2211" } }] } } },
        ],
      },
    });
    expect(where.AND[2]).toEqual({ batchId: { not: null } });
  });
});

describe("Evaluasi (Ketua Departemen): status priority on the server", () => {
  const evaluation = (id, status, recommendation) => ({
    id, status, recommendation, evaluationType: "six_month", isFollowUp: false, createdAt: at(1), thesis: null,
  });

  it("waiting for the decision first, then decided or recorded; page 11 of 150 rows", async () => {
    const pending = range(30, (i) => evaluation(`p${i}`, "pending", "extend_1_month"));
    const approved = range(60, (i) => evaluation(`a${i}`, "approved", "extend_1_month"));
    const rejected = range(30, (i) => evaluation(`r${i}`, "rejected", "extend_1_month"));
    const recorded = range(30, (i) => evaluation(`c${i}`, "approved", "continue"));
    const { rowsOf } = fakeTable([
      [{ status: "pending" }, pending],
      [{ status: "approved", recommendation: { not: "continue" } }, approved],
      [{ status: "rejected" }, rejected],
      [{ recommendation: "continue", status: { not: "pending" } }, recorded],
    ]);
    evalRepo.countEvaluations.mockImplementation(async (where) => rowsOf(where).length);
    evalRepo.findEvaluationPage.mockImplementation(async (where, _orderBy, { skip, take }) => rowsOf(where).slice(skip, skip + take));

    const first = await evaluations.listInbox("kadep-1", { page: 1, pageSize: 50 });
    expect(first.meta).toEqual({ page: 1, pageSize: 50, total: 150, totalPages: 3 });
    expect(first.data.slice(0, 30).every((row) => row.viewStatus === "awaiting_decision")).toBe(true);
    expect(first.data[30].viewStatus).toBe("approved");
    expect(first.counts).toEqual({ awaitingDecision: 30 });

    const page11 = await evaluations.listInbox("kadep-1", { page: 11, pageSize: 10 });
    expect(page11.data.map((row) => row.id)).toEqual(range(10, (i) => `r${10 + i}`));
    const page15 = await evaluations.listInbox("kadep-1", { page: 15, pageSize: 10 });
    expect(page15.data.map((row) => row.viewStatus)).toEqual(range(10, () => "recorded"));
  });

  it("the Status filter keeps one status, searched by name or NIM", async () => {
    evalRepo.countEvaluations.mockResolvedValue(0);
    evalRepo.findEvaluationPage.mockResolvedValue([]);
    await evaluations.listInbox("kadep-1", { status: "recorded", search: "Nabil" });
    expect(evalRepo.countEvaluations.mock.calls[0][0]).toEqual({
      AND: [
        { OR: [{ recommendation: "continue", status: { not: "pending" } }] },
        { thesis: { student: { user: { OR: [{ fullName: { contains: "Nabil" } }, { identityNumber: { contains: "Nabil" } }] } } } },
      ],
    });
  });
});

describe("Permohonan (lecturer approval inbox): both kinds, status priority on the server", () => {
  const supervisorRequest = (id, status, day) => ({
    id, status, createdAt: at(day), lecturerId: "lect-1", route: "direct", academicYearId: "ay-1",
    student: { id: `s-${id}`, user: { fullName: `Mahasiswa ${id}`, identityNumber: id } }, lecturer: null, redirectTarget: null,
  });

  function wire({ requestsByStatus, changesByStatus }) {
    const requestRows = (where) => {
      const statuses = where?.AND?.[1]?.status?.in ?? [];
      return requestsByStatus.filter((row) => statuses.includes(row.status));
    };
    requestRepo.countRequests.mockImplementation(async (where) => (where?.AND ? requestRows(where).length : requestsByStatus.filter((r) => ["pending", "under_review"].includes(r.status)).length));
    requestRepo.findRequestPage.mockImplementation(async (where, _orderBy, { skip, take }) => requestRows(where).slice(skip, skip + take));
    const { rowsOf } = fakeTable(changesByStatus);
    changeRepo.countWhere.mockImplementation(async (where) => rowsOf(where).length);
    changeRepo.findPage.mockImplementation(async (where, _orderBy, { skip, take }) => {
      const rows = rowsOf(where);
      return { rows: rows.slice(skip, skip + take), total: rows.length };
    });
  }

  it("everything waiting for the viewer first (both kinds, newest first), then each level; past 100 rows", async () => {
    changeRepo.findIdsAtLecturerStep.mockResolvedValue(["mine"]);
    // Paket E6: not the requests the lecturer submitted (their own step was approved on submission).
    const involved = { approvals: { some: { lecturerId: "lect-1" } }, NOT: { requestedByUserId: "lect-1" } };
    const mine = { id: { in: ["mine"] } };
    const awaitingChange = [changeRequest("mine", "pending", [step("lect-1", "pending")], 15)];
    const runningChange = [changeRequest("later", "pending", [step("lect-0", "pending"), { ...step("lect-1", "pending"), stepOrder: 2 }], 14)];
    const requestsByStatus = [
      supervisorRequest("req-new", "pending", 20),
      supervisorRequest("req-old", "under_review", 10),
      supervisorRequest("req-kadep", "pending_kadep", 9),
      // Newest first, as the database returns them.
      ...range(100, (i) => ({ ...supervisorRequest(`acc-${i}`, "accepted", 8), createdAt: new Date(at(8).getTime() - i * 60_000) })),
      ...range(45, (i) => ({ ...supervisorRequest(`rej-${i}`, "rejected_by_lecturer", 5), createdAt: new Date(at(5).getTime() - i * 60_000) })),
    ];
    wire({
      requestsByStatus,
      changesByStatus: [
        [mine, awaitingChange],
        [{ AND: [{ status: "pending" }, involved, { NOT: mine }] }, runningChange],
      ],
    });

    const first = await requests.listLecturerInbox("lect-1", { page: 1, pageSize: 10 });
    expect(first.meta.total).toBe(150);
    expect(first.data.slice(0, 5).map((row) => [row.kind, row.id, row.viewStatus])).toEqual([
      ["supervisor_request", "req-new", "pending"],
      ["change_request", "mine", "awaiting_me"],
      ["supervisor_request", "req-old", "under_review"],
      ["change_request", "later", "in_progress"],
      ["supervisor_request", "req-kadep", "pending_kadep"],
    ]);
    expect(first.data[5].viewStatus).toBe("accepted");
    expect(first.counts).toEqual({ waiting: 3, waitingRequests: 2, waitingChanges: 1 });
    expect(first.data[1].changeRequest.viewStatus).toBe("awaiting_me");
    expect(first.data[0].supervisorRequest.id).toBe("req-new");

    // 5 rows of levels 0 and 1, then 100 accepted: page 11 crosses into the closed ones.
    const page11 = await requests.listLecturerInbox("lect-1", { page: 11, pageSize: 10 });
    expect(page11.data.map((row) => row.id)).toEqual([...range(5, (i) => `acc-${95 + i}`), ...range(5, (i) => `rej-${i}`)]);
    expect(requestRepo.findRequestPage.mock.calls.at(-1)[0].AND[0]).toEqual({ OR: [{ lecturerId: "lect-1" }, { redirectedTo: "lect-1" }] });
  });

  it("the Jenis filter (Paket E6: four values) keeps one kind and the Status filter one status", async () => {
    wire({ requestsByStatus: [supervisorRequest("req", "pending", 3)], changesByStatus: [] });
    for (const [kind, requestType] of [["change_title", "title"], ["change_supervisor", "supervisor"], ["change_both", "both"]]) {
      requestRepo.countRequests.mockClear();
      changeRepo.countWhere.mockClear();
      const onlyChanges = await requests.listLecturerInbox("lect-1", { kind });
      expect(onlyChanges.meta.total).toBe(0);
      // Only change-request groups are counted, each narrowed to the kind.
      const groupWheres = changeRepo.countWhere.mock.calls.map(([where]) => where).filter((where) => where?.AND?.length === 3);
      expect(groupWheres.length).toBeGreaterThan(0);
      expect(groupWheres.every((where) => JSON.stringify(where.AND[2]) === JSON.stringify({ requestType }))).toBe(true);
      expect(requestRepo.countRequests.mock.calls.filter(([where]) => where?.AND)).toHaveLength(0);
    }
    expect(requestRepo.findRequestPage).not.toHaveBeenCalled();

    const onlyRequests = await requests.listLecturerInbox("lect-1", { kind: "supervisor_request" });
    expect(onlyRequests.data.map((row) => row.kind)).toEqual(["supervisor_request"]);

    const onlyPending = await requests.listLecturerInbox("lect-1", { status: "pending" });
    expect(onlyPending.data.map((row) => row.id)).toEqual(["req"]);
    expect(changeRepo.findPage).not.toHaveBeenCalled();
  });
});
