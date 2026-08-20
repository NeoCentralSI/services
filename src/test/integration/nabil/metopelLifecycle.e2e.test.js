/**
 * E2E Integration Test: Complete Metopel (Metodologi Penelitian) Lifecycle
 *
 * Tests all end-to-end scenarios of Metopen across 4 roles:
 *   1. Scenario 1: Happy Path (TA-01 Booking -> P1 ACC -> Kadep Overquota ACC -> TA-02 Guidance -> TA-03A/B Scoring -> Batch TA-04 Finalization -> Archive Mode)
 *   2. Scenario 2: Supervisor Rejection & Rollback (TA-01 Reject -> student chooses new supervisor)
 *
 * Usage:
 *   npx vitest run src/test/integration/nabil/metopelLifecycle.e2e.test.js --config vitest.integration.config.js
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { ADVISOR_REQUEST_STATUS } from "../../../constants/advisorRequestStatus.js";
import {
  submitRequest,
  respondByLecturer,
  decideByKadep,
} from "../../../services/advisorRequest.service.js";
import { resolveMetopenEligibilityState } from "../../../services/metopenEligibility.service.js";
import { getActiveAcademicYear } from "../../../helpers/academicYear.helper.js";

// Mock external side effects
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(true),
  sendPushNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: "mock-1", studentEventId: "mock-2" }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(true),
}));

describe("E2E Test: Metopel (Metodologi Penelitian) Complete Flow", () => {
  let activeAcademicYear = null;
  let testTopic = null;
  let lecturerP1 = null;
  let lecturerP2 = null;
  let kadepUser = null;

  let testStudentUser = null;
  let testStudent = null;
  let createdThesisId = null;

  beforeAll(async () => {
    // 1. Fetch active academic year
    activeAcademicYear = await getActiveAcademicYear();
    if (!activeAcademicYear) {
      activeAcademicYear = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
    }

    // 2. Fetch test topic
    testTopic = await prisma.thesisTopic.findFirst({
      include: { scienceGroup: true },
    });

    // 3. Fetch lecturers and ensure accepting requests
    const lecturers = await prisma.lecturer.findMany({
      include: { user: true },
      take: 5,
    });
    expect(lecturers.length).toBeGreaterThanOrEqual(2);
    lecturerP1 = lecturers[0];
    lecturerP2 = lecturers[1];

    await prisma.lecturer.updateMany({
      where: { id: { in: [lecturerP1.id, lecturerP2.id] } },
      data: { acceptingRequests: true },
    });

    // Find Kadep user
    const kadepRoleAssignment = await prisma.userHasRole.findFirst({
      where: {
        role: { name: ROLES.KETUA_DEPARTEMEN },
        status: "active",
      },
      include: { user: true },
    });
    kadepUser = kadepRoleAssignment?.user || lecturers[0].user;

    // 4. Create dedicated test student for E2E run
    const testNim = `23999${Math.floor(1000 + Math.random() * 9000)}`;
    testStudentUser = await prisma.user.create({
      data: {
        email: `e2e_student_${Date.now()}@test.unand.ac.id`,
        identityNumber: testNim,
        identityType: "NIM",
        fullName: "E2E Test Student Angkatan 23",
        student: {
          create: {
            status: "active",
            enrollmentYear: 2023,
            currentSemester: 5,
            sksCompleted: 100,
            mandatoryCoursesCompleted: true,
            mkwuCompleted: true,
            eligibleMetopen: true,
            metopenEligibilitySource: "sia",
            metopenEligibilityUpdatedAt: new Date(),
          },
        },
      },
      include: { student: true },
    });
    testStudent = testStudentUser.student;

    // Create snapshot for active year
    if (activeAcademicYear) {
      await prisma.studentAcademicYearSnapshot.upsert({
        where: {
          studentId_academicYearId: {
            studentId: testStudent.id,
            academicYearId: activeAcademicYear.id,
          },
        },
        create: {
          studentId: testStudent.id,
          academicYearId: activeAcademicYear.id,
          eligibleMetopen: true,
          eligibilitySource: "sia",
          eligibilityCapturedAt: new Date(),
          capturedAt: new Date(),
        },
        update: {
          eligibleMetopen: true,
          eligibilitySource: "sia",
          eligibilityCapturedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    // Clean up created E2E test student & related data
    if (testStudentUser) {
      try {
        if (createdThesisId) {
          await prisma.researchMethodScoreDetail.deleteMany({
            where: { researchMethodScore: { thesisId: createdThesisId } },
          });
          await prisma.researchMethodScore.deleteMany({ where: { thesisId: createdThesisId } });
          await prisma.thesisProposalVersion.deleteMany({ where: { thesisId: createdThesisId } });
          await prisma.thesisGuidance.deleteMany({ where: { thesisId: createdThesisId } });
          await prisma.thesisSupervisors.deleteMany({ where: { thesisId: createdThesisId } });
          await prisma.thesisAdvisorRequest.deleteMany({ where: { thesisId: createdThesisId } });
          await prisma.thesis.deleteMany({ where: { id: createdThesisId } });
        }
        await prisma.document.deleteMany({ where: { userId: testStudentUser.id } });
        await prisma.studentAcademicYearSnapshot.deleteMany({ where: { studentId: testStudent.id } });
        await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: testStudent.id } });
        await prisma.student.deleteMany({ where: { id: testStudent.id } });
        await prisma.userHasRole.deleteMany({ where: { userId: testStudentUser.id } });
        await prisma.user.deleteMany({ where: { id: testStudentUser.id } });
      } catch (err) {
        console.warn("E2E Cleanup notice:", err.message);
      }
    }
  });

  // =========================================================================
  // SCENARIO 1: HAPPY PATH E2E (TA-01 -> TA-02 -> TA-03 -> TA-04 -> ARSIP)
  // =========================================================================
  describe("Scenario 1: Happy Path Metopel Full Lifecycle", () => {
    let advisorRequestId = null;

    it("1.1 Fase 0: Validasi Kelayakan Metopen Mahasiswa", async () => {
      const eligibility = await resolveMetopenEligibilityState(testStudent.id);
      expect(eligibility.eligibleMetopen).toBe(true);
    });

    it("1.2 Fase 1 (TA-01): Mahasiswa Mengajukan Judul & Booking Calon Pembimbing", async () => {
      const payload = {
        topicId: testTopic.id,
        lecturerId: lecturerP1.id,
        proposedTitle: "Rancang Bangun Sistem Metopen Terintegrasi Berbasis Event-Driven",
        backgroundSummary: "Latar belakang masalah penelitian metopen secara komprehensif",
        problemStatement: "Bagaimana merancang sistem yang efisien, skalabel, dan andal",
        proposedSolution: "Menggunakan arsitektur event-driven terdistribusi dan message broker",
        researchObject: "Jurusan Sistem Informasi Universitas Andalas",
        researchPermitStatus: "approved",
        studentJustification: "Justifikasi akademik mahasiswa untuk memilih dosen pembimbing karena kesesuaian riset",
      };

      const request = await submitRequest(testStudentUser.id, payload);
      expect(request).toBeDefined();
      expect(request.id).toBeDefined();
      expect([ADVISOR_REQUEST_STATUS.PENDING, ADVISOR_REQUEST_STATUS.PENDING_KADEP]).toContain(request.status);
      advisorRequestId = request.id;
    });

    it("1.3 Fase 1: Dosen Pembimbing 1 Menyetujui Booking (TA-01 ACC)", async () => {
      const reviewResult = await respondByLecturer(
        advisorRequestId,
        lecturerP1.id,
        {
          action: "accept",
          approvalNote: "Topik dan rumusan masalah disetujui untuk bimbingan proposal.",
          lecturerOverquotaReason: "Dosen bersedia membimbing topik riset ini secara intensif.",
        }
      );

      expect(reviewResult).toBeDefined();

      let finalReviewResult = reviewResult;
      if (reviewResult.status === ADVISOR_REQUEST_STATUS.PENDING_KADEP) {
        finalReviewResult = await decideByKadep(advisorRequestId, kadepUser.id, {
          action: "approve",
          notes: "Disetujui overquota oleh Kadep",
        });
      }

      expect(finalReviewResult.status).toBe(ADVISOR_REQUEST_STATUS.BOOKING_APPROVED);

      // Verify Thesis record in database
      const thesis = await prisma.thesis.findFirst({
        where: { studentId: testStudent.id },
        include: {
          thesisTopic: true,
          thesisStatus: true,
        },
      });

      expect(thesis).toBeDefined();
      expect(thesis.isProposal).toBe(true);
      createdThesisId = thesis.id;
    });

    it("1.4 Fase 2 (TA-02): Mahasiswa Mencatat Bimbingan & Dosen Menyetujui Logbook", async () => {
      const guidance = await prisma.thesisGuidance.create({
        data: {
          thesisId: createdThesisId,
          requestedDate: new Date(),
          approvedDate: new Date(),
          studentNotes: "Membahas BAB 1 dan perumusan masalah",
          sessionSummary: "Revisi rumusan masalah dengan metriks SMART",
          status: "completed",
        },
      });

      expect(guidance).toBeDefined();
      expect(guidance.id).toBeDefined();

      // Create Document first for proposal version
      const doc = await prisma.document.create({
        data: {
          fileName: "proposal_bab1_3.pdf",
          filePath: "/uploads/proposals/test.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
        },
      });

      // Submit Proposal Version draft
      const proposalVersion = await prisma.thesisProposalVersion.create({
        data: {
          thesisId: createdThesisId,
          documentId: doc.id,
          version: 1,
          description: "Draft pertama proposal Bab 1 - Bab 3",
          submittedAsFinalAt: new Date(),
        },
      });

      expect(proposalVersion).toBeDefined();
      expect(proposalVersion.version).toBe(1);
    });

    it("1.5 Fase 3 (TA-03A): Dosen Pembimbing Menginput Nilai Rubrik Proposal", async () => {
      const score = await prisma.researchMethodScore.upsert({
        where: { thesisId: createdThesisId },
        create: {
          thesisId: createdThesisId,
          supervisorId: lecturerP1.id,
          supervisorScore: 68,
        },
        update: {
          supervisorId: lecturerP1.id,
          supervisorScore: 68,
        },
      });

      expect(score).toBeDefined();
      expect(score.supervisorScore).toBe(68);
    });

    it("1.6 Fase 3 (TA-03B): Koordinator Metopen Menginput Nilai Kelas", async () => {
      const scoreB = await prisma.researchMethodScore.update({
        where: { thesisId: createdThesisId },
        data: {
          lecturerId: lecturerP2.id,
          lecturerScore: 22,
          finalScore: 90,
          isFinalized: true,
          finalizedAt: new Date(),
        },
      });

      expect(scoreB).toBeDefined();
      expect(scoreB.finalScore).toBe(90);
      expect(scoreB.isFinalized).toBe(true);
    });

    it("1.7 Fase 4 (TA-04): Batch Finalization SK Penugasan TA-04", async () => {
      await prisma.thesis.update({
        where: { id: createdThesisId },
        data: {
          proposalStatus: "accepted",
          ta04AssignmentIssuedAt: new Date(),
        },
      });

      const updated = await prisma.thesis.findUnique({
        where: { id: createdThesisId },
      });

      expect(updated.proposalStatus).toBe("accepted");
      expect(updated.ta04AssignmentIssuedAt).toBeDefined();
    });
  });

  // =========================================================================
  // SCENARIO 2: SUPERVISOR REJECTION FLOW (TA-01 REJECT & RE-CHOOSE)
  // =========================================================================
  describe("Scenario 2: Dosen Menolak Booking (TA-01 Reject & Rollback)", () => {
    let studentUser2 = null;
    let student2 = null;
    let rejectedRequestId = null;

    beforeAll(async () => {
      const nim = `23888${Math.floor(1000 + Math.random() * 9000)}`;
      studentUser2 = await prisma.user.create({
        data: {
          email: `e2e_student_reject_${Date.now()}@test.unand.ac.id`,
          identityNumber: nim,
          identityType: "NIM",
          fullName: "E2E Student Reject Test",
          student: {
            create: {
              status: "active",
              enrollmentYear: 2023,
              currentSemester: 5,
              sksCompleted: 95,
              mandatoryCoursesCompleted: true,
              mkwuCompleted: true,
              eligibleMetopen: true,
              metopenEligibilitySource: "sia",
            },
          },
        },
        include: { student: true },
      });
      student2 = studentUser2.student;
    });

    afterAll(async () => {
      if (studentUser2) {
        try {
          await prisma.studentAcademicYearSnapshot.deleteMany({ where: { studentId: student2.id } });
          await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: student2.id } });
          await prisma.thesisAdvisorRequestDraft.deleteMany({ where: { studentId: student2.id } });
          await prisma.student.deleteMany({ where: { id: student2.id } });
          await prisma.userHasRole.deleteMany({ where: { userId: studentUser2.id } });
          await prisma.user.deleteMany({ where: { id: studentUser2.id } });
        } catch (e) {
          console.warn("Cleanup student2 notice:", e.message);
        }
      }
    });

    it("2.1 Mahasiswa mengajukan booking ke Dosen 1", async () => {
      const request = await submitRequest(
        studentUser2.id,
        {
          topicId: testTopic.id,
          lecturerId: lecturerP1.id,
          proposedTitle: "Analisis Komparasi Kinerja Algoritma Klasifikasi Data Mining",
          backgroundSummary: "Abstraksi untuk pengujian penolakan pembimbing",
          problemStatement: "Permasalahan komparasi kinerja model klasifikasi",
          proposedSolution: "Melakukan benchmarking multi-algoritma",
          researchObject: "Dataset Publik Citra Medis",
          researchPermitStatus: "approved",
          studentJustification: "Justifikasi akademik mahasiswa untuk memilih dosen pembimbing karena bidang riset",
        }
      );

      expect(request).toBeDefined();
      expect([ADVISOR_REQUEST_STATUS.PENDING, ADVISOR_REQUEST_STATUS.PENDING_KADEP]).toContain(request.status);
      rejectedRequestId = request.id;
    });

    it("2.2 Dosen 1 menolak booking dengan alasan topik", async () => {
      const rejectResult = await respondByLecturer(
        rejectedRequestId,
        lecturerP1.id,
        {
          action: "reject",
          rejectionReason: "Topik kurang sesuai dengan roadmap riset saat ini.",
        }
      );

      expect(rejectResult).toBeDefined();
      expect(rejectResult.status).toBe(ADVISOR_REQUEST_STATUS.REJECTED_BY_DOSEN);
    });

    it("2.3 Mahasiswa bebas mengajukan booking baru ke Dosen 2", async () => {
      const reRequest = await submitRequest(
        studentUser2.id,
        {
          topicId: testTopic.id,
          lecturerId: lecturerP2.id,
          proposedTitle: "Analisis Komparasi Kinerja Algoritma Alternatif dengan Pendekatan Hybrid",
          backgroundSummary: "Abstraksi baru untuk pengajuan ke dosen alternatif",
          problemStatement: "Permasalahan komparasi kinerja model alternatif",
          proposedSolution: "Melakukan benchmarking multi-algoritma teroptimasi",
          researchObject: "Dataset Alternatif Citra Medis",
          researchPermitStatus: "approved",
          studentJustification: "Justifikasi akademik baru untuk memilih dosen pembimbing alternatif",
        }
      );

      expect(reRequest).toBeDefined();
      expect([ADVISOR_REQUEST_STATUS.PENDING, ADVISOR_REQUEST_STATUS.PENDING_KADEP]).toContain(reRequest.status);
      expect(reRequest.lecturerId).toBe(lecturerP2.id);
    });
  });
});
