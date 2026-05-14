import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma.js", () => ({
  default: {
    student: {
      findUnique: vi.fn(),
    },
    thesisParticipant: {
      count: vi.fn(),
    },
  },
}));

vi.mock("../utils/quotaSync.js", () => ({
  countActiveSupervisionsForYear: vi.fn(),
}));

vi.mock("../repositories/advisorRequest.repository.js", () => ({
  findStudentByUserId: vi.fn(),
  findStudentAdvisorAccessContext: vi.fn(),
  findBlockingByStudent: vi.fn(),
  findBlockingConflictByStudent: vi.fn(),
  findLatestByStudent: vi.fn(),
  findActiveByStudent: vi.fn(),
  create: vi.fn(),
  createWithClient: vi.fn(),
  findByStudent: vi.fn(),
  findById: vi.fn(),
  findByIdWithClient: vi.fn(),
  updateStatus: vi.fn(),
  updateStatusWithClient: vi.fn(),
  getLecturerCatalog: vi.fn(),
  findByLecturerId: vi.fn(),
  findEscalated: vi.fn(),
  findPendingAssignment: vi.fn(),
  findAlternativeLecturers: vi.fn(),
  incrementQuotaCount: vi.fn(),
  findActiveAcademicYear: vi.fn(),
  findTopicById: vi.fn(),
  findTopicByIdWithClient: vi.fn(),
  findLecturerForValidation: vi.fn(),
  findLecturerForValidationWithClient: vi.fn(),
  findLecturerQuota: vi.fn(),
  findRoleByName: vi.fn(),
  findRoleByNameWithClient: vi.fn(),
  findThesisStatusByName: vi.fn(),
  findThesisByStudent: vi.fn(),
  findThesisById: vi.fn(),
  findThesisByIdWithClient: vi.fn(),
  findThesisByStudentWithClient: vi.fn(),
  createThesisWithClient: vi.fn(),
  updateThesisWithClient: vi.fn(),
  findLecturerForAssignment: vi.fn(),
  findSupervisorAssignmentByLecturerAndThesis: vi.fn(),
  createSupervisorAssignmentWithClient: vi.fn(),
  terminateSupervisorAssignmentByLecturerAndThesis: vi.fn(),
  hasAnyActiveRole: vi.fn(),
  executeTransaction: vi.fn(),
  executeAssignmentTransaction: vi.fn(),
  lockStudentRow: vi.fn(),
  lockAdvisorRequestRow: vi.fn(),
  upsertDraftByStudent: vi.fn(),
  findDraftByStudent: vi.fn(),
  upsertDraftByStudentWithClient: vi.fn(),
  findDraftByStudentWithClient: vi.fn(),
  findThesisProcessLockState: vi.fn(),
  findTA04LetterData: vi.fn(),
  createDocument: vi.fn(),
  findAcademicYearById: vi.fn(),
  findSupervisorsByAcademicYear: vi.fn(),
  createAuditLogWithClient: vi.fn(),
}));

vi.mock("../services/advisorQuota.service.js", () => ({
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
  lockLecturerQuotaForUpdate: vi.fn().mockResolvedValue({ id: "quota-1" }),
  syncLecturerQuotaCurrentCount: vi.fn().mockResolvedValue(0),
}));

import { ROLES } from "../constants/roles.js";
import prisma from "../config/prisma.js";
import * as repo from "../repositories/advisorRequest.repository.js";
import { countActiveSupervisionsForYear } from "../utils/quotaSync.js";
import {
  getLecturerQuotaSnapshot,
  syncLecturerQuotaCurrentCount,
} from "../services/advisorQuota.service.js";
import * as service from "../services/advisorRequest.service.js";

