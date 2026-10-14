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
    lecturer: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (cb) => cb(mockPrisma)),
  },
  mockNotif: { createNotificationsForUsers: vi.fn().mockResolvedValue(undefined) },
  mockPush: { sendFcmToUsers: vi.fn().mockResolvedValue(undefined) },
  mockQuota: {
    getLecturerLoads: vi.fn(),
  },
  mockAudit: {
    logAudit: vi.fn().mockResolvedValue({ id: "audit-1" }),
    AUDIT_ACTIONS: {
      SUPERVISOR_REQUEST_CREATED: "SUPERVISOR_REQUEST_CREATED",
      SUPERVISOR_REQUEST_CANCELLED: "SUPERVISOR_REQUEST_CANCELLED",
      SUPERVISOR_REQUEST_ACCEPTED: "SUPERVISOR_REQUEST_ACCEPTED",
      SUPERVISOR_REQUEST_REJECTED: "SUPERVISOR_REQUEST_REJECTED",
      SUPERVISOR_REQUEST_KADEP_APPROVED: "SUPERVISOR_REQUEST_KADEP_APPROVED",
      SUPERVISOR_REQUEST_KADEP_REJECTED: "SUPERVISOR_REQUEST_KADEP_REJECTED",
    },
    ENTITY_TYPES: {
      THESIS_SUPERVISOR_REQUEST: "THESIS_SUPERVISOR_REQUEST",
      SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST",
    },
  },
}));

vi.mock("../../../repositories/thesisGuidance/supervisor2.repository.js", () => mockSupervisor2Repo);
vi.mock("../../../repositories/thesisGuidance/student.guidance.repository.js", () => mockStudentRepo);
vi.mock("../../../repositories/thesis-guidance-evaluation.repository.js", () => mockEvalRepo);
vi.mock("../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../services/notification.service.js", () => mockNotif);
vi.mock("../../../services/push.service.js", () => mockPush);
vi.mock("../../../services/thesis-proposal/supervision-quota.service.js", () => mockQuota);
vi.mock("../../../services/auditLog.service.js", () => mockAudit);

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
  // E4: this request flow is for proposal theses only.
  status: "proposal",
  proposalStatus: "accepted",
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
    // Plan 10.1: a full lecturer is not blocked; only a lecturer who closed intake is.
    mockQuota.getLecturerLoads.mockImplementation(async (ids) => new Map(
      ids.map((id) => [id, { activeCount: 1, softLimit: 8, hardLimit: 10, limitSource: "default", level: "available" }]),
    ));
    mockPrisma.lecturer.findUnique.mockResolvedValue({ acceptingRequests: true });
    mockPrisma.lecturer.findMany.mockResolvedValue([]);
    mockEvalRepo.findUsersByActiveRole.mockResolvedValue([{ id: KADEP_USER_ID }]);
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
  });

  describe("getAvailableSupervisor2Service", () => {
    it("menolak TA fase penelitian dan mengarahkan ke Pengajuan Perubahan Tugas Akhir (E4)", async () => {
      mockActiveThesis({ status: "research" });

      await expect(getAvailableSupervisor2Service(STUDENT_USER_ID)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("Pengajuan Perubahan Tugas Akhir"),
      });
    });

    it("menolak jika thesis sudah ditutup (Selesai/Gagal) (F2-2)", async () => {
      mockActiveThesis({ status: "completed" });

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
      mockQuota.getLecturerLoads.mockResolvedValue(new Map([
        [LECTURER_ID, { activeCount: 1, softLimit: 2, hardLimit: 3, limitSource: "general", level: "available" }],
      ]));
      mockPrisma.lecturer.findMany.mockResolvedValue([{ id: LECTURER_ID, acceptingRequests: true }]);

      const list = await getAvailableSupervisor2Service(STUDENT_USER_ID);
      expect(list[0].trafficLight).toBe("green");
      expect(list[0].normalAvailable).toBe(2);
      expect(list[0].acceptingRequests).toBe(true);
      expect(Object.keys(list[0]).sort()).toEqual(
        ["acceptingRequests", "activeCount", "fullName", "id", "normalAvailable", "trafficLight"],
      );
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
      expect(mockQuota.getLecturerLoads).toHaveBeenCalledWith([LECTURER_ID], "ay-1");
    });

    it("mengizinkan request saat fase proposal", async () => {
      mockActiveThesis({ status: "proposal" });
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

    it("menolak (400) jika dosen menutup penerimaan; dosen penuh tetap boleh dipilih", async () => {
      mockActiveThesis();
      mockSupervisor2Repo.hasPembimbing1.mockResolvedValue(true);
      mockSupervisor2Repo.hasPembimbing2.mockResolvedValue(false);
      mockSupervisor2Repo.findPendingSupervisor2Request.mockResolvedValue(null);
      mockSupervisor2Repo.findAvailableSupervisor2Lecturers.mockResolvedValue([
        { id: LECTURER_ID, fullName: "Dr. Andi" },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ fullName: "Budi" });
      mockSupervisor2Repo.createSupervisor2Request.mockResolvedValue({ id: "req-new" });
      mockQuota.getLecturerLoads.mockResolvedValue(new Map([
        [LECTURER_ID, { activeCount: 12, softLimit: 8, hardLimit: 10, limitSource: "default", level: "full" }],
      ]));

      const allowed = await requestSupervisor2Service(STUDENT_USER_ID, { lecturerId: LECTURER_ID });
      expect(allowed.requestId).toBe("req-new");

      mockPrisma.lecturer.findUnique.mockResolvedValue({ acceptingRequests: false });
      await expect(
        requestSupervisor2Service(STUDENT_USER_ID, { lecturerId: LECTURER_ID }),
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("menutup penerimaan") });
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
      expect(mockQuota.getLecturerLoads).toHaveBeenCalledWith([LECTURER_ID], "ay-1");
    });

    it("menolak (400) bila dosen menutup penerimaan saat bersedia (F2-3)", async () => {
      mockLecturerStageRequest();
      mockPrisma.lecturer.findUnique.mockResolvedValue({ acceptingRequests: false });

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

    it("approve → membuat participant P2; penetapan yang sudah terbit tidak dibatalkan (K3, K9)", async () => {
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
      expect(mockPrisma.thesis.update).not.toHaveBeenCalled();
      // re-check kuota di titik keputusan KaDep (F2-3)
      expect(mockQuota.getLecturerLoads).toHaveBeenCalledWith([LECTURER_ID], "ay-1");
    });

    it("approve menolak (400) bila thesis sudah ditutup (F2-2)", async () => {
      mockKadepStageRequest();
      mockThesisForValidation({ status: "completed" });

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
