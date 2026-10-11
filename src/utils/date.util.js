// Date formatting utilities for consistent response formatting

const DEFAULT_TIME_ZONE = "Asia/Jakarta"; // WIB (UTC+7)
const DEFAULT_LOCALE = "id-ID";

// Format: [<weekday>, ]YYYY-MM-DD HH:mm or with seconds
export function formatDateTimeJakarta(input, { withSeconds = false, withDay = false } = {}) {
	if (!input) return null;
	const d = input instanceof Date ? input : new Date(input);
	if (isNaN(d)) return null;

	const pad = (n) => String(n).padStart(2, "0");

	// Use Intl to get parts in target TZ
	const dtf = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
		timeZone: DEFAULT_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: withSeconds ? "2-digit" : undefined,
		weekday: withDay ? "long" : undefined,
		hour12: false,
	});
	const parts = Object.fromEntries(dtf.formatToParts(d).map((p) => [p.type, p.value]));
	// parts: { year, month, day, hour, minute, second }
	const date = `${parts.year}-${parts.month}-${parts.day}`;
	const time = withSeconds
		? `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
		: `${pad(parts.hour)}:${pad(parts.minute)}`;
	const day = parts.weekday ? `${parts.weekday}, ` : "";
	return `${withDay ? day : ""}${date} ${time}`.trim();
}

// Helper: return weekday in Indonesian (e.g., "Senin", "Selasa") in Asia/Jakarta TZ
/**
 * Indonesian date + time for user-facing text (notifications, FCM, email), always
 * Asia/Jakarta, 24-hour clock with a dot: "14 Oktober 2026 14.00 WIB", or
 * "Rabu, 14 Oktober 2026 14.00 WIB" with `withWeekday`. Empty/invalid input -> "-".
 * Same output as the frontend `formatDateTimeWib` (lib/text.ts).
 */
export function formatDateTimeWib(input, { withWeekday = false } = {}) {
  if (!input) return "-";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const text = `${get("day")} ${get("month")} ${get("year")} ${get("hour")}.${get("minute")} WIB`;
  return withWeekday ? `${get("weekday")}, ${text}` : text;
}

export function getWeekdayIndonesian(input) {
	if (!input) return null;
	const d = input instanceof Date ? input : new Date(input);
	if (isNaN(d)) return null;
	const dtf = new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: DEFAULT_TIME_ZONE, weekday: "long" });
	return dtf.format(d);
}

export function isValidDateValue(v) {
	if (v instanceof Date) return !isNaN(v);
	if (typeof v === "string" || typeof v === "number") {
		const d = new Date(v);
		return !isNaN(d);
	}
	return false;
}

export function isProbablyDateKey(key) {
	if (!key || typeof key !== "string") return false;
	if (key.endsWith("Formatted")) return false;
	// Common date key patterns
	return /(At|Date|Time|Timestamp)$/i.test(key) || ["timestamp"].includes(key);
}

// Deep-clone and add `<key>Formatted` for date-like fields, preserving originals
export function withFormattedDates(payload, { withSeconds = false, withDay = false } = {}) {
	if (payload == null) return payload;
	if (Array.isArray(payload)) return payload.map((v) => withFormattedDates(v, { withSeconds }));
	if (typeof payload !== "object") return payload;

	const out = Array.isArray(payload) ? [] : {};
	for (const [key, value] of Object.entries(payload)) {
		if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
			out[key] = withFormattedDates(value, { withSeconds });
		} else if (Array.isArray(value)) {
			out[key] = value.map((v) => withFormattedDates(v, { withSeconds }));
		} else {
			out[key] = value;
		}

		if (isProbablyDateKey(key) && isValidDateValue(value)) {
			const formatted = formatDateTimeJakarta(value, { withSeconds, withDay });
			if (formatted) {
				out[`${key}Formatted`] = formatted;
			}
		}
	}
	return out;
}

export default {
	formatDateTimeJakarta,
	getWeekdayIndonesian,
	withFormattedDates,
	isValidDateValue,
	isProbablyDateKey,
};