function createStudentContext({
  gateStatuses = ["completed"],
  supervisors = [],
  proposalStatus = null,
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
        proposalStatus,
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
    status: "active",
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

let advisorDraft = null;

describe("advisorRequest.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    advisorDraft = null;
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      eligibleMetopen: true,
      metopenEligibilitySource: "dummy",
      metopenEligibilityUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      takingThesisCourse: false,
      thesisCourseEnrollmentSource: null,
      thesisCourseEnrollmentUpdatedAt: null,
      user: {
        id: "student-1",
        identityNumber: "2211521001",
        fullName: "Mahasiswa Uji",
        email: "mhs@example.com",
      },
      thesis: [],
    });
    repo.findLatestByStudent.mockResolvedValue(null);
    repo.findActiveAcademicYear.mockResolvedValue({ id: "academic-year-1" });
    repo.findBlockingConflictByStudent.mockResolvedValue(null);
    repo.executeTransaction.mockImplementation(async (callback) => callback({ tx: true }));
    repo.upsertDraftByStudentWithClient.mockImplementation(async (_tx, _studentId, patch) => {
      advisorDraft = { ...(advisorDraft ?? {}), ...patch };
      return advisorDraft;
    });
    repo.findDraftByStudentWithClient.mockImplementation(async () => advisorDraft);
    repo.createWithClient.mockImplementation(async (_tx, data) => ({
      id: "request-created",
      ...data,
    }));
    repo.createAuditLogWithClient.mockResolvedValue({});
    vi.mocked(countActiveSupervisionsForYear).mockResolvedValue(0);
    vi.mocked(getLecturerQuotaSnapshot).mockResolvedValue({
      lecturerId: "lecturer-1",
      trafficLight: "green",
      normalAvailable: 2,
      quotaMax: 10,
      currentCount: 8,
    });
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
      expect(result.gateOpen).toBe(true);
      expect(result.canBrowseCatalog).toBe(true);
      expect(result.nextStep).toBe("browse_catalog");
    });
  });

  describe("submitRequest", () => {
    it("should reject when student already has an official supervisor", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(
        createStudentContext({
          supervisors: [createSupervisor()],
          proposalStatus: "accepted",
        })
      );
      repo.findBlockingByStudent.mockResolvedValue(null);

      await expect(
        service.submitRequest("student-1", {
          lecturerId: "lecturer-1",
          topicId: "topic-1",
          proposedTitle: "Judul Uji",
          backgroundSummary: "Latar belakang pengujian yang cukup panjang.",
          problemStatement: "Tujuan pengujian yang cukup jelas dan terukur.",
          proposedSolution: "Solusi pengujian yang cukup panjang.",
          researchObject: "Objek Uji",
          researchPermitStatus: "approved",
        })
      ).rejects.toThrow("sudah memiliki dosen pembimbing aktif");

      expect(repo.createWithClient).not.toHaveBeenCalled();
    });

    it("should reject when a request is already approved and waiting assignment", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(createBlockingRequest("approved"));

      await expect(
        service.submitRequest("student-1", {
          lecturerId: "lecturer-1",
          topicId: "topic-1",
          proposedTitle: "Judul Uji",
          backgroundSummary: "Latar belakang pengujian yang cukup panjang.",
          problemStatement: "Tujuan pengujian yang cukup jelas dan terukur.",
          proposedSolution: "Solusi pengujian yang cukup panjang.",
          researchObject: "Objek Uji",
          researchPermitStatus: "approved",
        })
      ).rejects.toThrow("menunggu penetapan pembimbing");

      expect(repo.createWithClient).not.toHaveBeenCalled();
    });

    it("should keep student submission on the normal route while quota is not red", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);
      repo.findActiveByStudent.mockResolvedValue(null);
      repo.createWithClient.mockResolvedValue({ id: "request-1", status: "pending", routeType: "normal" });

      repo.findActiveAcademicYear.mockResolvedValue({ id: "academic-year-1" });
      repo.findTopicByIdWithClient.mockResolvedValue({ id: "topic-1", name: "AI" });
      repo.findLecturerForValidationWithClient.mockResolvedValue({ id: "lecturer-1", acceptingRequests: true });

      await service.submitRequest("student-1", {
        lecturerId: "lecturer-1",
        topicId: "topic-1",
        proposedTitle: "Judul Uji",
        backgroundSummary: "Latar belakang pengujian yang cukup panjang.",
        problemStatement: "Tujuan pengujian yang cukup jelas dan terukur.",
        proposedSolution: "Solusi pengujian yang cukup panjang.",
        researchObject: "Objek Uji",
        researchPermitStatus: "approved",
        justificationText: "Topik ini sangat spesifik dan membutuhkan dosen tersebut.",
      });

      expect(repo.createWithClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          studentId: "student-1",
          status: "pending",
          routeType: "normal",
        })
      );
    });

    it("should create escalated red-quota submissions for lecturer target review first", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);
      repo.findActiveByStudent.mockResolvedValue(null);
      repo.createWithClient.mockResolvedValue({
        id: "request-red-1",
        status: "pending",
        routeType: "escalated",
      });

      repo.findActiveAcademicYear.mockResolvedValue({ id: "academic-year-1" });
      repo.findTopicByIdWithClient.mockResolvedValue({ id: "topic-1", name: "AI" });
      repo.findLecturerForValidationWithClient.mockResolvedValue({ id: "lecturer-1", acceptingRequests: true });
      vi.mocked(getLecturerQuotaSnapshot).mockResolvedValue({
        lecturerId: "lecturer-1",
        trafficLight: "red",
        normalAvailable: 0,
        quotaMax: 8,
        currentCount: 8,
      });

      await service.submitRequest("student-1", {
        lecturerId: "lecturer-1",
        topicId: "topic-1",
        proposedTitle: "Sistem Cerdas",
        backgroundSummary: "Latar belakang yang cukup panjang untuk pengujian.",
        problemStatement: "Masalah utama yang ingin dipecahkan secara terukur.",
        proposedSolution: "Rencana solusi yang relevan dengan topik.",
        researchObject: "Objek Penelitian",
        researchPermitStatus: "in_process",
        justificationText: "Topik ini sangat spesifik dan perlu diproses melalui departemen.",
      });

      expect(repo.createWithClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          studentId: "student-1",
          status: "pending",
          routeType: "escalated",
          justificationText: "Topik ini sangat spesifik dan perlu diproses melalui departemen.",
          studentJustification: "Topik ini sangat spesifik dan perlu diproses melalui departemen.",
        })
      );
    });

    it("should allow TA-02 submission without selecting a target lecturer", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);
      repo.findActiveByStudent.mockResolvedValue(null);
      repo.createWithClient.mockResolvedValue({
        id: "request-ta02-1",
        status: "pending_kadep",
        routeType: "escalated",
        lecturerId: null,
      });

      repo.findActiveAcademicYear.mockResolvedValue({ id: "academic-year-1" });
      repo.findTopicByIdWithClient.mockResolvedValue({ id: "topic-1", name: "AI" });

      await service.submitRequest("student-1", {
        lecturerId: null,
        topicId: "topic-1",
        proposedTitle: "Usulan Topik TA",
        backgroundSummary: "Latar belakang pengajuan TA-02 yang cukup panjang.",
        problemStatement: "Permasalahan penelitian yang akan dibahas pada usulan ini.",
        proposedSolution: "Rencana solusi yang akan ditawarkan dalam penelitian.",
        researchObject: "Objek Penelitian",
        researchPermitStatus: "not_approved",
      });

      expect(repo.findLecturerForValidationWithClient).not.toHaveBeenCalled();
      expect(getLecturerQuotaSnapshot).not.toHaveBeenCalled();
      expect(repo.createWithClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          studentId: "student-1",
          lecturerId: null,
          status: "pending_kadep",
          routeType: "escalated",
        }),
      );
    });

    it("should keep yellow quota on the normal route until the lecturer is truly red/full", async () => {
      repo.findStudentAdvisorAccessContext.mockResolvedValue(createStudentContext());
      repo.findBlockingByStudent.mockResolvedValue(null);
      repo.findActiveByStudent.mockResolvedValue(null);
      repo.createWithClient.mockResolvedValue({ id: "request-2", status: "pending", routeType: "normal" });

      repo.findActiveAcademicYear.mockResolvedValue({ id: "academic-year-1" });
      repo.findTopicByIdWithClient.mockResolvedValue({ id: "topic-1", name: "AI" });
      repo.findLecturerForValidationWithClient.mockResolvedValue({ id: "lecturer-1", acceptingRequests: true });
      vi.mocked(getLecturerQuotaSnapshot).mockResolvedValue({
        lecturerId: "lecturer-1",
        trafficLight: "yellow",
        normalAvailable: 0,
        quotaMax: 8,
        currentCount: 6,
      });
      await service.submitRequest("student-1", {
        lecturerId: "lecturer-1",
        topicId: "topic-1",
        proposedTitle: "Judul Uji",
        backgroundSummary: "Latar belakang pengujian yang cukup panjang.",
        problemStatement: "Tujuan pengujian yang cukup jelas dan terukur.",
        proposedSolution: "Solusi pengujian yang cukup panjang.",
        researchObject: "Objek Uji",
        researchPermitStatus: "approved",
      });

      expect(repo.createWithClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "pending",
          routeType: "normal",
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
      repo.findRoleByName.mockResolvedValue({ id: "role-p1", name: ROLES.PEMBIMBING_1 });
      repo.findThesisStatusByName.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
      repo.findThesisByStudent.mockResolvedValue({
        id: "thesis-1",
        title: null,
        thesisTopicId: null,
        academicYearId: null,
      });
      repo.findLecturerForAssignment.mockResolvedValue({ id: "lecturer-1", user: { fullName: "Dosen" } });

      const tx = {
        userRole: {
          findMany: vi.fn().mockResolvedValue([
            { id: "role-p1", name: ROLES.PEMBIMBING_1 },
            { id: "role-p2", name: ROLES.PEMBIMBING_2 },
          ]),
        },
        thesis: {
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: "thesis-1" }),
        },
        supervisionQuotaDefault: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        thesisParticipant: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: "supervisor-row-1" }),
        },
        lecturerSupervisionQuota: {
          upsert: vi.fn().mockResolvedValue({ id: "quota-1" }),
        },
        thesisAdvisorRequest: {
          update: vi.fn().mockResolvedValue({ id: "request-1", status: "assigned" }),
        },
      };
      repo.executeAssignmentTransaction.mockImplementation(async (callback) => callback(tx));
      repo.findTA04LetterData.mockResolvedValue([null, null, null]);

      const result = await service.assignAdvisor("request-1", "kadep-1");

      expect(tx.thesis.update).toHaveBeenCalledWith({
        where: { id: "thesis-1" },
        data: expect.objectContaining({
          thesisStatusId: "status-bimbingan",
          thesisTopicId: "topic-1",
          academicYearId: "academic-year-1",
        }),
      });
      expect(tx.thesisParticipant.create).toHaveBeenCalledWith({
        data: {
          thesisId: "thesis-1",
          lecturerId: "lecturer-1",
          roleId: "role-p1",
        },
        select: { id: true, thesisId: true, lecturerId: true, roleId: true, status: true },
      });
      expect(syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(
        "lecturer-1",
        "academic-year-1",
        { client: tx },
      );
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
      repo.findRoleByName.mockResolvedValue({ id: "role-p1", name: ROLES.PEMBIMBING_1 });
      repo.findThesisStatusByName.mockResolvedValue({ id: "status-bimbingan", name: "Bimbingan" });
      repo.findThesisByStudent.mockResolvedValue({
        id: "thesis-1",
        title: "Judul Lama",
        thesisTopicId: "topic-1",
        academicYearId: "academic-year-1",
      });
      repo.findLecturerForAssignment.mockResolvedValue({ id: "lecturer-1", user: { fullName: "Dosen" } });

      const tx = {
        userRole: {
          findMany: vi.fn().mockResolvedValue([
            { id: "role-p1", name: ROLES.PEMBIMBING_1 },
            { id: "role-p2", name: ROLES.PEMBIMBING_2 },
          ]),
        },
        thesis: {
          create: vi.fn(),
          update: vi.fn().mockResolvedValue({ id: "thesis-1" }),
        },
        thesisParticipant: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "existing-by-role",
              lecturerId: "lecturer-old",
              roleId: "role-p1",
              role: { name: ROLES.PEMBIMBING_1 },
              lecturer: { user: { fullName: "Dosen Lama" } },
            },
          ]),
          create: vi.fn(),
        },
        lecturerSupervisionQuota: {
          upsert: vi.fn(),
        },
        thesisAdvisorRequest: {
          update: vi.fn(),
        },
      };
      repo.executeAssignmentTransaction.mockImplementation(async (callback) => callback(tx));

      await expect(service.assignAdvisor("request-1", "kadep-1")).rejects.toThrow(
        "Mahasiswa ini sudah memiliki Pembimbing 1"
      );

      expect(tx.thesisParticipant.create).not.toHaveBeenCalled();
      expect(syncLecturerQuotaCurrentCount).not.toHaveBeenCalled();
      expect(tx.thesisAdvisorRequest.update).not.toHaveBeenCalled();
    });
  });
});
