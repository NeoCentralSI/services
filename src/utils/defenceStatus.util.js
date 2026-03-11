/**
 * Compute the effective display status of a defence.
 *
 * DB status is not mutated. This helper derives a runtime status for API responses.
 *
 * Rules (only when DB status === 'scheduled'):
 *   now >= combinedStart -> 'ongoing'
 *   now < combinedStart  -> 'scheduled'
 */
const WIB_OFFSET_HOURS = 7;

export function computeEffectiveDefenceStatus(status, date, startTime, endTime) {
  if (status !== 'scheduled') return status;
  if (!date || !startTime || !endTime) return status;

  const dateObj = new Date(date);
  const y = dateObj.getUTCFullYear();
  const mo = dateObj.getUTCMonth();
  const d = dateObj.getUTCDate();

  const startObj = new Date(startTime);
  const endObj = new Date(endTime);

  const start = new Date(Date.UTC(
    y,
    mo,
    d,
    startObj.getUTCHours() - WIB_OFFSET_HOURS,
    startObj.getUTCMinutes(),
    startObj.getUTCSeconds()
  ));

  const end = new Date(Date.UTC(
    y,
    mo,
    d,
    endObj.getUTCHours() - WIB_OFFSET_HOURS,
    endObj.getUTCMinutes(),
    endObj.getUTCSeconds()
  ));

  const now = new Date();
  void end;

  if (now >= start) return 'ongoing';
  return status;
}
