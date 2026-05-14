/**
 * Run BullMQ workers (PDF generation queue)
 * Usage: pnpm run worker
 * Requires: Redis (REDIS_URL)
 */
import { startPdfWorker } from "../src/jobs/workers.js";
import { ENV } from "../src/config/env.js";

async function main() {
  console.log("[Workers] Starting SIMPTA workers...");
  console.log("[Workers] Redis:", ENV.REDIS_URL || "redis://localhost:6379");

  const pdfWorker = startPdfWorker();
  console.log("[Workers] PDF worker started (queue: simpta:pdf)");

  const shutdown = async () => {
    console.log("[Workers] Shutting down...");
    await pdfWorker.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Workers] Startup failed:", err);
  process.exit(1);
});
