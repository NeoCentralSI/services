/**
 * IT-P2: End-to-end Pembimbing 2 matching + TA-03B read-only (Pembimbing 2)
 *
 * Menguji alur bisnis lengkap terhadap database nyata (sama pola IT-03/IT-04):
 *   A. Katalog dosen P2 + visibilitas kuota mahasiswa (tanpa booking/pending KaDep)
 *   B. Siklus permintaan: ajukan → pending → batalkan
 *   C. Siklus persetujuan: ajukan → setujui → ThesisSupervisors P2 → bersihkan
 *   D. Pembimbing 2 membaca nilai TA-03A/TA-03B (getScoresByThesisForSupervisor)
 *   E. Daftar mahasiswa arsip (scope=archive) untuk thesis Selesai
 *
 * Jalankan:
 *   cd services
 *   pnpm test:integration:nabil -- src/test/integration/nabil/supervisor2.e2e.test.js
 *
 * Prasyarat data (otomatis dicari; tes dilewati jika tidak ada):
 *   - Mahasiswa dengan thesis aktif, Pembimbing 1 aktif, belum ada P2, tidak ada pending REQUEST_SUPERVISOR_2
 *   - Minimal satu dosen dengan role Pembimbing 2 di katalog (kuota boleh penuh — tes C dilewati)
 *   - Opsional: thesis Selesai + P2 + finalProposalVersionId + ResearchMethodScore untuk D/E
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import {
  getAvailableSupervisor2Service,
  requestSupervisor2Service,
  getPendingSupervisor2RequestService,
  cancelSupervisor2RequestService,
  getSupervisor2RequestsService,
  approveSupervisor2RequestService,
  rejectSupervisor2RequestService,
  getSupervisor2KadepQueueService,
  decideSupervisor2ByKadepService,
} from "../../../services/thesisGuidance/supervisor2.service.js";
import { findUsersByActiveRole } from "../../../repositories/thesisGuidanceEvaluation.repository.js";
import { getMyStudentsService } from "../../../services/thesisGuidance/lecturer.guidance.service.js";
import {
  getScoresByThesisForSupervisor,
  getSupervisorContextForThesis,
} from "../../../services/assessment.service.js";
import { hasPembimbing2 } from "../../../repositories/thesisGuidance/supervisor2.repository.js";
import { ForbiddenError } from "../../../utils/errors.js";

vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/auditLog.service.js", () => ({
  logAudit: vi.fn().mockResolvedValue({ id: "audit-mock" }),
  AUDIT_ACTIONS: {},
  ENTITY_TYPES: {},
}));

const FORBIDDEN_QUOTA_KEYS = ["booking", "pendingKadep", "overquota", "pendingKaDep"];

/** @type {{ studentUserId: string, thesisId: string, academicYearId: string, p1LecturerId: string } | null} */
let fixture = null;
/** @type {string | null} */
let targetP2LecturerId = null;
/** @type {string[]} */
const createdNotificationIds = [];
/** @type {string | null} */
let createdParticipantId = null;
/** @type {{ thesisId: string, p2LecturerId: string, previousFinalProposalVersionId: string | null } | null} */
let scoreReadFixture = null;

