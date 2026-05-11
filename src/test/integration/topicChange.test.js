/**
 * Integration Test IT-02: Topic Change (Ganti Topik) - Full Flow
 *
 * Tests the complete topic change workflow with REAL database:
 *   1. Student submits topic change request → new "Diajukan" thesis created
 *   2. All supervisors approve the request
 *   3. Kadep approves → prisma.$transaction() executes:
 *      - Old thesis → "Dibatalkan" + CANCELLED
 *      - New thesis → "Bimbingan" + ONGOING + startDate + deadlineDate
 *      - Supervisors moved from old → new thesis
 *      - Milestones auto-created from topic templates
 *
 * IMPORTANT: This hits the REAL database. Make sure .env points to TEST database.
 *
 * Usage:
 *   cd c:\Projects\Tugas Akhir\backend
 *   npx vitest run --config vitest.integration.config.js src/test/integration/topicChange.test.js
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import prisma from "../../config/prisma.js";
import {
  submitRequest,
  reviewRequestByLecturer,
  approveRequest,
} from "../../services/thesisChangeRequest.service.js";

// ── Test Data References ──
// We'll pick a real thesis from DB in beforeAll
let testThesis = null;
let testStudentUserId = null;
let testSupervisors = []; // [{ lecturerId, userId }]
let kadepUserId = null;
let originalTopicId = null;
let newTopicId = null;

// Track created data for cleanup
let createdRequestId = null;
let newThesisId = null;
let supportingDocumentId = null;

describe("IT-02: Topic Change Full Flow", () => {
  beforeAll(async () => {
    // 1. Find a thesis in "Bimbingan" status with at least 1 supervisor
    testThesis = await prisma.thesis.findFirst({
      where: {
        thesisStatus: { name: "Bimbingan" },
        thesisSupervisors: { some: {} },
        NOT: {
          title: { startsWith: "[IT-" },
        },
      },
      include: {
        student: { include: { user: { select: { id: true, fullName: true, identityNumber: true } } } },
        thesisStatus: { select: { id: true, name: true } },
        thesisTopic: { select: { id: true, name: true } },
        thesisSupervisors: {
          include: {
            lecturer: { include: { user: { select: { id: true, fullName: true } } } },
            role: { select: { name: true } },
          },
        },
        thesisMilestones: { select: { id: true } },
      },
    });

    if (!testThesis) {
      console.warn("[IT-02] No active thesis found in 'Bimbingan' status. Skipping.");
      return;
    }

    testStudentUserId = testThesis.student.id;
    originalTopicId = testThesis.thesisTopicId;

    const staleRequests = await prisma.thesisChangeRequest.findMany({
      where: {
        thesisId: testThesis.id,
        status: "pending",
      },
      select: { id: true },
    });
    const staleRequestIds = staleRequests.map((request) => request.id);
    if (staleRequestIds.length > 0) {
      await prisma.thesisChangeRequestApproval.deleteMany({
        where: { requestId: { in: staleRequestIds } },
      });
      await prisma.thesisChangeRequest.deleteMany({
        where: { id: { in: staleRequestIds } },
      });
    }
    await prisma.thesis.deleteMany({
      where: {
        studentId: testStudentUserId,
        title: { startsWith: "[IT-02 TEST]" },
        thesisStatus: { name: "Diajukan" },
      },
    });
    await prisma.document.deleteMany({
      where: {
        userId: testStudentUserId,
        fileName: { startsWith: "it02-topic-change-" },
      },
    });

    // Get supervisors with "Pembimbing 1"/"Pembimbing 2" roles
    testSupervisors = testThesis.thesisSupervisors
      .filter((s) => s.role.name === "Pembimbing 1" || s.role.name === "Pembimbing 2")
      .map((s) => ({
        lecturerId: s.lecturerId,
        userId: s.lecturer.user.id,
        role: s.role.name,
        supervisorRecordId: s.id,
      }));

    // 2. Find Kadep user
    const kadep = await prisma.user.findFirst({
      where: {
        userHasRoles: { some: { role: { name: "Ketua Departemen" }, status: "active" } },
      },
      select: { id: true },
    });
    kadepUserId = kadep?.id;

    // 3. Find a different topic for the change
    const otherTopic = await prisma.thesisTopic.findFirst({
      where: originalTopicId ? { id: { not: originalTopicId } } : undefined,
    });
    newTopicId = otherTopic?.id;

    console.log("[IT-02] Test Thesis:", testThesis.id);
    console.log("[IT-02] Student:", testThesis.student.user.fullName);
    console.log("[IT-02] Supervisors:", testSupervisors.map((s) => `${s.role}: ${s.userId}`).join(", "));
    console.log("[IT-02] Kadep:", kadepUserId);
    console.log("[IT-02] Topic change:", originalTopicId, "→", newTopicId);
  });

  afterAll(async () => {
    // Cleanup: Restore original state
    try {
      if (testThesis) {
        // 1. Restore old thesis to Bimbingan status
        const bimbinganStatus = await prisma.thesisStatus.findFirst({ where: { name: "Bimbingan" } });
        if (bimbinganStatus) {
          await prisma.thesis.update({
            where: { id: testThesis.id },
            data: {
              thesisStatusId: bimbinganStatus.id,
              rating: testThesis.rating || "ONGOING",
            },
          });
        }

        // 2. Move supervisors back to old thesis (if they were moved)
        if (newThesisId) {
          await prisma.thesisParticipant.updateMany({
            where: { thesisId: newThesisId },
            data: { thesisId: testThesis.id },
          });
        }

        // 3. Delete the new thesis and its milestones
        if (newThesisId) {
          await prisma.thesisMilestone.deleteMany({ where: { thesisId: newThesisId } });
          await prisma.thesis.delete({ where: { id: newThesisId } }).catch(() => {});
        }

        // 4. Delete change request and approvals
        if (createdRequestId) {
          await prisma.thesisChangeRequestApproval.deleteMany({ where: { requestId: createdRequestId } });
          await prisma.thesisChangeRequest.delete({ where: { id: createdRequestId } }).catch(() => {});
        }

        if (supportingDocumentId) {
          await prisma.document.delete({ where: { id: supportingDocumentId } }).catch(() => {});
        }

        // 5. Clean up notifications created during test
        await prisma.notification.deleteMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 60000) },
            title: { contains: "Pergantian" },
          },
        });
      }
      console.log("[IT-02 cleanup] Restored original state.");
    } catch (err) {
      console.error("[IT-02 cleanup] Error:", err.message);
    }
    await prisma.$disconnect();
  });

  it("should complete the full topic change flow: submit → supervisor approve → kadep approve", async () => {
    // Guard: skip if no test data
    if (!testThesis || !newTopicId || !kadepUserId || testSupervisors.length === 0) {
      console.warn("[IT-02] Insufficient test data, skipping");
      return;
    }

    // ═══════════════════════════════════════════════════════
    // STEP 1: Student submits topic change request
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 1] Student submits topic change request...");

    const newTitle = `[IT-02 TEST] Judul Baru ${Date.now()}`;
    const supportingDocument = await prisma.document.create({
      data: {
        userId: testStudentUserId,
        fileName: `it02-topic-change-${Date.now()}.pdf`,
        filePath: `uploads/test/it02-topic-change-${Date.now()}.pdf`,
        mimeType: "application/pdf",
      },
    });
    supportingDocumentId = supportingDocument.id;

    const submitResult = await submitRequest(testStudentUserId, {
      requestType: "topic",
      reason: "Integration test - ganti topik",
      supportingDocumentId,
      newTitle,
      newTopicId,
    });

    expect(submitResult).toBeDefined();
    expect(submitResult.id).toBeDefined();
    createdRequestId = submitResult.id;
    console.log("[STEP 1] ✅ Request created:", createdRequestId);

    // Verify: a new thesis with "Diajukan" status should exist
    const diajukanStatus = await prisma.thesisStatus.findFirst({ where: { name: "Diajukan" } });
    const proposedThesis = await prisma.thesis.findFirst({
      where: {
        studentId: testStudentUserId,
        thesisStatusId: diajukanStatus.id,
        title: newTitle,
      },
    });
    expect(proposedThesis).not.toBeNull();
    newThesisId = proposedThesis.id;
    console.log("[STEP 1] ✅ New thesis (Diajukan) created:", newThesisId);

    // Verify: approvals created for each supervisor
    const approvals = await prisma.thesisChangeRequestApproval.findMany({
      where: { requestId: createdRequestId },
    });
    expect(approvals.length).toBe(testSupervisors.length);
    expect(approvals.every((a) => a.status === "pending")).toBe(true);
    console.log(`[STEP 1] ✅ ${approvals.length} supervisor approval(s) created (all pending)`);

    // ═══════════════════════════════════════════════════════
    // STEP 2: All supervisors approve
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 2] Supervisors approve the request...");

    for (const sup of testSupervisors) {
      await reviewRequestByLecturer(createdRequestId, sup.lecturerId, "approved", "Setuju - IT test");
      console.log(`[STEP 2] ✅ ${sup.role} (${sup.lecturerId}) approved`);
    }

    // Verify: all approvals are now 'approved'
    const updatedApprovals = await prisma.thesisChangeRequestApproval.findMany({
      where: { requestId: createdRequestId },
    });
    expect(updatedApprovals.every((a) => a.status === "approved")).toBe(true);
    console.log("[STEP 2] ✅ All supervisor approvals confirmed");

    // ═══════════════════════════════════════════════════════
    // STEP 3: Kadep approves → $transaction executes
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 3] Kadep approves the request (triggers $transaction)...");

    // Find kadep's lecturer ID
    const kadepLecturer = await prisma.lecturer.findUnique({ where: { id: kadepUserId } });
    const reviewerId = kadepLecturer ? kadepUserId : kadepUserId;

    const approveResult = await approveRequest(createdRequestId, reviewerId, "Disetujui - IT test");
    expect(approveResult).toBeDefined();
    expect(approveResult.status).toBe("approved");
    console.log("[STEP 3] ✅ Request approved by Kadep");

    // ═══════════════════════════════════════════════════════
    // STEP 4: Verify database state after transaction
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 4] Verifying database state...");

    // 4a. Old thesis should be "Dibatalkan" + CANCELLED
    const oldThesis = await prisma.thesis.findUnique({
      where: { id: testThesis.id },
      include: { thesisStatus: { select: { name: true } } },
    });
    expect(oldThesis.thesisStatus.name).toBe("Dibatalkan");
    expect(oldThesis.rating).toBe("CANCELLED");
    console.log(`[STEP 4a] ✅ Old thesis: status=${oldThesis.thesisStatus.name}, rating=${oldThesis.rating}`);

    // 4b. New thesis should be "Bimbingan" + ONGOING + has startDate + deadlineDate
    const newThesis = await prisma.thesis.findUnique({
      where: { id: newThesisId },
      include: { thesisStatus: { select: { name: true } } },
    });
    expect(newThesis.thesisStatus.name).toBe("Bimbingan");
    expect(newThesis.rating).toBe("ONGOING");
    expect(newThesis.startDate).not.toBeNull();
    expect(newThesis.deadlineDate).not.toBeNull();

    // Deadline should be ~1 year from now
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const deadlineDiff = Math.abs(newThesis.deadlineDate.getTime() - oneYearFromNow.getTime());
    expect(deadlineDiff).toBeLessThan(60000); // Within 1 minute tolerance
    console.log(`[STEP 4b] ✅ New thesis: status=${newThesis.thesisStatus.name}, rating=${newThesis.rating}`);
    console.log(`[STEP 4b] ✅ Deadline set: ${newThesis.deadlineDate.toISOString()}`);

    // 4c. Supervisors should be moved from old to new thesis
    const oldThesisSupervisors = await prisma.thesisParticipant.findMany({
      where: { thesisId: testThesis.id },
    });
    const newThesisSupervisors = await prisma.thesisParticipant.findMany({
      where: { thesisId: newThesisId },
      include: { role: { select: { name: true } } },
    });
    expect(oldThesisSupervisors.length).toBe(0);
    expect(newThesisSupervisors.length).toBeGreaterThanOrEqual(testSupervisors.length);
    console.log(`[STEP 4c] ✅ Supervisors moved: old=${oldThesisSupervisors.length}, new=${newThesisSupervisors.length}`);

    // 4d. Check milestones were auto-created for new thesis (if topic has templates)
    const milestoneTemplates = await prisma.thesisMilestoneTemplate.findMany({
      where: { topicId: newTopicId, isActive: true },
    });
    if (milestoneTemplates.length > 0) {
      const newMilestones = await prisma.thesisMilestone.findMany({
        where: { thesisId: newThesisId },
      });
      expect(newMilestones.length).toBe(milestoneTemplates.length);
      expect(newMilestones.every((m) => m.status === "not_started")).toBe(true);
      console.log(`[STEP 4d] ✅ ${newMilestones.length} milestones auto-created from ${milestoneTemplates.length} templates`);
    } else {
      console.log("[STEP 4d] ⏩ No milestone templates for new topic, skipping milestone check");
    }

    // 4e. Verify the change request status
    const finalRequest = await prisma.thesisChangeRequest.findUnique({
      where: { id: createdRequestId },
    });
    expect(finalRequest.status).toBe("approved");
    expect(finalRequest.reviewedBy).toBe(reviewerId);
    expect(finalRequest.reviewedAt).not.toBeNull();
    console.log("[STEP 4e] ✅ Change request final status: approved");

    console.log("\n[IT-02] ✅ FULL TOPIC CHANGE FLOW VERIFIED SUCCESSFULLY");
  }, 60000); // 60s timeout
});
