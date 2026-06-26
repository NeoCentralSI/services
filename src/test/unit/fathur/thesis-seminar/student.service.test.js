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
    student: { findUnique: vi.fn() },
  },
  mockStatusUtil: {
    computeEffectiveStatus: vi.fn((s) => s),
  },
}));

vi.mock("../../../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: mockLecturerRepo.getStudentByUserId,
}));
vi.mock("../../../../repositories/thesis-seminar/thesis-seminar.repository.js", () => mockCoreRepo);
vi.mock("../../../../repositories/thesis-seminar/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-seminar/revision.repository.js", () => mockRevisionRepo);
vi.mock("../../../../repositories/thesis-seminar/audience.repository.js", () => mockAudienceRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("xlsx", () => ({}));
vi.mock("../../../../utils/seminarStatus.util.js", () => mockStatusUtil);

import {
  getOverview,
  getAttendanceHistory,
  getSeminarHistory,
  getAnnouncements,
} from "../../../../services/thesis-seminar/student.service.js";

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
  registeredAt: new Date(),
  date: null,
  startTime: null,
  endTime: null,
  examiners: [],
  documents: [],
  ...overrides,
});

// ── tests ─────────────────────────────────────────────────────
describe("Student Seminar Service — Overview Milestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("stage 0: checklist not met", async () => {
    const thesis = makeThesis();
    thesis.thesisSupervisors[0].seminarReady = false; // Supervisor not ready
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(false);
    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(false);
    expect(result.canUpload).toBe(false);
  });

  it("stage 1: checklist met, no seminar yet (can upload)", async () => {
    const thesis = makeThesis();
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(true);
    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
    expect(result.canUpload).toBe(true);
  });

  it("stage 2: registered (documents in progress)", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "registered" })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
    expect(result.canUpload).toBe(true);
  });

  it("stage 3: verified (documents locked)", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "verified" })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'examiner').checked).toBe(false);
    expect(result.canUpload).toBe(false);
  });

  it("stage 4: scheduled", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "scheduled", date: new Date() })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'schedule').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'concluded').checked).toBe(false);
  });

  it("stage 5: passed", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ status: "passed" })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.milestones.every(m => m.checked)).toBe(true);
  });

  it("returns preview overview when student has no thesis", async () => {
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(null);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(3);

    const result = await getOverview("user-1");

    expect(result.thesisId).toBeNull();
    expect(result.thesisTitle).toBeNull();
    expect(result.seminar).toBeNull();
    expect(result.allChecklistMet).toBe(false);
    expect(result.canUpload).toBe(false);
    expect(result.checklist.bimbingan.met).toBe(false);
    expect(result.checklist.kehadiran.current).toBe(3);
    expect(result.milestones.every((m) => !m.checked)).toBe(true);
  });

  it("resets overview when latest seminar is failed (treats as no active seminar)", async () => {
    const thesis = makeThesis();
    thesis.thesisSeminars = [makeSeminar({ id: "failed-sem", status: "failed" })];
    mockCoreRepo.getStudentThesisWithSeminarInfo.mockResolvedValue(thesis);
    mockCoreRepo.countSeminarAttendance.mockResolvedValue(10);

    const result = await getOverview("user-1");

    expect(result.seminar).toBeNull(); // History filtered out from current attempt
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
  });
});

describe("Student Seminar Service — History & Attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("filters seminar history correctly", async () => {
    mockCoreRepo.getAllStudentSeminars.mockResolvedValue([
      makeSeminar({ id: "s1", status: "passed" }),
      makeSeminar({ id: "s2", status: "failed" }),
    ]);
    const result = await getSeminarHistory("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("failed");
  });

  it("calculates attendance summary correctly", async () => {
    mockCoreRepo.getSeminarAttendanceHistory.mockResolvedValue([
      { approvedAt: new Date(), seminar: { status: "passed", endTime: new Date("1970-01-01T10:00:00.000Z"), resultFinalizedAt: new Date("2026-05-01T00:00:00.000Z") } },
      { approvedAt: null, seminar: { status: "passed", endTime: new Date("1970-01-01T10:00:00.000Z"), resultFinalizedAt: new Date("2026-05-01T00:00:00.000Z") } },
    ]);
    const result = await getAttendanceHistory("user-1");
    expect(result.summary.attended).toBe(1);
    expect(result.summary.total).toBe(2);
    expect(result.records[1].seminarStatus).toBe("passed");
    expect(result.records[1].seminarEndTime).toBeTruthy();
    expect(result.records[1].seminarResultFinalizedAt).toBeTruthy();
  });

  it("getAnnouncements returns list of ongoing/scheduled seminars", async () => {
    mockCoreRepo.getAllAnnouncedSeminars.mockResolvedValue([makeSeminar({ id: "s1" })]);
    mockPrisma.lecturer.findMany.mockResolvedValue([]);
    const result = await getAnnouncements("user-1");
    expect(result).toHaveLength(1);
  });
});
