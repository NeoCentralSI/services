import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTx, mockGetActiveAcademicYearId } = vi.hoisted(() => ({
  mockPrisma: {
    cpmk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    assessmentCriteria: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    assessmentRubric: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    thesisSeminarExaminerAssessmentDetail: {
      findMany: vi.fn(),
    },
    thesisDefenceExaminerAssessmentDetail: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockTx: {
    cpmk: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    assessmentCriteria: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    assessmentRubric: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockGetActiveAcademicYearId: vi.fn(),
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYearId: mockGetActiveAcademicYearId,
}));

import {
  copyTemplateCpmk,
  createCpmk,
  deleteCpmk,
  getAllCpmks,
  getCpmkById,
  updateCpmk,
} from "../../../../services/cpmk.service.js";

const NOW = new Date("2026-04-20T00:00:00.000Z");

describe("CPMK Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveAcademicYearId.mockResolvedValue("ay-active");
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(mockTx);
      return Promise.all(arg);
    });
  });

  it("getAllCpmks returns ordered list by code for selected academic year and appends hasAssessmentDetails", async () => {
    mockPrisma.cpmk.findMany.mockResolvedValue([
      {
        id: "cpmk-a",
        academicYearId: "ay-1",
        code: "CPMK-01",
        description: "Desc 1",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 2 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      },
      {
        id: "cpmk-b",
        academicYearId: "ay-1",
        code: "CPMK-02",
        description: "Desc 2",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 1 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      },
    ]);
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1", cpmkId: "cpmk-a" },
      { id: "cr-2", cpmkId: "cpmk-b" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([
      { assessmentCriteriaId: "cr-1" },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);

    const result = await getAllCpmks({ academicYearId: "ay-1" });

    expect(mockPrisma.cpmk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { academicYearId: "ay-1" },
        orderBy: { code: "asc" },
      })
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ code: "CPMK-01", hasAssessmentDetails: true });
    expect(result[1]).toMatchObject({ code: "CPMK-02", hasAssessmentDetails: false });
  });

  it("getCpmkById returns single CPMK with resolved hasAssessmentDetails flag", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-a",
      academicYearId: "ay-1",
      code: "CPMK-01",
      description: "Desc 1",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 1 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1", cpmkId: "cpmk-a" }]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([
      { assessmentCriteriaId: "cr-1" },
    ]);

    const result = await getCpmkById("cpmk-a");
    expect(result).toMatchObject({ id: "cpmk-a", hasAssessmentDetails: true });
  });

  it("createCpmk succeeds when no duplicate code is found in target academic year", async () => {
    mockPrisma.cpmk.findFirst.mockResolvedValue(null);
    mockPrisma.cpmk.create.mockResolvedValue({ id: "new-cpmk" });
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "new-cpmk",
      academicYearId: "ay-1",
      code: "CPMK-09",
      description: "New",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 0 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });

    const result = await createCpmk({
      academicYearId: "ay-1",
      code: "CPMK-09",
      description: "New",
      type: "thesis",
    });

    expect(mockPrisma.cpmk.create).toHaveBeenCalled();
    expect(result).toMatchObject({ id: "new-cpmk", code: "CPMK-09" });
  });

  it("createCpmk rejects when duplicate code exists in target academic year", async () => {
    mockPrisma.cpmk.findFirst.mockResolvedValue({ id: "dup-cpmk" });

    await expect(
      createCpmk({
        academicYearId: "ay-1",
        code: "CPMK-01",
        description: "Dup",
        type: "thesis",
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("updateCpmk allows description update even when downstream assessment details exist", async () => {
    mockPrisma.cpmk.findUnique
      .mockResolvedValueOnce({
        id: "cpmk-a",
        academicYearId: "ay-1",
        code: "CPMK-01",
        description: "Old",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 1 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      })
      .mockResolvedValueOnce({
        id: "cpmk-a",
        academicYearId: "ay-1",
        code: "CPMK-01",
        description: "Updated",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 1 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1", cpmkId: "cpmk-a" }]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([
      { assessmentCriteriaId: "cr-1" },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.cpmk.update.mockResolvedValue({ id: "cpmk-a" });

    const result = await updateCpmk("cpmk-a", { description: "Updated" });
    expect(mockPrisma.cpmk.update).toHaveBeenCalledWith({
      where: { id: "cpmk-a" },
      data: { description: "Updated" },
    });
    expect(result).toMatchObject({ description: "Updated" });
  });

  it("updateCpmk allows code update when downstream assessment details do not exist", async () => {
    mockPrisma.cpmk.findUnique
      .mockResolvedValueOnce({
        id: "cpmk-a",
        academicYearId: "ay-1",
        code: "CPMK-01",
        description: "Desc",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 1 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      })
      .mockResolvedValueOnce({
        id: "cpmk-a",
        academicYearId: "ay-1",
        code: "CPMK-01-R",
        description: "Desc",
        type: "thesis",
        createdAt: NOW,
        updatedAt: NOW,
        _count: { assessmentCriterias: 1 },
        academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
      });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1", cpmkId: "cpmk-a" }]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.cpmk.findFirst.mockResolvedValue(null);
    mockPrisma.cpmk.update.mockResolvedValue({ id: "cpmk-a" });

    const result = await updateCpmk("cpmk-a", { code: "CPMK-01-R" });
    expect(mockPrisma.cpmk.update).toHaveBeenCalledWith({
      where: { id: "cpmk-a" },
      data: { code: "CPMK-01-R" },
    });
    expect(result).toMatchObject({ code: "CPMK-01-R" });
  });

  it("updateCpmk rejects code update when downstream assessment details are detected", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-a",
      academicYearId: "ay-1",
      code: "CPMK-01",
      description: "Desc",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 1 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1", cpmkId: "cpmk-a" }]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([
      { assessmentCriteriaId: "cr-1" },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);

    await expect(updateCpmk("cpmk-a", { code: "CPMK-XX" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.cpmk.update).not.toHaveBeenCalled();
  });

  it("deleteCpmk succeeds without cascade when no child criteria exist", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-a",
      academicYearId: "ay-1",
      code: "CPMK-01",
      description: "Desc",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 0 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockTx.assessmentCriteria.findMany.mockResolvedValue([]);
    mockTx.cpmk.delete.mockResolvedValue({ id: "cpmk-a" });

    await deleteCpmk("cpmk-a");

    expect(mockTx.assessmentRubric.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.assessmentCriteria.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.cpmk.delete).toHaveBeenCalledWith({ where: { id: "cpmk-a" } });
  });

  it("deleteCpmk cascades rubrics and criteria deletion when children exist and no downstream details", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-a",
      academicYearId: "ay-1",
      code: "CPMK-01",
      description: "Desc",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 2 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1", cpmkId: "cpmk-a" },
      { id: "cr-2", cpmkId: "cpmk-a" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);
    mockTx.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1" }, { id: "cr-2" }]);
    mockTx.assessmentRubric.deleteMany.mockResolvedValue({ count: 4 });
    mockTx.assessmentCriteria.deleteMany.mockResolvedValue({ count: 2 });
    mockTx.cpmk.delete.mockResolvedValue({ id: "cpmk-a" });

    await deleteCpmk("cpmk-a");

    expect(mockTx.assessmentRubric.deleteMany).toHaveBeenCalledWith({
      where: { assessmentCriteriaId: { in: ["cr-1", "cr-2"] } },
    });
    expect(mockTx.assessmentCriteria.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["cr-1", "cr-2"] } },
    });
    expect(mockTx.cpmk.delete).toHaveBeenCalledWith({ where: { id: "cpmk-a" } });
  });

  it("deleteCpmk rejects entirely when downstream assessment details exist", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-a",
      academicYearId: "ay-1",
      code: "CPMK-01",
      description: "Desc",
      type: "thesis",
      createdAt: NOW,
      updatedAt: NOW,
      _count: { assessmentCriterias: 1 },
      academicYear: { id: "ay-1", semester: "genap", year: "2025/2026", isActive: true },
    });
    mockPrisma.assessmentCriteria.findMany.mockResolvedValue([{ id: "cr-1", cpmkId: "cpmk-a" }]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.findMany.mockResolvedValue([
      { assessmentCriteriaId: "cr-1" },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.findMany.mockResolvedValue([]);

    await expect(deleteCpmk("cpmk-a")).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("copyTemplateCpmk succeeds with nested hierarchy transaction when target academic year is empty", async () => {
    mockTx.cpmk.findMany.mockResolvedValue([
      {
        code: "CPMK-01",
        description: "A",
        type: "thesis",
        assessmentCriterias: [
          {
            name: "K1",
            appliesTo: "seminar",
            role: "default",
            maxScore: 50,
            displayOrder: 1,
            assessmentRubrics: [
              { minScore: 0, maxScore: 25, description: "R1", displayOrder: 1 },
            ],
          },
        ],
      },
    ]);
    mockTx.cpmk.count.mockResolvedValue(0);
    mockTx.cpmk.create.mockResolvedValue({ id: "new-cpmk" });
    mockTx.assessmentCriteria.create.mockResolvedValue({ id: "new-cr-1" });
    mockTx.assessmentRubric.createMany.mockResolvedValue({ count: 1 });

    const result = await copyTemplateCpmk({
      sourceAcademicYearId: "ay-src",
      targetAcademicYearId: "ay-dst",
    });

    expect(result).toMatchObject({ cpmk: 1, criteria: 1, rubrics: 1 });
    expect(mockTx.cpmk.count).toHaveBeenCalledWith({
      where: { academicYearId: "ay-dst" },
    });
  });

  it("copyTemplateCpmk rejects (400) when target academic year already has CPMKs", async () => {
    mockTx.cpmk.findMany.mockResolvedValue([]);
    mockTx.cpmk.count.mockResolvedValue(1);

    await expect(
      copyTemplateCpmk({
        sourceAcademicYearId: "ay-src",
        targetAcademicYearId: "ay-dst",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
