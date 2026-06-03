import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockTx, mockGetActiveAcademicYearId } = vi.hoisted(() => ({
  mockPrisma: {
    thesisCpmk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    thesisDefenceExaminerAssessmentCriteria: { aggregate: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    thesisDefenceExaminerAssessmentRubric: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisDefenceSupervisorAssessmentCriteria: { 
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisDefenceSupervisorAssessmentRubric: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisSeminarExaminerAssessmentDetail: { count: vi.fn() },
    thesisDefenceExaminerAssessmentDetail: {
      count: vi.fn(),
    },
    thesisDefenceSupervisorAssessmentDetail: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockTx: { thesisDefenceExaminerAssessmentCriteria: { findMany: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() }, thesisDefenceSupervisorAssessmentCriteria: { findMany: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() }, thesisDefenceExaminerAssessmentRubric: { deleteMany: vi.fn() }, thesisDefenceSupervisorAssessmentRubric: { deleteMany: vi.fn() },
    thesisDefenceExaminerAssessmentRubric: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    thesisDefenceExaminerAssessmentCriteria: {
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
  calculateDefenceTotals,
  createCriteria,
  createRubric,
  deleteCriteria,
  deleteRubric,
  getCpmksWithRubrics,
  getWeightSummary,
  reorderCriteria,
  reorderRubrics,
  removeDefenceCpmkConfig,
  updateCriteria,
  updateRubric,
} from "../../../../services/defence-rubric.service.js";

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
    mockPrisma.thesisCpmk.findMany.mockResolvedValue([
      {
        id: "thesisCpmk-1",
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
    const result = await getCpmksWithRubrics("examiner", { academicYearId: "ay-1" });
    expect(result[0].assessmentCriterias[0]).toMatchObject({
      role: "examiner",
      hasAssessmentDetails: false,
    });
  });

  it("createCriteria enforces role validity and maps appliesTo='defence' for valid role", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
      id: "thesisCpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findFirst.mockResolvedValue({ displayOrder: 0 });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.create.mockResolvedValue({
      id: "cr-new",
      thesisCpmkId: "thesisCpmk-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 20,
      displayOrder: 1,
      name: "Baru",
    });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 20 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 50 } });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    const result = await createCriteria({
      thesisCpmkId: "thesisCpmk-1",
      role: "examiner",
      name: "Baru",
      maxScore: 20,
    });

    expect(mockPrisma.thesisDefenceExaminerAssessmentCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appliesTo: "defence",
        role: "examiner",
      }),
    });
    expect(result.criteria).toMatchObject({ id: "cr-new", role: "examiner" });
  });

  it("createCriteria rejects (400) for invalid defence role values", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
      id: "thesisCpmk-1",
      type: "thesis",
      academicYearId: "ay-1",
    });

    await expect(
      createCriteria({ thesisCpmkId: "thesisCpmk-1", role: "default", maxScore: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateCriteria allows name update regardless of downstream detail locks", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisCpmk.findMany.mockResolvedValue([{ thesisDefenceExaminerAssessmentCriteria: [] }]);
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 30 } });
    mockPrisma.thesisDefenceSupervisorAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 45 } });

    const result = await updateCriteria("examiner", "cr-1", { name: "Updated" });
    expect(result.criteria).toMatchObject({ id: "cr-1", name: "Updated" });
  });

  it("updateCriteria maxScore succeeds when downstream detail counts are zero", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [{ maxScore: 10 }],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.update.mockResolvedValue({
      id: "cr-1",
      maxScore: 50,
    });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 10 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 15 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 25 } });

    const result = await updateCriteria("examiner", "cr-1", { maxScore: 50 });
    expect(result.criteria).toMatchObject({ id: "cr-1", maxScore: 50 });
  });

  it("updateCriteria maxScore rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 40,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(updateCriteria("examiner", "cr-1", { maxScore: 60 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reorderCriteria mutates only displayOrder and can reject cross-role boundary errors from repository", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1", academicYearId: "ay-1" });
    const crossRoleError = Object.assign(new Error("Cross-role reorder forbidden"), { statusCode: 400 });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(crossRoleError);

    await expect(
      reorderCriteria("examiner", { thesisCpmkId: "thesisCpmk-1", orderedIds: ["examiner-cr", "supervisor-cr"] })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockPrisma.thesisDefenceExaminerAssessmentCriteria.update).toHaveBeenCalledWith({
      where: { id: "examiner-cr" },
      data: { displayOrder: 1 },
    });
  });

  it("deleteCriteria succeeds and returns totals when downstream details are zero", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "supervisor",
      thesisCpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockTx.thesisDefenceExaminerAssessmentRubric.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.thesisDefenceExaminerAssessmentCriteria.delete.mockResolvedValue({ id: "cr-1" });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate
      .mockResolvedValueOnce({ _sum: { maxScore: 35 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 30 } })
      .mockResolvedValueOnce({ _sum: { maxScore: 65 } });

    const result = await deleteCriteria("supervisor", "cr-1");
    expect(result.totals).toMatchObject({
      examinerTotal: 35,
      supervisorTotal: 30,
      combinedTotal: 65,
    });
  });

  it("deleteCriteria rejects (400) when downstream assessment details are found", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      thesisCpmk: { academicYearId: "ay-1" },
      assessmentRubrics: [],
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(deleteCriteria("examiner", "cr-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("createRubric succeeds with displayOrder assignment when parent criteria is unlocked", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 10,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentRubric.findMany.mockResolvedValue([]);
    mockTx.thesisDefenceExaminerAssessmentRubric.findFirst.mockResolvedValue({ displayOrder: 1 });
    mockTx.thesisDefenceExaminerAssessmentRubric.create.mockResolvedValue({ id: "rb-1", displayOrder: 2 });

    const result = await createRubric("examiner", "cr-1", {
      description: "R",
      minScore: 0,
      maxScore: 8,
    });
    expect(result).toMatchObject({ id: "rb-1", displayOrder: 2 });
  });

  it("createRubric rejects (400) when parent criteria is locked by downstream assessment details", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      maxScore: 10,
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(
      createRubric("examiner", "cr-1", { description: "Blocked", minScore: 0, maxScore: 5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateRubric succeeds when parent criteria has no downstream detail records", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      thesisDefenceExaminerAssessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      thesisDefenceExaminerAssessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentRubric.findMany.mockResolvedValue([]);
    mockPrisma.thesisDefenceExaminerAssessmentRubric.update.mockResolvedValue({
      id: "rb-1",
      minScore: 1,
      maxScore: 7,
      description: "Updated",
    });

    const result = await updateRubric("examiner", "rb-1", {
      minScore: 1,
      maxScore: 7,
      description: "Updated",
    });
    expect(result).toMatchObject({ id: "rb-1", maxScore: 7 });
  });

  it("updateRubric rejects (400) when parent criteria has downstream detail records", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      minScore: 0,
      maxScore: 5,
      thesisDefenceExaminerAssessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(updateRubric("examiner", "rb-1", { description: "Blocked" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("reorderRubrics mutates only displayOrder and rejects invalid parent context", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-1",
      appliesTo: "defence",
      role: "examiner",
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });
    mockPrisma.thesisDefenceExaminerAssessmentRubric.update.mockResolvedValue({});

    await reorderRubrics("examiner", { criteriaId: "cr-1", orderedIds: ["rb-2", "rb-1"] });
    expect(mockPrisma.thesisDefenceExaminerAssessmentRubric.update).toHaveBeenNthCalledWith(1, {
      where: { id: "rb-2" },
      data: { displayOrder: 1 },
    });

    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findUnique.mockResolvedValue({
      id: "cr-x",
      appliesTo: "seminar",
      role: "default",
      assessmentRubrics: [],
      thesisCpmk: { academicYearId: "ay-1" },
    });

    await expect(
      reorderRubrics("default", { criteriaId: "cr-x", orderedIds: ["rb-a", "rb-b"] })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deleteRubric succeeds when parent criteria is unlocked and rejects when locked", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentRubric.findUnique.mockResolvedValue({
      id: "rb-1",
      assessmentCriteriaId: "cr-1",
      thesisDefenceExaminerAssessmentCriteria: {
        id: "cr-1",
        appliesTo: "defence",
        role: "examiner",
        maxScore: 10,
      },
    });
    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.thesisDefenceExaminerAssessmentRubric.delete.mockResolvedValue({ id: "rb-1" });
    await deleteRubric("examiner", "rb-1");

    mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(deleteRubric("examiner", "rb-1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("calculateDefenceTotals returns examiner/supervisor/combined totals and combined equals sum of role totals", async () => {
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 30 } });
    mockPrisma.thesisDefenceSupervisorAssessmentCriteria.aggregate.mockResolvedValue({ _sum: { maxScore: 45 } });

    const totals = await calculateDefenceTotals("ay-1");
    expect(totals).toMatchObject({
      examinerTotal: 30,
      supervisorTotal: 45,
      combinedTotal: 75,
    });
    expect(totals.combinedTotal).toBe(totals.examinerTotal + totals.supervisorTotal);
  });

  it("getWeightSummary merges defence summary with totals and returns consistent combinedTotal", async () => {
    mockPrisma.thesisCpmk.findMany.mockResolvedValue([
      {
        id: "thesisCpmk-1",
        code: "CPMK-01",
        description: "Desc",
        assessmentCriterias: [{ id: "cr-1", name: "A", maxScore: 30, assessmentRubrics: [{ id: "r1" }] }],
      },
    ]);
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.aggregate
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

  it("removeDefenceCpmkConfig succeeds when no downstream assessment details exist", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1", type: "thesis" });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1" },
      { id: "cr-2" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockResolvedValue([{ count: 2 }, { count: 2 }]);

    await removeDefenceCpmkConfig("thesisCpmk-1", "supervisor");
    // Since it's inside a transaction using prisma directly in the repository, we just ensure it doesn't throw.
  });

  it("removeDefenceCpmkConfig rejects (400) when downstream assessment details exist", async () => {
    mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "thesisCpmk-1", type: "thesis" });
    mockPrisma.thesisDefenceExaminerAssessmentCriteria.findMany.mockResolvedValue([
      { id: "cr-1" },
    ]);
    mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
    await expect(removeDefenceCpmkConfig("thesisCpmk-1", "supervisor")).rejects.toMatchObject({ statusCode: 400 });
  });
});
