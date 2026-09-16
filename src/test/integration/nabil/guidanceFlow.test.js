/**
 * Integration Test IT-04: Full Guidance Flow
 *
 * Tests the complete guidance workflow with REAL database:
 *   1. Student submits a guidance request
 *   2. Supervisor approves the guidance request
 *   3. Student marks session complete with summary
 *
 * Prasyarat bimbingan proposal (KC-20260710-01 / KC-20260709-03): booking
 * pembimbing disetujui (ThesisAdvisorRequest booking_approved + P1 aktif) DAN
 * penugasan resmi TA-04 sudah terbit (`ta04AssignmentIssuedAt`). Fixture di
 * bawah menyiapkan/mencari keadaan itu apa adanya dan memverifikasinya lewat
 * `getTa04GuidanceAuthorization` yang sama dengan yang dipakai produksi —
 * gate tidak boleh di-mock atau dilewati.
 *
 * Usage:
 *   pnpm test:integration:nabil
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { getTa04GuidanceAuthorization } from "../../../services/ta04Authorization.service.js";
import { requestGuidanceService, markSessionCompleteService } from "../../../services/thesisGuidance/student.guidance.service.js";
import { approveGuidanceService } from "../../../services/thesisGuidance/lecturer.guidance.service.js";
import { runCleanupIfEnabled } from "./cleanup.js";

// Mock FCM and Calendar to avoid real network calls during integration test
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(true),
  sendPushNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: "sup-event-1", studentEventId: "stu-event-1" }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(true),
}));

const STUDENT_NOTES_MARKER = "IT Test Guidance Notes";
const INACTIVE_THESIS_STATUSES = ["Dibatalkan", "Gagal"];

const THESIS_INCLUDE = {
  student: { include: { user: { select: { id: true, fullName: true } } } },
  thesisStatus: { select: { name: true } },
  thesisSupervisors: {
    where: { status: "active" },
    include: {
      role: { select: { name: true } },
      lecturer: { include: { user: { select: { id: true, fullName: true } } } },
    },
  },
};

// Booking sudah disetujui + P1 aktif, tetapi belum tentu TA-04 terbit.
const BOOKED_THESIS_WHERE = {
  advisorRequests: { some: { status: "booking_approved" } },
  thesisSupervisors: {
    some: { status: "active", role: { name: ROLES.PEMBIMBING_1 } },
  },
  NOT: { thesisStatus: { name: { in: INACTIVE_THESIS_STATUSES } } },
  // Guard "satu pengajuan aktif" di requestGuidanceService akan menolak thesis
  // yang masih punya antrean bimbingan milik data lain.
  thesisGuidances: { none: { status: "requested" } },
};

function findActiveP1(thesis) {
  return (thesis?.thesisSupervisors ?? []).find(
    (supervisor) =>
      supervisor.role?.name === ROLES.PEMBIMBING_1 && supervisor.lecturer?.user?.id,
  );
}

/**
 * Sama persis dengan `getActiveThesisForStudent` di repository mahasiswa:
 * requestGuidanceService selalu memakai thesis itu, bukan thesis pilihan test.
 */
