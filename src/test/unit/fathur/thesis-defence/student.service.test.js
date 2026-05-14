import { describe, it, expect, beforeEach, vi } from "vitest";

// ── hoisted mocks ─────────────────────────────────────────────
const {
  mockCoreRepo,
  mockDocRepo,
  mockExaminerRepo,
  mockLecturerRepo,
  mockPrisma,
  mockStatusUtil,
} = vi.hoisted(() => ({
  mockCoreRepo: {
    getStudentThesisWithDefenceInfo: vi.fn(),
    countSeminarRevisions: vi.fn(),
    getAllStudentDefences: vi.fn(),
    findStudentDefenceDetail: vi.fn(),
    findDefenceSupervisorAssessmentDetails: vi.fn(),
  },
  mockDocRepo: {
    getDefenceDocumentTypes: vi.fn(),
  },
  mockExaminerRepo: {
    findStudentDefenceExaminerAssessmentDetails: vi.fn(),
  },
  mockLecturerRepo: {
    getStudentByUserId: vi.fn(),
  },
  mockPrisma: {
    lecturer: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    thesis: { findFirst: vi.fn() },
  },
  mockStatusUtil: {
    computeEffectiveDefenceStatus: vi.fn((s) => s),
  },
}));

vi.mock("../../../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getStudentByUserId: mockLecturerRepo.getStudentByUserId,
}));
vi.mock("../../../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../../../repositories/thesis-defence/doc.repository.js", () => mockDocRepo);
vi.mock("../../../../repositories/thesis-defence/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../utils/defenceStatus.util.js", () => mockStatusUtil);

import {
  getOverview,
  getDefenceHistory,
  getDefenceDetail,
  getAssessmentView,
} from "../../../../services/thesis-defence/student.service.js";

// ── helpers ───────────────────────────────────────────────────
const makeStudent = (id = "student-1") => ({
  id,
  skscompleted: 144,
  user: { fullName: "Test Student", identityNumber: "123456" },
});

const makeThesis = (id = "thesis-1") => ({
  id,
  title: "Test TA Title",
  thesisSupervisors: [
    { lecturerId: "lec-1", defenceReady: true, lecturer: { user: { fullName: "Dosen 1" } }, role: { name: "Pembimbing 1" } },
  ],
  thesisSeminars: [{ id: 'sem-1', status: 'passed' }],
  thesisDefences: [],
});

const makeDefence = (overrides = {}) => ({
  id: "def-1",
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
describe("Student Defence Service — Overview Milestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("stage 0: checklist not met (SKS insufficient)", async () => {
    const student = makeStudent();
    student.skscompleted = 100;
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(student);
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(makeThesis());

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(false);
    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(false);
    expect(result.canUpload).toBe(false);
  });

  it("stage 1: checklist met, no defence yet (can upload)", async () => {
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(makeThesis());

    const result = await getOverview("user-1");

    expect(result.allChecklistMet).toBe(true);
    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
    expect(result.canUpload).toBe(true);
  });

  it("stage 2: registered (documents in progress)", async () => {
    const thesis = makeThesis();
    thesis.thesisDefences = [makeDefence({ status: "registered" })];
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(thesis);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'checklist').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
    expect(result.canUpload).toBe(true);
  });

  it("stage 3: verified (documents locked)", async () => {
    const thesis = makeThesis();
    thesis.thesisDefences = [makeDefence({ status: "verified" })];
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(thesis);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'examiner').checked).toBe(false);
    expect(result.canUpload).toBe(false);
  });

  it("stage 4: scheduled", async () => {
    const thesis = makeThesis();
    thesis.thesisDefences = [makeDefence({ status: "scheduled", date: new Date() })];
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(thesis);

    const result = await getOverview("user-1");

    expect(result.milestones.find(m => m.id === 'schedule').checked).toBe(true);
    expect(result.milestones.find(m => m.id === 'concluded').checked).toBe(false);
  });

  it("stage 5: passed", async () => {
    const thesis = makeThesis();
    thesis.thesisDefences = [makeDefence({ status: "passed" })];
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(thesis);

    const result = await getOverview("user-1");

    expect(result.milestones.every(m => m.checked)).toBe(true);
  });

  it("resets overview when latest defence is failed (treats as no active attempt)", async () => {
    const thesis = makeThesis();
    thesis.thesisDefences = [makeDefence({ id: "failed-def", status: "failed" })];
    mockCoreRepo.getStudentThesisWithDefenceInfo.mockResolvedValue(thesis);

    const result = await getOverview("user-1");

    expect(result.defence).toBeNull(); 
    expect(result.milestones.find(m => m.id === 'documents').checked).toBe(false);
  });
});

describe("Student Defence Service — Logic & History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLecturerRepo.getStudentByUserId.mockResolvedValue(makeStudent());
  });

  it("getDefenceHistory filters failed/cancelled attempts and enriches names", async () => {
    mockCoreRepo.getAllStudentDefences.mockResolvedValue([
      makeDefence({ id: "d1", status: "passed" }),
      makeDefence({ id: "d2", status: "failed", examiners: [{ lecturerId: "lec-1" }] }),
    ]);
    mockPrisma.lecturer.findMany.mockResolvedValue([{ id: "lec-1", user: { fullName: "Dosen 1" } }]);

    const result = await getDefenceHistory("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("failed");
    expect(result[0].examiners[0].lecturerName).toBe("Dosen 1");
  });

  it("getDefenceDetail validates access and enriches data", async () => {
    const student = makeStudent();
    const defence = makeDefence({ thesis: { studentId: student.id } });
    mockCoreRepo.findStudentDefenceDetail.mockResolvedValue(defence);
    mockDocRepo.getDefenceDocumentTypes.mockResolvedValue([{ id: 'dt1', name: 'Type 1' }]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await getDefenceDetail("user-1", "def-1");
    expect(result.id).toBe("def-1");
  });

  it("getAssessmentView calculates average score correctly", async () => {
    const detail = makeDefence({ 
      status: "passed", 
      thesis: { studentId: "student-1", thesisSupervisors: [] },
      examinerAverageScore: 80,
      supervisorScore: 85,
      finalScore: 82.5
    });
    mockCoreRepo.findStudentDefenceDetail.mockResolvedValue(detail);
    mockExaminerRepo.findStudentDefenceExaminerAssessmentDetails.mockResolvedValue([]);
    mockCoreRepo.findDefenceSupervisorAssessmentDetails.mockResolvedValue([]);

    const result = await getAssessmentView("user-1", "def-1");
    expect(result.defence.finalScore).toBe(82.5);
    expect(result.defence.grade).toBe("A");
  });
});
