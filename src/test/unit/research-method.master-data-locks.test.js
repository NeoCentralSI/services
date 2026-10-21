/**
 * Kelola > Metode Penelitian once Penilaian Proposal has started in a semester (any draft or sent
 * detail): CPMK, criteria and rubrics cannot be deleted, no criterion or rubric is added, and the
 * maximum scores and rubric ranges stay; names and descriptions still change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminRepo, assessmentRepo } = vi.hoisted(() => ({
  adminRepo: {
    findCpmkById: vi.fn(async () => ({ id: "cpmk-1", code: "CPMK-01", academicYearId: "ay-2" })),
    findAllCpmks: vi.fn(async () => [{ id: "cpmk-1", code: "CPMK-01" }]),
    findCpmkByCode: vi.fn(async () => null),
    updateCpmk: vi.fn(async (id, data) => ({ id, ...data })),
    deleteCpmk: vi.fn(),
    findCriteriaById: vi.fn(async () => ({
      id: "c1",
      maxScore: 20,
      researchMethodCpmk: { id: "cpmk-1", academicYearId: "ay-2" },
      assessmentRubrics: [{ id: "r1", minScore: 0, maxScore: 20 }],
    })),
    updateCriteria: vi.fn(async (_assessor, id, data) => ({ id, ...data })),
    deleteCriteria: vi.fn(),
    createCriteria: vi.fn(),
    removeConfigByCpmk: vi.fn(),
    findRubricById: vi.fn(async () => ({ id: "r1", assessmentCriteriaId: "c1", minScore: 0, maxScore: 20 })),
    findRubricsByCriteria: vi.fn(async () => [{ id: "r1", minScore: 0, maxScore: 20 }]),
    updateRubric: vi.fn(async (_assessor, id, data) => ({ id, ...data })),
    deleteRubric: vi.fn(),
    createRubric: vi.fn(),
    getGlobalTotal: vi.fn(async () => ({ totalScore: 20 })),
    getNextCriteriaDisplayOrder: vi.fn(async () => 1),
    getNextRubricDisplayOrder: vi.fn(async () => 1),
    getWeightSummary: vi.fn(async () => ({ totalScore: 100 })),
  },
  assessmentRepo: { periodHasAssessmentDetails: vi.fn(), periodHasFinalResult: vi.fn() },
}));

vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../repositories/researchMethodAssessmentAdmin.repository.js", () => adminRepo);
vi.mock("../../repositories/research-method/assessment.repository.js", () => assessmentRepo);

const service = await import("../../services/researchMethodAssessmentAdmin.service.js");

const DELETE = "Penilaian proposal semester ini sudah dimulai; CPMK, kriteria, dan rubrik tidak dapat dihapus.";
const SCORE = "Penilaian proposal semester ini sudah dimulai; skor maksimum kriteria dan rentang rubrik tidak dapat diubah.";

beforeEach(() => {
  vi.clearAllMocks();
  assessmentRepo.periodHasAssessmentDetails.mockResolvedValue(true);
  assessmentRepo.periodHasFinalResult.mockResolvedValue(false);
});

describe("after Penilaian Proposal has started", () => {
  it("nothing is deleted", async () => {
    await expect(service.deleteCpmk("cpmk-1")).rejects.toThrow(DELETE);
    await expect(service.deleteCriteria("supervisor", "c1")).rejects.toThrow(DELETE);
    await expect(service.removeCpmkConfig("supervisor", "cpmk-1")).rejects.toThrow(DELETE);
    await expect(service.deleteRubric("supervisor", "r1")).rejects.toThrow(DELETE);
    expect(adminRepo.deleteCpmk).not.toHaveBeenCalled();
    expect(adminRepo.deleteCriteria).not.toHaveBeenCalled();
    expect(adminRepo.removeConfigByCpmk).not.toHaveBeenCalled();
    expect(adminRepo.deleteRubric).not.toHaveBeenCalled();
  });

  it("maximum scores and rubric ranges stay, and no criterion or rubric is added", async () => {
    await expect(service.updateCriteria("supervisor", "c1", { maxScore: 25 })).rejects.toThrow(SCORE);
    await expect(service.updateRubric("supervisor", "r1", { minScore: 1 })).rejects.toThrow(SCORE);
    await expect(service.createCriteria("supervisor", { researchMethodCpmkId: "cpmk-1", name: "Baru", maxScore: 5 })).rejects.toThrow(SCORE);
    await expect(service.createRubric("supervisor", "c1", { minScore: 0, maxScore: 5, description: "x" })).rejects.toThrow(SCORE);
    expect(adminRepo.updateCriteria).not.toHaveBeenCalled();
    expect(adminRepo.updateRubric).not.toHaveBeenCalled();
  });

  it("names and descriptions still change (also with the same maximum or range sent along)", async () => {
    await service.updateCriteria("supervisor", "c1", { name: "Presentasi rencana" });
    await service.updateCriteria("supervisor", "c1", { name: "Presentasi", maxScore: 20 });
    await service.updateRubric("supervisor", "r1", { description: "Baik sekali" });
    await service.updateCpmk("cpmk-1", { description: "Deskripsi baru CPMK" });
    expect(adminRepo.updateCriteria).toHaveBeenCalledTimes(2);
    expect(adminRepo.updateRubric).toHaveBeenCalledWith("supervisor", "r1", { description: "Baik sekali" });
    expect(adminRepo.updateCpmk).toHaveBeenCalled();
  });

  it("the CPMK list and the weight summary carry the locks", async () => {
    assessmentRepo.periodHasFinalResult.mockResolvedValue(true);
    expect(await service.listCpmks("ay-2")).toEqual([{ id: "cpmk-1", code: "CPMK-01", hasAssessmentDetails: true }]);
    expect(await service.getWeightSummary("ay-2")).toMatchObject({ totalScore: 100, assessmentStarted: true, minimumScoreLocked: true });
  });
});

describe("before Penilaian Proposal has started", () => {
  it("deleting and changing scores work as before", async () => {
    assessmentRepo.periodHasAssessmentDetails.mockResolvedValue(false);
    await service.deleteCpmk("cpmk-1");
    await service.deleteRubric("supervisor", "r1");
    await service.updateCriteria("supervisor", "c1", { maxScore: 25 });
    expect(adminRepo.deleteCpmk).toHaveBeenCalledWith("cpmk-1");
    expect(adminRepo.deleteRubric).toHaveBeenCalledWith("supervisor", "r1");
    expect(adminRepo.updateCriteria).toHaveBeenCalledWith("supervisor", "c1", { maxScore: 25 });
    expect(await service.listCpmks("ay-2")).toEqual([{ id: "cpmk-1", code: "CPMK-01", hasAssessmentDetails: false }]);
  });
});
