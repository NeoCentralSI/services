/**
 * Calculate working days (Monday-Friday) between two dates.
 * @param {Date|string} startDate 
 * @param {Date|string} endDate 
 * @returns {Date[]} Array of Date objects (Monday-Friday)
 */
export function getWorkingDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];

    // Use UTC to avoid timezone shifts between local and DB
    // We normalize to midnight UTC
    const current = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate()
    ));
    const finalEnd = new Date(Date.UTC(
        end.getUTCFullYear(),
        end.getUTCMonth(),
        end.getUTCDate()
    ));

    while (current <= finalEnd) {
        const dayOfWeek = current.getUTCDay();
        // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(new Date(current));
        }
        // Increment by one UTC day
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return days;
}
