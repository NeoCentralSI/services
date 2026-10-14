import prisma from "../config/prisma.js";
import { WITHDRAW_LOCK_HOURS } from "../constants/thesis-proposal.js";
import { findStaleWaitingRequests } from "../repositories/thesis-proposal/supervisor-request.repository.js";
import { createNotificationEventForUsers } from "../services/notification.service.js";

const REMINDER_TYPE = "supervisor_request_withdraw_available";

/**
 * Tell a student once that a request still waiting after 72 hours may now be pulled back
 * (kept from the old module's withdraw reminder, now scheduled daily).
 * @returns {Promise<{ total: number, sent: number, skipped: number, failed: number }>}
 */
export async function runSupervisorRequestReminderJob(now = new Date()) {
  const cutoff = new Date(now.getTime() - WITHDRAW_LOCK_HOURS * 60 * 60 * 1000);
  const requests = await findStaleWaitingRequests(cutoff);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const request of requests) {
    try {
      const already = await prisma.notification.findFirst({
        where: { userId: request.studentId, type: REMINDER_TYPE, data: { path: "$.requestId", equals: request.id } },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const lecturerName = request.lecturer?.user?.fullName;
      await createNotificationEventForUsers(
        [request.studentId],
        {
          title: "Pengajuan Pembimbing Bisa Ditarik",
          message: lecturerName
            ? `Pengajuan Anda ke ${lecturerName} sudah menunggu lebih dari ${WITHDRAW_LOCK_HOURS} jam. Anda kini dapat menariknya bila ingin memilih dosen lain.`
            : `Pengajuan Anda lewat departemen sudah menunggu lebih dari ${WITHDRAW_LOCK_HOURS} jam. Anda kini dapat menariknya bila ingin mengajukan ulang.`,
          type: REMINDER_TYPE,
          data: { requestId: request.id, route: "/tugas-akhir/proposal" },
        },
        { push: true },
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`[supervisor-request-reminder] gagal untuk pengajuan ${request.id}:`, error?.message ?? error);
    }
  }
  console.log(`[supervisor-request-reminder] total ${requests.length}, terkirim ${sent}, dilewati ${skipped}, gagal ${failed}`);
  return { total: requests.length, sent, skipped, failed };
}
