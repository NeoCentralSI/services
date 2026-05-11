import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../repositories/metopenAssessmentAdmin.repository.js", () => ({
  findCpmkById: vi.fn(),
  findCriteriaById: vi.fn(),
  findCriteria: vi.fn(),
  createCriteria: vi.fn(),
  updateCriteria: vi.fn(),
  softDeleteCriteria: vi.fn(),
  findRubricById: vi.fn(),
  findRubricsByCriteria: vi.fn(),
  createRubric: vi.fn(),
  updateRubric: vi.fn(),
  softDeleteRubric: vi.fn(),
  getNextCriteriaDisplayOrder: vi.fn(),
  getNextRubricDisplayOrder: vi.fn(),
  getActiveCriteriaTotalScore: vi.fn(),
  criteriaHasAssessmentData: vi.fn(),
  rubricHasAssessmentData: vi.fn(),
  findConfiguredMetopenCpmks: vi.fn(),
  getMetopenWeightSummary: vi.fn(),
  findMetopenCriteriaByCpmk: vi.fn(),
  removeMetopenConfigByCpmk: vi.fn(),
  reorderCriteria: vi.fn(),
  reorderRubrics: vi.fn(),
}));

const repo = await import("../../repositories/metopenAssessmentAdmin.repository.js");
const service = await import("../metopenAssessmentAdmin.service.js");

function makeCpmk(type = "research_method") {
  return { id: "cpmk-1", type, code: "CPMK-01", isActive: true };
}

function makeCriteria(overrides = {}) {
  return {
    id: "crit-1",
    cpmkId: "cpmk-1",
    appliesTo: "metopen",
    role: "supervisor",
    name: "Presentasi Lisan",
    maxScore: 20,
    isDeleted: false,
    assessmentRubrics: [],
    ...overrides,
  };
}

