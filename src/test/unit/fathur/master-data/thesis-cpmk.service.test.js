import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesisCpmk: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    thesisSeminarAssessmentCriteria: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    thesisDefenceExaminerAssessmentCriteria: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    thesisDefenceSupervisorAssessmentCriteria: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    thesisSeminarExaminerAssessmentDetail: { count: vi.fn() },
    thesisDefenceExaminerAssessmentDetail: { count: vi.fn() },
    thesisDefenceSupervisorAssessmentDetail: { count: vi.fn() },
    thesisSeminarAssessmentRubric: { deleteMany: vi.fn() },
    thesisDefenceExaminerAssessmentRubric: { deleteMany: vi.fn() },
    thesisDefenceSupervisorAssessmentRubric: { deleteMany: vi.fn() },
    $transaction: vi.fn((callback) => callback(mockPrisma)),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import {
  createThesisCpmk,
  deleteThesisCpmk,
  getAllThesisCpmks,
  getThesisCpmkById,
  updateThesisCpmk,
} from "../../../../services/thesis-cpmk.service.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("Thesis CPMK Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllThesisCpmks", () => {
    it("should return list of thesis cpmks filtered by academicYearId", async () => {
      const mockData = [
        {
          id: "1",
          academicYearId: "ay-1",
          code: "CPMK-01",
          description: "Desc 1",
          thesisSeminarAssessmentCriterias: [{ _count: { examinerAssessmentDetails: 0 } }],
          thesisDefenceExaminerAssessmentCriterias: [{ _count: { examinerAssessmentDetails: 0 } }],
          thesisDefenceSupervisorAssessmentCriterias: [{ _count: { supervisorAssessmentDetails: 0 } }],
        },
      ];
      mockPrisma.thesisCpmk.findMany.mockResolvedValue(mockData);

      const result = await getAllThesisCpmks({ academicYearId: "ay-1" });

      expect(mockPrisma.thesisCpmk.findMany).toHaveBeenCalledWith({
        where: { academicYearId: "ay-1" },
        include: {
          academicYear: {
            select: {
              id: true,
              semester: true,
              year: true,
              isActive: true,
            },
          },
          thesisSeminarAssessmentCriterias: {
              include: { _count: { select: { examinerAssessmentDetails: true } } }
          },
          thesisDefenceExaminerAssessmentCriterias: {
              include: { _count: { select: { examinerAssessmentDetails: true } } }
          },
          thesisDefenceSupervisorAssessmentCriterias: {
              include: { _count: { select: { supervisorAssessmentDetails: true } } }
          }
        },
        orderBy: { code: "asc" },
      });
      expect(result).toEqual([{
          id: "1",
          academicYearId: "ay-1",
          code: "CPMK-01",
          description: "Desc 1",
          hasAssessmentDetails: false,
          thesisSeminarAssessmentCriterias: undefined,
          thesisDefenceExaminerAssessmentCriterias: undefined,
          thesisDefenceSupervisorAssessmentCriterias: undefined,
      }]);
    });
  });

  describe("getThesisCpmkById", () => {
    it("should return a cpmk by id", async () => {
      const mockCpmk = { id: "1", code: "CPMK-01" };
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue(mockCpmk);

      const result = await getThesisCpmkById("1");

      expect(mockPrisma.thesisCpmk.findUnique).toHaveBeenCalledWith({
        where: { id: "1" },
        include: {
          academicYear: {
            select: {
              id: true,
              semester: true,
              year: true,
              isActive: true,
            },
          },
        },
      });
      expect(result).toEqual(mockCpmk);
    });

    it("should throw error if not found", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue(null);
      await expect(getThesisCpmkById("not-found")).rejects.toThrow("CPMK Tugas Akhir tidak ditemukan");
    });
  });

  describe("createThesisCpmk", () => {
    it("should create successfully if code is unique", async () => {
      mockPrisma.thesisCpmk.findFirst.mockResolvedValue(null);
      mockPrisma.thesisCpmk.create.mockResolvedValue({ id: "1", code: "C1" });

      const data = { academicYearId: "ay-1", code: "C1", description: "Desc" };
      const result = await createThesisCpmk(data);

      expect(mockPrisma.thesisCpmk.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: "1", code: "C1" });
    });

    it("should throw error if code already exists", async () => {
      mockPrisma.thesisCpmk.findFirst.mockResolvedValue({ id: "existing" });

      const data = { academicYearId: "ay-1", code: "C1", description: "Desc" };
      await expect(createThesisCpmk(data)).rejects.toThrow("CPMK dengan kode C1 sudah ada pada tahun ajaran ini");
    });
  });

  describe("updateThesisCpmk", () => {
    it("should update successfully if code is unchanged", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
        id: "1",
        academicYearId: "ay-1",
        code: "C1",
      });
      mockPrisma.thesisCpmk.update.mockResolvedValue({ id: "1", code: "C1", description: "New Desc" });

      const result = await updateThesisCpmk("1", { description: "New Desc" });

      expect(mockPrisma.thesisCpmk.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.thesisCpmk.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { description: "New Desc" },
      });
      expect(result).toEqual({ id: "1", code: "C1", description: "New Desc" });
    });

    it("should update successfully if new code is unique", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
        id: "1",
        academicYearId: "ay-1",
        code: "C1",
      });
      mockPrisma.thesisCpmk.findFirst.mockResolvedValue(null);
      mockPrisma.thesisCpmk.update.mockResolvedValue({ id: "1", code: "C2" });

      const result = await updateThesisCpmk("1", { code: "C2" });

      expect(mockPrisma.thesisCpmk.findFirst).toHaveBeenCalledWith({
        where: { code: "C2", academicYearId: "ay-1", id: { not: "1" } },
      });
      expect(mockPrisma.thesisCpmk.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { code: "C2" },
      });
    });

    it("should throw error if new code already exists", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({
        id: "1",
        academicYearId: "ay-1",
        code: "C1",
      });
      mockPrisma.thesisCpmk.findFirst.mockResolvedValue({ id: "existing" });

      await expect(updateThesisCpmk("1", { code: "C2" })).rejects.toThrow("CPMK dengan kode C2 sudah ada pada tahun ajaran ini");
    });
  });

  describe("deleteThesisCpmk", () => {
    it("should delete successfully if no related data", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "1" });
      mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
      mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
      mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

      mockPrisma.thesisSeminarAssessmentCriteria.findMany.mockResolvedValue([]);
      mockPrisma.thesisDefenceExaminerAssessmentCriteria.findMany.mockResolvedValue([]);
      mockPrisma.thesisDefenceSupervisorAssessmentCriteria.findMany.mockResolvedValue([]);

      await deleteThesisCpmk("1");

      expect(mockPrisma.thesisCpmk.delete).toHaveBeenCalledWith({ where: { id: "1" } });
    });

    it("should throw error if has seminar assessment details", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "1" });
      mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(1);
      mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(0);
      mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

      await expect(deleteThesisCpmk("1")).rejects.toThrow("CPMK tidak dapat dihapus karena sudah digunakan dalam penilaian (sudah ada nilai yang masuk)");
      expect(mockPrisma.thesisCpmk.delete).not.toHaveBeenCalled();
    });

    it("should throw error if has defence examiner assessment details", async () => {
      mockPrisma.thesisCpmk.findUnique.mockResolvedValue({ id: "1" });
      mockPrisma.thesisSeminarExaminerAssessmentDetail.count.mockResolvedValue(0);
      mockPrisma.thesisDefenceExaminerAssessmentDetail.count.mockResolvedValue(1);
      mockPrisma.thesisDefenceSupervisorAssessmentDetail.count.mockResolvedValue(0);

      await expect(deleteThesisCpmk("1")).rejects.toThrow("CPMK tidak dapat dihapus karena sudah digunakan dalam penilaian (sudah ada nilai yang masuk)");
      expect(mockPrisma.thesisCpmk.delete).not.toHaveBeenCalled();
    });
  });
});
