import prisma from "../config/prisma.js";
import { sendFcmToUsers } from "../services/push.service.js";
import { createNotificationsForUsers } from "../services/notification.service.js";

/**
 * Job to send FCM and DB notifications 10 minutes before an internship seminar starts.
 * Query: InternshipSeminar with status = 'APPROVED' and startTime in ~10 minutes.
 */
export async function runInternshipSeminarReminderJob() {
  const now = new Date();
  
  console.log(`🔔 [internship-seminar-reminder] Job started at ${now.toISOString()}`);

  try {
    // Get seminars for today to filter by time
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const seminars = await prisma.internshipSeminar.findMany({
      where: {
        status: 'APPROVED',
        seminarDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        internship: {
          include: {
            student: { include: { user: true } },
            supervisor: { include: { user: true } }
          }
        },
        room: true
      }
    });

    let sentCount = 0;

    for (const seminar of seminars) {
      if (!seminar.startTime) continue;

      // Extract time from startTime (stored as UTC-like Date in Prisma for Time columns)
      const st = new Date(seminar.startTime);
      // Combine today's date with seminar's start time (UTC)
      const seminarFullStartTime = new Date(
        now.getFullYear(), 
        now.getMonth(), 
        now.getDate(), 
        st.getUTCHours(), 
        st.getUTCMinutes(), 
        0
      );

      const diffMs = seminarFullStartTime.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / (60 * 1000));

      // check if it's in the 10-minute window (between 9 and 11 minutes specifically to catch it once if job runs every min)
      if (diffMins === 10) {
        const studentUserId = seminar.internship?.studentId;
        const supervisorUserId = seminar.internship?.supervisorId;
        const roomName = seminar.room?.name || "Ruangan";
        
        const timeStr = st.toLocaleTimeString("id-ID", { 
          hour: "2-digit", 
          minute: "2-digit",
          timeZone: "UTC"
        });

        const title = "🔔 Pengingat: Seminar KP Dimulai";
        const bodyMahasiswa = `Seminar KP kamu akan dimulai dalam 10 menit (${timeStr}) di ${roomName}.`;
        const bodyDosen = `Seminar KP mahasiswa bimbingan kamu (${seminar.internship.student.user.fullName}) akan dimulai dalam 10 menit (${timeStr}) di ${roomName}.`;

        // Send to student
        if (studentUserId) {
          await createNotificationsForUsers([studentUserId], { title, message: bodyMahasiswa });
          await sendFcmToUsers([studentUserId], {
            title,
            body: bodyMahasiswa,
            data: {
              type: 'internship_seminar_reminder',
              seminarId: seminar.id,
              role: 'student'
            },
            dataOnly: true
          });
          sentCount++;
        }

        // Send to supervisor
        if (supervisorUserId) {
          await createNotificationsForUsers([supervisorUserId], { title, message: bodyDosen });
          await sendFcmToUsers([supervisorUserId], {
            title,
            body: bodyDosen,
            data: {
              type: 'internship_seminar_reminder',
              seminarId: seminar.id,
              role: 'supervisor'
            },
            dataOnly: true
          });
          sentCount++;
        }
      }
    }

    if (sentCount > 0) {
      console.log(`✅ [internship-seminar-reminder] Sent ${sentCount} reminders.`);
    }

    return { totalChecked: seminars.length, sentCount };
  } catch (err) {
    console.error("❌ [internship-seminar-reminder] Job failed:", err?.message || err);
    throw err;
  }
}
