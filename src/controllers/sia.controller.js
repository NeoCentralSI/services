import { getSyncStatus, getAllCachedStudents } from "../services/sia.store.js";
import { runSiaSync } from "../services/sia.sync.job.js";
import { fetchStudentsFull } from "../services/sia.client.js";
import { ENV } from "../config/env.js";

export async function triggerSiaSync(req, res, next) {
  try {
    const summary = await runSiaSync();
    res.json({ success: true, message: "SIA sync triggered", summary });
  } catch (err) {
    next(err);
  }
}

export async function siaSyncStatus(req, res, next) {
  try {
    const status = await getSyncStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
}

export async function getCachedStudents(req, res, next) {
  try {
    let data = [];

    // Try Redis first
    try {
      data = await getAllCachedStudents();
    } catch (redisErr) {
      console.warn("⚠️  Redis unavailable, falling back to SIA source:", redisErr.message);
    }

    // If Redis is empty (not yet synced) or errored, try SIA directly (mock or real)
    if (!data || data.length === 0) {
      console.log("ℹ️  Redis cache empty, reading from SIA source directly...");
      try {
        data = await fetchStudentsFull(1);
      } catch (siaErr) {
        console.warn("⚠️  SIA fetch also failed:", siaErr.message);
        data = [];
      }
    }

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}
