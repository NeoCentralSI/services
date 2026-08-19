import { beforeEach, describe, expect, it, vi } from "vitest";

const { repository, getActiveAcademicYearId } = vi.hoisted(() => ({
  repository: {
    updateDefenceMinimumScore: vi.fn(),
    findThesisCpmkById: vi.fn(),
    findConfiguredDefenceCpmks: vi.fn(),
    getNextCriteriaDisplayOrder: vi.fn(),
    createCriteria: vi.fn(),
    findCriteriaById: vi.fn(),
    updateCriteria: vi.fn(),
    removeCriteriaWithRubrics: vi.fn(),
    findDefenceCriteriaByCpmk: vi.fn(),
    removeDefenceConfigByCpmk: vi.fn(),
    criteriaHasAssessmentData: vi.fn(),
    hasAnyAssessmentDataForAcademicYear: vi.fn(),
    findRubricById: vi.fn(),
    createRubricTx: vi.fn(),
    updateRubric: vi.fn(),
    removeRubric: vi.fn(),
    findRubricsByCriteria: vi.fn(),
    getActiveCriteriaTotalScore: vi.fn(),
    reorderCriteria: vi.fn(),
    reorderRubrics: vi.fn(),
    getDefenceWeightSummary: vi.fn(),
  },
  getActiveAcademicYearId: vi.fn(),
}));

vi.mock("../../../../repositories/defence-rubric.repository.js", () => repository);
vi.mock("../../../../helpers/academicYear.helper.js", () => ({ getActiveAcademicYearId }));

import {
  calculateDefenceTotals,
  createCriteria,
  getCpmksWithRubrics,
  getWeightSummary,
  reorderCriteria,
  reorderRubrics,
  updateCriteria,
  updateDefenceMinimumScore,
  updateRubric,
} from "../../../../services/defence-rubric.service.js";

