import app from "./app.js";
import { ENV } from "./config/env.js";
import { initConnections } from "./config/db.js";
// removed password queue worker; using user-initiated account activation instead

const PORT = ENV.PORT || 3000;

async function startServer() {
  try {
    await initConnections(); // ✅ pastikan DB & Redis ready
    if (!ENV.SKIP_REDIS) {
      const {
        scheduleDailyThesisStatus,
        scheduleSiaSync,
        scheduleGuidanceReminder,
        scheduleDailyThesisReminder,
        scheduleAdvisorWithdrawReminder,
      } = await import("./queues/maintenance.queue.js");
      // Schedule daily maintenance jobs
      await scheduleDailyThesisStatus();
      // Schedule SIA sync job (if enabled)
      await scheduleSiaSync();
      // Schedule daily guidance reminder
      await scheduleGuidanceReminder();
      // Schedule daily thesis reminder for active thesis students (09:00 WIB)
      await scheduleDailyThesisReminder();
      // Schedule advisor request withdraw unlock reminder (hourly)
      await scheduleAdvisorWithdrawReminder();
    } else {
      console.log("⏭️ SKIP_REDIS=true, skipping maintenance queue scheduler");
    }
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
