import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findCpmkById: vi.fn(),
  findAllCpmks: vi.fn(),
  findCpmkByCode: vi.fn(),
  createCpmk: vi.fn(),
  updateCpmk: vi.fn(),
  deleteCpmk: vi.fn(),
  getGlobalTotal: vi.fn(),
  getNextCriteriaDisplayOrder: vi.fn(),
  createCriteria: vi.fn(),
  findCriteriaById: vi.fn(),
  updateCriteria: vi.fn(),
  deleteCriteria: vi.fn(),
  getWeightSummary: vi.fn(),
  findConfiguredCpmks: vi.fn(),
  findRubricsByCriteria: vi.fn(),
  getNextRubricDisplayOrder: vi.fn(),
  createRubric: vi.fn(),
  findRubricById: vi.fn(),
  updateRubric: vi.fn(),
  deleteRubric: vi.fn(),
  findCriteriaByCpmk: vi.fn(),
  removeConfigByCpmk: vi.fn(),
  reorderCriteria: vi.fn(),
  reorderRubrics: vi.fn(),
}));

vi.mock("../../repositories/researchMethodAssessmentAdmin.repository.js", () => repo);

const service = await import("../researchMethodAssessmentAdmin.service.js");

const cpmk = {
  id: "cpmk-1",
  code: "CPMK-01",
  description: "Analisis masalah penelitian",
  academicYearId: "ay-1",
};

describe("researchMethodAssessmentAdmin.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getGlobalTotal.mockResolvedValue({
      supervisorTotal: 60,
      coordinatorTotal: 20,
      totalScore: 80,
    });
  });

  it("menerima aktor pembimbing dan koordinator", () => {
    expect(service.requireAssessor("supervisor")).toBe("supervisor");
    expect(service.requireAssessor("coordinator")).toBe("coordinator");
  });

  it("menolak nama aktor lama default", () => {
    expect(() => service.requireAssessor("default")).toThrow(
      /supervisor atau coordinator/,
    );
  });

  it("membuat CPMK baru secara independen pada tahun ajaran yang dipilih", async () => {
    repo.findCpmkByCode.mockResolvedValue(null);
    repo.createCpmk.mockResolvedValue(cpmk);

    await expect(
      service.createCpmk({
        code: "cpmk 01",
        description: cpmk.description,
        academicYearId: "ay-1",
      }),
    ).resolves.toEqual(cpmk);

    expect(repo.createCpmk).toHaveBeenCalledWith({
      code: "CPMK-01",
      description: cpmk.description,
      academicYearId: "ay-1",
    });
  });

  it("menolak CPMK duplikat dalam tahun ajaran yang sama", async () => {
    repo.findCpmkByCode.mockResolvedValue(cpmk);

    await expect(
      service.createCpmk({
        code: "CPMK-01",
        description: cpmk.description,
        academicYearId: "ay-1",
      }),
    ).rejects.toThrow(/sudah ada/);
  });

  it("dapat menghapus CPMK baru tanpa membaca nilai TA-03 lama", async () => {
    repo.findCpmkById.mockResolvedValue(cpmk);
    repo.deleteCpmk.mockResolvedValue(cpmk);

    await expect(service.deleteCpmk(cpmk.id)).resolves.toEqual(cpmk);

    expect(repo.deleteCpmk).toHaveBeenCalledWith(cpmk.id);
  });

  it("mencegah total gabungan kriteria melebihi 100", async () => {
    repo.findCpmkById.mockResolvedValue(cpmk);

    await expect(
      service.createCriteria("supervisor", {
        researchMethodCpmkId: cpmk.id,
        name: "Presentasi",
        maxScore: 21,
      }),
    ).rejects.toThrow(/melebihi 100/);
  });

  it("membuat kriteria jika total gabungan masih valid", async () => {
    repo.findCpmkById.mockResolvedValue(cpmk);
    repo.getNextCriteriaDisplayOrder.mockResolvedValue(3);
    repo.createCriteria.mockResolvedValue({ id: "criteria-1" });

    await service.createCriteria("coordinator", {
      researchMethodCpmkId: cpmk.id,
      name: "Metodologi",
      maxScore: 20,
    });

    expect(repo.createCriteria).toHaveBeenCalledWith("coordinator", {
      researchMethodCpmkId: cpmk.id,
      name: "Metodologi",
      maxScore: 20,
      displayOrder: 3,
    });
  });

  it("mengembalikan ringkasan bobot dinamis", async () => {
    const summary = {
      supervisorTotal: 65,
      coordinatorTotal: 35,
      totalScore: 100,
      isComplete: true,
    };
    repo.getWeightSummary.mockResolvedValue(summary);

    await expect(service.getWeightSummary("ay-1")).resolves.toEqual(summary);
  });

  it("menolak pemindahan kriteria ke tahun ajaran berbeda", async () => {
    repo.findCriteriaById.mockResolvedValue({
      id: "criteria-1",
      researchMethodCpmk: cpmk,
    });
    repo.findCpmkById.mockResolvedValue({
      ...cpmk,
      id: "cpmk-2",
      academicYearId: "ay-2",
    });

    await expect(
      service.updateCriteria("supervisor", "criteria-1", {
        researchMethodCpmkId: "cpmk-2",
      }),
    ).rejects.toThrow(/tahun ajaran berbeda/);
    expect(repo.updateCriteria).not.toHaveBeenCalled();
  });

  it("menolak reorder kriteria yang memuat ID dari CPMK lain", async () => {
    repo.findCpmkById.mockResolvedValue(cpmk);
    repo.findCriteriaByCpmk.mockResolvedValue([
      { id: "criteria-1" },
      { id: "criteria-2" },
    ]);

    await expect(
      service.reorderCriteria("supervisor", {
        cpmkId: cpmk.id,
        orderedIds: ["criteria-1", "criteria-other"],
      }),
    ).rejects.toThrow(/tidak sesuai/);
    expect(repo.reorderCriteria).not.toHaveBeenCalled();
  });

  it("menerapkan reorder rubrik jika seluruh ID berasal dari kriteria yang sama", async () => {
    repo.findCriteriaById.mockResolvedValue({
      id: "criteria-1",
      researchMethodCpmk: cpmk,
    });
    repo.findRubricsByCriteria.mockResolvedValue([
      { id: "rubric-1" },
      { id: "rubric-2" },
    ]);
    repo.reorderRubrics.mockResolvedValue([]);

    await service.reorderRubrics("coordinator", {
      criteriaId: "criteria-1",
      orderedIds: ["rubric-2", "rubric-1"],
    });

    expect(repo.reorderRubrics).toHaveBeenCalledWith("coordinator", [
      "rubric-2",
      "rubric-1",
    ]);
  });
});
