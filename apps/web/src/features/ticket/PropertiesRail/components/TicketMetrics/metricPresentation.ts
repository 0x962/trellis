export type MetricRequestState = "pending" | "error" | "success";

export const metricText = (state: MetricRequestState, value: number | null, format: (value: number) => string) => {
	if (state === "pending") return "Load…";
	if (state === "error") return "Failed to load";
	if (value === null) return "Unavailable";
	return format(value);
};

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

export const ageRefreshDelay = (ageMs: number) => {
	const bucket = ageMs < minute ? second : ageMs < hour ? minute : ageMs < day ? hour : day;
	return bucket - (ageMs % bucket);
};
