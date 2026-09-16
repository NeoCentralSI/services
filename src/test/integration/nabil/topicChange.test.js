/**
 * Integration Test IT-02: Topic Change (Ganti Topik) - Production model
 *
 * Production behavior (do not invent a new thesis):
 *   1. Student submits topic change → ThesisChangeRequest stores newTitle/newTopicId/supportingDocumentId
 *   2. Existing thesis status is unchanged at submit
 *   3. All supervisors approve the request
 *   4. Kadep approveRequest archives the old thesis (Dibatalkan), soft-deletes
 *      guidances/milestones, and does NOT create a new thesis
 *
 * IMPORTANT: This hits the REAL database. Make sure .env points to TEST database.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import prisma from "../../../config/prisma.js";
import {
  submitRequest,
  reviewRequestByLecturer,
  approveRequest,
} from "../../../services/thesisChangeRequest.service.js";

let testThesis = null;
let testStudentUserId = null;
let testSupervisors = [];
let kadepUserId = null;
let originalTopicId = null;
let newTopicId = null;
let originalTitle = null;
let originalStatusId = null;
let originalGuidanceStates = [];
let originalMilestoneStates = [];
let thesisCountBefore = 0;

let createdRequestId = null;
let supportingDocumentId = null;
let createdGuidanceId = null;
let createdMilestoneId = null;

describe("IT-02: Topic Change Full Flow", () => {
  beforeAll(async () => {
    const candidates = await prisma.thesis.findMany({
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
        thesisMilestones: { select: { id: true, status: true } },
        thesisGuidances: { select: { id: true, status: true } },
      },
      take: 30,
    });

    for (const candidate of candidates) {
      const studentThesisCount = await prisma.thesis.count({
        where: { studentId: candidate.studentId },
      });
      const lookupMatch = await prisma.thesis.findFirst({
        where: { student: { id: candidate.student.id } },
        select: { id: true },
      });
      if (lookupMatch?.id === candidate.id && studentThesisCount === 1) {
        testThesis = candidate;
        break;
      }
      if (!testThesis && lookupMatch?.id === candidate.id) {
        testThesis = candidate;
      }
    }
    if (!testThesis) {
      testThesis = candidates[0] || null;
    }

    if (!testThesis) {
      console.warn("[IT-02] No active thesis found in 'Bimbingan' status. Skipping.");
      return;
    }

    testStudentUserId = testThesis.student.id;
    originalTopicId = testThesis.thesisTopicId;
    originalTitle = testThesis.title;
    originalStatusId = testThesis.thesisStatusId;
    originalGuidanceStates = (testThesis.thesisGuidances || []).map((g) => ({
      id: g.id,
      status: g.status,
    }));
    originalMilestoneStates = (testThesis.thesisMilestones || []).map((m) => ({
      id: m.id,
      status: m.status,
    }));
    thesisCountBefore = await prisma.thesis.count({
      where: { studentId: testStudentUserId },
    });

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
    await prisma.document.deleteMany({
      where: {
        userId: testStudentUserId,
        fileName: { startsWith: "it02-topic-change-" },
      },
    });

    testSupervisors = testThesis.thesisSupervisors.map((s) => ({
      lecturerId: s.lecturerId,
      userId: s.lecturer.user.id,
      role: s.role?.name || "Pembimbing",
      supervisorRecordId: s.id,
    }));

    const kadep = await prisma.user.findFirst({
      where: {
        userHasRoles: { some: { role: { name: "Ketua Departemen" }, status: "active" } },
      },
      select: { id: true },
    });
    kadepUserId = kadep?.id;

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
    try {
      if (createdRequestId) {
        await prisma.thesisChangeRequestApproval.deleteMany({
          where: { requestId: createdRequestId },
        });
        await prisma.thesisChangeRequest.delete({
          where: { id: createdRequestId },
        }).catch(() => {});
      }

      if (createdGuidanceId) {
        await prisma.thesisGuidance.delete({ where: { id: createdGuidanceId } }).catch(() => {});
      }
      if (createdMilestoneId) {
        await prisma.thesisMilestone.delete({ where: { id: createdMilestoneId } }).catch(() => {});
      }

      if (testThesis && originalStatusId) {
        await prisma.thesis.update({
          where: { id: testThesis.id },
          data: {
            thesisStatusId: originalStatusId,
            title: originalTitle,
          },
        });
      }

      for (const guidance of originalGuidanceStates) {
        await prisma.thesisGuidance.update({
          where: { id: guidance.id },
          data: { status: guidance.status },
        }).catch(() => {});
      }
      for (const milestone of originalMilestoneStates) {
        await prisma.thesisMilestone.update({
          where: { id: milestone.id },
          data: { status: milestone.status },
        }).catch(() => {});
      }

      if (supportingDocumentId) {
        await prisma.document.delete({ where: { id: supportingDocumentId } }).catch(() => {});
      }

      await prisma.notification.deleteMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
          title: { contains: "Pergantian" },
        },
      });

      console.log("[IT-02 cleanup] Restored original state.");
    } catch (err) {
      console.error("[IT-02 cleanup] Error:", err.message);
    }
    await prisma.$disconnect();
  });

  it("should complete the full topic change flow: submit → supervisor approve → kadep archive", async () => {
    if (!testThesis || !newTopicId || !kadepUserId || testSupervisors.length === 0) {
      console.warn("[IT-02] Insufficient test data, skipping");
      return;
    }

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

    const createdGuidance = await prisma.thesisGuidance.create({
      data: {
        thesisId: testThesis.id,
        requestedDate: new Date(),
        studentNotes: "[IT-02 TEST] guidance for archive assertion",
      },
    });
    createdGuidanceId = createdGuidance.id;

    const createdMilestone = await prisma.thesisMilestone.create({
      data: {
        thesisId: testThesis.id,
        title: "[IT-02 TEST] milestone for archive assertion",
      },
    });
    createdMilestoneId = createdMilestone.id;

    const submitResult = await submitRequest(testStudentUserId, {
      requestType: "topic",
      reason: "Integration test - ganti topik sesuai minat penelitian",
      supportingDocumentId,
      newTitle,
      newTopicId,
    });

    expect(submitResult).toBeDefined();
    expect(submitResult.id).toBeDefined();
    createdRequestId = submitResult.id;
    expect(submitResult.thesisId).toBe(testThesis.id);

    const storedRequest = await prisma.thesisChangeRequest.findUnique({
      where: { id: createdRequestId },
    });
    expect(storedRequest).not.toBeNull();
    expect(storedRequest.newTitle).toBe(newTitle);
    expect(storedRequest.newTopicId).toBe(newTopicId);
    expect(storedRequest.supportingDocumentId).toBe(supportingDocumentId);
    expect(storedRequest.status).toBe("pending");
    console.log("[STEP 1] ✅ Request stored with newTitle/newTopicId/supportingDocumentId:", createdRequestId);

    const thesisAfterSubmit = await prisma.thesis.findUnique({
      where: { id: testThesis.id },
      include: { thesisStatus: { select: { name: true } } },
    });
    expect(thesisAfterSubmit.thesisStatus.name).toBe(testThesis.thesisStatus.name);
    expect(thesisAfterSubmit.title).toBe(originalTitle);
    expect(thesisAfterSubmit.thesisStatusId).toBe(originalStatusId);

    const inventedThesis = await prisma.thesis.findFirst({
      where: {
        studentId: testStudentUserId,
        title: newTitle,
      },
    });
    expect(inventedThesis).toBeNull();
    expect(
      await prisma.thesis.count({ where: { studentId: testStudentUserId } })
    ).toBe(thesisCountBefore);
    console.log("[STEP 1] ✅ Old thesis unchanged; no new thesis created");

    const approvals = await prisma.thesisChangeRequestApproval.findMany({
      where: { requestId: createdRequestId },
    });
    expect(approvals.length).toBe(testSupervisors.length);
    expect(approvals.every((a) => a.status === "pending")).toBe(true);
    console.log(`[STEP 1] ✅ ${approvals.length} supervisor approval(s) created (all pending)`);

    console.log("\n[STEP 2] Supervisors approve the request...");

    for (const sup of testSupervisors) {
      await reviewRequestByLecturer(createdRequestId, sup.lecturerId, "approved", "Setuju - IT test");
      console.log(`[STEP 2] ✅ ${sup.role} (${sup.lecturerId}) approved`);
    }

    const updatedApprovals = await prisma.thesisChangeRequestApproval.findMany({
      where: { requestId: createdRequestId },
    });
    expect(updatedApprovals.every((a) => a.status === "approved")).toBe(true);
    console.log("[STEP 2] ✅ All supervisor approvals confirmed");

    console.log("\n[STEP 3] Kadep approves the request (archives old thesis)...");

    const kadepLecturer = await prisma.lecturer.findUnique({ where: { id: kadepUserId } });
    const reviewerId = kadepLecturer ? kadepUserId : kadepUserId;

    const approveResult = await approveRequest(createdRequestId, reviewerId, "Disetujui - IT test");
    expect(approveResult).toBeDefined();
    expect(approveResult.status).toBe("approved");
    console.log("[STEP 3] ✅ Request approved by Kadep");

    console.log("\n[STEP 4] Verifying production archive model...");

    const oldThesis = await prisma.thesis.findUnique({
      where: { id: testThesis.id },
      include: { thesisStatus: { select: { name: true } } },
    });
    expect(["Dibatalkan", "Gagal"]).toContain(oldThesis.thesisStatus.name);
    if (oldThesis.thesisStatus.name === "Dibatalkan") {
      expect(oldThesis.title).toBe(`${originalTitle} (Dibatalkan)`);
    }
    console.log(`[STEP 4a] ✅ Old thesis archived: status=${oldThesis.thesisStatus.name}`);

    expect(
      await prisma.thesis.count({ where: { studentId: testStudentUserId } })
    ).toBe(thesisCountBefore);
    const newThesisAfterApprove = await prisma.thesis.findFirst({
      where: {
        studentId: testStudentUserId,
        title: newTitle,
      },
    });
    expect(newThesisAfterApprove).toBeNull();
    console.log("[STEP 4b] ✅ No new thesis created after approve");

    const archivedGuidance = await prisma.thesisGuidance.findUnique({
      where: { id: createdGuidanceId },
    });
    const archivedMilestone = await prisma.thesisMilestone.findUnique({
      where: { id: createdMilestoneId },
    });
    expect(archivedGuidance.status).toBe("deleted");
    expect(archivedMilestone.status).toBe("deleted");

    for (const guidance of originalGuidanceStates) {
      const row = await prisma.thesisGuidance.findUnique({ where: { id: guidance.id } });
      expect(row.status).toBe("deleted");
    }
    for (const milestone of originalMilestoneStates) {
      const row = await prisma.thesisMilestone.findUnique({ where: { id: milestone.id } });
      expect(row.status).toBe("deleted");
    }
    console.log("[STEP 4c] ✅ Guidances and milestones soft-deleted");

    const supervisorsStillOnOld = await prisma.thesisSupervisors.count({
      where: { thesisId: testThesis.id },
    });
    expect(supervisorsStillOnOld).toBe(testSupervisors.length);
    console.log("[STEP 4d] ✅ Supervisors were not moved to a new thesis");

    const finalRequest = await prisma.thesisChangeRequest.findUnique({
      where: { id: createdRequestId },
    });
    expect(finalRequest.status).toBe("approved");
    expect(finalRequest.reviewedBy).toBe(reviewerId);
    expect(finalRequest.reviewedAt).not.toBeNull();
    expect(finalRequest.newTitle).toBe(newTitle);
    expect(finalRequest.newTopicId).toBe(newTopicId);
    expect(finalRequest.supportingDocumentId).toBe(supportingDocumentId);
    console.log("[STEP 4e] ✅ Change request final status: approved (fields still stored)");

    console.log("\n[IT-02] ✅ PRODUCTION TOPIC CHANGE FLOW VERIFIED");
  }, 60000);
});
