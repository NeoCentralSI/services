/**
 * Compute the effective display status of a seminar.
 *
 * The DB status is never mutated; this helper derives a *runtime* status
 * that is only used for display and client-facing API responses.
 *
 * IMPORTANT: startTime and endTime in the Prisma schema are typed as
 * @db.Time(0) — Prisma serialises them as a JavaScript Date anchored to
 * 1970-01-01T{time}Z.  The actual calendar date is stored in the separate
 * `date` field (@db.Date).  We must combine them to build the correct
 * absolute datetime before comparing against `now`.
 *
 * Rules (evaluated only when DB status === 'scheduled'):
 *   now >= combinedStart  →  'ongoing'
 *   now <  combinedStart  →  'scheduled'
 *
 * All other DB statuses are returned as-is.
 *
 * @param {string}           status    - ThesisSeminar.status from DB
 * @param {Date|string|null} date      - @db.Date  — the seminar calendar date (WIB date)
 * @param {Date|string|null} startTime - @db.Time(0) — start wall-clock time in WIB
 * @param {Date|string|null} endTime   - @db.Time(0) — end   wall-clock time in WIB
 * @returns {string} effectiveStatus
 */

// WIB = UTC+7. All times stored in the TIME field represent WIB hours.
const WIB_OFFSET_HOURS = 7;

export function computeEffectiveStatus(status, date, startTime, endTime) {
  if (status !== 'scheduled') return status;
  if (!date || !startTime || !endTime) return status;

  // Extract UTC date components from the @db.Date field.
  // Prisma returns @db.Date as "YYYY-MM-DDT00:00:00.000Z" (UTC midnight).
  // The UTC year/month/day components equal the stored WIB calendar date.
  const dateObj = new Date(date);
  const y  = dateObj.getUTCFullYear();
  const mo = dateObj.getUTCMonth();
  const d  = dateObj.getUTCDate();

  // Extract the WIB wall-clock hours from @db.Time(0) fields.
  // Prisma returns these as "1970-01-01T{HH}:{mm}:{ss}.000Z" where HH is the
  // stored WIB hour (no timezone conversion is applied by Prisma for TIME).
  // We must subtract WIB_OFFSET to obtain the equivalent UTC instant.
  // Note: Date.UTC() handles negative/overflow hour values correctly by
  // rolling back/forward to the adjacent day.
  const startObj = new Date(startTime);
  const endObj   = new Date(endTime);

  const start = new Date(Date.UTC(
    y, mo, d,
    startObj.getUTCHours() - WIB_OFFSET_HOURS,
    startObj.getUTCMinutes(),
    startObj.getUTCSeconds()
  ));
  const end = new Date(Date.UTC(
    y, mo, d,
    endObj.getUTCHours() - WIB_OFFSET_HOURS,
    endObj.getUTCMinutes(),
    endObj.getUTCSeconds()
  ));

  const now = new Date(); // always UTC-based regardless of server TZ
  void end;

  if (now >= start) return 'ongoing';
  return status;
}
