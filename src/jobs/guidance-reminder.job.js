import prisma from "../config/prisma.js";
import { sendFcmToUsers } from "../services/push.service.js";
import { SCHEDULED_GUIDANCE_STATUSES, getScheduledAt } from "../constants/guidanceStatus.js";
import { formatDateTimeWib } from "../utils/date.util.js";

/**
 * Job untuk mengirim FCM reminder ke mahasiswa dan dosen
 * saat hari bimbingan yang dijadwalkan sudah tiba.
 * 
 * Query: ThesisGuidance dengan approvedDate = hari ini dan status = 'accepted'
 */
export async function runGuidanceReminderJob() {
  const started = new Date();
  console.log(`📅 [guidance-reminder] Job started at ${started.toISOString()}`);

  try {
    // Get today's date range (start of day - end of day) in local timezone
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Find all guidance sessions scheduled for today that haven't been reminded yet
    const guidances = await prisma.thesisGuidance.findMany({
      where: {
        status: { in: SCHEDULED_GUIDANCE_STATUSES },
        approvedDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        thesis: {
          include: {
            student: {
              include: {
                user: {
                  select: { id: true, fullName: true },
                },
              },
            },
          },
        },
        supervisor: {
          include: {
            user: {
              select: { id: true, fullName: true },
            },
          },
        },
        milestones: {
          include: {
            milestone: {
              select: { title: true },
            },
          },
        },
      },
    });

    console.log(`📅 [guidance-reminder] Found ${guidances.length} guidance(s) scheduled for today`);

    let sentCount = 0;
    let failedCount = 0;

    for (const guidance of guidances) {
      try {
        const studentUserId = guidance.thesis?.student?.id;
        const supervisorUserId = guidance.supervisor?.id;
        const studentName = guidance.thesis?.student?.user?.fullName || "Mahasiswa";
        const supervisorName = guidance.supervisor?.user?.fullName || "Dosen";
        const milestoneName = guidance.milestones?.[0]?.milestone?.title || "bimbingan";
        
        // Session time for the notification text (agreed time, WIB)
        const approvedTime = formatDateTimeWib(getScheduledAt(guidance));

        // Send to student
        if (studentUserId) {
          await sendFcmToUsers([studentUserId], {
            title: "🔔 Reminder: Bimbingan Hari Ini",
            body: `Kamu memiliki jadwal bimbingan dengan ${supervisorName} hari ini, ${approvedTime}`,
            data: {
              type: "guidance_reminder",
              guidanceId: guidance.id,
              route: `/tugas-akhir/bimbingan/student/session/${guidance.id}`,
            },
          });
          sentCount++;
        }

        // Send to supervisor
        if (supervisorUserId) {
          await sendFcmToUsers([supervisorUserId], {
            title: "🔔 Reminder: Bimbingan Hari Ini",
            body: `Anda memiliki jadwal bimbingan dengan ${studentName} hari ini, ${approvedTime}`,
            data: {
              type: "guidance_reminder",
              guidanceId: guidance.id,
              route: `/tugas-akhir/bimbingan/lecturer/session/${guidance.id}`,
            },
          });
          sentCount++;
        }
      } catch (err) {
        console.error(`❌ [guidance-reminder] Failed to send reminder for guidance ${guidance.id}:`, err?.message || err);
        failedCount++;
      }
    }

    const finished = new Date();
    console.log(
      `✅ [guidance-reminder] Job finished at ${finished.toISOString()} — total: ${guidances.length}, sent: ${sentCount}, failed: ${failedCount}`
    );

    return { total: guidances.length, sent: sentCount, failed: failedCount };
  } catch (err) {
    console.error("❌ [guidance-reminder] Job failed:", err?.message || err);
    throw err;
  }
}
