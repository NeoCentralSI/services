import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTx, mockGetActiveAcademicYearId } = vi.hoisted(() => ({
  mockPrisma: {
    academicYear: {
      findUnique: vi.fn(),
    },
    thesisCpmk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    thesisSeminarAssessmentCriteria: { aggregate: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisSeminarAssessmentRubric: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisSeminarExaminerAssessmentDetail: {
      count: vi.fn(),
    },
    thesisDefenceExaminerAssessmentDetail: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockTx: {
    thesisSeminarAssessmentRubric: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    thesisSeminarAssessmentCriteria: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
  },
  mockGetActiveAcademicYearId: vi.fn(),
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYearId: mockGetActiveAcademicYearId,
}));

import {
  createCriteria,
  createRubric,
  deleteCriteria,
  deleteRubric,
  getCpmksWithRubrics,
  getWeightSummary,
  reorderCriteria,
  reorderRubrics,
  removeSeminarCpmkConfig,
  updateCriteria,
  updateRubric,
} from "../../../../services/seminar-rubric.service.js";

describe("Rubric Seminar Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveAcademicYearId.mockResolvedValue("ay-active");
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(mockTx);
      return Promise.all(arg);
    });
  });

  it("getCpmksWithRubrics returns configured tree with criteria/rubric ordering and lock flags", async () => {
    mockPrisma.thesisCpmk.findMany.mockResolvedValue([
      {
        id: "thesisCpmk-1",
        code: "CPMK-01",
        description: "A",
        thesisSeminarAssessmentCriterias: [
          {
            id: "cr-1",
            name: "K1",
            maxScore: 40,
            displayOrder: 1,
            assessmentRubrics: [{ id: "rb-1", displayOrder: 1 }],
          },
        ],
      },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    const result = await getCpmksWithRubrics({ academicYearId: "ay-1" });
    expect(result[0].assessmentCriterias[0]).toMatchObject({
      id: "cr-1",
      hasAssessmentDetails: false,
    });
  });

  it("createCriteria succeeds and assigns next displayOrder for seminar/default context", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
      id: "thesisCpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });
    mockPrisma.thesisSeminarAssessmentCriteria.findFirst.mockResolvedValue({ displayOrder: 2 });
    mockPrisma.thesisSeminarAssessmentCriteria.create.mockResolvedValue({
      id: "cr-new",
      thesisCpmkId: "thesisCpmk-1",
      
      maxScore: 30,
      name: "Baru",
      displayOrder: 3,
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 0 } });
    const result = await createCriteria({ thesisCpmkId: "thesisCpmk-1", name: "Baru", maxScore: 30 });
    expect(mockPrisma.thesisSeminarAssessmentCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thesisCpmkId: "thesisCpmk-1",
        name: "Baru",
        maxScore: 30,
        displayOrder: 3,
      }),
    });
    expect(result).toMatchObject({ id: "cr-new" });
  });

  it("updateCriteria rejects (400) when downstream assessment details exist", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      thesisCpmkId: "thesisCpmk-1",
      
      maxScore: 40,
      assessmentRubrics: [{ maxScore: 20 }],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);

    await expect(updateCriteria("cr-1", { name: "Updated Name" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateCriteria maxScore succeeds when downstream assessment details are zero", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      thesisCpmkId: "thesisCpmk-1",
      
      maxScore: 40,
      assessmentRubrics: [{ maxScore: 20 }],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarAssessmentRubric.findMany.mockResolvedValue([]);
      mockPrisma.thesisSeminarAssessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      maxScore: 45,
    });

    mockPrisma.thesisSeminarAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 0 } });
    const result = await updateCriteria("cr-1", { maxScore: 45 });
    expect(result).toMatchObject({ id: "cr-1", maxScore: 45 });
  });

  it("updateCriteria maxScore rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      thesisCpmkId: "thesisCpmk-1",
      
      maxScore: 40,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(updateCriteria("cr-1", { maxScore: 50 })).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.thesisSeminarAssessmentCriteria.update).not.toHaveBeenCalled();
  });

  it("reorderCriteria mutates only displayOrder fields in sequence", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1" });
    mockPrisma.thesisSeminarAssessmentRubric.findMany.mockResolvedValue([]);
      mockPrisma.thesisSeminarAssessmentCriteria.update.mockResolvedValue({});

    await reorderCriteria({ thesisCpmkId: "thesisCpmk-1", orderedIds: ["cr-2", "cr-1"] });

    expect(mockPrisma.thesisSeminarAssessmentCriteria.update).toHaveBeenNthCalledWith(1, {
      where: { id: "cr-2" },
      data: { displayOrder: 1 },
    });
    expect(mockPrisma.thesisSeminarAssessmentCriteria.update).toHaveBeenNthCalledWith(2, {
      where: { id: "cr-1" },
      data: { displayOrder: 2 },
    });
  });

  it("reorderCriteria rejects (400) when repository signals parent mismatch", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1" });
    const mismatchError = Object.assign(new Error("Mismatch"), { statusCode: 400 });
    mockPrisma.thesisSeminarAssessmentCriteria.update.mockRejectedValue(mismatchError);

    await expect(
      reorderCriteria({ thesisCpmkId: "thesisCpmk-1", orderedIds: ["cr-x", "cr-y"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteCriteria succeeds and cascades when downstream assessment details are zero", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      
      thesisCpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockTx.thesisSeminarAssessmentRubric.deleteMany.mockResolvedValue({ count: 2 });
    mockTx.thesisSeminarAssessmentCriteria.delete.mockResolvedValue({ id: "cr-1" });

    await deleteCriteria("cr-1");
    expect(mockTx.thesisSeminarAssessmentRubric.deleteMany).toHaveBeenCalledWith({
      where: { thesisSeminarAssessmentCriteriaId: "cr-1" },
    });
    expect(mockTx.thesisSeminarAssessmentCriteria.delete).toHaveBeenCalledWith({
      where: { id: "cr-1" },
    });
  });

  it("deleteCriteria rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      
      thesisCpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(deleteCriteria("cr-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("createRubric succeeds with next displayOrder when parent criteria is unlocked", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      
      maxScore: 10,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarAssessmentRubric.findMany.mockResolvedValue([]);
    mockTx.thesisSeminarAssessmentRubric.findFirst.mockResolvedValue({ displayOrder: 1 });
    mockTx.thesisSeminarAssessmentRubric.create.mockResolvedValue({ id: "rb-new", displayOrder: 2 });

    const result = await createRubric("cr-1", {
      description: "Rubrik A",
      minScore: 0,
      maxScore: 10,
    });

    expect(result).toMatchObject({ id: "rb-new", displayOrder: 2 });
  });

  it("createRubric rejects (400) when parent criteria has downstream assessment details", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      
      maxScore: 10,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(
      createRubric("cr-1", { description: "Locked", minScore: 0, maxScore: 5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateRubric allows editing all rubric fields when parent criteria is unlocked", async () => {
    mockPrisma.thesisSeminarAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      thesisSeminarAssessmentCriteria: {
        id: "cr-1",
        
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarAssessmentRubric.findMany.mockResolvedValue([]);
    mockPrisma.thesisSeminarAssessmentRubric.update.mockResolvedValue({
      id: "rb-1",
      description: "Updated",
      minScore: 1,
      maxScore: 7,
    });

    const result = await updateRubric("rb-1", {
      description: "Updated",
      minScore: 1,
      maxScore: 7,
    });
    expect(result).toMatchObject({ id: "rb-1", maxScore: 7 });
  });

  it("updateRubric rejects (400) when parent criteria has downstream assessment details", async () => {
    mockPrisma.thesisSeminarAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      thesisSeminarAssessmentCriteria: {
        id: "cr-1",
        
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(updateRubric("rb-1", { description: "Blocked" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("reorderRubrics mutates only displayOrder values", async () => {
    mockPrisma.thesisSeminarAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarAssessmentRubric.update.mockResolvedValue({});

    await reorderRubrics({ criteriaId: "cr-1", orderedIds: ["rb-2", "rb-1"] });

    expect(mockPrisma.thesisSeminarAssessmentRubric.update).toHaveBeenNthCalledWith(1, {
      where: { id: "rb-2" },
      data: { displayOrder: 1 },
    });
    expect(mockPrisma.thesisSeminarAssessmentRubric.update).toHaveBeenNthCalledWith(2, {
      where: { id: "rb-1" },
      data: { displayOrder: 2 },
    });
  });



  it("deleteRubric succeeds when parent criteria has no downstream assessment details", async () => {
    mockPrisma.thesisSeminarAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      thesisSeminarAssessmentCriteria: {
        id: "cr-1",
        
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarAssessmentRubric.delete.mockResolvedValue({ id: "rb-1" });

    await deleteRubric("rb-1");
    expect(mockPrisma.thesisSeminarAssessmentRubric.delete).toHaveBeenCalledWith({ where: { id: "rb-1" } });
  });

  it("deleteRubric rejects (400) when parent criteria has downstream assessment details", async () => {
    mockPrisma.thesisSeminarAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      thesisSeminarAssessmentCriteria: {
        id: "cr-1",
        
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(deleteRubric("rb-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("getWeightSummary returns totalScore and details computed for seminar context", async () => {
    mockPrisma.academicYear.findUnique.mockResolvedValue({ thesisSeminarMinimumScore: 60 });
    mockPrisma.thesisCpmk.findMany.mockResolvedValue([
      {
        id: "thesisCpmk-1",
        code: "CPMK-01",
        description: "Desc",
        thesisSeminarAssessmentCriterias: [
          { id: "cr-1", name: "A", maxScore: 30, assessmentRubrics: [{ id: "r1" }] },
          { id: "cr-2", name: "B", maxScore: 20, assessmentRubrics: [] },
        ],
      },
      {
        id: "thesisCpmk-2",
        code: "CPMK-02",
        description: "Desc",
        thesisSeminarAssessmentCriterias: [{ id: "cr-3", name: "C", maxScore: 10, assessmentRubrics: [] }],
      },
    ]);

    const result = await getWeightSummary({ academicYearId: "ay-1" });
    expect(result.totalScore).toBe(60);
    expect(result.details).toHaveLength(2);
  });

  it("removeSeminarCpmkConfig succeeds when no downstream assessment details exist", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1", type: "thesis" });
    mockPrisma.thesisSeminarAssessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1" },
      { id: "cr-2" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    

    mockTx.thesisSeminarAssessmentCriteria.findMany.mockResolvedValue([{id:"cr-1"}]);
    mockTx.thesisSeminarAssessmentRubric.deleteMany.mockResolvedValue({count: 1});
    mockTx.thesisSeminarAssessmentCriteria.deleteMany.mockResolvedValue({count: 1});
    await removeSeminarCpmkConfig("thesisCpmk-1");
    // Since it's inside a transaction using prisma directly in the repository, we just ensure it doesn't throw.
  });

  it("removeSeminarCpmkConfig rejects (400) when downstream assessment details exist", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1", type: "thesis" });
    mockPrisma.thesisSeminarAssessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(removeSeminarCpmkConfig("thesisCpmk-1")).rejects.toMatchObject({ statusCode: 400 });
  });
});