async function resolvesToActiveThesis(thesis) {
  const active = await prisma.thesis.findFirst({
    where: { studentId: thesis.studentId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return active?.id === thesis.id;
}

async function pickUsableThesis(where) {
  const candidates = await prisma.thesis.findMany({
    where,
    include: THESIS_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: 25,
  });
  for (const candidate of candidates) {
    if (!findActiveP1(candidate)) continue;
    if (!candidate.student?.user?.id) continue;
    if (!(await resolvesToActiveThesis(candidate))) continue;
    return candidate;
  }
  return null;
}

describe("IT-04: Guidance Request & Approval Flow", () => {
  let testThesis = null;
  let testStudentUserId = null;
  let testSupervisorUserId = null;
  let testSupervisorLecturerId = null;
  let createdGuidanceId = null;
  let gateAuthorization = null;
  // Diisi hanya bila fixture yang menerbitkan TA-04, agar bisa dikembalikan.
  let issuedTa04ByFixture = null;

  beforeAll(async () => {
    // Sisa run sebelumnya boleh menghalangi guard "satu pengajuan aktif".
    await prisma.thesisGuidance.deleteMany({
      where: { studentNotes: STUDENT_NOTES_MARKER },
    });

    // 1. Utamakan thesis yang gerbangnya memang sudah terbuka di database.
    testThesis = await pickUsableThesis({
      ...BOOKED_THESIS_WHERE,
      ta04AssignmentIssuedAt: { not: null },
    });

    // 2. Kalau belum ada, siapkan prasyarat terakhir alur kanonis: KaDep
    //    menerbitkan penugasan TA-04 untuk booking yang sudah disetujui.
    if (!testThesis) {
      const bookedThesis = await pickUsableThesis({
        ...BOOKED_THESIS_WHERE,
        ta04AssignmentIssuedAt: null,
      });
      const kadep = await prisma.user.findFirst({
        where: {
          userHasRoles: {
            some: { role: { name: ROLES.KETUA_DEPARTEMEN }, status: "active" },
          },
        },
        select: { id: true },
      });

      if (bookedThesis && kadep) {
        const supervisorNames = bookedThesis.thesisSupervisors
          .filter((supervisor) =>
            [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2].includes(supervisor.role?.name),
          )
          .map((supervisor) => supervisor.lecturer?.user?.fullName)
          .filter(Boolean)
          .join(", ");

        issuedTa04ByFixture = {
          thesisId: bookedThesis.id,
          previous: {
            ta04AssignmentIssuedAt: bookedThesis.ta04AssignmentIssuedAt,
            ta04AssignmentIssuedByUserId: bookedThesis.ta04AssignmentIssuedByUserId,
            ta04AssignmentTitle: bookedThesis.ta04AssignmentTitle,
            ta04AssignmentSupervisorNames: bookedThesis.ta04AssignmentSupervisorNames,
            ta04AssignmentAcademicYearId: bookedThesis.ta04AssignmentAcademicYearId,
          },
        };

        await prisma.thesis.update({
          where: { id: bookedThesis.id },
          data: {
            ta04AssignmentIssuedAt: new Date(),
            ta04AssignmentIssuedByUserId: kadep.id,
            ta04AssignmentTitle: bookedThesis.title,
            ta04AssignmentSupervisorNames: supervisorNames || null,
            ta04AssignmentAcademicYearId: bookedThesis.academicYearId,
          },
        });

        testThesis = await prisma.thesis.findUnique({
          where: { id: bookedThesis.id },
          include: THESIS_INCLUDE,
        });
      }
    }

    if (!testThesis) return;

    const p1 = findActiveP1(testThesis);
    testStudentUserId = testThesis.student.user.id;
    testSupervisorUserId = p1.lecturer.user.id;
    testSupervisorLecturerId = p1.lecturerId;

    // Verifikasi gerbang lewat service produksi (bukan mock, bukan asumsi).
    gateAuthorization = await getTa04GuidanceAuthorization(testThesis.id);
  });

  afterAll(async () => {
    await runCleanupIfEnabled("IT-04", async () => {
      // Cleanup generated guidance data
      if (createdGuidanceId) {
        await prisma.thesisGuidance.delete({ where: { id: createdGuidanceId } }).catch(() => {});
      }
      // Kembalikan penugasan TA-04 kalau fixture yang menerbitkannya.
      if (issuedTa04ByFixture) {
        await prisma.thesis
          .update({
            where: { id: issuedTa04ByFixture.thesisId },
            data: issuedTa04ByFixture.previous,
          })
          .catch(() => {});
      }
    });
    await prisma.$disconnect();
  });

  it("requires an approved booking and an issued TA-04 assignment before guidance starts", () => {
    expect(
      testThesis,
      "Tidak ada thesis dengan booking disetujui + P1 aktif yang bisa dipakai fixture",
    ).not.toBeNull();

    expect(gateAuthorization).toMatchObject({
      hasBookedSupervisor: true,
      ta04Issued: true,
      hasOfficialSupervisor: true,
      guidanceGateOpen: true,
    });
    expect(gateAuthorization.guidanceGateReason).toBeNull();
    expect(testThesis.ta04AssignmentIssuedAt).not.toBeNull();
  });

  it("should complete the guidance flow: request → approve → complete", async () => {
    // 1. Student Requests Guidance
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
    const requestResult = await requestGuidanceService(
      testStudentUserId,
      futureDate,
      STUDENT_NOTES_MARKER,
      null, // file
      testSupervisorLecturerId,
      { duration: 60 }
    );
    expect(requestResult).toBeDefined();
    expect(requestResult.guidance.status).toBe("requested");
    createdGuidanceId = requestResult.guidance.id;
    console.log("[IT-04] ✅ Request created:", createdGuidanceId);

    // 2. Supervisor Approves Guidance
    const approveResult = await approveGuidanceService(
      testSupervisorUserId,
      createdGuidanceId,
      { feedback: "Approved for IT test", approvedDate: futureDate, duration: 60 }
    );
    expect(approveResult.guidance.status).toBe("accepted");
    console.log("[IT-04] ✅ Guidance approved by supervisor");

    // 3. Student Marks Guidance as Complete
    const completeResult = await markSessionCompleteService(
      testStudentUserId,
      createdGuidanceId,
      { sessionSummary: "Finished well", actionItems: "Review code" }
    );
    expect(completeResult.guidance.status).toBe("completed");
    expect(completeResult.guidance.sessionSummary).toBe("Finished well");
    console.log("[IT-04] ✅ Guidance marked as completed by student");

    // 4. Verify Persisted State in Database
    const dbGuidance = await prisma.thesisGuidance.findUnique({
      where: { id: createdGuidanceId },
    });
    expect(dbGuidance).not.toBeNull();
    expect(dbGuidance.status).toBe("completed");
    expect(dbGuidance.sessionSummary).toBe("Finished well");
    expect(dbGuidance.actionItems).toBe("Review code");
    console.log("[IT-04] ✅ Database verification passed");
  });
});
