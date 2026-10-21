/**
 * Integration Test IT-04: Full Guidance Flow
 *
 * Tests the complete guidance workflow with REAL database:
 *   1. Student submits a guidance request
 *   2. Supervisor approves the guidance request
 *   3. Student sends the session summary; the supervisor approves it
 *
 * Prasyarat bimbingan fase proposal: pengajuan pembimbing disetujui, Pembimbing 1
 * aktif, dan Penetapan Pembimbing sudah terbit (`thesis.supervisor_assigned_at`). Fixture memakai
 * TA fase proposal dari seed apa adanya dan memeriksa gerbangnya lewat helper yang sama dengan
 * yang dipakai produksi; gerbang tidak di-mock atau dilewati.
 *
 * Usage:
 *   pnpm test:integration:nabil
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { getProposalPhaseAccess } from "../../../helpers/thesis-phase-access.helper.js";
import { requestGuidanceService, submitSessionSummaryService } from "../../../services/thesisGuidance/student.guidance.service.js";
import { approveGuidanceService, approveSessionSummaryService } from "../../../services/thesisGuidance/lecturer.guidance.service.js";
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

const THESIS_INCLUDE = {
  student: { include: { user: { select: { id: true, fullName: true } } } },
  thesisSupervisors: {
    where: { status: "active" },
    include: {
      role: { select: { name: true } },
      lecturer: { include: { user: { select: { id: true, fullName: true } } } },
    },
  },
};

// Proposal phase with an active Pembimbing 1 and no other request waiting (one active request).
const PROPOSAL_THESIS_WHERE = {
  status: "proposal",
  thesisSupervisors: { some: { status: "active", role: { name: ROLES.PEMBIMBING_1 } } },
  thesisGuidances: { none: { status: "requested" } },
};

function findActiveP1(thesis) {
  return (thesis?.thesisSupervisors ?? []).find(
    (supervisor) => supervisor.role?.name === ROLES.PEMBIMBING_1 && supervisor.lecturer?.user?.id,
  );
}

function pickThesis(where) {
  return prisma.thesis.findFirst({ where, include: THESIS_INCLUDE, orderBy: { updatedAt: "desc" } });
}

describe("IT-04: Guidance Request & Approval Flow (proposal phase)", () => {
  let assignedThesis = null;
  let unassignedThesis = null;
  let createdGuidanceId = null;

  beforeAll(async () => {
    // Leftovers of an earlier run may block the "one active request" rule.
    await prisma.thesisGuidance.deleteMany({ where: { studentNotes: STUDENT_NOTES_MARKER } });
    assignedThesis = await pickThesis({ ...PROPOSAL_THESIS_WHERE, supervisorAssignedAt: { not: null } });
    unassignedThesis = await pickThesis({ ...PROPOSAL_THESIS_WHERE, supervisorAssignedAt: null });
  });

  afterAll(async () => {
    await runCleanupIfEnabled("IT-04", async () => {
      if (createdGuidanceId) {
        await prisma.thesisGuidance.delete({ where: { id: createdGuidanceId } }).catch(() => {});
      }
    });
    await prisma.$disconnect();
  });

  it("opens proposal guidance only after Penetapan Pembimbing", async () => {
    expect(assignedThesis, "Seed tidak memuat TA fase proposal yang sudah ditetapkan").not.toBeNull();
    expect(await getProposalPhaseAccess(assignedThesis)).toEqual({ open: true, repeating: false });

    expect(unassignedThesis, "Seed tidak memuat TA fase proposal yang belum ditetapkan").not.toBeNull();
    expect(await getProposalPhaseAccess(unassignedThesis)).toEqual({ open: false, repeating: false });
    const p1 = findActiveP1(unassignedThesis);
    await expect(
      requestGuidanceService(unassignedThesis.student.user.id, new Date(Date.now() + 86400000).toISOString(), STUDENT_NOTES_MARKER, null, p1.lecturerId, { duration: 60 }),
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("Penetapan Pembimbing") });
  });

  it("should complete the guidance flow: request → approve → summary → approve summary", async () => {
    const p1 = findActiveP1(assignedThesis);
    const studentUserId = assignedThesis.student.user.id;

    // 1. Student Requests Guidance
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
    const requestResult = await requestGuidanceService(studentUserId, futureDate, STUDENT_NOTES_MARKER, null, p1.lecturerId, { duration: 60 });
    expect(requestResult.guidance.status).toBe("requested");
    createdGuidanceId = requestResult.guidance.id;

    // 2. Supervisor Approves Guidance
    const approveResult = await approveGuidanceService(p1.lecturer.user.id, createdGuidanceId, {
      feedback: "Approved for IT test",
      approvedDate: futureDate,
      duration: 60,
    });
    expect(approveResult.guidance.status).toBe("accepted");

    // 3. The session took place (moved back like DevTools does), the student sends the summary
    await prisma.thesisGuidance.update({ where: { id: createdGuidanceId }, data: { approvedDate: new Date(Date.now() - 3600000) } });
    const summaryResult = await submitSessionSummaryService(studentUserId, createdGuidanceId, {
      sessionSummary: "Finished well",
      actionItems: "Review code",
    });
    expect(summaryResult.guidance.status).toBe("summary_pending");

    // 4. The supervisor approves the summary: the session is completed
    await approveSessionSummaryService(p1.lecturer.user.id, createdGuidanceId);

    // 5. Persisted: the phase was set by the server from the thesis status
    const dbGuidance = await prisma.thesisGuidance.findUnique({ where: { id: createdGuidanceId } });
    expect(dbGuidance).toMatchObject({ status: "completed", phase: "proposal", sessionSummary: "Finished well", actionItems: "Review code" });
  });
});