describe("metopenAssessmentAdmin.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.criteriaHasAssessmentData.mockResolvedValue(false);
    repo.rubricHasAssessmentData.mockResolvedValue(false);
    repo.findRubricsByCriteria.mockResolvedValue([]);
  });

  describe("createCriteria", () => {
    it("creates criteria when within score cap (supervisor: 75)", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk());
      repo.getActiveCriteriaTotalScore.mockResolvedValue(55);
      repo.getNextCriteriaDisplayOrder.mockResolvedValue(1);
      repo.createCriteria.mockResolvedValue(makeCriteria());

      const result = await service.createCriteria({
        cpmkId: "cpmk-1",
        name: "Presentasi Lisan",
        role: "supervisor",
        maxScore: 20,
      });

      expect(repo.createCriteria).toHaveBeenCalledWith(
        expect.objectContaining({
          appliesTo: "proposal",
          role: "supervisor",
          maxScore: 20,
        }),
      );
      expect(result.id).toBe("crit-1");
    });

    it("rejects when score exceeds supervisor cap (75)", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk());
      repo.getActiveCriteriaTotalScore.mockResolvedValue(70);

      await expect(
        service.createCriteria({
          cpmkId: "cpmk-1",
          name: "Over",
          role: "supervisor",
          maxScore: 10,
        }),
      ).rejects.toThrow("Skor melebihi batas TA-03A (75)");
    });

    it("rejects when score exceeds default cap (25)", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk());
      repo.getActiveCriteriaTotalScore.mockResolvedValue(20);

      await expect(
        service.createCriteria({
          cpmkId: "cpmk-1",
          name: "Over",
          role: "default",
          maxScore: 10,
        }),
      ).rejects.toThrow("Skor melebihi batas TA-03B (25)");
    });

    it("rejects non-research_method CPMK", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk("thesis"));

      await expect(
        service.createCriteria({
          cpmkId: "cpmk-1",
          name: "X",
          role: "supervisor",
          maxScore: 10,
        }),
      ).rejects.toThrow("bukan CPMK Metode Penelitian");
    });

    it("rejects when CPMK not found", async () => {
      repo.findCpmkById.mockResolvedValue(null);

      await expect(
        service.createCriteria({
          cpmkId: "missing",
          name: "X",
          role: "supervisor",
          maxScore: 10,
        }),
      ).rejects.toThrow("CPMK tidak ditemukan");
    });
  });

  describe("updateCriteria", () => {
    it("rejects when updated score exceeds cap", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));
      repo.getActiveCriteriaTotalScore.mockResolvedValue(60);

      await expect(
        service.updateCriteria("crit-1", { maxScore: 20 }),
      ).rejects.toThrow("Skor melebihi batas");
    });

    it("allows update within cap", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));
      repo.getActiveCriteriaTotalScore.mockResolvedValue(50);
      repo.updateCriteria.mockResolvedValue(makeCriteria({ maxScore: 25 }));

      const result = await service.updateCriteria("crit-1", { maxScore: 25 });
      expect(result.maxScore).toBe(25);
    });

    it("checks score cap when moving criteria to another role without changing maxScore", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ role: "supervisor", maxScore: 20 }));
      repo.getActiveCriteriaTotalScore.mockResolvedValue(10);

      await expect(
        service.updateCriteria("crit-1", { role: "default" }),
      ).rejects.toThrow("Skor melebihi batas TA-03B (25)");
      expect(repo.updateCriteria).not.toHaveBeenCalled();
    });

    it("rejects semantic changes when criteria already has assessment data", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria());
      repo.criteriaHasAssessmentData.mockResolvedValue(true);

      await expect(
        service.updateCriteria("crit-1", { name: "Makna baru" }),
      ).rejects.toThrow("tidak dapat diubah maknanya");
      expect(repo.updateCriteria).not.toHaveBeenCalled();
    });

    it("allows operational updates when criteria already has assessment data", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ isActive: true }));
      repo.criteriaHasAssessmentData.mockResolvedValue(true);
      repo.updateCriteria.mockResolvedValue(makeCriteria({ isActive: false }));

      const result = await service.updateCriteria("crit-1", { isActive: false });
      expect(result.isActive).toBe(false);
      expect(repo.updateCriteria).toHaveBeenCalledWith(
        "crit-1",
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe("createRubric", () => {
    it("creates rubric from criteria path when range is valid", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));
      repo.findRubricsByCriteria.mockResolvedValue([]);
      repo.getNextRubricDisplayOrder.mockResolvedValue(1);
      repo.createRubric.mockResolvedValue({ id: "rubric-1", assessmentCriteriaId: "crit-1" });

      const result = await service.createRubric("crit-1", {
        minScore: 0,
        maxScore: 10,
        description: "Cukup",
      });

      expect(repo.createRubric).toHaveBeenCalledWith(
        expect.objectContaining({
          assessmentCriteriaId: "crit-1",
          minScore: 0,
          maxScore: 10,
          description: "Cukup",
        }),
      );
      expect(result.id).toBe("rubric-1");
    });

    it("rejects rubric range above criteria maxScore", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));

      await expect(
        service.createRubric("crit-1", {
          minScore: 0,
          maxScore: 25,
          description: "Terlalu besar",
        }),
      ).rejects.toThrow("melebihi skor maksimum kriteria");
      expect(repo.createRubric).not.toHaveBeenCalled();
    });

    it("rejects rubric range with maxScore below minScore at service layer", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));

      await expect(
        service.createRubric("crit-1", {
          minScore: 10,
          maxScore: 5,
          description: "Tidak valid",
        }),
      ).rejects.toThrow("Skor maksimal harus lebih besar");
      expect(repo.createRubric).not.toHaveBeenCalled();
    });

    it("rejects overlapping rubric ranges", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));
      repo.findRubricsByCriteria.mockResolvedValue([
        { id: "rubric-existing", minScore: 0, maxScore: 10 },
      ]);

      await expect(
        service.createRubric("crit-1", {
          minScore: 10,
          maxScore: 15,
          description: "Overlap",
        }),
      ).rejects.toThrow("tumpang tindih");
      expect(repo.createRubric).not.toHaveBeenCalled();
    });
  });

  describe("updateRubric", () => {
    it("rejects update when rubric has assessment data", async () => {
      repo.findRubricById.mockResolvedValue({
        id: "rubric-1",
        assessmentCriteriaId: "crit-1",
        minScore: 0,
        maxScore: 10,
        isDeleted: false,
      });
      repo.rubricHasAssessmentData.mockResolvedValue(true);

      await expect(
        service.updateRubric("rubric-1", { description: "Baru" }),
      ).rejects.toThrow("sudah digunakan pada data penilaian");
      expect(repo.updateRubric).not.toHaveBeenCalled();
    });

    it("rejects updated rubric overlap with another active rubric", async () => {
      repo.findRubricById.mockResolvedValue({
        id: "rubric-1",
        assessmentCriteriaId: "crit-1",
        minScore: 0,
        maxScore: 5,
        isDeleted: false,
      });
      repo.findCriteriaById.mockResolvedValue(makeCriteria({ maxScore: 20 }));
      repo.findRubricsByCriteria.mockResolvedValue([
        { id: "rubric-1", minScore: 0, maxScore: 5 },
        { id: "rubric-2", minScore: 10, maxScore: 20 },
      ]);

      await expect(
        service.updateRubric("rubric-1", { minScore: 8, maxScore: 12 }),
      ).rejects.toThrow("tumpang tindih");
      expect(repo.updateRubric).not.toHaveBeenCalled();
    });
  });

  describe("deleteCriteria", () => {
    it("rejects deletion when criteria has assessment data", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria());
      repo.criteriaHasAssessmentData.mockResolvedValue(true);

      await expect(service.deleteCriteria("crit-1")).rejects.toThrow(
        "sudah digunakan pada data penilaian",
      );
    });

    it("allows deletion when criteria has no assessment data", async () => {
      repo.findCriteriaById.mockResolvedValue(makeCriteria());
      repo.criteriaHasAssessmentData.mockResolvedValue(false);
      repo.softDeleteCriteria.mockResolvedValue({ id: "crit-1" });

      await expect(service.deleteCriteria("crit-1")).resolves.toBeDefined();
      expect(repo.softDeleteCriteria).toHaveBeenCalledWith("crit-1");
    });
  });

  describe("getCpmksWithRubrics", () => {
    it("delegates to repository with role", async () => {
      const mockData = [{ id: "cpmk-1", code: "CPMK-01", assessmentCriterias: [] }];
      repo.findConfiguredMetopenCpmks.mockResolvedValue(mockData);

      const result = await service.getCpmksWithRubrics("supervisor");
      expect(repo.findConfiguredMetopenCpmks).toHaveBeenCalledWith("supervisor");
      expect(result).toEqual(mockData);
    });
  });

  describe("getWeightSummary", () => {
    it("returns correct structure from repository", async () => {
      const mockSummary = {
        totalScore: 75,
        isComplete: true,
        details: [
          { cpmkId: "c1", cpmkCode: "CPMK-01", cpmkDescription: "X", criteriaCount: 3, criteriaScoreSum: 75, rubricCount: 6 },
        ],
      };
      repo.getMetopenWeightSummary.mockResolvedValue(mockSummary);

      const result = await service.getWeightSummary("supervisor");
      expect(result.totalScore).toBe(75);
      expect(result.details).toHaveLength(1);
    });
  });

  describe("removeCpmkConfig", () => {
    it("rejects when criteria has assessment data", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk());
      repo.findMetopenCriteriaByCpmk.mockResolvedValue([{ id: "crit-1" }]);
      repo.criteriaHasAssessmentData.mockResolvedValue(true);

      await expect(
        service.removeCpmkConfig("cpmk-1", "supervisor"),
      ).rejects.toThrow("sudah digunakan pada data penilaian");
    });

    it("removes config when no assessment data exists", async () => {
      repo.findCpmkById.mockResolvedValue(makeCpmk());
      repo.findMetopenCriteriaByCpmk.mockResolvedValue([{ id: "crit-1" }]);
      repo.criteriaHasAssessmentData.mockResolvedValue(false);
      repo.removeMetopenConfigByCpmk.mockResolvedValue({ deletedCriteria: 1, deletedRubrics: 2 });

      const result = await service.removeCpmkConfig("cpmk-1", "supervisor");
      expect(result.deletedCriteria).toBe(1);
    });
  });
});