async function findEligibleStudentFixture() {
  const pembimbing1Role = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_1 },
    select: { id: true },
  });
  const pembimbing2Role = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_2 },
    select: { id: true },
  });
  if (!pembimbing1Role || !pembimbing2Role) return null;

  const theses = await prisma.thesis.findMany({
    where: {
      // Guard F2-2: P2 hanya untuk thesis fase TA (post-TA-04) yang masih berjalan.
      isProposal: false,
      OR: [
        { thesisStatus: null },
        { thesisStatus: { name: { notIn: ["Selesai", "Gagal", "Dibatalkan", "Lulus", "Drop Out"] } } },
      ],
      thesisSupervisors: {
        some: {
          status: "active",
          roleId: pembimbing1Role.id,
        },
      },
      NOT: {
        thesisSupervisors: {
          some: {
            status: "active",
            roleId: pembimbing2Role.id,
          },
        },
      },
    },
    include: {
      student: { select: { id: true } },
      thesisSupervisors: {
        where: { status: "active", roleId: pembimbing1Role.id },
        take: 1,
        select: { lecturerId: true },
      },
    },
    orderBy: { startDate: "desc" },
    take: 30,
  });

  for (const thesis of theses) {
    const pending = await prisma.notification.findFirst({
      where: {
        title: { in: ["REQUEST_SUPERVISOR_2", "REQUEST_SUPERVISOR_2_KADEP"] },
        isRead: false,
        message: { startsWith: `${thesis.id}|` },
      },
    });
    if (pending) continue;

    const p1 = thesis.thesisSupervisors[0];
    if (!p1) continue;

    return {
      studentUserId: thesis.student.id,
      thesisId: thesis.id,
      academicYearId: thesis.academicYearId,
      p1LecturerId: p1.lecturerId,
    };
  }
  return null;
}

async function pickTargetP2Lecturer(thesisId, excludeLecturerIds = []) {
  const pembimbing2Role = await prisma.userRole.findFirst({
    where: { name: ROLES.PEMBIMBING_2 },
    select: { id: true },
  });
  if (!pembimbing2Role) return null;

  const participants = await prisma.thesisSupervisors.findMany({
    where: { thesisId },
    select: { lecturerId: true },
  });
  const exclude = new Set([...excludeLecturerIds, ...participants.map((p) => p.lecturerId)]);

  const lecturer = await prisma.lecturer.findFirst({
    where: {
      id: { notIn: [...exclude] },
      user: {
        userHasRoles: {
          some: { roleId: pembimbing2Role.id, status: "active" },
        },
      },
    },
    select: { id: true },
  });
  return lecturer?.id ?? null;
}

async function findScoreReadFixture() {
  const row = await prisma.researchMethodScore.findFirst({
    where: {
      lecturerScore: { not: null },
      thesis: {
        thesisSupervisors: {
          some: { status: "active", role: { name: ROLES.PEMBIMBING_2 } },
        },
      },
    },
    select: { thesisId: true },
  });
  if (!row) return null;

  const p2 = await prisma.thesisSupervisors.findFirst({
    where: {
      thesisId: row.thesisId,
      status: "active",
      role: { name: ROLES.PEMBIMBING_2 },
    },
    select: { lecturerId: true },
  });
  if (!p2) return null;

  const thesis = await prisma.thesis.findUnique({
    where: { id: row.thesisId },
    select: { finalProposalVersionId: true },
  });

  return {
    thesisId: row.thesisId,
    p2LecturerId: p2.lecturerId,
    previousFinalProposalVersionId: thesis?.finalProposalVersionId ?? null,
  };
}

