/**
 * Unit Tests — TA-17 Evaluasi Bimbingan Berkala (FR-EVL-01)
 * Updated to mock repository layer after H-03 refactoring.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../repositories/thesisGuidanceEvaluation.repository.js", () => ({
  findThesisSupervisor: vi.fn(),
  findPendingEvaluation: vi.fn(),
  createEvaluation: vi.fn(),
  findUsersByActiveRole: vi.fn(),
  findEvaluationById: vi.fn(),
  approveEvaluation: vi.fn(),
  rejectEvaluation: vi.fn(),
  findPendingEvaluations: vi.fn(),
  findEvaluationsForThesis: vi.fn(),
  findSupervisorId: vi.fn(),
}));

vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue(undefined),
}));

const repo = await import("../../repositories/thesisGuidanceEvaluation.repository.js");

import {
  submitEvaluation,
  kadepReviewEvaluation,
  getPendingEvaluations,
} from "../../services/thesisGuidanceEvaluation.service.js";

const SUPERVISOR = {
  id: "ts-1",
  thesisId: "thesis-1",
  lecturerId: "lec-1",
  thesis: {
    student: { user: { fullName: "Budi", id: "user-1" } },
  },
};

describe("ThesisGuidanceEvaluation: TA-17 (FR-EVL-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitEvaluation", () => {
    it("creates six_month evaluation with extend_1_month recommendation", async () => {
      repo.findThesisSupervisor.mockResolvedValue(SUPERVISOR);
      repo.findPendingEvaluation.mockResolvedValue(null);
      repo.createEvaluation.mockResolvedValue({
        id: "eval-1",
        evaluationType: "six_month",
        recommendation: "extend_1_month",
        status: "pending",
      });
      repo.findUsersByActiveRole.mockResolvedValue([{ id: "kadep-1" }]);

      const result = await submitEvaluation("lec-1", {
        thesisId: "thesis-1",
        evaluationType: "six_month",
        recommendation: "extend_1_month",
        notes: "Perlu perpanjangan",
      });

      expect(result.evaluationType).toBe("six_month");
      expect(result.recommendation).toBe("extend_1_month");
      expect(repo.createEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          thesisId: "thesis-1",
          thesisSupervisorId: "ts-1",
          evaluationType: "six_month",
          recommendation: "extend_1_month",
          status: "pending",
        })
      );
    });

    it("rejects invalid recommendation for six_month", async () => {
      await expect(
        submitEvaluation("lec-1", {
          thesisId: "thesis-1",
          evaluationType: "six_month",
          recommendation: "terminate_supervision",
          notes: "x",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects when lecturer is not supervisor", async () => {
      repo.findThesisSupervisor.mockResolvedValue(null);

      await expect(
        submitEvaluation("lec-2", {
          thesisId: "thesis-1",
          evaluationType: "six_month",
          recommendation: "extend_1_month",
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("kadepReviewEvaluation", () => {
    it("approves evaluation and terminates supervisor when recommendation is terminate_supervision", async () => {
      repo.findEvaluationById.mockResolvedValue({
        id: "eval-1",
        status: "pending",
        recommendation: "terminate_supervision",
        thesisSupervisorId: "ts-1",
      });
      repo.approveEvaluation.mockResolvedValue({
        action: "approved",
        evaluationId: "eval-1",
      });

      const result = await kadepReviewEvaluation("eval-1", "kadep-1", {
        action: "approve",
        kadepNotes: "Disetujui",
      });

      expect(result.action).toBe("approved");
      expect(repo.approveEvaluation).toHaveBeenCalledWith(
        "eval-1", "kadep-1", "Disetujui"
      );
    });

    it("rejects (400) when evaluation already processed", async () => {
      repo.findEvaluationById.mockResolvedValue({
        id: "eval-1",
        status: "approved",
      });

      await expect(
        kadepReviewEvaluation("eval-1", "kadep-1", { action: "approve" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("getPendingEvaluations", () => {
    it("returns pending evaluations", async () => {
      repo.findPendingEvaluations.mockResolvedValue([]);

      const result = await getPendingEvaluations();

      expect(Array.isArray(result)).toBe(true);
      expect(repo.findPendingEvaluations).toHaveBeenCalled();
    });
  });
});
