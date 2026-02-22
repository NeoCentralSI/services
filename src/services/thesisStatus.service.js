import prisma from "../config/prisma.js";
import { sendFcmToUsers } from "./push.service.js";
import { createNotificationsForUsers } from "./notification.service.js";
import { ROLES } from "../constants/roles.js";

const MONTH_2 = 60 * 24 * 60 * 60 * 1000;
const MONTH_4 = 120 * 24 * 60 * 60 * 1000;
const YEAR_1 = 365 * 24 * 60 * 60 * 1000;

function decideStatus(thesis) {
  const now = new Date();
  const created = new Date(thesis.createdAt);
  const age = now - created;

  // 1. FAILED: Jika > 1 tahun (dan belum selesai - checked outside)
  if (age > YEAR_1) {
    return "FAILED";
  }

  // Cari aktivitas milestone terakhir
  // thesis.thesisMilestones is array of { updatedAt }
  let lastActivity = created;
  if (thesis.thesisMilestones && thesis.thesisMilestones.length > 0) {
    // Assuming sorted desc by query
    const lastMilestone = thesis.thesisMilestones[0];
    const updateTime = new Date(lastMilestone.updatedAt);
    if (updateTime > lastActivity) lastActivity = updateTime;
  }

  const timeSinceLastChange = now - lastActivity;

  // 2. AT_RISK: > 4 bulan (120 hari) no change
  if (timeSinceLastChange > MONTH_4) {
    return "AT_RISK";
  }

  // 3. SLOW: > 2 bulan (60 hari) no change
  if (timeSinceLastChange > MONTH_2) {
    return "SLOW";
  }

  // 4. ONGOING
  return "ONGOING";
}

/**
 * Notify Kadep when thesis becomes FAILED
 */
async function notifyKadepForFailedThesis(thesisWithStudent) {
  try {
    const kadepUsers = await prisma.user.findMany({
      where: {
        userHasRoles: {
          some: {
            role: { name: ROLES.KETUA_DEPARTEMEN },
            status: 'active',
          },
        },
      },
      select: { id: true },
    });

    if (kadepUsers.length === 0) return;

    const kadepUserIds = kadepUsers.map((u) => u.id);
    const title = '⚠️ Tugas Akhir GAGAL';
    const message = `Mahasiswa ${thesisWithStudent.student?.user?.fullName || 'Unknown'} (${thesisWithStudent.student?.user?.identityNumber || '-'}) telah melampaui batas waktu 1 tahun tanpa menyelesaikan tugas akhir.`;

    // Create in-app notifications
    await createNotificationsForUsers(kadepUserIds, { title, message });

    // Send FCM push notification
    await sendFcmToUsers(kadepUserIds, {
      title,
      body: message,
      data: {
        type: 'thesis_failed',
        thesisId: thesisWithStudent.id,
        studentName: thesisWithStudent.student?.user?.fullName || '',
        studentNim: thesisWithStudent.student?.user?.identityNumber || '',
      },
    });
  } catch (error) {
    console.error('[thesis-status] Failed to notify kadep for FAILED thesis:', error);
  }
}

/**
 * Notify the student when their thesis becomes FAILED
 */
async function notifyStudentForFailedThesis(thesisWithStudent) {
  try {
    const studentUserId = thesisWithStudent.student?.user?.id;
    if (!studentUserId) return;

    const title = '⚠️ Tugas Akhir Gagal';
    const message = 'Tugas akhir Anda telah melewati deadline 1 tahun. Silakan ke departemen untuk mendaftar ulang tugas akhir dengan pembimbing dan topik baru.';

    await createNotificationsForUsers([studentUserId], { title, message });

    await sendFcmToUsers([studentUserId], {
      title,
      body: message,
      data: {
        type: 'thesis_failed',
        thesisId: thesisWithStudent.id,
      },
    });
  } catch (error) {
    console.error('[thesis-status] Failed to notify student for FAILED thesis:', error);
  }
}

/**
 * Auto-cleanup when thesis becomes FAILED:
 * - Cancel all pending/accepted guidances
 * (mirrors the pattern used when thesis is cancelled/topic changed)
 */
