import { beforeEach, describe, expect, it, vi } from "vitest";

const { repository, getActiveAcademicYearId } = vi.hoisted(() => ({
  repository: {
    updateSeminarMinimumScore: vi.fn(),
    findThesisCpmkById: vi.fn(),
    findConfiguredSeminarCpmks: vi.fn(),
    getNextCriteriaDisplayOrder: vi.fn(),
    createCriteria: vi.fn(),
    findCriteriaById: vi.fn(),
    updateCriteria: vi.fn(),
    removeCriteriaWithRubrics: vi.fn(),
    findSeminarCriteriaByCpmk: vi.fn(),
    removeSeminarConfigByCpmk: vi.fn(),
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
    getSeminarWeightSummary: vi.fn(),
  },
  getActiveAcademicYearId: vi.fn(),
}));

vi.mock("../../../../repositories/seminar-rubric.repository.js", () => repository);
vi.mock("../../../../helpers/academicYear.helper.js", () => ({ getActiveAcademicYearId }));

import {
  createCriteria,
  createRubric,
  deleteCriteria,
  getCpmksWithRubrics,
  reorderCriteria,
  reorderRubrics,
  updateCriteria,
  updateRubric,
  updateSeminarMinimumScore,
} from "../../../../services/seminar-rubric.service.js";

describe("Seminar rubric service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveAcademicYearId.mockResolvedValue("ay-active");
    repository.criteriaHasAssessmentData.mockResolvedValue(false);
    repository.hasAnyAssessmentDataForAcademicYear.mockResolvedValue(false);
    repository.findRubricsByCriteria.mockResolvedValue([]);
    repository.findSeminarCriteriaByCpmk.mockResolvedValue([]);
    repository.getActiveCriteriaTotalScore.mockResolvedValue(0);
  });

  it("returns the selected academic-year rubric tree with assessment locks", async () => {
    repository.findConfiguredSeminarCpmks.mockResolvedValue([{
      id: "cpmk-1",
      thesisSeminarAssessmentCriterias: [{
        id: "criteria-1",
        assessmentRubrics: [{ id: "rubric-1" }],
      }],
    }]);
    repository.criteriaHasAssessmentData.mockResolvedValue(true);

    const result = await getCpmksWithRubrics({ academicYearId: "ay-1" });

    expect(repository.findConfiguredSeminarCpmks).toHaveBeenCalledWith("ay-1");
    expect(result[0].assessmentCriterias[0].hasAssessmentDetails).toBe(true);
    expect(result[0].hasAssessmentDetails).toBe(true);
  });

  it("creates criteria under the CPMK academic year without exceeding 100", async () => {
    repository.findThesisCpmkById.mockResolvedValue({ id: "cpmk-1", academicYearId: "ay-1" });
    repository.getActiveCriteriaTotalScore.mockResolvedValue(70);
    repository.getNextCriteriaDisplayOrder.mockResolvedValue(3);
    repository.createCriteria.mockResolvedValue({ id: "criteria-new" });

    await createCriteria({ thesisCpmkId: "cpmk-1", name: "Analisis", maxScore: 30 });

    expect(repository.getActiveCriteriaTotalScore).toHaveBeenCalledWith(null, "ay-1");
    expect(repository.createCriteria).toHaveBeenCalledWith({
      thesisCpmkId: "cpmk-1",
      name: "Analisis",
      maxScore: 30,
      displayOrder: 3,
    });
  });

  it("rejects criteria that would make the academic-year total exceed 100", async () => {
    repository.findThesisCpmkById.mockResolvedValue({ id: "cpmk-1", academicYearId: "ay-1" });
    repository.getActiveCriteriaTotalScore.mockResolvedValue(90);

    await expect(createCriteria({
      thesisCpmkId: "cpmk-1",
      name: "Analisis",
      maxScore: 20,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows a criteria name change after scoring but locks maxScore", async () => {
    repository.findCriteriaById.mockResolvedValue({
      id: "criteria-1",
      maxScore: 20,
      thesisCpmk: { academicYearId: "ay-1" },
    });
    repository.criteriaHasAssessmentData.mockResolvedValue(true);
    repository.updateCriteria.mockResolvedValue({ id: "criteria-1", name: "Nama baru" });

    await expect(updateCriteria("criteria-1", { name: "Nama baru" })).resolves.toMatchObject({
      name: "Nama baru",
    });
    await expect(updateCriteria("criteria-1", { maxScore: 25 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("blocks deleting a scored criterion", async () => {
    repository.findCriteriaById.mockResolvedValue({ id: "criteria-1" });
    repository.criteriaHasAssessmentData.mockResolvedValue(true);

    await expect(deleteCriteria("criteria-1")).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.removeCriteriaWithRubrics).not.toHaveBeenCalled();
  });

  it("validates rubric ranges against the criterion and existing ranges", async () => {
    repository.findCriteriaById.mockResolvedValue({ id: "criteria-1", maxScore: 10 });
    repository.findRubricsByCriteria.mockResolvedValue([{ id: "rubric-1", minScore: 0, maxScore: 5 }]);

    await expect(createRubric("criteria-1", {
      description: "Tumpang tindih",
      minScore: 5,
      maxScore: 8,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updates a rubric through the new assessmentCriteria relation", async () => {
    repository.findRubricById.mockResolvedValue({
      id: "rubric-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: { id: "criteria-1", maxScore: 10 },
    });
    repository.updateRubric.mockResolvedValue({ id: "rubric-1", description: "Baru" });

    await updateRubric("rubric-1", { description: "Baru" });

    expect(repository.findRubricsByCriteria).toHaveBeenCalledWith("criteria-1", "rubric-1");
    expect(repository.updateRubric).toHaveBeenCalledWith("rubric-1", { description: "Baru" });
  });

  it("reorders only a complete, unlocked criterion set belonging to the CPMK", async () => {
    repository.findSeminarCriteriaByCpmk.mockResolvedValue([{ id: "criteria-1" }, { id: "criteria-2" }]);

    await reorderCriteria({
      thesisCpmkId: "cpmk-1",
      orderedIds: ["criteria-2", "criteria-1"],
    });

    expect(repository.reorderCriteria).toHaveBeenCalledWith(
      "cpmk-1",
      ["criteria-2", "criteria-1"],
    );
  });

  it("rejects rubric reorder IDs from another criterion", async () => {
    repository.findCriteriaById.mockResolvedValue({ id: "criteria-1" });
    repository.findRubricsByCriteria.mockResolvedValue([{ id: "rubric-1" }]);

    await expect(reorderRubrics({
      criteriaId: "criteria-1",
      orderedIds: ["rubric-other"],
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updates the minimum passing score for the requested academic year only when unlocked", async () => {
    repository.updateSeminarMinimumScore.mockResolvedValue({ id: "ay-1", thesisSeminarMinimumScore: 65 });

    await updateSeminarMinimumScore("ay-1", 65);

    expect(repository.updateSeminarMinimumScore).toHaveBeenCalledWith("ay-1", 65);

    repository.hasAnyAssessmentDataForAcademicYear.mockResolvedValue(true);
    await expect(updateSeminarMinimumScore("ay-1", 70)).rejects.toMatchObject({ statusCode: 400 });
  });
});
