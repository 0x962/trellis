// The `tabular` utility from @trellis/ui fonts.css. Every count, time, and
// identifier carries it so columns line up.
export const tabularClass = "tabular";

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

export type LocalTimeOptions = { locale?: string; timeZone?: string };

const timeZoneOption = (timeZone: string | undefined) => (timeZone === undefined ? {} : { timeZone });
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatter = (name: string, options: LocalTimeOptions, format: Intl.DateTimeFormatOptions) => {
	const key = `${name}\0${options.locale ?? ""}\0${options.timeZone ?? ""}`;
	let cached = formatters.get(key);
	if (cached === undefined) {
		cached = new Intl.DateTimeFormat(options.locale, { ...format, ...timeZoneOption(options.timeZone) });
		formatters.set(key, cached);
	}
	return cached;
};

export const localClock = (iso: string, options: LocalTimeOptions = {}) =>
	formatter("clock", options, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).format(new Date(iso));

export const localDateTime = (iso: string, options: LocalTimeOptions = {}) =>
	formatter("date-time", options, {
		dateStyle: "full",
		timeStyle: "long",
	}).format(new Date(iso));

export const localDate = (iso: string, options: LocalTimeOptions = {}) =>
	formatter("date", options, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const shortDate = (iso: string) =>
	new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));

// The bucket label without a suffix: 12s, 5m, 3h, 3d.
const bucket = (elapsed: number) => {
	if (elapsed < minute) return `${Math.floor(elapsed / second)}s`;
	if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
	if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
	return `${Math.floor(elapsed / day)}d`;
};

// "just now" under 10 s, then "12s ago" up to 30 days, then a short date.
export const relativeTime = (iso: string, now = new Date()) => {
	const elapsed = now.getTime() - Date.parse(iso);
	if (elapsed < 10 * second) return "just now";
	if (elapsed >= 30 * day) return shortDate(iso);
	return `${bucket(elapsed)} ago`;
};

// The same buckets for a row: "now", "12s", "3d", "Jul 31".
export const compactRelativeTime = (iso: string, now = new Date()) => {
	const elapsed = now.getTime() - Date.parse(iso);
	if (elapsed < 10 * second) return "now";
	if (elapsed >= 30 * day) return shortDate(iso);
	return bucket(elapsed);
};

// Digits grouped in the browser locale: 1,234.
export const formatCount = (count: number) => new Intl.NumberFormat().format(count);