async function cleanupFailedThesis(thesisId) {
  try {
    // Cancel all pending/accepted guidances
    const result = await prisma.thesisGuidance.updateMany({
      where: {
        thesisId,
        status: { in: ['requested', 'accepted'] },
      },
      data: {
        status: 'cancelled',
      },
    });

    if (result.count > 0) {
      console.log(`[thesis-status] Cancelled ${result.count} pending guidances for failed thesis ${thesisId}`);
    }
  } catch (error) {
    console.error('[thesis-status] Failed to cleanup failed thesis:', error);
  }
}

export async function updateAllThesisStatuses({ pageSize = 200, logger = console } = {}) {
  // 1. Get IDs of terminal statuses to skip
  const terminalStatuses = await prisma.thesisStatus.findMany({
    where: { name: { in: ["Selesai", "Gagal", "Lulus", "Drop Out", "Dibatalkan"] } }, // Adjust names as per seed
    select: { id: true, name: true }
  });
  const terminalIds = new Set(terminalStatuses.map(s => s.id));

  let page = 0;
  const updated = { ONGOING: 0, SLOW: 0, AT_RISK: 0, FAILED: 0 };
  const newlyFailedTheses = []; // Track thesis that just became FAILED

  for (; ;) {
    const theses = await prisma.thesis.findMany({
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        createdAt: true,
        thesisStatusId: true,
        thesisMilestones: {
          select: { updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 1
        },
        student: {
          select: {
            user: {
              select: {
                id: true,
                fullName: true,
                identityNumber: true,
              }
            }
          }
        }
      },
      orderBy: { id: "asc" },
    });

    if (theses.length === 0) break;

    await Promise.all(
      theses.map(async (t) => {
        // Skip if thesis is already in a terminal state (Selesai/Gagal)
        if (t.thesisStatusId && terminalIds.has(t.thesisStatusId)) {
          return;
        }

        const targetEnum = decideStatus(t);

        if (targetEnum !== t.rating) {
          const updateData = { rating: targetEnum };

          // If status becomes FAILED, also update the thesisStatusId to 'Gagal'
          if (targetEnum === 'FAILED') {
            const gagalStatus = terminalStatuses.find(s => s.name === 'Gagal');
            if (gagalStatus) {
              updateData.thesisStatusId = gagalStatus.id;
            }
          }

          await prisma.thesis.update({
            where: { id: t.id },
            data: updateData
          });
          if (updated[targetEnum] !== undefined) updated[targetEnum] += 1;

          // Track newly FAILED thesis for notification
          if (targetEnum === 'FAILED' && t.rating !== 'FAILED') {
            newlyFailedTheses.push(t);
          }
        }
      })
    );

    page += 1;
  }

  // Send notifications and cleanup for newly FAILED theses
  if (newlyFailedTheses.length > 0) {
    logger.log(`[thesis-status] Processing ${newlyFailedTheses.length} newly FAILED thesis(es)`);
    for (const thesis of newlyFailedTheses) {
      // 1. Notify Kadep
      await notifyKadepForFailedThesis(thesis);
      // 2. Notify Student
      await notifyStudentForFailedThesis(thesis);
      // 3. Cancel pending guidances (cleanup like cancellation flow)
      await cleanupFailedThesis(thesis.id);
    }
  }

  logger.log(
    `[thesis-status] Updated: ONGOING=${updated.ONGOING}, SLOW=${updated.SLOW}, AT_RISK=${updated.AT_RISK}, FAILED=${updated.FAILED}`
  );
  return updated;
}

/**
 * Get count of FAILED theses
 */
export async function getFailedThesesCount() {
  return await prisma.thesis.count({
    where: { rating: 'FAILED' }
  });
}

/**
 * Get list of FAILED theses with student info
 */
export async function getFailedTheses() {
  return await prisma.thesis.findMany({
    where: { rating: 'FAILED' },
    select: {
      id: true,
      title: true,
      rating: true,
      createdAt: true,
      student: {
        select: {
          user: {
            select: {
              id: true,
              fullName: true,
              identityNumber: true,
              email: true,
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}
