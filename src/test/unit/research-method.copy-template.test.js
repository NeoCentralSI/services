/**
 * "Salin Template" in Kelola > Metode Penelitian copies the CPMK, criteria and
 * rubrics of both parties from another period into an empty one, like the thesis CPMK copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, mockPrisma } = vi.hoisted(() => {
  const delegate = () => ({ create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), count: vi.fn() });
  const tx = {
    researchMethodCpmk: delegate(),
    researchMethodSupervisorAssessmentCriteria: delegate(),
    researchMethodSupervisorAssessmentRubric: delegate(),
    researchMethodCoordinatorAssessmentCriteria: delegate(),
    researchMethodCoordinatorAssessmentRubric: delegate(),
  };
  return {
    tx,
    mockPrisma: {
      academicYear: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn) => fn(tx)),
    },
  };
});

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

const service = await import("../../services/researchMethodAssessmentAdmin.service.js");

const rubric = (minScore, maxScore) => ({ minScore, maxScore, description: `Rentang ${minScore}-${maxScore}`, displayOrder: minScore });
const SOURCE = [
  {
    code: "CPMK-1",
    description: "Merumuskan masalah penelitian",
    supervisorAssessmentCriterias: [{ name: "Latar belakang", maxScore: 20, displayOrder: 0, assessmentRubrics: [rubric(0, 10), rubric(11, 20)] }],
    coordinatorAssessmentCriterias: [{ name: "Presentasi", maxScore: 25, displayOrder: 0, assessmentRubrics: [rubric(0, 25)] }],
  },
  { code: "CPMK-2", description: "Menyusun metode", supervisorAssessmentCriterias: [{ name: "Metode", maxScore: 55, displayOrder: 1, assessmentRubrics: [] }], coordinatorAssessmentCriterias: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.academicYear.findUnique.mockImplementation(async ({ where }) => ({ id: where.id }));
  tx.researchMethodCpmk.count.mockResolvedValue(0);
  tx.researchMethodCpmk.findMany.mockResolvedValue(SOURCE);
  let n = 0;
  tx.researchMethodCpmk.create.mockImplementation(async ({ data }) => ({ id: `cpmk-${++n}`, ...data }));
  tx.researchMethodSupervisorAssessmentCriteria.create.mockImplementation(async ({ data }) => ({ id: `sc-${++n}`, ...data }));
  tx.researchMethodCoordinatorAssessmentCriteria.create.mockImplementation(async ({ data }) => ({ id: `cc-${++n}`, ...data }));
});

describe("copyCpmkTemplate", () => {
  it("copies every CPMK with the criteria and rubrics of both parties into the target period", async () => {
    const result = await service.copyCpmkTemplate("ay-lalu", "ay-kini");
    expect(result).toEqual({ cpmk: 2, supervisorCriteria: 2, supervisorRubrics: 2, coordinatorCriteria: 1, coordinatorRubrics: 1 });
    expect(tx.researchMethodCpmk.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: "ay-lalu" } }));
    expect(tx.researchMethodCpmk.create).toHaveBeenNthCalledWith(1, { data: { academicYearId: "ay-kini", code: "CPMK-1", description: "Merumuskan masalah penelitian" } });
    expect(tx.researchMethodSupervisorAssessmentCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ researchMethodCpmkId: "cpmk-1", name: "Latar belakang", maxScore: 20 }),
    });
    const [rubrics] = tx.researchMethodSupervisorAssessmentRubric.createMany.mock.calls[0];
    expect(rubrics.data).toHaveLength(2);
    expect(rubrics.data[1]).toMatchObject({ minScore: 11, maxScore: 20, description: "Rentang 11-20" });
    expect(tx.researchMethodCoordinatorAssessmentRubric.createMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a target period that already has CPMKs, and changes nothing", async () => {
    tx.researchMethodCpmk.count.mockResolvedValue(3);
    await expect(service.copyCpmkTemplate("ay-lalu", "ay-kini")).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("sudah memiliki CPMK") });
    expect(tx.researchMethodCpmk.create).not.toHaveBeenCalled();
  });

  it("refuses an empty source period", async () => {
    tx.researchMethodCpmk.findMany.mockResolvedValue([]);
    await expect(service.copyCpmkTemplate("ay-kosong", "ay-kini")).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("belum memiliki CPMK") });
  });

  it("refuses the same period, a missing period, or an unknown one", async () => {
    await expect(service.copyCpmkTemplate("ay-kini", "ay-kini")).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.copyCpmkTemplate("", "ay-kini")).rejects.toMatchObject({ statusCode: 400 });
    mockPrisma.academicYear.findUnique.mockResolvedValueOnce(null);
    await expect(service.copyCpmkTemplate("ay-hilang", "ay-kini")).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
