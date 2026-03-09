import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/advisorRequest.repository.js", () => ({
  findStudentByUserId: vi.fn(),
  findStudentAdvisorAccessContext: vi.fn(),
  findBlockingByStudent: vi.fn(),
  findActiveByStudent: vi.fn(),
  create: vi.fn(),
  findByStudent: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  getLecturerCatalog: vi.fn(),
  findByLecturerId: vi.fn(),
  findEscalated: vi.fn(),
  findPendingAssignment: vi.fn(),
  findAlternativeLecturers: vi.fn(),
  incrementQuotaCount: vi.fn(),
}));

vi.mock("../config/prisma.js", () => ({
  default: {
    academicYear: { findFirst: vi.fn() },
    thesisTopic: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    lecturerSupervisionQuota: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    thesisStatus: { findFirst: vi.fn() },
    thesis: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { ROLES } from "../constants/roles.js";
import prisma from "../config/prisma.js";
import * as repo from "../repositories/advisorRequest.repository.js";
import * as service from "../services/advisorRequest.service.js";

function createStudentContext({
  gateStatuses = ["completed"],
  supervisors = [],
} = {}) {
  return {
    id: "student-1",
    user: {
      id: "student-1",
      fullName: "Mahasiswa Uji",
      email: "mhs@example.com",
      identityNumber: "2211521001",
    },
    thesis: [
      {
        id: "thesis-1",
        title: "Judul Uji",
        thesisStatus: { id: "status-metopen", name: "Metopel" },
        thesisSupervisors: supervisors,
        thesisMilestones: gateStatuses.map((status, index) => ({
          id: `gate-${index + 1}`,
          title: `Gate ${index + 1}`,
          status,
          milestoneTemplate: {
            id: `template-${index + 1}`,
            name: `Template Gate ${index + 1}`,
            isGateToAdvisorSearch: true,
          },
        })),
      },
    ],
  };
}

function createSupervisor(roleName = ROLES.PEMBIMBING_1) {
  return {
    id: "supervisor-1",
    lecturerId: "lecturer-1",
    role: { id: "role-1", name: roleName },
    lecturer: {
      id: "lecturer-1",
      user: {
        id: "lecturer-1",
        fullName: "Dosen Pembimbing",
        email: "lecturer@example.com",
        avatarUrl: null,
      },
    },
  };
}

function createBlockingRequest(status = "pending") {
  return {
    id: "request-1",
    status,
    lecturer: {
      user: { fullName: "Dosen Target" },
    },
  };
}

describe("advisorRequest.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMyAccessState", () => {
    it("should open advisor search when gate is completed and no blockers exist", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);

      const result = await service.getMyAccessState("student-1");

      expect(result.gateOpen).toBe(true);
      expect(result.canBrowseCatalog).toBe(true);
      expect(result.canSubmitRequest).toBe(true);
      expect(result.nextStep).toBe("browse_catalog");
    });

    it("should fail closed when gate milestone is not configured", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(
        createStudentContext({ gateStatuses: [] })
      );
      repo.findBlockingByStudent.mockResolvedValue(null);

      const result = await service.getMyAccessState("student-1");

      expect(result.gateConfigured).toBe(false);
      expect(result.gateOpen).toBe(false);
      expect(result.canBrowseCatalog).toBe(false);
      expect(result.nextStep).toBe("wait_gate_configuration");
    });
  });

  describe("submitRequest", () => {
    it("should reject when student already has an official supervisor", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(
        createStudentContext({ supervisors: [createSupervisor()] })
      );
      repo.findBlockingByStudent.mockResolvedValue(null);

      await expect(
        service.submitRequest("student-1", {
          lecturerId: "lecturer-1",
          topicId: "topic-1",
        })
      ).rejects.toThrow("sudah memiliki dosen pembimbing resmi");

      expect(repo.create).not.toHaveBeenCalled();
    });

    it("should reject when a request is already approved and waiting assignment", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(createBlockingRequest("approved"));

      await expect(
        service.submitRequest("student-1", {
          lecturerId: "lecturer-1",
          topicId: "topic-1",
        })
      ).rejects.toThrow("menunggu penetapan pembimbing");

      expect(repo.create).not.toHaveBeenCalled();
    });

    it("should create an escalated request for an overloaded lecturer", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);
      repo.findActiveByStudent.mockResolvedValue(null);
      repo.create.mockResolvedValue({ id: "request-1", status: "escalated", routeType: "escalated" });

      prisma.academicYear.findFirst.mockResolvedValue({ id: "academic-year-1" });
      prisma.thesisTopic.findUnique.mockResolvedValue({ id: "topic-1", name: "AI" });
      prisma.lecturer.findUnique.mockResolvedValue({ id: "lecturer-1", acceptingRequests: true });
      prisma.lecturerSupervisionQuota.findUnique.mockResolvedValue({
        lecturerId: "lecturer-1",
        academicYearId: "academic-year-1",
        currentCount: 10,
        quotaMax: 10,
      });

      await service.submitRequest("student-1", {
        lecturerId: "lecturer-1",
        topicId: "topic-1",
        justificationText: "Topik ini sangat spesifik dan membutuhkan dosen tersebut.",
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-1",
          status: "escalated",
          routeType: "escalated",
        })
      );
    });
  });

  describe("assignAdvisor", () => {
    it("should assign pembimbing 1 using roleId and thesisStatusId in one transaction", async () => {
      repo.findById.mockResolvedValue({
        id: "request-1",
        status: "approved",
        studentId: "student-1",
        lecturerId: "lecturer-1",
        academicYearId: "academic-year-1",
        topicId: "topic-1",
        proposedTitle: "Judul Uji",
      });
      prisma.userRole.findFirst.mockResolvedValue({ id: "role-p1", name: ROLES.PEMBIMBING_1 });
      prisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
      prisma.thesis.findFirst.mockResolvedValue({
        id: "thesis-1",
        title: null,
        thesisTopicId: null,
        academicYearId: null,
      });

      const tx = {
        thesis: {
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: "thesis-1" }),
        },
        thesisSupervisors: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "supervisor-row-1" }),
        },
        lecturerSupervisionQuota: {
          upsert: vi.fn().mockResolvedValue({ id: "quota-1" }),
        },
        thesisAdvisorRequest: {
          update: vi.fn().mockResolvedValue({ id: "request-1", status: "assigned" }),
        },
      };
      prisma.$transaction.mockImplementation(async (callback) => callback(tx));

      const result = await service.assignAdvisor("request-1", "kadep-1");

      expect(tx.thesis.update).toHaveBeenCalledWith({
        where: { id: "thesis-1" },
        data: expect.objectContaining({
          thesisStatusId: "status-bimbingan",
          thesisTopicId: "topic-1",
          academicYearId: "academic-year-1",
        }),
      });
      expect(tx.thesisSupervisors.create).toHaveBeenCalledWith({
        data: {
          thesisId: "thesis-1",
          lecturerId: "lecturer-1",
          roleId: "role-p1",
        },
      });
      expect(tx.lecturerSupervisionQuota.upsert).toHaveBeenCalled();
      expect(tx.thesisAdvisorRequest.update).toHaveBeenCalledWith({
        where: { id: "request-1" },
        data: expect.objectContaining({
          status: "assigned",
          reviewedBy: "kadep-1",
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({
          thesisId: "thesis-1",
          assignedLecturerId: "lecturer-1",
        })
      );
    });

    it("should reject duplicate pembimbing 1 assignment", async () => {
      repo.findById.mockResolvedValue({
        id: "request-1",
        status: "approved",
        studentId: "student-1",
        lecturerId: "lecturer-1",
        academicYearId: "academic-year-1",
        topicId: "topic-1",
        proposedTitle: "Judul Uji",
      });
      prisma.userRole.findFirst.mockResolvedValue({ id: "role-p1", name: ROLES.PEMBIMBING_1 });
      prisma.thesisStatus.findFirst.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
      prisma.thesis.findFirst.mockResolvedValue({
        id: "thesis-1",
        title: "Judul Lama",
        thesisTopicId: "topic-1",
        academicYearId: "academic-year-1",
      });

      const tx = {
        thesis: {
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: "thesis-1" }),
        },
        thesisSupervisors: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({ id: "existing-by-role" })
            .mockResolvedValueOnce(null),
          create: vi.fn(),
        },
        lecturerSupervisionQuota: {
          upsert: vi.fn(),
        },
        thesisAdvisorRequest: {
          update: vi.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (callback) => callback(tx));

      await expect(service.assignAdvisor("request-1", "kadep-1")).rejects.toThrow(
        "Mahasiswa ini sudah memiliki Pembimbing 1"
      );

      expect(tx.thesisSupervisors.create).not.toHaveBeenCalled();
      expect(tx.lecturerSupervisionQuota.upsert).not.toHaveBeenCalled();
      expect(tx.thesisAdvisorRequest.update).not.toHaveBeenCalled();
    });
  });
});
