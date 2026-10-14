/**
 * BullMQ workers — process PDF generation, etc.
 * Run via: pnpm run worker
 */
import { Worker } from "bullmq";
import { ENV } from "../config/env.js";

const connection = {
  host: new URL(ENV.REDIS_URL || "redis://localhost:6379").hostname,
  port: parseInt(new URL(ENV.REDIS_URL || "redis://localhost:6379").port || "6379", 10),
};

async function processPdfJob(job) {
  const { name, data } = job;
  // No PDF job is queued any more: the Penetapan Pembimbing PDF is rendered when issued (Paket P).
  void data;
  console.warn("[Worker] Unknown PDF job name:", name);
}

export function startPdfWorker() {
  const worker = new Worker(
    "simpta:pdf",
    async (job) => {
      await processPdfJob(job);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] PDF job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] PDF job ${job?.id} failed:`, err.message);
  });

  return worker;
}
