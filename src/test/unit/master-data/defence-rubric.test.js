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
      aggregate: vi.fn(),
    },
    assessmentRubric: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisDefenceExaminerAssessmentDetail: {
      count: vi.fn(),
    },
    thesisDefenceSupervisorAssessmentDetail: {
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

vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../helpers/academicYear.helper.js", () => ({
  getActiveAcademicYearId: mockGetActiveAcademicYearId,
}));

import {
  calculateDefenceTotals,
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
} from "../../../services/defence-rubric.service.js";

describe("Rubric Defence Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveAcademicYearId.mockResolvedValue("ay-active");
    mockPrisma.$transaction.mockImplementation(async (arg) => {
      if (typeof arg === "function") return arg(mockTx);
      return Promise.all(arg);
    });
  });

  it("getCpmksWithRubrics returns configured defence tree for selected role with lock flags", async () => {
    mockPrisma.cpmk.findMany.mockResolvedValue([
      {
        id: "cpmk-1",
        code: "CPMK-01",
        description: "A",
        assessmentCriterias: [
          {
            id: "cr-1",
            name: "K1",
            appliesTo: "defence",
            role: "examiner",
            maxScore: 40,
            displayOrder: 1,
            assessmentRubrics: [{ id: "rb-1", displayOrder: 1 }],
          },
        ],
      },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

    const result = await getCpmksWithRubrics("examiner", { academicYearId: "ay-1" });
    expect(result[0].assessmentCriterias[0]).toMatchObject({
      role: "examiner",
      hasAssessmentDetails: false,
    });
  });

  it("createCriteria enforces role validity and maps appliesTo='defence' for valid role", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });
    mockPrisma.assessmentCriteria.findFirst.mockResolvedValue({ displayOrder: 0 });
    mockPrisma.assessmentCriteria.create.mockResolvedValue({
      id: "cr-new",
      cpmkId: "cpmk-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 20,
      displayOrder: 1,
      name: "Baru",
    });
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 20 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 50 } });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

    const result = await createCriteria({
      cpmkId: "cpmk-1",
      role: "examiner",
      name: "Baru",
      maxScore: 20,
    });

    expect(mockPrisma.assessmentCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appliesTo: "defence",
        role: "examiner",
      }),
    });
    expect(result.criteria).toMatchObject({ id: "cr-new", role: "examiner" });
  });

  it("createCriteria rejects (400) for invalid defence role values", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({
      id: "cpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });

    await expect(
      createCriteria({ cpmkId: "cpmk-1", role: "default", maxScore: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateCriteria allows name update regardless of downstream detail locks", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.assessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      name: "Updated",
      maxScore: 40,
    });
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 10 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 5 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 15 } });

    const result = await updateCriteria("cr-1", { name: "Updated" });
    expect(result.criteria).toMatchObject({ id: "cr-1", name: "Updated" });
  });

  it("updateCriteria maxScore succeeds when downstream detail counts are zero", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [{ maxScore: 10 }],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      maxScore: 50,
    });
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 10 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 15 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 25 } });

    const result = await updateCriteria("cr-1", { maxScore: 50 });
    expect(result.criteria).toMatchObject({ id: "cr-1", maxScore: 50 });
  });

  it("updateCriteria maxScore rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

    await expect(updateCriteria("cr-1", { maxScore: 60 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reorderCriteria mutates only displayOrder and can reject cross-role boundary errors from repository", async () => {
    mockPrisma.cpmk.findUnique.mockResolvedValue({ id: "cpmk-1", academicYearId: "ay-1" });
    const crossRoleError = Object.assign(new Error("Cross-role reorder forbidden"), { statusCode: 400 });
    mockPrisma.assessmentCriteria.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(crossRoleError);

    await expect(
      reorderCriteria({ cpmkId: "cpmk-1", orderedIds: ["examiner-cr", "supervisor-cr"] })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockPrisma.assessmentCriteria.update).toHaveBeenCalledWith({
      where: { id: "examiner-cr" },
      data: { displayOrder: 1 },
    });
  });

  it("deleteCriteria succeeds and returns totals when downstream details are zero", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "supervisor",
      cpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    mockTx.assessmentRubric.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.assessmentCriteria.delete.mockResolvedValue({ id: "cr-1" });
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 35 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 65 } });

    const result = await deleteCriteria("cr-1");
    expect(result.totals).toMatchObject({
      examinerTotal: 35,
      supervisorTotal: 30,
      combinedTotal: 65,
    });
  });

  it("deleteCriteria rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      cpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(1);

    await expect(deleteCriteria("cr-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("createRubric succeeds with displayOrder assignment when parent criteria is unlocked", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 10,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.findMany.mockResolvedValue([]);
    mockTx.assessmentRubric.findFirst.mockResolvedValue({ displayOrder: 1 });
    mockTx.assessmentRubric.create.mockResolvedValue({ id: "rb-1", displayOrder: 2 });

    const result = await createRubric("cr-1", {
      description: "R",
      minScore: 0,
      maxScore: 8,
    });
    expect(result).toMatchObject({ id: "rb-1", displayOrder: 2 });
  });

  it("createRubric rejects (400) when parent criteria is locked by downstream assessment details", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 10,
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

    await expect(
      createRubric("cr-1", { description: "Blocked", minScore: 0, maxScore: 5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateRubric succeeds when parent criteria has no downstream detail records", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.findMany.mockResolvedValue([]);
    mockPrisma.assessmentRubric.update.mockResolvedValue({
      id: "rb-1",
      minScore: 1,
      maxScore: 7,
      description: "Updated",
    });

    const result = await updateRubric("rb-1", {
      minScore: 1,
      maxScore: 7,
      description: "Updated",
    });
    expect(result).toMatchObject({ id: "rb-1", maxScore: 7 });
  });

  it("updateRubric rejects (400) when parent criteria has downstream detail records", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(1);

    await expect(updateRubric("rb-1", { description: "Blocked" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("reorderRubrics mutates only displayOrder and rejects invalid parent context", async () => {
    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.assessmentRubric.update.mockResolvedValue({});

    await reorderRubrics({ criteriaId: "cr-1", orderedIds: ["rb-2", "rb-1"] });
    expect(mockPrisma.assessmentRubric.update).toHaveBeenNthCalledWith(1, {
      where: { id: "rb-2" },
      data: { displayOrder: 1 },
    });

    mockPrisma.assessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-x",
      appliesTo: "seminar",
      role: "default",
      assessmentRubrics: [],
      cpmk: { academicYearId: "ay-1" },
    });

    await expect(
      reorderRubrics({ criteriaId: "cr-x", orderedIds: ["rb-a", "rb-b"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteRubric succeeds when parent criteria is unlocked and rejects when locked", async () => {
    mockPrisma.assessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      assessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.assessmentRubric.delete.mockResolvedValue({ id: "rb-1" });
    await deleteRubric("rb-1");

    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);
    await expect(deleteRubric("rb-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("calculateDefenceTotals returns examiner/supervisor/combined totals and combined equals sum of role totals", async () => {
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } }) // examiner
      .mockResolvedValueOnce({ _sum: { maxScore: 45 } }) // supervisor
      .mockResolvedValueOnce({ _sum: { maxScore: 75 } }); // combined

    const totals = await calculateDefenceTotals("ay-1");
    expect(totals).toMatchObject({
      examinerTotal: 30,
      supervisorTotal: 45,
      combinedTotal: 75,
    });
    expect(totals.combinedTotal).toBe(totals.examinerTotal + totals.supervisorTotal);
  });

  it("getWeightSummary merges defence summary with totals and returns consistent combinedTotal", async () => {
    mockPrisma.cpmk.findMany.mockResolvedValue([
      {
        id: "cpmk-1",
        code: "CPMK-01",
        description: "Desc",
        assessmentCriterias: [{ id: "cr-1", name: "A", maxScore: 30, assessmentRubrics: [{ id: "r1" }] }],
      },
    ]);
    mockPrisma.assessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } }) // examiner
      .mockResolvedValueOnce({ _sum: { maxScore: 20 } }) // supervisor
      .mockResolvedValueOnce({ _sum: { maxScore: 50 } }); // combined

    const result = await getWeightSummary("examiner", { academicYearId: "ay-1" });
    expect(result).toMatchObject({
      totalScore: 30,
      examinerTotal: 30,
      supervisorTotal: 20,
      combinedTotal: 50,
    });
    expect(result.combinedTotal).toBe(result.examinerTotal + result.supervisorTotal);
  });
});
