/**
 * Unit tests — informalLog.service (Metopen-only informal notes).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  student: { findUnique: vi.fn() },
  thesisStudentInformalLog: { findMany: vi.fn(), create: vi.fn() },
  document: { create: vi.fn() },
}));

const mockGetActiveThesis = vi.hoisted(() => vi.fn());
const mockFindThesisById = vi.hoisted(() => vi.fn());
const mockFindThesisSupervisor = vi.hoisted(() => vi.fn());
const mockFindMetopenLecturerRole = vi.hoisted(() => vi.fn());

vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", () => ({
  getActiveThesisForStudent: (...args) => mockGetActiveThesis(...args),
}));
vi.mock("../../repositories/thesisGuidance/proposal.repository.js", () => ({
  findThesisById: (...args) => mockFindThesisById(...args),
  findThesisSupervisor: (...args) => mockFindThesisSupervisor(...args),
  findMetopenLecturerRole: (...args) => mockFindMetopenLecturerRole(...args),
}));

vi.mock("../../services/ta04Authorization.service.js", () => ({
  assertTa04GuidanceAuthorized: vi.fn(),
}));

import {
  listInformalLogsForStudent,
  listInformalLogsForLecturer,
  createInformalLogForStudent,
} from "../../services/thesisGuidance/informalLog.service.js";
import { AppError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { assertTa04GuidanceAuthorized } from "../../services/ta04Authorization.service.js";

describe("informalLog.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertTa04GuidanceAuthorized).mockResolvedValue({ guidanceGateOpen: true });
  });

  describe("listInformalLogsForStudent", () => {
    it("fails fast when Prisma client has no informal-log delegate", async () => {
      const prev = mockPrisma.thesisStudentInformalLog;
      delete mockPrisma.thesisStudentInformalLog;

      await expect(listInformalLogsForStudent("u1")).rejects.toBeInstanceOf(AppError);

      mockPrisma.thesisStudentInformalLog = prev;
    });

    it("rejects when student is enrolled in MK Tugas Akhir", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: true,
        eligibleMetopen: true,
      });

      await expect(listInformalLogsForStudent("u1")).rejects.toBeInstanceOf(ForbiddenError);
      expect(mockGetActiveThesis).not.toHaveBeenCalled();
    });

    it("rejects when Metopen eligibility is false", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: false,
      });

      await expect(listInformalLogsForStudent("u1")).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("returns empty payload when student has no active thesis", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: true,
      });
      mockGetActiveThesis.mockResolvedValue(null);

      const out = await listInformalLogsForStudent("u1");

      expect(out).toEqual({ thesisId: null, items: [] });
      expect(mockPrisma.thesisStudentInformalLog.findMany).not.toHaveBeenCalled();
    });

    it("returns mapped rows for active thesis", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: true,
      });
      mockGetActiveThesis.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      const created = new Date("2026-01-02T00:00:00.000Z");
      mockPrisma.thesisStudentInformalLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          content: "Hello",
          createdAt: created,
          updatedAt: created,
          document: null,
        },
      ]);

      const out = await listInformalLogsForStudent("u1");

      expect(out.thesisId).toBe("thesis-1");
      expect(out.items).toHaveLength(1);
      expect(out.items[0].content).toBe("Hello");
      expect(out.items[0].document).toBeNull();
    });
  });

  describe("listInformalLogsForLecturer", () => {
    it("returns 404 when thesis does not exist", async () => {
      mockFindThesisById.mockResolvedValue(null);

      await expect(listInformalLogsForLecturer("lect-1", "missing")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(mockFindThesisSupervisor).not.toHaveBeenCalled();
    });

    it("rejects non-supervisor even if they are Koordinator Metopen", async () => {
      mockFindThesisById.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      mockFindThesisSupervisor.mockResolvedValue(null);

      await expect(listInformalLogsForLecturer("koor-1", "thesis-1")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(mockFindMetopenLecturerRole).not.toHaveBeenCalled();
      expect(assertTa04GuidanceAuthorized).not.toHaveBeenCalled();
      expect(mockPrisma.thesisStudentInformalLog.findMany).not.toHaveBeenCalled();
    });

    it("blocks read until KaDep finalizes TA-04", async () => {
      mockFindThesisById.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      mockFindThesisSupervisor.mockResolvedValue({ id: "sup-1" });
      vi.mocked(assertTa04GuidanceAuthorized).mockRejectedValue(
        new ForbiddenError("TA-04 belum difinalisasi KaDep"),
      );

      await expect(listInformalLogsForLecturer("lect-1", "thesis-1")).rejects.toThrow(
        "TA-04 belum difinalisasi KaDep",
      );
      expect(mockPrisma.thesisStudentInformalLog.findMany).not.toHaveBeenCalled();
    });

    it("returns mapped rows for active P1/P2 after TA-04", async () => {
      mockFindThesisById.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      mockFindThesisSupervisor.mockResolvedValue({ id: "sup-1" });
      const created = new Date("2026-01-04T00:00:00.000Z");
      mockPrisma.thesisStudentInformalLog.findMany.mockResolvedValue([
        {
          id: "log-2",
          content: "Progress minggu ini",
          createdAt: created,
          updatedAt: created,
          document: {
            id: "doc-1",
            fileName: "catatan.pdf",
            filePath: "uploads/thesis/thesis-1/informal-log/catatan.pdf",
            fileSize: 10,
            mimeType: "application/pdf",
          },
        },
      ]);

      const out = await listInformalLogsForLecturer("lect-1", "thesis-1");

      expect(assertTa04GuidanceAuthorized).toHaveBeenCalledWith("thesis-1");
      expect(mockPrisma.thesisStudentInformalLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { thesisId: "thesis-1" } }),
      );
      expect(out).toEqual({
        thesisId: "thesis-1",
        items: [
          {
            id: "log-2",
            content: "Progress minggu ini",
            createdAt: created.toISOString(),
            updatedAt: created.toISOString(),
            document: {
              id: "doc-1",
              fileName: "catatan.pdf",
              url: "/uploads/thesis/thesis-1/informal-log/catatan.pdf",
              fileSize: 10,
              mimeType: "application/pdf",
            },
          },
        ],
      });
    });
  });

  describe("createInformalLogForStudent", () => {
    it("throws when no active thesis", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: true,
      });
      mockGetActiveThesis.mockResolvedValue(null);

      await expect(
        createInformalLogForStudent("u1", { content: "x" }, undefined),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("persists text-only log", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: true,
      });
      mockGetActiveThesis.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      const created = new Date("2026-01-03T00:00:00.000Z");
      mockPrisma.thesisStudentInformalLog.create.mockResolvedValue({
        id: "log-new",
        content: "Catatan",
        createdAt: created,
        updatedAt: created,
        document: null,
      });

      const row = await createInformalLogForStudent("u1", { content: "  Catatan  " }, undefined);

      expect(mockPrisma.document.create).not.toHaveBeenCalled();
      expect(mockPrisma.thesisStudentInformalLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            thesisId: "thesis-1",
            studentId: "u1",
            content: "Catatan",
            documentId: null,
          }),
        }),
      );
      expect(row.id).toBe("log-new");
      expect(row.content).toBe("Catatan");
    });

    it("blocks creation until KaDep finalizes TA-04", async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        takingThesisCourse: false,
        eligibleMetopen: true,
      });
      mockGetActiveThesis.mockResolvedValue({ id: "thesis-1", studentId: "u1" });
      vi.mocked(assertTa04GuidanceAuthorized).mockRejectedValue(
        new ForbiddenError("TA-04 belum difinalisasi KaDep"),
      );

      await expect(createInformalLogForStudent("u1", { content: "Catatan" }, undefined)).rejects.toThrow(
        "TA-04 belum difinalisasi KaDep",
      );
      expect(mockPrisma.thesisStudentInformalLog.create).not.toHaveBeenCalled();
    });
  });
});
