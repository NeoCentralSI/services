import { getSyncStatus, getAllCachedStudents } from "../services/sia.store.js";
import { runSiaSync } from "../services/sia.sync.job.js";

export async function triggerSiaSync(req, res, next) {
  try {
    await runSiaSync();
    res.json({ success: true, message: "SIA sync triggered" });
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
    const data = await getAllCachedStudents();
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
}
