import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/metopen.grading.repository.js", () => ({
  findClassGradingData: vi.fn(),
  findStudentGradingData: vi.fn(),
  upsertResearchMethodScore: vi.fn(),
  upsertScoreDetails: vi.fn(),
  findMetopenAssessmentCriteria: vi.fn(),
}));

const repo = await import("../../repositories/metopen.grading.repository.js");
const {
  getClassGradingSummary,
  inputSupervisorScore,
  inputLecturerScore,
  lockClassGrades,
} = await import("../metopen.grading.service.js");

function makeEnrollment({ supervisorScore = null, lecturerScore = null } = {}) {
  return {
    student: {
      id: "student-1",
      user: { id: "user-1", fullName: "Alice", identityNumber: "12345" },
      thesis: [
        {
          id: "thesis-1",
          thesisSupervisors: [
            { lecturerId: "lect-1", lecturer: { user: { fullName: "Dr. X" } } },
          ],
          thesisMilestones: [
            { id: "m-1", totalScore: 80, milestoneTemplate: { weightPercentage: 50 } },
            { id: "m-2", totalScore: 90, milestoneTemplate: { weightPercentage: 50 } },
          ],
          researchMethodScores: [
            { supervisorScore, lecturerScore, calculatedAt: null },
          ],
        },
      ],
    },
  };
}

describe("metopen.grading.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getClassGradingSummary", () => {
    it("uses ResearchMethodScore for lecturerScore, not milestone aggregation", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: 80, lecturerScore: 70 }),
      ]);

      const [row] = await getClassGradingSummary("class-1");

      expect(row.lecturerScore).toBe(70);
      expect(row.supervisorScore).toBe(80);
      expect(row.finalScore).toBe(Math.round(80 * 0.7 + 70 * 0.3));
    });

    it("returns null finalScore when lecturerScore is missing", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: 80, lecturerScore: null }),
      ]);

      const [row] = await getClassGradingSummary("class-1");

      expect(row.lecturerScore).toBeNull();
      expect(row.finalScore).toBeNull();
    });

    it("returns null finalScore when supervisorScore is missing", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: null, lecturerScore: 70 }),
      ]);

      const [row] = await getClassGradingSummary("class-1");

      expect(row.supervisorScore).toBeNull();
      expect(row.finalScore).toBeNull();
    });
  });

  describe("inputSupervisorScore", () => {
    it("stores supervisor score from criteria-based rubric input", async () => {
      repo.findStudentGradingData.mockResolvedValue({
        thesisSupervisors: [{ lecturerId: "lect-1" }],
        researchMethodScores: [],
      });
      repo.upsertResearchMethodScore.mockResolvedValue({
        id: "rms-1",
        supervisorScore: 85,
      });
      repo.upsertScoreDetails.mockResolvedValue(undefined);

      const result = await inputSupervisorScore("thesis-1", "lect-1", {
        criteriaScores: [
          { criteriaId: "c-1", score: 80 },
          { criteriaId: "c-2", score: 90 },
        ],
      });

      expect(repo.upsertResearchMethodScore).toHaveBeenCalledWith(
        expect.objectContaining({ supervisorScore: 85 })
      );
      expect(repo.upsertScoreDetails).toHaveBeenCalledWith("rms-1", [
        { criteriaId: "c-1", score: 80 },
        { criteriaId: "c-2", score: 90 },
      ]);
    });

    it("rejects when caller is not an assigned supervisor", async () => {
      repo.findStudentGradingData.mockResolvedValue({
        thesisSupervisors: [{ lecturerId: "other-lect" }],
        researchMethodScores: [],
      });

      await expect(
        inputSupervisorScore("thesis-1", "lect-1", { score: 80 })
      ).rejects.toThrow("Anda bukan dosen pembimbing");
    });
  });

  describe("inputLecturerScore (TA-03B)", () => {
    it("requires supervisor score to exist before lecturer can score (BR-11)", async () => {
      repo.findStudentGradingData.mockResolvedValue({
        thesisSupervisors: [],
        researchMethodScores: [{ supervisorScore: null }],
      });

      await expect(
        inputLecturerScore("thesis-1", "lect-1", { score: 70 })
      ).rejects.toThrow("Nilai Dosen Pembimbing belum tersedia");
    });

    it("stores lecturer score when supervisor score already exists", async () => {
      repo.findStudentGradingData.mockResolvedValue({
        thesisSupervisors: [],
        researchMethodScores: [{ supervisorScore: 80 }],
      });
      repo.upsertResearchMethodScore.mockResolvedValue({
        id: "rms-1",
        lecturerScore: 75,
      });

      const result = await inputLecturerScore("thesis-1", "lect-1", {
        score: 75,
      });

      expect(repo.upsertResearchMethodScore).toHaveBeenCalledWith(
        expect.objectContaining({ lecturerScore: 75 })
      );
    });
  });

  describe("lockClassGrades", () => {
    it("rejects locking when any student is missing supervisorScore", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: null, lecturerScore: 70 }),
      ]);

      await expect(lockClassGrades("class-1", "lect-1")).rejects.toThrow(
        "belum mendapatkan nilai Pembimbing"
      );
    });

    it("rejects locking when any student is missing lecturerScore", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: 80, lecturerScore: null }),
      ]);

      await expect(lockClassGrades("class-1", "lect-1")).rejects.toThrow(
        "belum mendapatkan nilai Pengampu"
      );
    });

    it("calculates 70:30 correctly and finalizes when all scores present", async () => {
      repo.findClassGradingData.mockResolvedValue([
        makeEnrollment({ supervisorScore: 80, lecturerScore: 70 }),
      ]);
      repo.upsertResearchMethodScore.mockResolvedValue({
        id: "rms-1",
        finalScore: 77,
        isFinalized: true,
      });

      const [result] = await lockClassGrades("class-1", "lect-1");

      expect(result.finalScore).toBe(Math.round(80 * 0.7 + 70 * 0.3));
      expect(result.isPassed).toBe(true);

      expect(repo.upsertResearchMethodScore).toHaveBeenCalledWith(
        expect.objectContaining({
          isFinalized: true,
          finalScore: Math.round(80 * 0.7 + 70 * 0.3),
        })
      );
    });
  });
});
