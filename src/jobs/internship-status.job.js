import { updateAllInternshipDeadlineStatuses } from "../services/insternship/internshipStatus.service.js";

/**
 * Job wrapper to run internship deadline status enforcement.
 */
export async function runInternshipStatusJob() {
  const started = new Date();
  console.log(`🕒 [internship-status] Job started at ${started.toISOString()}`);
  try {
    const summary = await updateAllInternshipDeadlineStatuses();
    const finished = new Date();
    console.log(
      `✅ [internship-status] Job finished at ${finished.toISOString()} — summary: ${JSON.stringify(summary)}`
    );
  } catch (err) {
    console.error("❌ [internship-status] Job failed:", err?.message || err);
  }
}
