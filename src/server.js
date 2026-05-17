import app from "./app.js";
import { ENV } from "./config/env.js";
import { initConnections } from "./config/db.js";
import {
  scheduleAcademicEventDayReminder,
  scheduleAcademicEventHMinusOneReminder,
  scheduleAcademicYearSync,
  scheduleDailyInternshipStatus,
  scheduleDailyThesisReminder,
  scheduleDailyThesisStatus,
  scheduleExaminerNoResponseReminder,
  scheduleGuidanceReminder,
  scheduleInternshipLogbookReminder,
  scheduleInternshipSeminarReminder,
  scheduleSiaSync,
  scheduleYudisiumRegistrationClosedReminder,
  scheduleYudisiumRegistrationClosingReminder,
  scheduleYudisiumRegistrationOpenReminder,
} from "./queues/maintenance.queue.js";
// removed password queue worker; using user-initiated account activation instead

const PORT = ENV.PORT || 3000;

async function startServer() {
  try {
    await initConnections(); // ✅ pastikan DB & Redis ready
    // Schedule daily maintenance jobs
    await scheduleDailyThesisStatus();
    // Schedule academic year sync job to ensure the active semester falls back correctly
    await scheduleAcademicYearSync();
    // Schedule SIA sync job (if enabled)
    await scheduleSiaSync();
    // Schedule daily guidance reminder
    await scheduleGuidanceReminder();
    // Schedule daily thesis reminder for active thesis students (09:00 WIB)
    await scheduleDailyThesisReminder();
    // Schedule internship status enforcement (00:00 WIB daily)
    await scheduleDailyInternshipStatus();
    // Schedule internship seminar reminder (every minute)
    await scheduleInternshipSeminarReminder();
    // Schedule internship logbook reminder (16:00 and 17:00 WIB daily)
    await scheduleInternshipLogbookReminder();
    // Schedule academic event reminders for seminar, defence, and yudisium
    await scheduleAcademicEventHMinusOneReminder();
    await scheduleAcademicEventDayReminder();
    // Schedule yudisium registration lifecycle reminders
    await scheduleYudisiumRegistrationClosingReminder();
    await scheduleYudisiumRegistrationOpenReminder();
    await scheduleYudisiumRegistrationClosedReminder();
    // Schedule examiner no-response reminder for Kadep
    await scheduleExaminerNoResponseReminder();
    const server = app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
    // WebSocket disabled: migrated to FCM push notifications
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1); // hentikan proses biar gak lanjut tanpa koneksi
  }
}

startServer();
