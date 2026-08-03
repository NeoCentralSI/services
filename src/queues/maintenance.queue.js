import pkg from "bullmq";
const { Queue, Worker } = pkg;
import { ENV } from "../config/env.js";
import { runThesisStatusJob } from "../jobs/thesis-status.job.js";
import { runSiaSync } from "../services/sia.sync.job.js";
import { runGuidanceReminderJob } from "../jobs/guidance-reminder.job.js";
import { runDailyThesisReminderJob } from "../jobs/daily-thesis-reminder.job.js";
import { syncActiveAcademicYear } from "../jobs/academic-year.job.js";
import { runInternshipStatusJob } from "../jobs/internship-status.job.js";
import { runInternshipSeminarReminderJob } from "../jobs/internship-seminar-reminder.job.js";
import { runInternshipLogbookReminderJob } from "../jobs/internship-logbook-reminder.job.js";
import {
  runAcademicEventReminderJob,
  runExaminerNoResponseReminderJob,
  runYudisiumRegistrationClosedReminderJob,
  runYudisiumRegistrationClosingReminderJob,
  runYudisiumRegistrationOpenReminderJob,
} from "../jobs/academic-event-notification.job.js";

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
const MAINTENANCE_ENABLED =
  ENV.ENABLE_CRON === true && ENV.SKIP_REDIS !== true && ENV.NODE_ENV !== "test";

let queueReady = true;

export const maintenanceQueue = MAINTENANCE_ENABLED
  ? new Queue(MAINTENANCE_QUEUE, {
      ...connection,
      limiter: { max: 100, duration: 60_000 },
    })
  : null;

if (maintenanceQueue) {
  maintenanceQueue.on("error", (err) => {
    if (!queueReady) return;
    queueReady = false;
    console.warn("⚠️  Maintenance queue unavailable (Redis/BullMQ init failed). Background jobs disabled. API server will continue normally.");
    console.warn("   Cause:", err.message);
    if (err.message.includes("Redis version")) {
      console.warn("   Fix: upgrade Redis to >= 5.0 (recommended 7.x). Current Redis is too old for BullMQ.");
    }
  });
}

async function safeAdd(name, opts) {
  if (!MAINTENANCE_ENABLED || !maintenanceQueue) {
    if (ENV.NODE_ENV !== "test") {
      console.log(`⏭️  Skip scheduling ${name} (maintenance jobs disabled).`);
    }
    return false;
  }
  if (!queueReady) {
    console.warn(`⏭️  Skip scheduling ${name} (queue unavailable).`);
    return false;
  }
  try {
    await maintenanceQueue.add(name, {}, opts);
    return true;
  } catch (err) {
    queueReady = false;
    console.warn(`⚠️  Failed to schedule ${name} (non-fatal): ${err.message}`);
    return false;
  }
}

export async function scheduleDailyThesisStatus() {
  const pattern = ENV.THESIS_STATUS_CRON || "30 2 * * *";
  const tz = ENV.THESIS_STATUS_TZ || "Asia/Jakarta";
  const ok = await safeAdd("thesis-status", { repeat: { pattern, tz }, removeOnComplete: true, removeOnFail: true });
  if (ok) console.log(`🗓️  Scheduled repeatable thesis-status job with cron: "${pattern}" tz="${tz}"`);

  try {
    if (!ok) return;
    const repeats = await maintenanceQueue.getRepeatableJobs();
    const jobInfo = repeats.find((r) => r.name === "thesis-status");
    if (jobInfo) {
      const nextIso = jobInfo.next ? new Date(jobInfo.next).toISOString() : "unknown";
      const nextLocal = jobInfo.next ? new Date(jobInfo.next).toLocaleString() : "unknown";
      console.log(`📌 Repeat registered: next=${nextIso} (local ${nextLocal}) key=${jobInfo.key || "n/a"}`);
    }
  } catch (e) {
    // non-fatal
  }
}

export async function scheduleAcademicYearSync() {
  const pattern = ENV.ACADEMIC_YEAR_SYNC_CRON || "0 1 * * *";
  const tz = ENV.ACADEMIC_YEAR_SYNC_TZ || "Asia/Jakarta";
  const ok = await safeAdd("academic-year-sync", {
    repeat: { pattern, tz },
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
  });
  if (ok) console.log(`🗓️  Scheduled repeatable academic-year-sync job with cron: "${pattern}" tz="${tz}"`);
}

