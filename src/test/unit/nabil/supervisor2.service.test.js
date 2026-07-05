/**
 * Unit Tests — Pembimbing 2 (Co-Advisor) Service
 * Selaras alur audit pass 2 (2026-06-10):
 *  - guard fase/status thesis (F2-2)
 *  - re-check kuota di tiap titik keputusan (F2-3)
 *  - dosen bersedia → diteruskan ke KaDep (persetujuan akhir, F2-5/OQ-2.2)
 *  - tanpa auto-promotion P2→P1 (F2-4/OQ-2.1)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockSupervisor2Repo,
  mockStudentRepo,
  mockEvalRepo,
  mockPrisma,
  mockNotif,
  mockPush,
  mockQuota,
  mockAudit,
  mockMetopen,
} = vi.hoisted(() => ({
  mockSupervisor2Repo: {
    findAvailableSupervisor2Lecturers: vi.fn(),
    hasPembimbing2: vi.fn(),
    hasPembimbing1: vi.fn(),
    findPendingSupervisor2Request: vi.fn(),
    createSupervisor2Request: vi.fn(),
    createSupervisor2KadepRequest: vi.fn(),
    findSupervisor2RequestById: vi.fn(),
    findSupervisor2KadepRequestById: vi.fn(),
    findPendingSupervisor2KadepRequests: vi.fn(),
    markSupervisor2RequestProcessed: vi.fn(),
    markSupervisor2RequestsProcessedForThesis: vi.fn(),
    createThesisSupervisors: vi.fn(),
    findPendingSupervisor2RequestsForLecturer: vi.fn(),
    SUPERVISOR2_STAGE_TITLES: {
      LECTURER: "REQUEST_SUPERVISOR_2",
      KADEP: "REQUEST_SUPERVISOR_2_KADEP",
    },
  },
  mockStudentRepo: {
    getStudentByUserId: vi.fn(),
    getActiveThesisForStudent: vi.fn(),
  },
  mockEvalRepo: {
    findUsersByActiveRole: vi.fn(),
  },
  mockPrisma: {
    user: { findUnique: vi.fn() },
    thesis: { findUnique: vi.fn(), update: vi.fn() },
    thesisSupervisors: { findFirst: vi.fn().mockResolvedValue(null) },
    researchMethodScore: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    $transaction: vi.fn(async (cb) => cb(mockPrisma)),
  },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockQuota: {
    checkQuotaAvailability: vi.fn().mockResolvedValue({ allowed: true }),
    browseLecturerQuotas: vi.fn().mockResolvedValue([]),
  },
  mockAudit: {
    logAudit: vi.fn().mockResolvedValue({ id: "audit-1" }),
    AUDIT_ACTIONS: {
      REQUEST_ADVISOR_CREATED: "REQUEST_ADVISOR_CREATED",
      REQUEST_ADVISOR_CANCELLED: "REQUEST_ADVISOR_CANCELLED",
      REQUEST_ADVISOR_ACCEPTED: "REQUEST_ADVISOR_ACCEPTED",
      REQUEST_ADVISOR_REJECTED: "REQUEST_ADVISOR_REJECTED",
      REQUEST_ADVISOR_KADEP_APPROVED: "REQUEST_ADVISOR_KADEP_APPROVED",
      REQUEST_ADVISOR_KADEP_REJECTED: "REQUEST_ADVISOR_KADEP_REJECTED",
    },
    ENTITY_TYPES: {
      THESIS_ADVISOR_REQUEST: "THESIS_ADVISOR_REQUEST",
      SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST",
    },
  },
  mockMetopen: {
    generateTitleApprovalLetter: vi.fn().mockResolvedValue(undefined),
    syncKadepProposalQueueByThesisId: vi.fn().mockResolvedValue({ dequeued: false }),
  },
}));

vi.mock("../../../repositories/thesisGuidance/supervisor2.repository.js", () => mockSupervisor2Repo);
vi.mock("../../../repositories/thesisGuidance/student.guidance.repository.js", () => mockStudentRepo);
vi.mock("../../../repositories/thesisGuidanceEvaluation.repository.js", () => mockEvalRepo);
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../services/quota.service.js", () => mockQuota);
vi.mock("../../../services/auditLog.service.js", () => mockAudit);
vi.mock("../../../services/metopen.service.js", () => mockMetopen);

import {
  requestSupervisor2Service,
  cancelSupervisor2RequestService,
  approveSupervisor2RequestService,
  rejectSupervisor2RequestService,
  getAvailableSupervisor2Service,
  getPendingSupervisor2RequestService,
  getSupervisor2KadepQueueService,
  decideSupervisor2ByKadepService,
} from "../../../services/thesisGuidance/supervisor2.service.js";

const STUDENT_USER_ID = "user-student-1";
const STUDENT_ID = "student-1";
const LECTURER_ID = "lec-p2-1";
const KADEP_USER_ID = "user-kadep-1";
const THESIS = {
  id: "thesis-1",
  title: "AI Research",
  studentId: STUDENT_ID,
  academicYearId: "ay-1",
  isProposal: false,
  proposalStatus: "accepted",
  thesisStatus: { name: "Bimbingan" },
};

function mockActiveThesis(overrides = {}) {
  mockStudentRepo.getStudentByUserId.mockResolvedValue({ id: STUDENT_ID });
  mockStudentRepo.getActiveThesisForStudent.mockResolvedValue({ ...THESIS, ...overrides });
}

function mockThesisForValidation(overrides = {}) {
  mockPrisma.thesis.findUnique.mockResolvedValue({ ...THESIS, ...overrides });
}

describe("Pembimbing 2 Service (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuota.checkQuotaAvailability.mockResolvedValue({ allowed: true });
    mockEvalRepo.findUsersByActiveRole.mockResolvedValue([{ id: KADEP_USER_ID }]);
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
  });

  describe("getAvailableSupervisor2Service", () => {
    it("menolak jika thesis masih fase proposal (F2-2)", async () => {
      mockActiveThesis({ isProposal: true });

      await expect(getAvailableSupervisor2Service(STUDENT_USER_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("menolak jika thesis sudah ditutup (Selesai/Gagal) (F2-2)", async () => {
      mockActiveThesis({ thesisStatus: { name: "Selesai" } });

      await expect(getAvailableSupervisor2Service(STUDENT_USER_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("menolak jika Pembimbing 1 belum ada", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(false);

      await expect(getAvailableSupervisor2Service(STUDENT_USER_ID)).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("mengembalikan katalog dengan enrich kuota aman mahasiswa", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: LECTURER_ID, fullName: "Dr. Andi" },
      ]);
      mockQuota.browseLecturerQuotas.mockResolvedValue([
        {
          lecturerId: LECTURER_ID,
          trafficLight: "green",
          normalAvailable: 2,
          activeCount: 1,
          acceptingRequests: true,
          booking: 99,
          pendingKadep: 5,
        },
      ]);

      const list = await getAvailableSupervisor2Service(STUDENT_USER_ID);
      expect(list[0].trafficLight).toBe("green");
      expect(list[0].normalAvailable).toBe(2);
      expect(list[0]).not.toHaveProperty("booking");
      expect(list[0]).not.toHaveProperty("pendingKadep");
    });
  });

  describe("requestSupervisor2Service", () => {
    it("membuat permintaan dan mengirim notifikasi ke dosen", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockSupervisor2Repo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: LECTURER_ID, fullName: "Dr. Andi" },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Budi" });
      mockSupervisor2Repo.createSupervisor2Request.mockResolvedValue({ id: "req-new" });

      const result = await requestSupervisor2Service(STUDENT_USER_ID, {
        lecturerId: LECTURER_ID,
      });

      expect(result.requestId).toBe("req-new");
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledWith(
        [LECTURER_ID],
        expect.objectContaining({ title: "Permintaan Pembimbing 2" }),
      );
      expect(mockQuota.checkQuotaAvailability).toHaveBeenCalledWith(LECTURER_ID, "ay-1");
    });

    it("mengizinkan request saat fase proposal (BR-20: P2 untuk co-sign TA-03A)", async () => {
      mockActiveThesis({ isProposal: true });
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockSupervisor2Repo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: LECTURER_ID, fullName: "Dr. Andi" },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Budi" });
      mockSupervisor2Repo.createSupervisor2Request.mockResolvedValue({ id: "req-new" });

      const result = await requestSupervisor2Service(STUDENT_USER_ID, {
        lecturerId: LECTURER_ID,
      });
      expect(result.requestId).toBe("req-new");
    });

    it("menolak (400) jika sudah punya Pembimbing 2", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(true);

      await expect(
        requestSupervisor2Service(STUDENT_USER_ID, { lecturerId: LECTURER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("menolak (400) jika kuota dosen penuh", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockSupervisor2Repo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: LECTURER_ID, fullName: "Dr. Andi" },
      ]);
      mockQuota.checkQuotaAvailability.mockResolvedValue({
        allowed: false,
        reason: "Kuota penuh",
      });

      await expect(
        requestSupervisor2Service(STUDENT_USER_ID, { lecturerId: LECTURER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("getPendingSupervisor2RequestService", () => {
    it("stage 'lecturer' saat menunggu kesediaan dosen", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue({
        id: "req-1",
        title: "REQUEST_SUPERVISOR_2",
        userId: LECTURER_ID,
        message: `${THESIS.id}|${STUDENT_ID}`,
        createdAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      const pending = await getPendingSupervisor2RequestService(STUDENT_USER_ID);
      expect(pending?.stage).toBe("lecturer");
      expect(pending?.lecturerId).toBe(LECTURER_ID);
    });

    it("stage 'kadep' saat menunggu persetujuan KaDep", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue({
        id: "req-2",
        title: "REQUEST_SUPERVISOR_2_KADEP",
        userId: KADEP_USER_ID,
        message: `${THESIS.id}|${STUDENT_ID}|${LECTURER_ID}`,
        createdAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      const pending = await getPendingSupervisor2RequestService(STUDENT_USER_ID);
      expect(pending?.stage).toBe("kadep");
      expect(pending?.lecturerId).toBe(LECTURER_ID);
    });
  });

  describe("cancelSupervisor2RequestService", () => {
    it("membatalkan permintaan pending (menutup semua tahap)", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue({
        id: "req-1",
        title: "REQUEST_SUPERVISOR_2",
      });
      mockSupervisor2Repo.markSupervisor2RequestsProcessedForThesis.mockResolvedValue({ count: 1 });

      const result = await cancelSupervisor2RequestService(STUDENT_USER_ID);
      expect(result.success).toBe(true);
      expect(mockSupervisor2Repo.markSupervisor2RequestsProcessedForThesis).toHaveBeenCalledWith(
        THESIS.id,
      );
    });
  });

  describe("approveSupervisor2RequestService (dosen bersedia → forward KaDep)", () => {
    function mockLecturerStageRequest() {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue({
        id: "req-1",
        message: `${THESIS.id}|${STUDENT_USER_ID}`,
      });
      mockThesisForValidation();
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.markSupervisor2RequestProcessed.mockResolvedValue({});
      mockSupervisor2Repo.createSupervisor2KadepRequest.mockResolvedValue({ id: "req-kadep-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
    }

    it("TIDAK membuat participant; membuat record tahap KaDep dalam transaksi", async () => {
      mockLecturerStageRequest();

      const result = await approveSupervisor2RequestService(LECTURER_ID, "req-1");

      expect(result.success).toBe(true);
      expect(result.forwardedToKadep).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockSupervisor2Repo.createThesisSupervisors).not.toHaveBeenCalled();
      expect(mockSupervisor2Repo.createSupervisor2KadepRequest).toHaveBeenCalledWith(
        {
          kadepUserId: KADEP_USER_ID,
          thesisId: THESIS.id,
          studentId: STUDENT_USER_ID,
          lecturerId: LECTURER_ID,
        },
        mockPrisma,
      );
      // re-check kuota di titik kesediaan dosen (F2-3)
      expect(mockQuota.checkQuotaAvailability).toHaveBeenCalledWith(LECTURER_ID, "ay-1");
    });

    it("menolak (400) bila kuota penuh saat dosen bersedia (F2-3)", async () => {
      mockLecturerStageRequest();
      mockQuota.checkQuotaAvailability.mockResolvedValue({ allowed: false, reason: "Kuota penuh" });

      await expect(approveSupervisor2RequestService(LECTURER_ID, "req-1")).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockSupervisor2Repo.createSupervisor2KadepRequest).not.toHaveBeenCalled();
    });

    it("gagal (500) bila akun KaDep aktif tidak ditemukan", async () => {
      mockLecturerStageRequest();
      mockEvalRepo.findUsersByActiveRole.mockResolvedValue([]);

      await expect(approveSupervisor2RequestService(LECTURER_ID, "req-1")).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe("rejectSupervisor2RequestService", () => {
    it("menolak permintaan dan memberi tahu mahasiswa", async () => {
      mockSupervisor2Repo.findSupervisor2RequestById.mockResolvedValue({
        id: "req-1",
        message: `${THESIS.id}|${STUDENT_USER_ID}`,
      });
      mockSupervisor2Repo.markSupervisor2RequestProcessed.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });

      const result = await rejectSupervisor2RequestService(LECTURER_ID, "req-1", {
        reason: "Tidak tersedia",
      });

      expect(result.success).toBe(true);
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalled();
    });
  });

  describe("KaDep queue + decide (F2-5 / OQ-2.2)", () => {
    function mockKadepStageRequest() {
      mockSupervisor2Repo.findSupervisor2KadepRequestById.mockResolvedValue({
        id: "req-kadep-1",
        message: `${THESIS.id}|${STUDENT_USER_ID}|${LECTURER_ID}`,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Dr. Andi" });
      mockThesisForValidation();
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.createThesisSupervisors.mockResolvedValue({});
      mockSupervisor2Repo.markSupervisor2RequestsProcessedForThesis.mockResolvedValue({ count: 2 });
    }

    it("antrean KaDep mem-parse thesis|student|lecturer", async () => {
      mockSupervisor2Repo.findPendingSupervisor2KadepRequests.mockResolvedValue([
        {
          id: "req-kadep-1",
          message: `${THESIS.id}|${STUDENT_USER_ID}|${LECTURER_ID}`,
          createdAt: new Date(),
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Seseorang", identityNumber: "X" });
      mockPrisma.thesis.findUnique.mockResolvedValue({ title: "AI Research" });

      const queue = await getSupervisor2KadepQueueService(KADEP_USER_ID);
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        thesisId: THESIS.id,
        studentId: STUDENT_USER_ID,
        lecturerId: LECTURER_ID,
      });
    });

    it("approve → membuat participant P2 dan menandai Formulir TA-04 batch perlu diperbarui", async () => {
      mockKadepStageRequest();

      const result = await decideSupervisor2ByKadepService(KADEP_USER_ID, "req-kadep-1", {
        approve: true,
      });

      expect(result.approved).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockSupervisor2Repo.createThesisSupervisors).toHaveBeenCalledWith(
        THESIS.id,
        LECTURER_ID,
        mockPrisma,
      );
      expect(mockSupervisor2Repo.markSupervisor2RequestsProcessedForThesis).toHaveBeenCalledWith(
        THESIS.id,
        mockPrisma,
      );
      expect(mockPrisma.thesis.update).toHaveBeenCalledWith({
        where: { id: THESIS.id },
        data: { titleApprovalDocumentId: null },
      });
      expect(mockMetopen.generateTitleApprovalLetter).not.toHaveBeenCalled();
      // re-check kuota di titik keputusan KaDep (F2-3)
      expect(mockQuota.checkQuotaAvailability).toHaveBeenCalledWith(LECTURER_ID, "ay-1");
    });

    it("approve menolak (400) bila thesis sudah ditutup (F2-2)", async () => {
      mockKadepStageRequest();
      mockThesisForValidation({ thesisStatus: { name: "Selesai" } });

      await expect(
        decideSupervisor2ByKadepService(KADEP_USER_ID, "req-kadep-1", { approve: true }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockSupervisor2Repo.createThesisSupervisors).not.toHaveBeenCalled();
    });

    it("reject → menutup permintaan + notifikasi mahasiswa & dosen, tanpa participant", async () => {
      mockKadepStageRequest();

      const result = await decideSupervisor2ByKadepService(KADEP_USER_ID, "req-kadep-1", {
        approve: false,
        reason: "Beban dosen tinggi",
      });

      expect(result.approved).toBe(false);
      expect(mockSupervisor2Repo.createThesisSupervisors).not.toHaveBeenCalled();
      expect(mockSupervisor2Repo.markSupervisor2RequestsProcessedForThesis).toHaveBeenCalledWith(
        THESIS.id,
      );
      expect(mockNotif.createNotificationsForUsers).toHaveBeenCalledTimes(2);
    });
  });
});
