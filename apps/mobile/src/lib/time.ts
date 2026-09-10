const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

// The bucket label of a row or a timeline line: "now" under 10 s, then
// "12s", "5m", "3h", "3d".
export const compactRelativeTime = (iso: string, now = Date.now()) => {
	const elapsed = now - Date.parse(iso);
	if (elapsed < 10 * second) return "now";
	if (elapsed < minute) return `${Math.floor(elapsed / second)}s`;
	if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
	if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
	return `${Math.floor(elapsed / day)}d`;
};