export async function scheduleSiaSync() {
  if (ENV.ENABLE_SIA_CRON === false || ENV.ENABLE_SIA_CRON === "false") {
    console.log("⏸️  SIA sync cron is disabled (ENABLE_SIA_CRON=false)");
    return;
  }
  const pattern = ENV.SIA_SYNC_CRON || "0 */6 * * *";
  const tz = ENV.SIA_SYNC_TZ || "Asia/Jakarta";
  const ok = await safeAdd("sia-sync", {
    repeat: { pattern, tz },
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
  if (ok) console.log(`🔄 Scheduled repeatable SIA sync job with cron: "${pattern}" tz="${tz}"`);

  try {
    if (!ok) return;
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

export async function scheduleGuidanceReminder() {
  const pattern = ENV.GUIDANCE_REMINDER_CRON || "0 7 * * *";
  const tz = ENV.GUIDANCE_REMINDER_TZ || "Asia/Jakarta";
  const ok = await safeAdd("guidance-reminder", { repeat: { pattern, tz }, removeOnComplete: 50, removeOnFail: 100 });
  if (ok) console.log(`📅 Scheduled repeatable guidance reminder job with cron: "${pattern}" tz="${tz}"`);

  try {
    if (!ok) return;
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

export async function scheduleDailyThesisReminder() {
  const pattern = ENV.DAILY_THESIS_REMINDER_CRON || "0 9 * * *";
  const tz = ENV.DAILY_THESIS_REMINDER_TZ || "Asia/Jakarta";
  const ok = await safeAdd("daily-thesis-reminder", { repeat: { pattern, tz }, removeOnComplete: 50, removeOnFail: 100 });
  if (ok) console.log(`🎓 Scheduled repeatable daily thesis reminder job with cron: "${pattern}" tz="${tz}"`);

  try {
    if (!ok) return;
    const repeats = await maintenanceQueue.getRepeatableJobs();
    const jobInfo = repeats.find((r) => r.name === "daily-thesis-reminder");
    if (jobInfo) {
      const nextIso = jobInfo.next ? new Date(jobInfo.next).toISOString() : "unknown";
      const nextLocal = jobInfo.next ? new Date(jobInfo.next).toLocaleString() : "unknown";
      console.log(`📌 Daily thesis reminder next run: ${nextIso} (local ${nextLocal}) key=${jobInfo.key || "n/a"}`);
    }
  } catch (e) {
    // non-fatal
  }
}

export async function scheduleDailyInternshipStatus() {
  const pattern = ENV.INTERNSHIP_STATUS_CRON || "0 0 * * *";
  const tz = ENV.INTERNSHIP_STATUS_TZ || "Asia/Jakarta";
  const ok = await safeAdd("internship-status", { repeat: { pattern, tz }, removeOnComplete: true, removeOnFail: true });
  if (ok) console.log(`🗓️  Scheduled repeatable internship-status job with cron: "${pattern}" tz="${tz}"`);
}

export async function scheduleInternshipSeminarReminder() {
  const pattern = "* * * * *";
  const tz = "Asia/Jakarta";
  const ok = await safeAdd("internship-seminar-reminder", { repeat: { pattern, tz }, removeOnComplete: true, removeOnFail: true });
  if (ok) console.log(`🗓️  Scheduled repeatable internship-seminar-reminder job with cron: "${pattern}"`);
}

export async function scheduleInternshipLogbookReminder() {
  const pattern = "0 16,17 * * *";
  const tz = "Asia/Jakarta";
  const ok = await safeAdd("internship-logbook-reminder", { repeat: { pattern, tz }, removeOnComplete: true, removeOnFail: true });
  if (ok) console.log(`🗓️  Scheduled repeatable internship-logbook-reminder job with cron: "${pattern}" tz="${tz}"`);
}

async function scheduleRepeatableMaintenanceJob(name, pattern, tz = "Asia/Jakarta") {
  const ok = await safeAdd(name, { repeat: { pattern, tz }, removeOnComplete: 50, removeOnFail: 100 });
  if (ok) console.log(`🗓️  Scheduled repeatable ${name} job with cron: "${pattern}" tz="${tz}"`);
}

export async function scheduleAcademicEventHMinusOneReminder() {
  await scheduleRepeatableMaintenanceJob(
    "academic-event-h-minus-one-reminder",
    ENV.ACADEMIC_EVENT_H_MINUS_ONE_CRON || "0 18 * * *",
    ENV.ACADEMIC_EVENT_REMINDER_TZ || "Asia/Jakarta"
  );
}

export async function scheduleAcademicEventDayReminder() {
  await scheduleRepeatableMaintenanceJob(
    "academic-event-day-reminder",
    ENV.ACADEMIC_EVENT_DAY_CRON || "0 7 * * *",
    ENV.ACADEMIC_EVENT_REMINDER_TZ || "Asia/Jakarta"
  );
}

export async function scheduleYudisiumRegistrationClosingReminder() {
  await scheduleRepeatableMaintenanceJob(
    "yudisium-registration-closing-reminder",
    ENV.YUDISIUM_REGISTRATION_CLOSING_REMINDER_CRON || "0 12 * * *",
    ENV.YUDISIUM_REGISTRATION_REMINDER_TZ || "Asia/Jakarta"
  );
}

export async function scheduleYudisiumRegistrationOpenReminder() {
  await scheduleRepeatableMaintenanceJob(
    "yudisium-registration-open-reminder",
    ENV.YUDISIUM_REGISTRATION_OPEN_REMINDER_CRON || "0 6 * * *",
    ENV.YUDISIUM_REGISTRATION_REMINDER_TZ || "Asia/Jakarta"
  );
}

export async function scheduleYudisiumRegistrationClosedReminder() {
  await scheduleRepeatableMaintenanceJob(
    "yudisium-registration-closed-reminder",
    ENV.YUDISIUM_REGISTRATION_CLOSED_REMINDER_CRON || "0 6 * * *",
    ENV.YUDISIUM_REGISTRATION_REMINDER_TZ || "Asia/Jakarta"
  );
}

export async function scheduleExaminerNoResponseReminder() {
  await scheduleRepeatableMaintenanceJob(
    "examiner-no-response-reminder",
    ENV.EXAMINER_NO_RESPONSE_REMINDER_CRON || "0 8 * * *",
    ENV.EXAMINER_NO_RESPONSE_REMINDER_TZ || "Asia/Jakarta"
  );
}

// Worker to process maintenance jobs
export const maintenanceWorker = MAINTENANCE_ENABLED
  ? new Worker(
      MAINTENANCE_QUEUE,
      async (job) => {
        switch (job.name) {
          case "thesis-status":
            await runThesisStatusJob();
            break;
          case "sia-sync":
            await runSiaSync();
            break;
          case "academic-year-sync":
            await syncActiveAcademicYear();
            break;
          case "guidance-reminder":
            await runGuidanceReminderJob();
            break;
          case "daily-thesis-reminder":
            await runDailyThesisReminderJob();
            break;
          case "internship-status":
            await runInternshipStatusJob();
            break;
          case "internship-seminar-reminder":
            await runInternshipSeminarReminderJob();
            break;
          case "internship-logbook-reminder":
            await runInternshipLogbookReminderJob();
            break;
          case "academic-event-h-minus-one-reminder":
            await runAcademicEventReminderJob({ offsetDays: 1, phase: "h_minus_one" });
            break;
          case "academic-event-day-reminder":
            await runAcademicEventReminderJob({ offsetDays: 0, phase: "event_day" });
            break;
          case "yudisium-registration-closing-reminder":
            await runYudisiumRegistrationClosingReminderJob();
            break;
          case "yudisium-registration-open-reminder":
            await runYudisiumRegistrationOpenReminderJob();
            break;
          case "yudisium-registration-closed-reminder":
            await runYudisiumRegistrationClosedReminderJob();
            break;
          case "examiner-no-response-reminder":
            await runExaminerNoResponseReminderJob();
            break;
          default:
            // no-op
            break;
        }
      },
      { ...connection, concurrency: 1 }
    )
  : null;

if (maintenanceWorker) {
  maintenanceWorker.on("error", (err) => {
    if (ENV.NODE_ENV === "test") return;
    console.warn("⚠️  Maintenance worker error (non-fatal):", err.message);
  });

  maintenanceWorker.on("completed", (job) => {
    if (ENV.NODE_ENV !== "test") console.log(`🧹 Maintenance job done → ${job.name} (${job.id})`);
  });
  maintenanceWorker.on("failed", (job, err) => {
    console.error(`❌ Maintenance job failed → ${job?.name} (${job?.id}):`, err?.message || err);
  });
  maintenanceWorker.on("ready", () => {
    console.log("🛠️  Maintenance worker is ready and listening for jobs");
  });
}