describe("IT-P2: Pembimbing 2 E2E (matching + TA-03B read-only)", () => {
  beforeAll(async () => {
    fixture = await findEligibleStudentFixture();
    if (fixture) {
      targetP2LecturerId = await pickTargetP2Lecturer(fixture.thesisId, [fixture.p1LecturerId]);
    }
    scoreReadFixture = await findScoreReadFixture();
  });

  afterAll(async () => {
    if (createdParticipantId) {
      await prisma.thesisSupervisors
        .delete({ where: { id: createdParticipantId } })
        .catch(() => {});
    }
    for (const nid of createdNotificationIds) {
      await prisma.notification.delete({ where: { id: nid } }).catch(() => {});
    }
    // Bersihkan record internal tahap KaDep yang dibuat selama pengujian.
    if (fixture) {
      await prisma.notification
        .deleteMany({
          where: {
            title: { in: ["REQUEST_SUPERVISOR_2", "REQUEST_SUPERVISOR_2_KADEP"] },
            message: { startsWith: `${fixture.thesisId}|` },
          },
        })
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("A — katalog P2 memuat trafficLight/normalAvailable/activeCount tanpa field terlarang", async () => {
    if (!fixture) {
      console.warn("[IT-P2/A] Tidak ada mahasiswa eligible (P1 ada, belum P2, tanpa pending). Lewati.");
      return;
    }

    const catalog = await getAvailableSupervisor2Service(fixture.studentUserId);
    expect(Array.isArray(catalog)).toBe(true);

    if (catalog.length === 0) {
      console.warn("[IT-P2/A] Katalog kosong — tidak ada dosen role P2 tersedia.");
      return;
    }

    const sample = catalog[0];
    expect(sample).toHaveProperty("id");
    expect(sample).toHaveProperty("fullName");
    expect(["green", "yellow", "red", null]).toContain(sample.trafficLight ?? null);

    for (const key of FORBIDDEN_QUOTA_KEYS) {
      expect(sample).not.toHaveProperty(key);
    }

    console.log(
      `[IT-P2/A] ✅ Katalog ${catalog.length} dosen; contoh trafficLight=${sample.trafficLight}, normalAvailable=${sample.normalAvailable}`,
    );
  });

  it("B — ajukan → pending → batalkan (tanpa sisa P2)", async () => {
    if (!fixture || !targetP2LecturerId) {
      console.warn("[IT-P2/B] Fixture atau dosen P2 target tidak ada. Lewati.");
      return;
    }

    const beforePending = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(beforePending).toBeNull();

    const created = await requestSupervisor2Service(fixture.studentUserId, {
      lecturerId: targetP2LecturerId,
    });
    expect(created.requestId).toBeTruthy();
    expect(created.lecturerName).toBeTruthy();
    createdNotificationIds.push(created.requestId);

    const pending = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(pending?.requestId).toBe(created.requestId);
    expect(pending?.lecturerId).toBe(targetP2LecturerId);

    const lecturerInbox = await getSupervisor2RequestsService(targetP2LecturerId);
    expect(lecturerInbox.some((r) => r.requestId === created.requestId)).toBe(true);

    const cancelled = await cancelSupervisor2RequestService(fixture.studentUserId);
    expect(cancelled.success).toBe(true);

    const afterPending = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(afterPending).toBeNull();

    const stillHasP2 = await hasPembimbing2(fixture.thesisId);
    expect(stillHasP2).toBe(false);

    console.log("[IT-P2/B] ✅ Siklus ajukan → pending → batalkan berhasil");
  });

  it("G — tolak permintaan: ajukan ke dosen lain lalu reject", async () => {
    if (!fixture) {
      console.warn("[IT-P2/G] Fixture tidak ada. Lewati.");
      return;
    }

    const hasP2 = await hasPembimbing2(fixture.thesisId);
    if (hasP2) {
      console.warn("[IT-P2/G] Thesis sudah punya P2 — lewati reject flow.");
      return;
    }

    const altLecturerId = await pickTargetP2Lecturer(fixture.thesisId, [
      fixture.p1LecturerId,
      targetP2LecturerId,
    ].filter(Boolean));

    if (!altLecturerId) {
      console.warn("[IT-P2/G] Tidak ada dosen P2 alternatif. Lewati.");
      return;
    }

    const created = await requestSupervisor2Service(fixture.studentUserId, {
      lecturerId: altLecturerId,
    });
    createdNotificationIds.push(created.requestId);

    const rejected = await rejectSupervisor2RequestService(altLecturerId, created.requestId, {
      reason: "IT-P2 uji tolak",
    });
    expect(rejected.success).toBe(true);

    const pending = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(pending).toBeNull();

    console.log("[IT-P2/G] ✅ Alur tolak permintaan P2 berhasil");
  });

  it("C — ajukan → dosen bersedia (forward KaDep) → KaDep setujui → participant P2 aktif", async () => {
    if (!fixture || !targetP2LecturerId) {
      console.warn("[IT-P2/C] Fixture atau dosen P2 target tidak ada. Lewati.");
      return;
    }

    const kadepUsers = await findUsersByActiveRole(ROLES.KETUA_DEPARTEMEN);
    if (!kadepUsers.length) {
      console.warn("[IT-P2/C] Tidak ada akun KaDep aktif. Lewati.");
      return;
    }
    const kadepUserId = kadepUsers[0].id;

    const created = await requestSupervisor2Service(fixture.studentUserId, {
      lecturerId: targetP2LecturerId,
    });
    createdNotificationIds.push(created.requestId);

    // Tahap 1: dosen bersedia → diteruskan ke KaDep (BELUM membuat participant).
    const approved = await approveSupervisor2RequestService(targetP2LecturerId, created.requestId);
    expect(approved.success).toBe(true);
    expect(approved.forwardedToKadep).toBe(true);

    let p2Row = await prisma.thesisSupervisors.findFirst({
      where: {
        thesisId: fixture.thesisId,
        lecturerId: targetP2LecturerId,
        status: "active",
        role: { name: ROLES.PEMBIMBING_2 },
      },
    });
    expect(p2Row).toBeNull();

    const pendingKadep = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(pendingKadep?.stage).toBe("kadep");

    // Tahap 2: KaDep menyetujui → participant P2 dibuat; Formulir TA-04 batch perlu difinalisasi ulang.
    const queue = await getSupervisor2KadepQueueService(kadepUserId);
    const queueItem = queue.find((q) => q.thesisId === fixture.thesisId);
    expect(queueItem).toBeTruthy();

    const decided = await decideSupervisor2ByKadepService(kadepUserId, queueItem.requestId, {
      approve: true,
    });
    expect(decided.approved).toBe(true);

    p2Row = await prisma.thesisSupervisors.findFirst({
      where: {
        thesisId: fixture.thesisId,
        lecturerId: targetP2LecturerId,
        status: "active",
        role: { name: ROLES.PEMBIMBING_2 },
      },
    });
    expect(p2Row).toBeTruthy();
    createdParticipantId = p2Row.id;

    const stillPending = await getPendingSupervisor2RequestService(fixture.studentUserId);
    expect(stillPending).toBeNull();

    console.log("[IT-P2/C] ✅ Dua tahap (dosen + KaDep) membuat ThesisSupervisors P2:", p2Row.id);
  });

  it("D1 — guard: P2 tidak bisa baca skor jika proposal final belum ada", async () => {
    if (!scoreReadFixture) {
      console.warn("[IT-P2/D1] Tidak ada thesis P2 + ResearchMethodScore. Lewati.");
      return;
    }

    if (scoreReadFixture.previousFinalProposalVersionId) {
      await prisma.thesis.update({
        where: { id: scoreReadFixture.thesisId },
        data: { finalProposalVersionId: null },
      });
    }

    await expect(
      getScoresByThesisForSupervisor(scoreReadFixture.thesisId, scoreReadFixture.p2LecturerId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    console.log("[IT-P2/D1] ✅ Guard proposal final aktif untuk pembimbing P2");
  });

  it("D2 — P2 membaca skor + detail rubrik TA-03B (setelah proposal final tersedia)", async () => {
    if (!scoreReadFixture) {
      console.warn("[IT-P2/D2] Tidak ada thesis P2 + skor. Lewati.");
      return;
    }

    let versionId = scoreReadFixture.previousFinalProposalVersionId;
    if (!versionId) {
      const version = await prisma.thesisProposalVersion.findFirst({
        where: { thesisId: scoreReadFixture.thesisId },
        orderBy: { version: "desc" },
        select: { id: true },
      });
      versionId = version?.id ?? null;
    }

    if (!versionId) {
      console.warn("[IT-P2/D2] Tidak ada versi proposal untuk dipasang sebagai final. Lewati.");
      return;
    }

    await prisma.thesis.update({
      where: { id: scoreReadFixture.thesisId },
      data: { finalProposalVersionId: versionId },
    });

    try {
      const ctx = await getSupervisorContextForThesis(
        scoreReadFixture.thesisId,
        scoreReadFixture.p2LecturerId,
      );
      expect(ctx.role).toBe("P2");

      const scores = await getScoresByThesisForSupervisor(
        scoreReadFixture.thesisId,
        scoreReadFixture.p2LecturerId,
      );
      expect(scores).toBeDefined();
      expect(scores.thesisId).toBe(scoreReadFixture.thesisId);
      expect(scores.supervisorScore).toBeTypeOf("number");
      expect(scores.lecturerScore).toBeTypeOf("number");

      if (scores.researchMethodScoreDetails?.length) {
        const ta03bCriteria = scores.researchMethodScoreDetails.filter(
          (d) => d.criteria?.role === "default" || d.criteria?.role === "metopen",
        );
        expect(ta03bCriteria.length).toBeGreaterThan(0);
        console.log(
          `[IT-P2/D2] ✅ Baca skor OK; TA-03A=${scores.supervisorScore}, TA-03B=${scores.lecturerScore}, detail=${ta03bCriteria.length}`,
        );
      } else {
        console.log("[IT-P2/D2] ✅ Baca skor agregat OK; detail rubrik kosong di DB");
      }
    } finally {
      await prisma.thesis.update({
        where: { id: scoreReadFixture.thesisId },
        data: { finalProposalVersionId: scoreReadFixture.previousFinalProposalVersionId },
      });
    }
  });

  it("E — arsip: Pembimbing 2 melihat mahasiswa thesis Selesai di scope archive", async () => {
    const selesaiStatus = await prisma.thesisStatus.findFirst({
      where: { name: "Selesai" },
      select: { id: true },
    });
    if (!selesaiStatus) {
      console.warn("[IT-P2/E] Status Selesai tidak ada. Lewati.");
      return;
    }

    const p2OnFinished = await prisma.thesisSupervisors.findFirst({
      where: {
        status: "active",
        role: { name: ROLES.PEMBIMBING_2 },
        thesis: { thesisStatusId: selesaiStatus.id },
      },
      select: { lecturerId: true, thesisId: true },
    });

    if (!p2OnFinished) {
      console.warn("[IT-P2/E] Tidak ada P2 pada thesis Selesai. Lewati.");
      return;
    }

    const activeList = await getMyStudentsService(p2OnFinished.lecturerId, [ROLES.PEMBIMBING_2], {
      scope: "active",
    });
    const archiveList = await getMyStudentsService(p2OnFinished.lecturerId, [ROLES.PEMBIMBING_2], {
      scope: "archive",
    });

    expect(archiveList.some((s) => s.thesisId === p2OnFinished.thesisId)).toBe(true);
  });

  it("F — baca skor thesis Selesai tidak ditolak karena status tutup (read-only arsip)", async () => {
    const selesaiStatus = await prisma.thesisStatus.findFirst({
      where: { name: "Selesai" },
      select: { id: true },
    });
    if (!selesaiStatus) return;

    const row = await prisma.thesisSupervisors.findFirst({
      where: {
        status: "active",
        role: { name: ROLES.PEMBIMBING_2 },
        thesis: {
          thesisStatusId: selesaiStatus.id,
          finalProposalVersionId: { not: null },
        },
      },
      select: {
        lecturerId: true,
        thesis: { select: { id: true, finalProposalVersionId: true } },
      },
    });

    if (!row?.thesis?.finalProposalVersionId) {
      console.warn("[IT-P2/F] Tidak ada thesis Selesai + P2 + proposal final. Lewati.");
      return;
    }

    await expect(
      getScoresByThesisForSupervisor(row.thesis.id, row.lecturerId),
    ).resolves.toBeDefined();

    console.log("[IT-P2/F] ✅ P2 dapat membaca skor pada thesis Selesai (arsip)");
  });

});
