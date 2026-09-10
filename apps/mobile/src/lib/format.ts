const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

const shortDate = (iso: string) =>
	new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));

// The bucket label: 12s, 9m, 2h, 1d.
const bucket = (elapsed: number) => {
	if (elapsed < minute) return `${Math.floor(elapsed / second)}s`;
	if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
	if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
	return `${Math.floor(elapsed / day)}d`;
};

// The time on a row: "now" under 10 s, then the bucket up to 30 days, then
// a short date.
export const compactRelativeTime = (iso: string, now: Date = new Date()): string => {
	const elapsed = now.getTime() - Date.parse(iso);
	if (elapsed < 10 * second) return "now";
	if (elapsed >= 30 * day) return shortDate(iso);
	return bucket(elapsed);
};

// Digits grouped in the device locale: 1,234.
export const formatCount = (count: number): string => new Intl.NumberFormat().format(count);
