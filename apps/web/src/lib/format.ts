import { shortDay } from "@trellis/api";

// The `tabular` utility from @trellis/ui fonts.css. Every count, time, and
// identifier carries it so columns line up.
export const tabularClass = "tabular";

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

// The display bucket of one elapsed time: 1s under a minute, then 1m,
// 1h, and 1d. The duration label and the age refresh timer share it, so
// a bucket change moves both together.
export const durationBucketMs = (elapsed: number) =>
	elapsed < minute ? second : elapsed < hour ? minute : elapsed < day ? hour : day;
// The bucket label without a suffix: 12s, 5m, 3h, 3d.
const bucket = (elapsed: number) => {
	const bucketMs = durationBucketMs(elapsed);
	const unit = bucketMs === second ? "s" : bucketMs === minute ? "m" : bucketMs === hour ? "h" : "d";
	return `${Math.floor(elapsed / bucketMs)}${unit}`;
};

export const formatDuration = (elapsed: number) => bucket(elapsed);

// "just now" under 10 s, then "12s ago" up to 30 days, then a short date.
export const relativeTime = (iso: string, now = new Date()) => {
	const elapsed = now.getTime() - Date.parse(iso);
	if (elapsed < 10 * second) return "just now";
	if (elapsed >= 30 * day) return shortDay(iso);
	return `${bucket(elapsed)} ago`;
};

// The same buckets for a row: "now", "12s", "3d", "Jul 31".
export const compactRelativeTime = (iso: string, now = new Date()) => {
	const elapsed = now.getTime() - Date.parse(iso);
	if (elapsed < 10 * second) return "now";
	if (elapsed >= 30 * day) return shortDay(iso);
	return bucket(elapsed);
};

// Digits grouped in the browser locale: 1,234.
export const formatCount = (count: number) => new Intl.NumberFormat().format(count);
