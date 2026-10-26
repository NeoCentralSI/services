import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The "Penetapan" panel merges the cohort, the Kadep queue (department, over quota)
 * and the Pembimbing 2 requests into one row per student, waiting first.
 */
const { db, overview, supervisor2, loads } = vi.hoisted(() => ({
  db: {
    academicYear: { findUnique: vi.fn() },
    thesisSupervisorRequest: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
    thesis: { findMany: vi.fn() },
    researchMethodAssessment: { findMany: vi.fn() },
    lecturer: { findMany: vi.fn(async () => [{ id: "lect-2", acceptingRequests: false }]) },
  },
  overview: { getAssignmentOverview: vi.fn() },
  supervisor2: { getSupervisor2KadepQueueService: vi.fn() },
  loads: { getLecturerLoads: vi.fn() },
}));
vi.mock("../../config/prisma.js", () => ({ default: db }));
vi.mock("../../services/thesis-proposal/supervisor-assignment.service.js", () => overview);
vi.mock("../../services/thesisGuidance/supervisor2.service.js", () => supervisor2);
vi.mock("../../services/thesis-proposal/supervision-quota.service.js", () => loads);
vi.mock("../../services/thesis-proposal/supervisor-request.service.js", () => ({ mapRequest: (r) => (r ? { id: r.id, status: r.status, route: r.route } : null) }));
vi.mock("../../repositories/thesis-proposal/supervisor-assignment.repository.js", () => ({ findActiveUserByRole: vi.fn(async () => ({ id: "kadep-1" })) }));
vi.mock("../../helpers/academicYear.helper.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveOperationalAcademicYear: vi.fn(async () => ({ id: "ay-1", year: "2026/2027", semester: "ganjil" })),
}));

const { getAssignmentBoard } = await import("../../services/thesis-proposal/supervisor-assignment-board.service.js");

const YEAR = { id: "ay-1", year: "2026/2027", semester: "ganjil", isActive: true };
const at = (day) => new Date(Date.UTC(2026, 9, day));
const request = (id, studentId, route, status, day, extra = {}) => ({ id, studentId, route, status, createdAt: at(day), reviewedAt: null, lecturerId: null, ...extra });

function wire({ entries = [], requests = [], p2 = [], currentVersion = 2 }) {
  db.academicYear.findUnique.mockResolvedValue(YEAR);
  overview.getAssignmentOverview.mockResolvedValue({
    academicYear: { id: YEAR.id, semester: YEAR.semester, year: YEAR.year, isActive: true },
    entries,
    currentBatch: currentVersion ? { id: "b", version: currentVersion } : null,
    batches: [],
    upToDate: false,
    needsIssue: true,
    newCount: entries.filter((e) => !e.inCurrentBatch).length,
  });
  db.thesisSupervisorRequest.findMany.mockImplementation(async ({ where, select }) => {
    if (select?.thesisId) return []; // the period of a Pembimbing 2 request: none, so the operational one
    if (select?.studentId) return requests.filter((r) => ["department", "over_quota"].includes(r.route)).map((r) => ({ studentId: r.studentId }));
    return requests.filter((r) => where.studentId.in.includes(r.studentId));
  });
  const students = [...new Set([...entries.map((e) => e.studentId), ...requests.map((r) => r.studentId), ...p2.map((r) => r.studentId)])];
  db.student.findMany.mockResolvedValue(students.map((id) => ({ id, user: { fullName: `Mhs ${id}`, identityNumber: `22${id}` } })));
  db.thesis.findMany.mockResolvedValue(students.map((id) => ({
    id: `t-${id}`, studentId: id, title: `Judul ${id}`, status: "proposal",
    thesisSupervisors: entries.some((e) => e.studentId === id) ? [{ lecturerId: "lect-1", role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "Dosen Satu" } } }] : [],
  })));
  db.researchMethodAssessment.findMany.mockResolvedValue([]);
  supervisor2.getSupervisor2KadepQueueService.mockResolvedValue(p2);
  loads.getLecturerLoads.mockImplementation(async (ids) => new Map(ids.map((id) => [id, { activeCount: 10, semesterQuota: 8, totalLimit: 10, level: "full" }])));
}

describe("getAssignmentBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.lecturer.findMany.mockResolvedValue([{ id: "lect-2", acceptingRequests: false }]);
  });

  it("one row per student: waiting decisions first (department, over quota, Pembimbing 2), then the cohort not yet issued", async () => {
    wire({
      entries: [
        { thesisId: "t-a", studentId: "a", requestId: "r-a", studentName: "A", studentNim: "22a", title: "Judul a", inCurrentBatch: true },
        { thesisId: "t-b", studentId: "b", requestId: "r-b", studentName: "B", studentNim: "22b", title: "Judul b", inCurrentBatch: false },
        { thesisId: "t-p", studentId: "p", requestId: "r-p", studentName: "P", studentNim: "22p", title: "Judul p", inCurrentBatch: true },
      ],
      requests: [
        request("r-a", "a", "direct", "assigned", 1),
        request("r-b", "b", "direct", "accepted", 2),
        request("r-p", "p", "direct", "assigned", 1),
        request("r-d", "d", "department", "pending_kadep", 5),
        request("r-q", "q", "over_quota", "pending_kadep", 4, { lecturerId: "lect-9", lecturer: { user: { fullName: "Dosen Penuh" } } }),
        request("r-x", "x", "department", "rejected_by_kadep", 3, { reviewedAt: at(6) }),
        // an older request of the same student stays in the detail history only
        request("r-d0", "d", "department", "withdrawn", 1),
      ],
      p2: [{ requestId: "n-1", thesisId: "t-p", studentId: "p", lecturerId: "lect-2", lecturerName: "Dosen Dua", thesisTitle: "Judul p", requestedAt: at(7) }],
    });

    const board = await getAssignmentBoard(null, "kadep-1");
    expect(board.rows.map((row) => [row.studentId, row.submission, row.assignment.assigned])).toEqual([
      ["d", "department_waiting", false],
      ["q", "over_quota_waiting", false],
      ["p", "supervisor2_waiting", true],
      ["b", "approved", false],
      ["a", "approved", true],
      ["x", "rejected", false],
    ]);
    expect(board.counts).toEqual({ waiting: 3, cohort: 3 });
    const byId = Object.fromEntries(board.rows.map((row) => [row.studentId, row]));
    expect(byId.d.history.map((r) => r.id)).toEqual(["r-d0"]);
    expect(byId.q.candidate).toMatchObject({ role: "Pembimbing 1", fullName: "Dosen Penuh", load: { activeCount: 10 } });
    expect(byId.q.request.lecturerLoad).toMatchObject({ projectedCount: 11, overBy: 1 });
    expect(byId.p.candidate).toMatchObject({ role: "Pembimbing 2", fullName: "Dosen Dua", acceptingRequests: false });
    expect(byId.q.candidate.acceptingRequests).toBe(true);
    expect(byId.p.supervisor2Request.requestId).toBe("n-1");
    expect(byId.a.assignment).toEqual({ inCohort: true, assigned: true, version: 2 });
    expect(byId.b.assignment).toEqual({ inCohort: true, assigned: false, version: null });
    expect(board.academicYear.isOperational).toBe(true);
  });

  it("a semester without students gives an empty board, no extra queries", async () => {
    wire({});
    const board = await getAssignmentBoard("ay-1");
    expect(board.rows).toEqual([]);
    expect(db.student.findMany).not.toHaveBeenCalled();
  });
});
