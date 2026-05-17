import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as service from "../../../../services/yudisium/exit-survey.service.js";
import * as repo from "../../../../repositories/yudisium/exit-survey.repository.js";
import * as studentService from "../../../../services/yudisium/student.service.js";
import prisma from "../../../../config/prisma.js";
import { convertHtmlToPdf } from "../../../../utils/pdf.util.js";

vi.mock("../../../../repositories/yudisium/exit-survey.repository.js");
vi.mock("../../../../services/yudisium/student.service.js");
vi.mock("../../../../config/prisma.js", () => ({
  default: {
    studentExitSurveyResponse: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    studentExitSurveyAnswer: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb({
        studentExitSurveyAnswer: { 
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }) 
        },
        exitSurveyOption: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        exitSurveyQuestion: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        exitSurveySession: { delete: vi.fn().mockResolvedValue({ id: '1' }) },
        studentExitSurveyResponse: { 
          create: vi.fn().mockResolvedValue({ id: 'r1' }),
          findUnique: vi.fn().mockResolvedValue({ id: 'r1', answers: [] })
        },
    })),
  },
}));
vi.mock("../../../../utils/pdf.util.js", () => ({
  convertHtmlToPdf: vi.fn(),
}));

const makeYudisiumContext = (overrides = {}) => ({
  id: "y1",
  name: "Yudisium Mei 2026",
  registrationOpenDate: new Date("2026-05-01T00:00:00.000Z"),
  registrationCloseDate: new Date("2026-05-31T23:59:59.000Z"),
  eventDate: new Date("2026-06-10T02:00:00.000Z"),
  exitSurveyForm: {
    id: "f1",
    name: "Exit Survey",
    description: null,
    sessions: [],
  },
  ...overrides,
});

const makeStudentContext = (overrides = {}) => ({
  id: "student-1",
  skscompleted: 150,
  mandatoryCoursesCompleted: true,
  mkwuCompleted: true,
  internshipCompleted: true,
  kknCompleted: true,
  ...overrides,
});

const makeThesisContext = (overrides = {}) => ({
  id: "t1",
  thesisDefences: [
    {
      status: "passed",
      revisionFinalizedAt: null,
      revisionFinalizedBy: null,
    },
  ],
  ...overrides,
});

