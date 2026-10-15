/**
 * E2E Integration Test: Thesis Guidance to Seminar Ready Flow & FCM Push Notifications
 *
 * Tests the complete flow:
 *   1. Eight completed research-phase guidance sessions (Paket E: the seminar needs at least 8
 *      sessions of the research phase with status Selesai; proposal-phase sessions do not count)
 *   2. Approval refused while a milestone is not finished
 *   3. Milestone completion validation
 *   4. Supervisor 1 seminar readiness approval + FCM check (partial approval)
 *   5. Supervisor 2 seminar readiness approval + FCM check (full approval -> Acc Seminar)
 *   6. Verification that student is eligible to register for seminar
 *
 * Usage:
 *   npx vitest run src/test/integration/nabil/thesisGuidanceSeminarReady.e2e.test.js --config vitest.integration.config.js
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import {
  approveSeminarReadiness,
  getThesisSeminarReadiness,
} from "../../../services/thesisGuidance/milestone.service.js";
import { getActiveAcademicYear } from "../../../helpers/academicYear.helper.js";
import { sendFcmToUsers } from "../../../services/push.service.js";

// Mock external side effects
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(true),
  sendPushNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: "mock-1", studentEventId: "mock-2" }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(true),
}));

describe("E2E Test: Bimbingan Mahasiswa to Seminar Ready & FCM Notification Flow", () => {
  let activeAcademicYear = null;
  let testTopic = null;
  let lecturerP1 = null;
  let lecturerP2 = null;
  let testStudentUser = null;
  let testStudent = null;
  let testThesis = null;

  beforeAll(async () => {
    // 1. Fetch active academic year
    activeAcademicYear = await getActiveAcademicYear();
    if (!activeAcademicYear) {
      activeAcademicYear = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
    }

    // 2. Fetch Topic
    testTopic = await prisma.thesisTopic.findFirst();

    // 4. Fetch 2 distinct lecturers with user accounts
    const lecturers = await prisma.lecturer.findMany({
      include: { user: true },
      take: 2,
    });
    lecturerP1 = lecturers[0];
    lecturerP2 = lecturers[1];

    const p1Role = await prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } });
    const p2Role = await prisma.userRole.findFirst({ where: { name: "Pembimbing 2" } });

    // 5. Create a test student taking thesis course
    const timestamp = Date.now();
    const testNim = `22999${Math.floor(1000 + Math.random() * 9000)}`;
    testStudentUser = await prisma.user.create({
      data: {
        identityNumber: testNim,
        identityType: "NIM",
        fullName: `Test Student Seminar Ready ${timestamp}`,
        email: `student.seminar.${timestamp}@test.unand.ac.id`,
        student: {
          create: {
            enrollmentYear: 2022,
            sksCompleted: 125,
            researchMethodCompleted: true,
            status: "active",
          },
        },
      },
      include: { student: true },
    });
    testStudent = testStudentUser.student;

    // 6. Create active Thesis with 2 Supervisors (P1 and P2)
    testThesis = await prisma.thesis.create({
      data: {
        studentId: testStudent.id,
        thesisTopicId: testTopic.id,
        status: "research",
        academicYearId: activeAcademicYear.id,
        title: "Rancang Bangun Sistem Realtime IoT Menggunakan WebSockets",
        startDate: new Date(),
        thesisSupervisors: {
          create: [
            {
              lecturerId: lecturerP1.id,
              status: "active",
              roleId: p1Role.id,
              seminarReady: false,
            },
            {
              lecturerId: lecturerP2.id,
              status: "active",
              roleId: p2Role.id,
              seminarReady: false,
            },
          ],
        },
      },
      include: { thesisSupervisors: true },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testThesis?.id) {
      await prisma.thesisGuidance.deleteMany({ where: { thesisId: testThesis.id } });
      await prisma.thesisMilestone.deleteMany({ where: { thesisId: testThesis.id } });
      await prisma.thesisSupervisors.deleteMany({ where: { thesisId: testThesis.id } });
      await prisma.thesis.deleteMany({ where: { id: testThesis.id } });
    }
    if (testStudentUser?.id) {
      await prisma.notification.deleteMany({ where: { userId: testStudentUser.id } });
      await prisma.student.deleteMany({ where: { id: testStudent.id } });
      await prisma.user.deleteMany({ where: { id: testStudentUser.id } });
    }
  });

  it("1. Delapan sesi bimbingan fase penelitian berstatus Selesai (syarat seminar)", async () => {
    const now = Date.now();
    await prisma.thesisGuidance.createMany({
      data: Array.from({ length: 8 }, (_, index) => {
        const at = new Date(now - (8 - index) * 7 * 24 * 60 * 60 * 1000);
        return {
          thesisId: testThesis.id,
          supervisorId: lecturerP1.id,
          requestedDate: at,
          approvedDate: at,
          studentNotes: `Konsultasi ke-${index + 1}: BAB 4 & Analisis Kinerja WebSocket`,
          sessionSummary: "Pembahasan grafik perbandingan latency telah tervalidasi. Lanjutkan ke penulisan draf final.",
          status: "completed",
          phase: "research",
          completedAt: at,
        };
      }),
    });

    const completed = await prisma.thesisGuidance.count({ where: { thesisId: testThesis.id, phase: "research", status: "completed" } });
    expect(completed).toBe(8);
  });

  it("2. Validasi gagal approval seminar readiness jika milestone belum lengkap 100%", async () => {
    // Buat 1 milestone yang belum selesai
    await prisma.thesisMilestone.create({
      data: {
        thesisId: testThesis.id,
        title: "Bab 1: Pendahuluan",
        orderIndex: 1,
        status: "in_progress",
        phase: "research",
        progressPercentage: 50,
      },
    });

    // P1 mencoba approve sebelum milestone selesai
    await expect(
      approveSeminarReadiness(testThesis.id, lecturerP1.user.id, "Draf bab 1 masih separuh")
    ).rejects.toThrow(/belum memenuhi syarat seminar hasil: Seluruh milestone selesai \(100%\) \(0 dari 1 milestone selesai\)/);
  });

  it("3. Mahasiswa menyelesaikan semua milestone progress 100%", async () => {
    // Update all milestones to completed
    await prisma.thesisMilestone.updateMany({
      where: { thesisId: testThesis.id },
      data: {
        status: "completed",
        progressPercentage: 100,
        completedAt: new Date(),
      },
    });

    const status = await getThesisSeminarReadiness(testThesis.id, testStudentUser.id);
    expect(status.milestoneProgress.isComplete).toBe(true);
    expect(status.canRegisterSeminar).toBe(false); // Belum di-approve dosen
  });

  it("4. Pembimbing 1 memberikan persetujuan kesiapan seminar & memverifikasi payload FCM", async () => {
    vi.clearAllMocks();

    const result = await approveSeminarReadiness(testThesis.id, lecturerP1.user.id, "BAB 1-5 dan prototype telah lengkap");

    expect(result.data.approvedBySupervisor1).toBe(true);
    expect(result.data.isFullyApproved).toBe(false); // P2 belum approve

    // Verifikasi FCM push notification terpanggil dengan payload yang sesuai
    expect(sendFcmToUsers).toHaveBeenCalledTimes(1);
    expect(sendFcmToUsers).toHaveBeenCalledWith(
      [testStudentUser.id],
      expect.objectContaining({
        title: expect.stringContaining("Persetujuan Seminar"),
        data: expect.objectContaining({
          type: "seminar_readiness_approved",
          thesisId: testThesis.id,
          isFullyApproved: "false",
        }),
      })
    );
  });

  it("5. Pembimbing 2 memberikan persetujuan kesiapan seminar -> Fully Approved & Acc Seminar + FCM", async () => {
    vi.clearAllMocks();

    const result = await approveSeminarReadiness(testThesis.id, lecturerP2.user.id, "Disetujui untuk maju seminar hasil");

    expect(result.data.approvedBySupervisor1).toBe(true);
    expect(result.data.approvedBySupervisor2).toBe(true);
    expect(result.data.isFullyApproved).toBe(true);

    // Verifikasi FCM push notification penuh
    expect(sendFcmToUsers).toHaveBeenCalledTimes(1);
    expect(sendFcmToUsers).toHaveBeenCalledWith(
      [testStudentUser.id],
      expect.objectContaining({
        title: expect.stringContaining("Kesiapan Seminar Disetujui Penuh"),
        data: expect.objectContaining({
          type: "seminar_readiness_approved",
          thesisId: testThesis.id,
          isFullyApproved: "true",
        }),
      })
    );
  });

  it("6. Mahasiswa sekarang memenuhi syarat lengkap untuk mendaftar seminar hasil", async () => {
    const finalStatus = await getThesisSeminarReadiness(testThesis.id, testStudentUser.id);
    expect(finalStatus.canRegisterSeminar).toBe(true);
  });
});
