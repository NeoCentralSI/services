import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTx, mockGetActiveAcademicYearId } = vi.hoisted(() => ({
  mockPrisma: {
    cpmk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    assessmentCriteria: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    assessmentRubric: {
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
    assessmentRubric: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    assessmentCriteria: {
      delete: vi.fn(),
    },
  },
  mockGetActiveAcademicYearId: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../helpers/academicYear.helper.js", () => ({
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
  updateCriteria,
  updateRubric,
} from "../../services/seminar-rubric.service.js";

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
    mockPrisma.cpmk.findMany.mockResolvedValue([
      {
        id: "cpmk-1",
        code: "CPMK-01",
        description: "A",
        assessmentCriterias: [
          {
            id: "cr-1",
            name: "K1",
            appliesTo: "seminar",
            role: "default",
            maxScore: 40,
            displayOrder: 1,
            assessmentRubrics: [{ id: "rb-1", displayOrder: 1 }],
          },
        ],
      },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);

    const result = await getCpmksWithRubrics({ academicYearId: "ay-1" });
    expect(result[0].assessmentCriterias[0]).toMatchObject({
      id: "cr-1",
      hasAssessmentDetails: false,
    });
  });

  it("createCriteria succeeds and assigns next displayOrder for seminar/default context", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });
    mockPrisma.assessmentCriteria.findFirst.mockResolvedValue({ displayOrder: 2 });
    mockPrisma.assessmentCriteria.create.mockResolvedValue({
      id: "cr-new",
      cpmkId: "cpmk-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 30,
      name: "Baru",
      displayOrder: 3,
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);

    const result = await createCriteria({ cpmkId: "cpmk-1", name: "Baru", maxScore: 30 });
    expect(mockPrisma.assessmentCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cpmkId: "cpmk-1",
        appliesTo: "seminar",
        role: "default",
        displayOrder: 3,
      }),
    });
    expect(result).toMatchObject({ id: "cr-new" });
  });

  it("updateCriteria allows name changes even when downstream assessment details exist", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      cpmkId: "cpmk-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 40,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      name: "Updated Name",
      maxScore: 40,
    });

    const result = await updateCriteria("cr-1", { name: "Updated Name" });
    expect(mockPrisma.assessmentCriteria.update).toHaveBeenCalledWith({
      where: { id: "cr-1" },
      data: { name: "Updated Name" },
    });
    expect(result).toMatchObject({ id: "cr-1" });
  });

  it("updateCriteria maxScore succeeds when downstream assessment details are zero", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      cpmkId: "cpmk-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 40,
      assessmentRubrics: [{ maxScore: 20 }],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      maxScore: 45,
    });

    const result = await updateCriteria("cr-1", { maxScore: 45 });
    expect(result).toMatchObject({ id: "cr-1", maxScore: 45 });
  });

  it("updateCriteria maxScore rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      cpmkId: "cpmk-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 40,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);

    await expect(updateCriteria("cr-1", { maxScore: 50 })).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.assessmentCriteria.update).not.toHaveBeenCalled();
  });

  it("reorderCriteria mutates only displayOrder fields in sequence", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({ id: "cpmk-1" });
    mockPrisma.assessmentCriteria.update.mockResolvedValue({});

    await reorderCriteria({ cpmkId: "cpmk-1", orderedIds: ["cr-2", "cr-1"] });

    expect(mockPrisma.assessmentCriteria.update).toHaveBeenNthCalledWith(1, {
      where: { id: "cr-2" },
      data: { displayOrder: 1 },
    });
    expect(mockPrisma.assessmentCriteria.update).toHaveBeenNthCalledWith(2, {
      where: { id: "cr-1" },
      data: { displayOrder: 2 },
    });
  });

  it("reorderCriteria rejects (400) when repository signals parent mismatch", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({ id: "cpmk-1" });
    const mismatchError = Object.assign(new Error("Mismatch"), { statusCode: 400 });
    mockPrisma.assessmentCriteria.update.mockRejectedValue(mismatchError);

    await expect(
      reorderCriteria({ cpmkId: "cpmk-1", orderedIds: ["cr-x", "cr-y"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteCriteria succeeds and cascades when downstream assessment details are zero", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "seminar",
      role: "default",
      cpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockTx.assessmentRubric.deleteMany.mockResolvedValue({ count: 2 });
    mockTx.assessmentCriteria.delete.mockResolvedValue({ id: "cr-1" });

    await deleteCriteria("cr-1");
    expect(mockTx.assessmentRubric.deleteMany).toHaveBeenCalledWith({
      where: { assessmentCriteriaId: "cr-1" },
    });
    expect(mockTx.assessmentCriteria.delete).toHaveBeenCalledWith({
      where: { id: "cr-1" },
    });
  });

  it("deleteCriteria rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "seminar",
      role: "default",
      cpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);

    await expect(deleteCriteria("cr-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("createRubric succeeds with next displayOrder when parent criteria is unlocked", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 10,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.findMany.mockResolvedValue([]);
    mockTx.assessmentRubric.findFirst.mockResolvedValue({ displayOrder: 1 });
    mockTx.assessmentRubric.create.mockResolvedValue({ id: "rb-new", displayOrder: 2 });

    const result = await createRubric("cr-1", {
      description: "Rubrik A",
      minScore: 0,
      maxScore: 10,
    });

    expect(result).toMatchObject({ id: "rb-new", displayOrder: 2 });
  });

  it("createRubric rejects (400) when parent criteria has downstream assessment details", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "seminar",
      role: "default",
      maxScore: 10,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);

    await expect(
      createRubric("cr-1", { description: "Locked", minScore: 0, maxScore: 5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateRubric allows editing all rubric fields when parent criteria is unlocked", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "seminar",
        role: "default",
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.findMany.mockResolvedValue([]);
    mockPrisma.assessmentRubric.update.mockResolvedValue({
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
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "seminar",
        role: "default",
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);

    await expect(updateRubric("rb-1", { description: "Blocked" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("reorderRubrics mutates only displayOrder values", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "seminar",
      role: "default",
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.assessmentRubric.update.mockResolvedValue({});

    await reorderRubrics({ criteriaId: "cr-1", orderedIds: ["rb-2", "rb-1"] });

    expect(mockPrisma.assessmentRubric.update).toHaveBeenNthCalledWith(1, {
      where: { id: "rb-2" },
      data: { displayOrder: 1 },
    });
    expect(mockPrisma.assessmentRubric.update).toHaveBeenNthCalledWith(2, {
      where: { id: "rb-1" },
      data: { displayOrder: 2 },
    });
  });

  it("reorderRubrics rejects (400) when criteria parent context is invalid", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-x",
      appliesTo: "defence",
      role: "examiner",
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });

    await expect(
      reorderRubrics({ criteriaId: "cr-x", orderedIds: ["rb-1", "rb-2"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteRubric succeeds when parent criteria has no downstream assessment details", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "seminar",
        role: "default",
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.delete.mockResolvedValue({ id: "rb-1" });

    await deleteRubric("rb-1");
    expect(mockPrisma.assessmentRubric.delete).toHaveBeenCalledWith({ where: { id: "rb-1" } });
  });

  it("deleteRubric rejects (400) when parent criteria has downstream assessment details", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "seminar",
        role: "default",
        maxScore: 10,
      },
    });
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);

    await expect(deleteRubric("rb-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("getWeightSummary returns totalScore and details computed for seminar context", async () => {
    mockPrisma.cpmk.findMany.mockResolvedValue([
      {
        id: "cpmk-1",
        code: "CPMK-01",
        description: "Desc",
        assessmentCriterias: [
          { id: "cr-1", name: "A", maxScore: 30, assessmentRubrics: [{ id: "r1" }] },
          { id: "cr-2", name: "B", maxScore: 20, assessmentRubrics: [] },
        ],
      },
      {
        id: "cpmk-2",
        code: "CPMK-02",
        description: "Desc",
        assessmentCriterias: [{ id: "cr-3", name: "C", maxScore: 10, assessmentRubrics: [] }],
      },
    ]);

    const result = await getWeightSummary({ academicYearId: "ay-1" });
    expect(result.totalScore).toBe(60);
    expect(result.details).toHaveLength(2);
  });
});
