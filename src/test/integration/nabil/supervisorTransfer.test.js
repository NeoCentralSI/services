/**
 * Integration Test IT-03: Supervisor Transfer (Transfer Pembimbing) - Full Flow
 *
 * Tests the complete supervisor transfer workflow with REAL database:
 *   1. Dosen A requests transfer of student(s) to Dosen B
 *      → Creates TX notification for Dosen B + TX_KADEP for Kadep
 *   2. Dosen B (target) approves the transfer request
 *      → Updates TX_KADEP tgtApproved=true, notifies Kadep
 *   3. Kadep approves → prisma.$transaction() executes:
 *      - ThesisSupervisors.lecturerId swapped from A → B
 *      - If B was already P2 on same thesis, duplicate removed
 *      - Students notified of supervisor change
 *
 * IMPORTANT: This hits the REAL database. Make sure .env points to TEST database.
 *
 * Usage:
 *   cd c:\Projects\Tugas Akhir\backend
 *   npx vitest run --config vitest.integration.config.js src/test/integration/supervisorTransfer.test.js
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import prisma from "../../../config/prisma.js";
import {
  requestStudentTransferService,
  approveTransferRequestService,
  kadepApproveTransferService,
} from "../../../services/thesisGuidance/lecturer.guidance.service.js";

// ── Test Data ──
let sourceThesis = null;       // Thesis supervised by source lecturer
let sourceLecturerId = null;   // Dosen A (current supervisor)
let sourceUserId = null;
let targetLecturerId = null;   // Dosen B (target)
let targetUserId = null;
let kadepUserId = null;
let thesisSupervisorRecordId = null;  // the supervisor record to transfer
let originalLecturerId = null;  // backup for restoration

// Notification IDs created during the test
let targetNotificationId = null;
let kadepNotificationId = null;

describe("IT-03: Supervisor Transfer Full Flow", () => {
  beforeAll(async () => {
    // 1. Find a thesis in "Bimbingan" with a Pembimbing 1 supervisor
    sourceThesis = await prisma.thesis.findFirst({
      where: {
        thesisStatus: { name: "Bimbingan" },
        thesisSupervisors: {
          some: { role: { name: "Pembimbing 1" } },
        },
      },
      include: {
        student: { include: { user: { select: { id: true, fullName: true } } } },
        thesisSupervisors: {
          include: {
            lecturer: { include: { user: { select: { id: true, fullName: true } } } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!sourceThesis) {
      console.warn("[IT-03] No thesis with Pembimbing 1 found. Skipping.");
      return;
    }

    // Find the P1 supervisor (source)
    const p1Sup = sourceThesis.thesisSupervisors.find((s) => s.role.name === "Pembimbing 1");
    if (!p1Sup) {
      console.warn("[IT-03] No P1 supervisor found. Skipping.");
      return;
    }

    sourceLecturerId = p1Sup.lecturerId;
    sourceUserId = p1Sup.lecturer.user.id;
    thesisSupervisorRecordId = p1Sup.id;
    originalLecturerId = p1Sup.lecturerId;

    // 2. Find a target lecturer (Pembimbing 1 role, different from source)
    const targetLecturer = await prisma.lecturer.findFirst({
      where: {
        id: { not: sourceLecturerId },
        user: {
          userHasRoles: { some: { role: { name: "Pembimbing 1" }, status: "active" } },
        },
      },
      include: { user: { select: { id: true, fullName: true } } },
    });

    if (!targetLecturer) {
      console.warn("[IT-03] No eligible target lecturer found. Skipping.");
      return;
    }

    targetLecturerId = targetLecturer.id;
    targetUserId = targetLecturer.user.id;

    // Also make sure target is not already a supervisor on this thesis
    const existingTargetSup = sourceThesis.thesisSupervisors.find(
      (s) => s.lecturerId === targetLecturerId
    );
    if (existingTargetSup) {
      // Find another target that is NOT already on this thesis
      const altTarget = await prisma.lecturer.findFirst({
        where: {
          id: { notIn: sourceThesis.thesisSupervisors.map((s) => s.lecturerId) },
          user: {
            userHasRoles: { some: { role: { name: "Pembimbing 1" }, status: "active" } },
          },
        },
        include: { user: { select: { id: true, fullName: true } } },
      });
      if (altTarget) {
        targetLecturerId = altTarget.id;
        targetUserId = altTarget.user.id;
      } else {
        console.warn("[IT-03] No suitable target lecturer (not already on thesis). Skipping.");
        targetLecturerId = null;
        return;
      }
    }

    // 3. Find Kadep user
    const kadep = await prisma.user.findFirst({
      where: {
        userHasRoles: { some: { role: { name: "Ketua Departemen" }, status: "active" } },
      },
      select: { id: true },
    });
    kadepUserId = kadep?.id;

    console.log("[IT-03] Source thesis:", sourceThesis.id);
    console.log("[IT-03] Student:", sourceThesis.student.user.fullName);
    console.log("[IT-03] Source lecturer (A):", sourceUserId, "-", sourceLecturerId);
    console.log("[IT-03] Target lecturer (B):", targetUserId, "-", targetLecturerId);
    console.log("[IT-03] Kadep:", kadepUserId);
    console.log("[IT-03] Supervisor record:", thesisSupervisorRecordId);
  });

  afterAll(async () => {
    try {
      // 1. Restore the supervisor record back to original lecturer
      if (thesisSupervisorRecordId && originalLecturerId) {
        await prisma.thesisSupervisors
          .update({
            where: { id: thesisSupervisorRecordId },
            data: { lecturerId: originalLecturerId },
          })
          .catch(() => {});
      }

      // 2. Clean up notification records created during the test
      const cutoff = new Date(Date.now() - 120000); // within last 2 minutes
      await prisma.notification.deleteMany({
        where: {
          createdAt: { gte: cutoff },
          OR: [
            { title: { contains: "Transfer" } },
            { title: { contains: "Dosen Pembimbing Berubah" } },
            { title: { contains: "Permintaan Transfer" } },
          ],
        },
      });

      console.log("[IT-03 cleanup] Restored original state.");
    } catch (err) {
      console.error("[IT-03 cleanup] Error:", err.message);
    }
    await prisma.$disconnect();
  });

  it("should complete the full supervisor transfer flow: request → target approve → kadep approve", async () => {
    // Guard
    if (!sourceThesis || !targetLecturerId || !kadepUserId) {
      console.warn("[IT-03] Insufficient test data, skipping");
      return;
    }

    // ═══════════════════════════════════════════════════════
    // STEP 1: Dosen A requests transfer to Dosen B
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 1] Dosen A requests student transfer to Dosen B...");

    const transferResult = await requestStudentTransferService(sourceUserId, {
      thesisIds: [sourceThesis.id],
      targetLecturerId,
      reason: "Integration test - transfer pembimbing",
    });

    expect(transferResult).toBeDefined();
    expect(transferResult.studentCount).toBe(1);
    console.log("[STEP 1] ✅ Transfer request sent:", transferResult.message);

    // Verify: TX notification created for target lecturer
    const targetNotifs = await prisma.notification.findMany({
      where: {
        userId: targetLecturerId,
        isRead: false,
        message: { contains: '"t":"TX"' },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(targetNotifs.length).toBeGreaterThanOrEqual(1);
    targetNotificationId = targetNotifs[0].id;
    console.log("[STEP 1] ✅ Target notification created:", targetNotificationId);

    // Verify: TX_KADEP notification created for Kadep
    const kadepNotifs = await prisma.notification.findMany({
      where: {
        userId: kadepUserId,
        isRead: false,
        message: { contains: '"t":"TX_KADEP"' },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(kadepNotifs.length).toBeGreaterThanOrEqual(1);
    kadepNotificationId = kadepNotifs[0].id;

    // Verify kadep payload shows tgtApproved=false
    const kadepPayload = JSON.parse(kadepNotifs[0].message);
    expect(kadepPayload.tgtApproved).toBe(false);
    expect(kadepPayload.st).toBe("pending");
    console.log("[STEP 1] ✅ Kadep notification created:", kadepNotificationId);

    // ═══════════════════════════════════════════════════════
    // STEP 2: Dosen B (target) approves the transfer
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 2] Dosen B (target) approves the transfer...");

    const approveResult = await approveTransferRequestService(targetUserId, targetNotificationId);
    expect(approveResult).toBeDefined();
    console.log("[STEP 2] ✅ Target approved:", approveResult.message);

    // Verify: tgtApproved updated to true in kadep notification
    const updatedKadepNotif = await prisma.notification.findUnique({
      where: { id: kadepNotificationId },
    });
    const updatedKadepPayload = JSON.parse(updatedKadepNotif.message);
    expect(updatedKadepPayload.tgtApproved).toBe(true);
    console.log("[STEP 2] ✅ Kadep notification updated: tgtApproved=true");

    // Verify: target's TX notification is now read
    const targetNotifAfter = await prisma.notification.findUnique({
      where: { id: targetNotificationId },
    });
    expect(targetNotifAfter.isRead).toBe(true);
    console.log("[STEP 2] ✅ Target notification marked as read");

    // ═══════════════════════════════════════════════════════
    // STEP 3: Kadep approves → $transaction executes swap
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 3] Kadep approves the transfer (triggers $transaction)...");

    const kadepResult = await kadepApproveTransferService(kadepUserId, kadepNotificationId);
    expect(kadepResult).toBeDefined();
    console.log("[STEP 3] ✅ Kadep approved:", kadepResult.message);

    // ═══════════════════════════════════════════════════════
    // STEP 4: Verify database state after transaction
    // ═══════════════════════════════════════════════════════
    console.log("\n[STEP 4] Verifying database state after swap...");

    // 4a. Supervisor record should now point to target lecturer
    const swappedSupervisor = await prisma.thesisSupervisors.findUnique({
      where: { id: thesisSupervisorRecordId },
      include: {
        lecturer: { include: { user: { select: { fullName: true } } } },
        role: { select: { name: true } },
      },
    });
    expect(swappedSupervisor).not.toBeNull();
    expect(swappedSupervisor.lecturerId).toBe(targetLecturerId);
    console.log(
      `[STEP 4a] ✅ Supervisor swapped: ${swappedSupervisor.lecturer.user.fullName} (${swappedSupervisor.role.name})`
    );

    // 4b. Thesis should still be in valid state (not corrupted)
    const thesisAfter = await prisma.thesis.findUnique({
      where: { id: sourceThesis.id },
      include: {
        thesisStatus: { select: { name: true } },
        thesisSupervisors: {
          include: {
            lecturer: { include: { user: { select: { fullName: true } } } },
            role: { select: { name: true } },
          },
        },
      },
    });
    expect(thesisAfter.thesisStatus.name).toBe("Bimbingan"); // Status unchanged
    console.log(`[STEP 4b] ✅ Thesis status preserved: ${thesisAfter.thesisStatus.name}`);
    console.log(
      `[STEP 4b] ✅ Current supervisors: ${thesisAfter.thesisSupervisors.map((s) => `${s.role.name}: ${s.lecturer.user.fullName}`).join(", ")}`
    );

    // 4c. Original source lecturer should NOT be a supervisor on this thesis anymore
    const sourceStillSupervisor = thesisAfter.thesisSupervisors.some(
      (s) => s.lecturerId === sourceLecturerId
    );
    expect(sourceStillSupervisor).toBe(false);
    console.log("[STEP 4c] ✅ Source lecturer no longer supervisor on thesis");

    // 4d. Kadep notification should be marked as read with status "approved"
    const kadepNotifFinal = await prisma.notification.findUnique({
      where: { id: kadepNotificationId },
    });
    expect(kadepNotifFinal.isRead).toBe(true);
    const finalKadepPayload = JSON.parse(kadepNotifFinal.message);
    expect(finalKadepPayload.st).toBe("approved");
    console.log("[STEP 4d] ✅ Kadep notification status: approved, isRead: true");

    // 4e. Student should have been notified about supervisor change
    const studentNotif = await prisma.notification.findFirst({
      where: {
        userId: sourceThesis.student.user.id,
        title: "Dosen Pembimbing Berubah",
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    });
    expect(studentNotif).not.toBeNull();
    console.log("[STEP 4e] ✅ Student notified about supervisor change");

    console.log("\n[IT-03] ✅ FULL SUPERVISOR TRANSFER FLOW VERIFIED SUCCESSFULLY");
  }, 60000); // 60s timeout
});
