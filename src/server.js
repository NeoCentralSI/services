import app from "./app.js";
import { ENV } from "./config/env.js";
import { initConnections } from "./config/db.js";
import { scheduleDailyThesisStatus, scheduleSiaSync } from "./queues/maintenance.queue.js";
// removed password queue worker; using user-initiated account activation instead

const PORT = ENV.PORT || 3000;

async function startServer() {
  try {
    await initConnections(); // ✅ pastikan DB & Redis ready
    // Schedule daily maintenance jobs
    await scheduleDailyThesisStatus();
    // Schedule SIA sync job (if enabled)
    await scheduleSiaSync();
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
