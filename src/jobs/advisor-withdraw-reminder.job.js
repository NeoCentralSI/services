import prisma from "../config/prisma.js";
import {
  ADVISOR_REQUEST_STATUS,
} from "../constants/advisorRequestStatus.js";
import { WITHDRAW_LOCK_HOURS } from "../constants/advisorRequest.js";
import { sendFcmToUsers } from "../services/push.service.js";

const REMINDER_TYPE = "advisor_withdraw_unlocked";
const REVIEW_LOCKED_STATUSES = [
  ADVISOR_REQUEST_STATUS.PENDING,
  ADVISOR_REQUEST_STATUS.UNDER_REVIEW,
  ADVISOR_REQUEST_STATUS.PENDING_KADEP,
  ADVISOR_REQUEST_STATUS.ESCALATED,
];

async function hasReminderBeenSent(userId, requestId) {
  const recent = await prisma.notification.findMany({
    where: { userId, type: REMINDER_TYPE },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return recent.some((notification) => {
    const data = notification.data || {};
    return data.requestId === requestId;
  });
}

export async function runAdvisorWithdrawReminderJob() {
  const started = new Date();
  const unlockCutoff = new Date(started.getTime() - WITHDRAW_LOCK_HOURS * 60 * 60 * 1000);
  console.log(`📣 [advisor-withdraw-reminder] Job started at ${started.toISOString()}`);

  const requests = await prisma.thesisAdvisorRequest.findMany({
    where: {
      status: { in: REVIEW_LOCKED_STATUSES },
      withdrawnAt: null,
      createdAt: { lte: unlockCutoff },
    },
    include: {
      lecturer: {
        include: {
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const request of requests) {
    const studentUserId = request.studentId;
    if (!studentUserId) {
      skipped += 1;
      continue;
    }

    try {
      if (await hasReminderBeenSent(studentUserId, request.id)) {
        skipped += 1;
        continue;
      }

      const title = "Tarik Pengajuan Sudah Tersedia";
      const lecturerName = request.lecturer?.user?.fullName;
      const message = lecturerName
        ? `Window 72 jam pengajuan pembimbing ke ${lecturerName} sudah lewat. Anda sekarang dapat menarik pengajuan bila ingin memilih dosen lain.`
        : "Window 72 jam pengajuan TA-02 jalur departemen sudah lewat. Anda sekarang dapat menarik pengajuan bila ingin mengajukan ulang.";
      const data = {
        requestId: request.id,
        route: "/metopel/cari-pembimbing",
        unlockAt: new Date(request.createdAt.getTime() + WITHDRAW_LOCK_HOURS * 60 * 60 * 1000).toISOString(),
      };

      await prisma.notification.create({
        data: {
          userId: studentUserId,
          title,
          message,
          type: REMINDER_TYPE,
          data,
        },
      });

      await sendFcmToUsers([studentUserId], {
        title,
        body: message,
        data: {
          ...data,
          type: REMINDER_TYPE,
        },
      });

      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `❌ [advisor-withdraw-reminder] Failed for request ${request.id}:`,
        error?.message || error,
      );
    }
  }

  const finished = new Date();
  console.log(
    `✅ [advisor-withdraw-reminder] Job finished at ${finished.toISOString()} — total: ${requests.length}, sent: ${sent}, skipped: ${skipped}, failed: ${failed}`,
  );

  return { total: requests.length, sent, skipped, failed };
}
