/**
 * Integration Test IT-04: Full Guidance Flow
 *
 * Tests the complete guidance workflow with REAL database:
 *   1. Student submits a guidance request
 *   2. Supervisor approves the guidance request
 *   3. Student marks session complete with summary
 *
 * Usage:
 *   pnpm test:integration:nabil
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import { requestGuidanceService, markSessionCompleteService } from "../../../services/thesisGuidance/student.guidance.service.js";
import { approveGuidanceService } from "../../../services/thesisGuidance/lecturer.guidance.service.js";

// Mock FCM and Calendar to avoid real network calls during integration test
vi.mock("../../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(true),
  sendPushNotification: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: "sup-event-1", studentEventId: "stu-event-1" }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(true),
}));

describe("IT-04: Guidance Request & Approval Flow", () => {
  const SKIP_CLEANUP = process.env.SKIP_CLEANUP === "true";
  let testThesis = null;
  let testStudentUserId = null;
  let testSupervisorUserId = null;
  let testSupervisorLecturerId = null;
  let createdGuidanceId = null;

  beforeAll(async () => {
    // Find an active thesis in "Bimbingan" with at least one supervisor
    testThesis = await prisma.thesis.findFirst({
      where: {
        thesisStatus: { name: "Bimbingan" },
        thesisSupervisors: { some: {} },
      },
      include: {
        student: { include: { user: true } },
        thesisSupervisors: {
          include: { lecturer: { include: { user: true } } },
        },
      },
    });

    if (testThesis) {
      testStudentUserId = testThesis.student.userId || testThesis.student.user.id;
      const sup = testThesis.thesisSupervisors[0];
      testSupervisorUserId = sup.lecturer.userId || sup.lecturer.user.id;
      testSupervisorLecturerId = sup.lecturerId;
    }
  });

  afterAll(async () => {
    if (SKIP_CLEANUP) {
      console.warn("[IT-04] SKIP_CLEANUP=true, skipping cleanup");
      await prisma.$disconnect();
      return;
    }
    // Cleanup generated guidance data
    if (createdGuidanceId) {
      await prisma.thesisGuidance.delete({ where: { id: createdGuidanceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("should complete the guidance flow: request → approve → complete", async () => {
    // Skip if no test data available
    if (!testThesis) {
      console.warn("[IT-04] Insufficient test data, skipping");
      return;
    }

    // 1. Student Requests Guidance
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
    const requestResult = await requestGuidanceService(
      testStudentUserId,
      futureDate,
      "IT Test Guidance Notes",
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

    // Verify final state in DB
    const dbGuidance = await prisma.thesisGuidance.findUnique({ where: { id: createdGuidanceId } });
    expect(dbGuidance.status).toBe("completed");
    expect(dbGuidance.sessionSummary).toBe("Finished well");
    expect(dbGuidance.actionItems).toBe("Review code");
  });
});
