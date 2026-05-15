import { describe, it, expect, vi, beforeEach } from "vitest";
import * as service from "../../../../services/yudisium/exit-survey.service.js";
import * as repo from "../../../../repositories/yudisium/exit-survey.repository.js";
import prisma from "../../../../config/prisma.js";

vi.mock("../../../../repositories/yudisium/exit-survey.repository.js");
vi.mock("../../../../config/prisma.js", () => ({
  default: {
    studentExitSurveyResponse: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb({
        studentExitSurveyAnswer: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        exitSurveyOption: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        exitSurveyQuestion: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        exitSurveySession: { delete: vi.fn().mockResolvedValue({ id: '1' }) },
    })),
  },
}));

describe("Unit Test: Exit Survey Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      prisma.studentExitSurveyResponse.count.mockResolvedValue(10);

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

  describe("deleteSession", () => {
    it("should delete session and all its children via transaction", async () => {
      repo.findSessionById.mockResolvedValue({ id: "s1", exitSurveyFormId: "f1" });
      
      await service.deleteSession("f1", "s1");

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should throw 404 if session mismatch", async () => {
      repo.findSessionById.mockResolvedValue({ id: "s1", exitSurveyFormId: "other" });
      await expect(service.deleteSession("f1", "s1")).rejects.toThrow("Sesi tidak ditemukan");
    });
  });

  describe("createQuestion", () => {
    it("should validate question type", async () => {
      repo.findFormById.mockResolvedValue({ id: "f1", sessions: [] });
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
});
