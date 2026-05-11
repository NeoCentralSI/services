import prisma from "../config/prisma.js";
import { sendFcmToUsers } from "../services/push.service.js";

/**
 * Job untuk mengirim daily reminder ke semua mahasiswa yang sedang mengerjakan tugas akhir.
 * Dijalankan setiap pukul 09:00 WIB.
 * 
 * Query: Thesis dengan status aktif (belum selesai/lulus)
 * Target: Mahasiswa yang memiliki thesis aktif
 */
export async function runDailyThesisReminderJob() {
  const started = new Date();
  console.log(`📣 [daily-thesis-reminder] Job started at ${started.toISOString()}`);

  try {
    // Find all active thesis (students currently working on thesis)
    // Excluded statuses: thesis that are completed/graduated
    const activeTheses = await prisma.thesis.findMany({
      where: {
        // Active thesis - only send reminder if status is "Bimbingan"
        thesisStatus: {
          name: "Bimbingan"
        }
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true }
            }
          }
        },
        thesisStatus: {
          select: { name: true }
        },
        thesisSupervisors: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: { fullName: true }
                }
              }
            }
          }
        },
        // Get latest guidance to check activity
        thesisGuidances: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            status: true
          }
        },
        // Get milestones progress
        thesisMilestones: {
          select: {
            status: true
          }
        }
      }
    });

    console.log(`📣 [daily-thesis-reminder] Found ${activeTheses.length} active thesis(es)`);

    let sentCount = 0;
    let failedCount = 0;

    for (const thesis of activeTheses) {
      try {
        const studentUserId = thesis.student?.user?.id;
        const studentName = thesis.student?.user?.fullName || "Mahasiswa";
        
        if (!studentUserId) continue;

        // Calculate days since last guidance activity
        const lastGuidance = thesis.thesisGuidances[0];
        let daysSinceLastActivity = null;
        let activityMessage = "";
        
        if (lastGuidance) {
          const lastDate = new Date(lastGuidance.createdAt);
          const today = new Date();
          daysSinceLastActivity = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastActivity > 14) {
            activityMessage = `⚠️ Sudah ${daysSinceLastActivity} hari sejak aktivitas bimbingan terakhir.`;
          } else if (daysSinceLastActivity > 7) {
            activityMessage = `📝 ${daysSinceLastActivity} hari sejak bimbingan terakhir.`;
          }
        }

        // Calculate milestone progress
        const totalMilestones = thesis.thesisMilestones.length;
        const completedMilestones = thesis.thesisMilestones.filter(m => m.status === "completed").length;
        const progressPercent = totalMilestones > 0 
          ? Math.round((completedMilestones / totalMilestones) * 100) 
          : 0;

        // Get supervisor names
        const supervisorNames = thesis.thesisSupervisors
          .map(s => s.lecturer?.user?.fullName)
          .filter(Boolean)
          .join(", ");

        // Build notification message
        let notificationBody = "Selamat pagi! Jangan lupa untuk terus mengerjakan tugas akhir Anda.";
        
        if (progressPercent > 0) {
          notificationBody = `Progress: ${progressPercent}% (${completedMilestones}/${totalMilestones} milestone).`;
        }
        
        if (activityMessage) {
          notificationBody += ` ${activityMessage}`;
        }

        if (supervisorNames) {
          notificationBody += ` Hubungi pembimbing: ${supervisorNames}.`;
        }

        // Send FCM notification to student
        await sendFcmToUsers([studentUserId], {
          title: "🎓 Reminder Tugas Akhir",
          body: notificationBody,
          data: {
            type: "daily_thesis_reminder",
            thesisId: thesis.id,
            route: "/tugas-akhir/bimbingan/student",
          },
        });

        sentCount++;
        console.log(`  ✓ Sent reminder to ${studentName} (progress: ${progressPercent}%)`);

      } catch (err) {
        failedCount++;
        console.error(`  ✗ Failed to send reminder for thesis ${thesis.id}:`, err?.message || err);
      }
    }

    const finished = new Date();
    const duration = finished.getTime() - started.getTime();
    console.log(
      `✅ [daily-thesis-reminder] Job finished at ${finished.toISOString()} ` +
      `— sent: ${sentCount}, failed: ${failedCount}, duration: ${duration}ms`
    );

    return { sent: sentCount, failed: failedCount, duration };

  } catch (err) {
    console.error("❌ [daily-thesis-reminder] Job failed:", err?.message || err);
    throw err;
  }
}
