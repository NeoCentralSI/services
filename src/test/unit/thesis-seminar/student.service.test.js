/**
 * Unit Tests — Student Thesis Seminar: thesis-seminar-student.service.js
 * Covers:
 *  - getOverview (Checklist, Research Method, Effective Status)
 *  - getAttendanceHistory (Summary, Records)
 *  - getSeminarHistory (Failed/Cancelled filter, "Attempt" logic)
 *  - getAnnouncements (Effective Status, Registration check)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────
const {
  mockCoreRepo,
  mockDocRepo,
  mockRevisionRepo,
  mockAudienceRepo,
  mockLecturerRepo,
  mockPrisma,
  mockStatusUtil,
} = vi.hoisted(() => ({
  mockCoreRepo: {
    getStudentThesisWithSeminarInfo: vi.fn(),
    countSeminarAttendance: vi.fn(),
    enrichExaminers: vi.fn(),
    getAllAnnouncedSeminars: vi.fn(),
    getSeminarAttendanceHistory: vi.fn(),
    getAllStudentSeminars: vi.fn(),
    findSeminarById: vi.fn(),
    findSeminarBasicById: vi.fn(),
    findSeminarSupervisorRole: vi.fn(),
  },
  mockDocRepo: {
    getSeminarDocumentTypes: vi.fn(),
    findSeminarDocuments: vi.fn(),
  },
  mockRevisionRepo: {
    findRevisionsBySeminarId: vi.fn(),
  },
  mockAudienceRepo: {
    findAudiencesBySeminarId: vi.fn(),
  },
  mockLecturerRepo: {
    getStudentByUserId: vi.fn(),
  },
  mockPrisma: {
    lecturer: { findMany: vi.fn() },
    thesis: { findFirst: vi.fn() },
  },
  mockStatusUtil: {
    computeEffectiveStatus: vi.fn((s) => s),
  },
}));

vi.mock("../../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: mockLecturerRepo.getStudentByUserId,
}));
vi.mock("../../../repositories/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../repositories/thesis-seminar-doc.repository.js", () => mockDocRepo);
vi.mock("../../../repositories/thesis-seminar-revision.repository.js", () => mockRevisionRepo);
vi.mock("../../../repositories/thesis-seminar-audience.repository.js", () => mockAudienceRepo);
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../utils/seminarStatus.util.js", () => mockStatusUtil);

import {
  getOverview,
  getAttendanceHistory,
  getSeminarHistory,
  getAnnouncements,
} from "../../../services/thesis-seminar-student.service.js";

// ── helpers ───────────────────────────────────────────────────
const makeStudent = (id = "student-1") => ({
  id,
  researchMethodCompleted: true,
  user: { fullName: "Test Student", identityNumber: "123456" },
});

const makeThesis = (id = "thesis-1") => ({
  id,
  title: "Test Thesis Title",
  thesisGuidances: Array(8).fill({}),
  thesisSupervisors: [
    { lecturerId: "lec-1", seminarReady: true, lecturer: { user: { fullName: "Dosen 1" } }, role: { name: "Pembimbing 1" } },
  ],
  thesisSeminars: [],
});

const makeSeminar = (overrides = {}) => ({
  id: "sem-1",
  status: "registered",
  registeredAt: "2026-04-20T10:00:00.000Z",
  date: null,
  startTime: null,
  endTime: null,
  examiners: [],
  documents: [],
  ...overrides,
});

// ── tests ─────────────────────────────────────────────────────
describe("Student Seminar Service — Overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("calculates checklist correctly when all requirements met", async () => {
    const thesis = makeThesis();
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(8);

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(true);
    expect(result.checklist.bimbingan.met).toBe(true);
    expect(result.checklist.kehadiran.met).toBe(true);
    expect(result.checklist.metopen.met).toBe(true);
    expect(result.checklist.pembimbing.met).toBe(true);
  });

  it("calculates checklist correctly when some requirements missing", async () => {
    const thesis = makeThesis();
    thesis.thesisGuidances = Array(5).fill({}); // Only 5
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(2); // Only 2

    const student = makeStudent();
    student.researchMethodCompleted = false; // Not completed
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(student);

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(false);
    expect(result.checklist.bimbingan.met).toBe(false);
    expect(result.checklist.kehadiran.met).toBe(false);
    expect(result.checklist.metopen.met).toBe(false);
  });

  it("maps status to 'examiner_assigned' when examiners assigned but no date", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "examiner_assigned", date: null })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);
    mockStatusUtil.computeEffectiveStatus.mockReturnValue("examiner_assigned");

    const result = await getOverview("user-1");

    expect(result.seminar.status).toBe("examiner_assigned");
  });

  it("maps status to 'scheduled' when scheduled", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "scheduled", date: "2026-05-01" })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);
    mockStatusUtil.computeEffectiveStatus.mockReturnValue("scheduled");

    const result = await getOverview("user-1");

    expect(result.seminar.status).toBe("scheduled");
  });
});

describe("Student Seminar Service — History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("filters out passed seminars from history (only failed/cancelled)", async () => {
    mockCoreRepo.getAllStudentSeminars.mockResolvedValue([
      makeSeminar({ id: "sem-passed", status: "passed" }),
      makeSeminar({ id: "sem-failed", status: "failed" }),
      makeSeminar({ id: "sem-cancelled", status: "cancelled" }),
    ]);

    const result = await getSeminarHistory("user-1");

    expect(result).toHaveLength(2);
    expect(result.find(s => s.id === "sem-passed")).toBeUndefined();
    expect(result.find(s => s.id === "sem-failed")).toBeDefined();
    expect(result.find(s => s.id === "sem-cancelled")).toBeDefined();
  });

  it("includes maxWeight=100 in history records", async () => {
    mockCoreRepo.getAllStudentSeminars.mockResolvedValue([
      makeSeminar({ id: "sem-1", status: "failed" }),
    ]);

    const result = await getSeminarHistory("user-1");

    expect(result[0].maxWeight).toBe(100);
  });
});

describe("Student Seminar Service — Attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("returns summary and records correctly", async () => {
    mockCoreRepo.getSeminarAttendanceHistory.mockResolvedValue([
      { thesisSeminarId: "s1", approvedAt: "2026-04-01", seminar: { thesis: { student: { user: { fullName: "P1" } } } } },
      { thesisSeminarId: "s2", approvedAt: null, seminar: { thesis: { student: { user: { fullName: "P2" } } } } },
    ]);

    const result = await getAttendanceHistory("user-1");

    expect(result.summary.attended).toBe(1);
    expect(result.summary.total).toBe(2);
    expect(result.records).toHaveLength(2);
  });
});
