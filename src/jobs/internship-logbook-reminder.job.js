import { sendLogbookReminders } from "../services/insternship/activity.service.js";

/**
 * Job to send internship logbook reminders to students.
 * Runs at 16:00 and 17:00 WIB.
 */
export async function runInternshipLogbookReminderJob() {
    console.log("[Job] Running internship logbook reminder...");
    try {
        const result = await sendLogbookReminders();
        console.log(`[Job] Finished internship logbook reminder. Notifications sent: ${result.sentCount}`);
        return result;
    } catch (error) {
        console.error("[Job] Internship logbook reminder failed:", error);
        throw error;
    }
}