describe("Defence rubric service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveAcademicYearId.mockResolvedValue("ay-active");
    repository.criteriaHasAssessmentData.mockResolvedValue(false);
    repository.hasAnyAssessmentDataForAcademicYear.mockResolvedValue(false);
    repository.findRubricsByCriteria.mockResolvedValue([]);
    repository.findDefenceCriteriaByCpmk.mockResolvedValue([]);
    repository.getActiveCriteriaTotalScore.mockImplementation(async (role) =>
      role === "examiner" ? 60 : 30
    );
  });

  it("returns the selected academic-year tree for the selected role", async () => {
    repository.findConfiguredDefenceCpmks.mockResolvedValue([{
      id: "cpmk-1",
      thesisDefenceExaminerAssessmentCriterias: [{
        id: "criteria-1",
        assessmentRubrics: [{ id: "rubric-1" }],
      }],
    }]);

    const result = await getCpmksWithRubrics("examiner", { academicYearId: "ay-1" });

    expect(repository.findConfiguredDefenceCpmks).toHaveBeenCalledWith("examiner", "ay-1");
    expect(result[0].assessmentCriterias[0].id).toBe("criteria-1");
  });

  it("rejects every unsupported defence role before repository access", async () => {
    await expect(getCpmksWithRubrics("default", { academicYearId: "ay-1" }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(createCriteria({
      thesisCpmkId: "cpmk-1",
      role: "default",
      name: "Invalid",
      maxScore: 10,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.findThesisCpmkById).not.toHaveBeenCalled();
  });

  it("calculates examiner and supervisor totals for one academic year", async () => {
    const result = await calculateDefenceTotals("ay-1");

    expect(repository.getActiveCriteriaTotalScore).toHaveBeenCalledWith("examiner", null, "ay-1");
    expect(repository.getActiveCriteriaTotalScore).toHaveBeenCalledWith("supervisor", null, "ay-1");
    expect(result).toEqual({
      examinerTotal: 60,
      supervisorTotal: 30,
      combinedTotal: 90,
    });
  });

  it("creates role-specific criteria while enforcing the combined 100 score cap", async () => {
    repository.findThesisCpmkById.mockResolvedValue({ id: "cpmk-1", academicYearId: "ay-1" });
    repository.getNextCriteriaDisplayOrder.mockResolvedValue(2);
    repository.createCriteria.mockResolvedValue({ id: "criteria-new" });

    await createCriteria({
      thesisCpmkId: "cpmk-1",
      role: "supervisor",
      name: "Kemandirian",
      maxScore: 10,
    });

    expect(repository.createCriteria).toHaveBeenCalledWith("supervisor", {
      thesisCpmkId: "cpmk-1",
      name: "Kemandirian",
      maxScore: 10,
      displayOrder: 2,
    });

    await expect(createCriteria({
      thesisCpmkId: "cpmk-1",
      role: "examiner",
      name: "Berlebih",
      maxScore: 11,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows name edits after scoring but locks maxScore", async () => {
    repository.findCriteriaById.mockResolvedValue({
      id: "criteria-1",
      maxScore: 20,
      thesisCpmk: { academicYearId: "ay-1" },
    });
    repository.criteriaHasAssessmentData.mockResolvedValue(true);
    repository.updateCriteria.mockResolvedValue({ id: "criteria-1", name: "Nama baru" });

    await expect(updateCriteria("examiner", "criteria-1", { name: "Nama baru" }))
      .resolves.toMatchObject({ name: "Nama baru" });
    await expect(updateCriteria("examiner", "criteria-1", { maxScore: 25 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("updates rubric data through the role-specific new-schema relation", async () => {
    repository.findRubricById.mockResolvedValue({
      id: "rubric-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: { id: "criteria-1", maxScore: 10 },
    });
    repository.updateRubric.mockResolvedValue({ id: "rubric-1", description: "Baru" });

    await updateRubric("supervisor", "rubric-1", { description: "Baru" });

    expect(repository.findRubricsByCriteria).toHaveBeenCalledWith(
      "supervisor",
      "criteria-1",
      "rubric-1",
    );
    expect(repository.updateRubric).toHaveBeenCalledWith(
      "supervisor",
      "rubric-1",
      { description: "Baru" },
    );
  });

  it("reorders only the complete criterion set for the selected role", async () => {
    repository.findDefenceCriteriaByCpmk.mockResolvedValue([
      { id: "criteria-1" },
      { id: "criteria-2" },
    ]);

    await reorderCriteria("examiner", {
      thesisCpmkId: "cpmk-1",
      orderedIds: ["criteria-2", "criteria-1"],
    });

    expect(repository.reorderCriteria).toHaveBeenCalledWith(
      "examiner",
      "cpmk-1",
      ["criteria-2", "criteria-1"],
    );
  });

  it("rejects rubric IDs outside the selected criterion and role", async () => {
    repository.findCriteriaById.mockResolvedValue({ id: "criteria-1" });
    repository.findRubricsByCriteria.mockResolvedValue([{ id: "rubric-1" }]);

    await expect(reorderRubrics("supervisor", {
      criteriaId: "criteria-1",
      orderedIds: ["rubric-other"],
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns role details with shared defence totals and the selected academic year", async () => {
    repository.getDefenceWeightSummary.mockResolvedValue({
      totalScore: 60,
      minimumScore: 65,
      details: [],
    });

    const result = await getWeightSummary("examiner", { academicYearId: "ay-1" });

    expect(repository.getDefenceWeightSummary).toHaveBeenCalledWith("examiner", "ay-1");
    expect(result).toMatchObject({
      totalScore: 60,
      minimumScore: 65,
      examinerTotal: 60,
      supervisorTotal: 30,
      combinedTotal: 90,
    });
  });

  it("updates the selected academic year's minimum score only before assessments exist", async () => {
    repository.updateDefenceMinimumScore.mockResolvedValue({ id: "ay-1", thesisDefenceMinimumScore: 65 });

    await updateDefenceMinimumScore("ay-1", 65);
    expect(repository.updateDefenceMinimumScore).toHaveBeenCalledWith("ay-1", 65);

    repository.hasAnyAssessmentDataForAcademicYear.mockResolvedValue(true);
    await expect(updateDefenceMinimumScore("ay-1", 70))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
