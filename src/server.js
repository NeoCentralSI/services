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
  } catch (err) {
    console.error("❌ Connection init failed, aborting:", err.message);
    process.exit(1);
  }
  // Schedule daily maintenance jobs (non-fatal — server runs even if queue unavailable)
  const schedulers = [
    scheduleDailyThesisStatus,
    scheduleAcademicYearSync,
    scheduleSiaSync,
    scheduleGuidanceReminder,
    scheduleDailyThesisReminder,
    scheduleDailyInternshipStatus,
    scheduleInternshipSeminarReminder,
    scheduleInternshipLogbookReminder,
    scheduleAcademicEventHMinusOneReminder,
    scheduleAcademicEventDayReminder,
    scheduleYudisiumRegistrationClosingReminder,
    scheduleYudisiumRegistrationOpenReminder,
    scheduleYudisiumRegistrationClosedReminder,
    scheduleExaminerNoResponseReminder,
  ];
  for (const fn of schedulers) {
    try {
      await fn();
    } catch (err) {
      console.warn(`⚠️  Scheduler ${fn.name} failed (non-fatal): ${err.message}`);
    }
  }
  const server = app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });
  // WebSocket disabled: migrated to FCM push notifications
}

startServer();
