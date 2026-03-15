/**
 * BullMQ job queues — PDF generation, notifications, SIA sync
 * Requires Redis (REDIS_URL). Falls back to no-op when Redis unavailable.
 */
import { Queue } from "bullmq";
import { ENV } from "../config/env.js";

const connection = {
  host: new URL(ENV.REDIS_URL || "redis://localhost:6379").hostname,
  port: parseInt(new URL(ENV.REDIS_URL || "redis://localhost:6379").port || "6379", 10),
};

let pdfQueue = null;

function getPdfQueue() {
  if (!pdfQueue) {
    try {
      pdfQueue = new Queue("simpta:pdf", {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
        },
      });
    } catch (err) {
      console.warn("[Jobs] PDF queue init failed (Redis?):", err.message);
      return null;
    }
  }
  return pdfQueue;
}

/**
 * Enqueue PDF generation job. Returns job id if queued, null if Redis unavailable.
 */
export async function enqueuePdfJob(name, data) {
  const queue = getPdfQueue();
  if (!queue) return null;
  try {
    const job = await queue.add(name, data);
    return job.id;
  } catch (err) {
    console.warn("[Jobs] enqueuePdfJob failed:", err.message);
    return null;
  }
}

export { getPdfQueue };
