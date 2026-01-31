import pkg from "bullmq";
const { Queue, Worker } = pkg;
import { ENV } from "../config/env.js";
import { runThesisStatusJob } from "../jobs/thesis-status.job.js";
import { runSiaSync } from "../services/sia.sync.job.js";
import { runGuidanceReminderJob } from "../jobs/guidance-reminder.job.js";

function buildRedisConnection(url) {
  try {
    const u = new URL(url || "redis://localhost:6379");
    const conn = {
      host: u.hostname || "localhost",
      port: u.port ? Number(u.port) : 6379,
    };
    if (u.password) conn.password = u.password;
    if (u.protocol === "rediss:") conn.tls = {};
    return conn;
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const connection = { connection: buildRedisConnection(ENV.REDIS_URL) };

export const MAINTENANCE_QUEUE = "maintenance";

export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, {
  ...connection,
  // global throughput limiter (optional)
  limiter: { max: 100, duration: 60_000 },
});

export async function scheduleDailyThesisStatus() {
  // Add or update a repeatable job that runs on a cron schedule
  // Default: once every 24 hours at 02:30 WIB. Override via ENV.THESIS_STATUS_CRON and ENV.THESIS_STATUS_TZ.
  const pattern = ENV.THESIS_STATUS_CRON || "30 2 * * *";
  const tz = ENV.THESIS_STATUS_TZ || "Asia/Jakarta";
  await maintenanceQueue.add(
    "thesis-status",
    {},
    {
      repeat: { pattern, tz },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
  console.log(`🗓️  Scheduled repeatable thesis-status job with cron: "${pattern}" tz="${tz}"`);

  try {
    const repeats = await maintenanceQueue.getRepeatableJobs();
    const jobInfo = repeats.find((r) => r.name === "thesis-status");
    if (jobInfo) {
      const nextIso = jobInfo.next ? new Date(jobInfo.next).toISOString() : "unknown";
      const nextLocal = jobInfo.next ? new Date(jobInfo.next).toLocaleString() : "unknown";
      // BullMQ v5 returns a `key` for repeatables; `id` may be undefined
      console.log(`📌 Repeat registered: next=${nextIso} (local ${nextLocal}) key=${jobInfo.key || "n/a"}`);
    }
  } catch (e) {
    // non-fatal
  }
}

/**
 * Schedule automatic SIA sync job
 * Default: every 6 hours. Override via ENV.SIA_SYNC_CRON
 */
export async function scheduleSiaSync() {
  // Check if SIA sync cron is enabled
  if (ENV.ENABLE_SIA_CRON === false || ENV.ENABLE_SIA_CRON === "false") {
    console.log("⏸️  SIA sync cron is disabled (ENABLE_SIA_CRON=false)");
    return;
  }

  // Default: every 6 hours at minute 0. Override via ENV.SIA_SYNC_CRON
  const pattern = ENV.SIA_SYNC_CRON || "0 */6 * * *";
  const tz = ENV.SIA_SYNC_TZ || "Asia/Jakarta";
  
  await maintenanceQueue.add(
    "sia-sync",
    {},
    {
      repeat: { pattern, tz },
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );
  console.log(`🔄 Scheduled repeatable SIA sync job with cron: "${pattern}" tz="${tz}"`);

  try {
    const repeats = await maintenanceQueue.getRepeatableJobs();
    const jobInfo = repeats.find((r) => r.name === "sia-sync");
    if (jobInfo) {
      const nextIso = jobInfo.next ? new Date(jobInfo.next).toISOString() : "unknown";
      const nextLocal = jobInfo.next ? new Date(jobInfo.next).toLocaleString() : "unknown";
      console.log(`📌 SIA sync next run: ${nextIso} (local ${nextLocal}) key=${jobInfo.key || "n/a"}`);
    }
  } catch (e) {
    // non-fatal
  }
}

/**
 * Schedule daily guidance reminder job
 * Default: every day at 07:00 WIB. Override via ENV.GUIDANCE_REMINDER_CRON
 * Sends FCM notifications to students and lecturers who have guidance scheduled for today
 */
export async function scheduleGuidanceReminder() {
  // Default: every day at 07:00 WIB
  const pattern = ENV.GUIDANCE_REMINDER_CRON || "0 7 * * *";
  const tz = ENV.GUIDANCE_REMINDER_TZ || "Asia/Jakarta";
  
  await maintenanceQueue.add(
    "guidance-reminder",
    {},
    {
      repeat: { pattern, tz },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  );
  console.log(`📅 Scheduled repeatable guidance reminder job with cron: "${pattern}" tz="${tz}"`);

  try {
    const repeats = await maintenanceQueue.getRepeatableJobs();
    const jobInfo = repeats.find((r) => r.name === "guidance-reminder");
    if (jobInfo) {
      const nextIso = jobInfo.next ? new Date(jobInfo.next).toISOString() : "unknown";
      const nextLocal = jobInfo.next ? new Date(jobInfo.next).toLocaleString() : "unknown";
      console.log(`📌 Guidance reminder next run: ${nextIso} (local ${nextLocal}) key=${jobInfo.key || "n/a"}`);
    }
  } catch (e) {
    // non-fatal
  }
}

// Worker to process maintenance jobs
export const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async (job) => {
    switch (job.name) {
      case "thesis-status":
        await runThesisStatusJob();
        break;
      case "sia-sync":
        await runSiaSync();
        break;
      case "guidance-reminder":
        await runGuidanceReminderJob();
        break;
      default:
        // no-op
        break;
    }
  },
  { ...connection, concurrency: 1 }
);

maintenanceWorker.on("completed", (job) => {
  if (ENV.NODE_ENV !== "test") console.log(`🧹 Maintenance job done → ${job.name} (${job.id})`);
});
maintenanceWorker.on("failed", (job, err) => {
  console.error(`❌ Maintenance job failed → ${job?.name} (${job?.id}):`, err?.message || err);
});
maintenanceWorker.on("ready", () => {
  console.log("🛠️  Maintenance worker is ready and listening for jobs");
});
