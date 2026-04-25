/**
 * Calculate working days (Monday-Friday) between two dates,
 * excluding any provided holiday dates.
 * @param {Date|string} startDate 
 * @param {Date|string} endDate 
 * @param {Date[]|string[]} [holidays=[]] Array of holiday dates to exclude
 * @returns {Date[]} Array of Date objects (Monday-Friday, excluding holidays)
 */
export function getWorkingDays(startDate, endDate, holidays = []) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];

    // Pre-process holidays into a Set of ISO date strings for O(1) lookup
    const holidaySet = new Set(
        holidays.map((h) => {
            const d = new Date(h);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        })
    );

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
            // Check if this date is a holiday
            const dateKey = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
            if (!holidaySet.has(dateKey)) {
                days.push(new Date(current));
            }
        }
        // Increment by one UTC day
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return days;
}