describe("Unit Test: Exit Survey Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================
  // FORMS
  // ============================================================
  describe("getForms", () => {
    it("should return formatted form summaries", async () => {
      const mockForms = [
        {
          id: "1",
          name: "Form A",
          isActive: true,
          sessions: [{ _count: { questions: 5 } }],
          _count: { yudisiums: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      repo.findAllForms.mockResolvedValue(mockForms);

      const result = await service.getForms();

      expect(result).toHaveLength(1);
      expect(result[0].totalQuestions).toBe(5);
      expect(result[0].usedCount).toBe(2);
    });
  });

  describe("getFormDetail", () => {
    it("should return detailed form structure with question counts", async () => {
      const mockForm = {
        id: "1",
        name: "Form A",
        isActive: true,
        sessions: [
          {
            id: "s1",
            name: "Session 1",
            order: 1,
            questions: [
              { id: "q1", question: "Q1", questionType: "short_answer", isRequired: true, orderNumber: 1 },
            ],
          },
        ],
        _count: { yudisiums: 1 },
      };
      repo.findFormById.mockResolvedValue(mockForm);
      prisma.studentExitSurveyResponse.findMany.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ thesisId: `thesis-${i}` }))
      );

      const result = await service.getFormDetail("1");

      expect(result.id).toBe("1");
      expect(result.totalQuestions).toBe(1);
      expect(result.totalResponses).toBe(10);
    });

    it("should throw 404 if form not found", async () => {
      repo.findFormById.mockResolvedValue(null);
      await expect(service.getFormDetail("999")).rejects.toThrow("tidak ditemukan");
    });
  });

  describe("createForm", () => {
    it("should create form with default values", async () => {
      const input = { name: "New Form", description: "Desc" };
      repo.createForm.mockResolvedValue({ id: "1", ...input, isActive: true });
      
      const result = await service.createForm(input);
      expect(result.id).toBe("1");
      expect(repo.createForm).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    });
  });

  describe("updateForm", () => {
    it("should prevent updates if form has linked responses", async () => {
      repo.findFormById.mockResolvedValue({ id: "1" });
      repo.formHasLinkedResponses.mockResolvedValue(true);

      await expect(service.updateForm("1", { name: "New" })).rejects.toThrow("sudah digunakan mahasiswa");
    });

    it("should update form if no responses exist", async () => {
      repo.findFormById.mockResolvedValue({ id: "1", name: "Old" });
      repo.formHasLinkedResponses.mockResolvedValue(false);
      repo.updateForm.mockResolvedValue({ id: "1", name: "New" });

      const result = await service.updateForm("1", { name: "New" });
      expect(result.name).toBe("New");
    });
  });

  describe("toggleForm", () => {
    it("should flip the isActive status", async () => {
      repo.findFormById.mockResolvedValue({ id: "1", isActive: true });
      repo.updateForm.mockResolvedValue({ id: "1", isActive: false });

      const result = await service.toggleForm("1");
      expect(result.isActive).toBe(false);
      expect(repo.updateForm).toHaveBeenCalledWith("1", { isActive: false });
    });
  });

  describe("deleteForm", () => {
    it("should delete form if not used in yudisium", async () => {
      repo.findFormById.mockResolvedValue({ id: "1" });
      repo.formHasRelatedYudisiums.mockResolvedValue(false);
      
      await service.deleteForm("1");
      expect(repo.removeForm).toHaveBeenCalledWith("1");
    });

    it("should throw 409 if form is used in yudisium", async () => {
      repo.findFormById.mockResolvedValue({ id: "1" });
      repo.formHasRelatedYudisiums.mockResolvedValue(true);

      await expect(service.deleteForm("1")).rejects.toThrow("sudah digunakan oleh acara yudisium");
    });
  });

  describe("getFormResponses", () => {
    it("should return mapped student responses", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1" });
      prisma.studentExitSurveyResponse.findMany.mockResolvedValue([
        {
          id: "r1",
          thesisId: "t1",
          submittedAt: new Date(),
          yudisium: { name: "Yud A" },
          answers: [],
          thesis: {
            student: {
              enrollmentYear: 2020,
              gpa: 3.82,
              graduationPredicate: "Dengan Pujian",
              user: { fullName: "Fathur", gender: false },
            },
          },
        }
      ]);

      const result = await service.getFormResponses("f1");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Fathur");
      expect(result[0].thesisId).toBe("t1");
      expect(result[0].genderLabel).toBe("Laki-laki");
      expect(result[0].gpa).toBe(3.82);
    });

    it("exports PDF report for choice-question responses using backend renderer", async () => {
      convertHtmlToPdf.mockResolvedValue(Buffer.from("exit-survey-pdf"));
      repo.findFormById.mockResolvedValue({
        id: "f1",
        name: "Exit Survey Alumni",
        sessions: [
          {
            id: "s1",
            name: "Akademik",
            order: 1,
            questions: [
              {
                id: "q1",
                question: "Kesesuaian kurikulum",
                questionType: "single_choice",
                orderNumber: 1,
                options: [
                  { id: "o1", optionText: "Sangat Sesuai", orderNumber: 1 },
                  { id: "o2", optionText: "Sesuai", orderNumber: 2 },
                ],
              },
              {
                id: "q2",
                question: "Saran",
                questionType: "paragraph",
                orderNumber: 2,
                options: [],
              },
            ],
          },
        ],
      });
      prisma.studentExitSurveyResponse.findMany.mockResolvedValue([
        {
          id: "r1",
          thesisId: "t1",
          submittedAt: new Date("2026-05-16T00:22:00.000Z"),
          yudisiumId: "y1",
          yudisium: { name: "Yudisium Mei 2026" },
          answers: [
            {
              exitSurveyQuestionId: "q1",
              exitSurveyOptionId: "o1",
              answerText: null,
              option: { optionText: "Sangat Sesuai" },
              question: { question: "Kesesuaian kurikulum" },
            },
            {
              exitSurveyQuestionId: "q2",
              exitSurveyOptionId: null,
              answerText: "Bagus",
              option: null,
              question: { question: "Saran" },
            },
          ],
          thesis: {
            student: {
              enrollmentYear: 2020,
              gpa: 3.81,
              user: { fullName: "Fathur", identityNumber: "001", gender: false },
            },
          },
        },
      ]);

      const result = await service.exportFormResponsesPdf("f1");

      expect(result).toEqual(Buffer.from("exit-survey-pdf"));
      const html = convertHtmlToPdf.mock.calls[0][0];
      expect(html).toContain("Laporan Exit Survey");
      expect(html).toContain("Daftar Isi");
      expect(html).toContain("Identitas Responden");
      expect(html).toContain("Kesesuaian kurikulum");
      expect(html).toContain("Sangat Sesuai");
      expect(html).not.toContain("Bagus");
    });

    it("exports Excel report with respondent identity and answers", async () => {
      repo.findFormById.mockResolvedValue({
        id: "f1",
        name: "Exit Survey Alumni",
        sessions: [
          {
            id: "s1",
            name: "Akademik",
            order: 1,
            questions: [
              {
                id: "q1",
                question: "Kesesuaian kurikulum",
                questionType: "single_choice",
                orderNumber: 1,
                options: [{ id: "o1", optionText: "Sangat Sesuai", orderNumber: 1 }],
              },
            ],
          },
        ],
      });
      prisma.studentExitSurveyResponse.findMany.mockResolvedValue([
        {
          id: "r1",
          thesisId: "t1",
          submittedAt: new Date("2026-05-16T00:22:00.000Z"),
          yudisiumId: "y1",
          yudisium: { name: "Yudisium Mei 2026" },
          answers: [
            {
              exitSurveyQuestionId: "q1",
              exitSurveyOptionId: "o1",
              answerText: null,
              option: { optionText: "Sangat Sesuai" },
              question: { question: "Kesesuaian kurikulum" },
            },
          ],
          thesis: {
            student: {
              enrollmentYear: 2020,
              gpa: 3.81,
              user: { fullName: "Fathur", identityNumber: "001", gender: false },
            },
          },
        },
      ]);

      const result = await service.exportFormResponsesExcel("f1");

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("duplicateForm", () => {
    it("should create a copy of the form with all sessions and questions", async () => {
      const mockExisting = {
        id: "old",
        name: "Old Form",
        sessions: [
          {
            id: "s1",
            name: "S1",
            order: 1,
            questions: [{ id: "q1", question: "Q1", questionType: "short_answer", options: [] }],
          },
        ],
      };
      repo.findFormById.mockResolvedValueOnce(mockExisting);
      repo.createForm.mockResolvedValue({ id: "new", name: "Salinan - Old Form" });
      repo.createSession.mockResolvedValue({ id: "new-s1" });
      
      // Mock getFormDetail for the final return
      repo.findFormById.mockResolvedValue({ id: "new", name: "Salinan - Old Form", sessions: [] });

      await service.duplicateForm("old");

      expect(repo.createForm).toHaveBeenCalledWith(expect.objectContaining({ name: "Salinan - Old Form" }));
      expect(repo.createSession).toHaveBeenCalled();
      expect(repo.createQuestion).toHaveBeenCalled();
    });
  });

  // ============================================================
  // SESSIONS
  // ============================================================
  describe("createSession", () => {
    it("should create session with correct order", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1", sessions: [{}, {}] });
      await service.createSession("f1", { name: "S3" });
      expect(repo.createSession).toHaveBeenCalledWith(expect.objectContaining({ order: 3 }));
    });
  });

  describe("deleteSession", () => {
    it("should delete session and all its children via transaction", async () => {
      repo.findSessionById.mockResolvedValue({ id: "s1", exitSurveyFormId: "f1" });
      repo.formHasLinkedResponses.mockResolvedValue(false);
      
      await service.deleteSession("f1", "s1");

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should prevent deleting session if form has linked responses", async () => {
      repo.findSessionById.mockResolvedValue({ id: "s1", exitSurveyFormId: "f1" });
      repo.formHasLinkedResponses.mockResolvedValue(true);

      await expect(service.deleteSession("f1", "s1")).rejects.toThrow("sudah digunakan mahasiswa");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should throw 404 if session mismatch", async () => {
      repo.findSessionById.mockResolvedValue({ id: "s1", exitSurveyFormId: "other" });
      await expect(service.deleteSession("f1", "s1")).rejects.toThrow("Sesi tidak ditemukan");
    });
  });

  // ============================================================
  // QUESTIONS
  // ============================================================
  describe("createQuestion", () => {
    it("should validate question type", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1", sessions: [] });
      repo.formHasLinkedResponses.mockResolvedValue(false);
      await expect(service.createQuestion("f1", { questionType: "invalid" })).rejects.toThrow("Jenis pertanyaan tidak valid");
    });

    it("should create session if none exists when adding a question", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1", sessions: [] });
      repo.formHasLinkedResponses.mockResolvedValue(false);
      repo.createSession.mockResolvedValue({ id: "auto-s1" });
      repo.createQuestion.mockResolvedValue({ id: "q1" });

      await service.createQuestion("f1", { question: "Q", questionType: "short_answer" });

      expect(repo.createSession).toHaveBeenCalled();
      expect(repo.createQuestion).toHaveBeenCalledWith(expect.objectContaining({ exitSurveySessionId: "auto-s1" }));
    });
  });

  describe("updateQuestion", () => {
    it("should update question data", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1" });
      repo.formHasLinkedResponses.mockResolvedValue(false);
      repo.findQuestionById.mockResolvedValue({ id: "q1", session: { exitSurveyFormId: "f1" } });
      repo.updateQuestion.mockResolvedValue({ id: "q1", question: "Updated" });

      const result = await service.updateQuestion("f1", "q1", { question: "Updated" });
      expect(result.question).toBe("Updated");
    });
  });

  // ============================================================
  // STUDENT SURVEY
  // ============================================================
  describe("getStudentSurvey", () => {
    it("should return student context and form", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext(),
        thesis: makeThesisContext()
      });
      repo.findResponseByYudisiumThesis.mockResolvedValue(null);

      const result = await service.getStudentSurvey("user1");
      expect(result.yudisium.id).toBe("y1");
      expect(result.isSubmitted).toBe(false);
    });

    it("should block new survey when registration is not open", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext({
          registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
          registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          eventDate: new Date("2026-06-10T02:00:00.000Z"),
        }),
        thesis: makeThesisContext(),
      });
      repo.findResponseByYudisiumThesis.mockResolvedValue(null);

      await expect(service.getStudentSurvey("user1"))
        .rejects.toThrow("Exit survey hanya dapat diisi saat pendaftaran yudisium dibuka");
    });

    it("should still allow reading an existing survey response after registration closes", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext({
          registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
          registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          eventDate: new Date("2026-06-10T02:00:00.000Z"),
        }),
        thesis: makeThesisContext(),
      });
      repo.findResponseByYudisiumThesis.mockResolvedValue({
        id: "response-1",
        submittedAt: new Date("2026-04-10T00:00:00.000Z"),
        answers: [],
      });

      const result = await service.getStudentSurvey("user1");

      expect(result.isSubmitted).toBe(true);
      expect(result.response.id).toBe("response-1");
    });

    it("should block survey access until academic requirements are met", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext({ kknCompleted: false }),
        currentYudisium: makeYudisiumContext(),
        thesis: makeThesisContext(),
      });

      await expect(service.getStudentSurvey("user1"))
        .rejects.toThrow("Exit survey hanya dapat diakses setelah seluruh persyaratan akademik terpenuhi");
    });
  });

  describe("submitStudentSurvey", () => {
    it("should submit answers successfully", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext({ exitSurveyForm: { 
          id: "f1",
          name: "Exit Survey",
          description: null,
          sessions: [{ questions: [{ id: "q1", isRequired: true, questionType: "short_answer" }] }] 
        } }),
        thesis: makeThesisContext()
      });
      repo.findResponseByYudisiumThesis.mockResolvedValue(null);
      repo.createResponseWithAnswers.mockResolvedValue({ id: "r1", answers: [] });

      const result = await service.submitStudentSurvey("user1", {
        answers: [{ questionId: "q1", answerText: "Valid Answer" }]
      });

      expect(repo.createResponseWithAnswers).toHaveBeenCalled();
      expect(result.response).toBeDefined();
    });

    it("should throw error if required question is missing", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext({ exitSurveyForm: { 
          id: "f1",
          name: "Exit Survey",
          description: null,
          sessions: [{ questions: [{ id: "q1", isRequired: true, question: "Req Q" }] }] 
        } }),
        thesis: makeThesisContext()
      });
      repo.findResponseByYudisiumThesis.mockResolvedValue(null);

      await expect(service.submitStudentSurvey("user1", { answers: [] }))
        .rejects.toThrow("Pertanyaan wajib belum dijawab: Req Q");
    });

    it("should block submission when registration is not open", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext(),
        currentYudisium: makeYudisiumContext({
          registrationOpenDate: new Date("2026-04-01T00:00:00.000Z"),
          registrationCloseDate: new Date("2026-04-30T23:59:59.000Z"),
          eventDate: new Date("2026-06-10T02:00:00.000Z"),
        }),
        thesis: makeThesisContext(),
      });

      await expect(service.submitStudentSurvey("user1", {
        answers: [{ questionId: "q1", answerText: "Valid Answer" }],
      })).rejects.toThrow("Exit survey hanya dapat diisi saat pendaftaran yudisium dibuka");
      expect(repo.createResponseWithAnswers).not.toHaveBeenCalled();
    });

    it("should block submission until academic requirements are met", async () => {
      studentService.findStudentContext.mockResolvedValue({
        student: makeStudentContext({ skscompleted: 120 }),
        currentYudisium: makeYudisiumContext(),
        thesis: makeThesisContext(),
      });

      await expect(service.submitStudentSurvey("user1", {
        answers: [{ questionId: "q1", answerText: "Valid Answer" }],
      })).rejects.toThrow("Exit survey hanya dapat diisi setelah seluruh persyaratan akademik terpenuhi");
      expect(repo.createResponseWithAnswers).not.toHaveBeenCalled();
    });
  });
});
