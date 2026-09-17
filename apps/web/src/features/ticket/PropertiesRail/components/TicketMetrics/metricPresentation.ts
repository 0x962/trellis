import { durationBucketMs } from "../../../../../lib/format";

export type MetricRequestState = "pending" | "error" | "success";

export const metricText = (state: MetricRequestState, value: number | null, format: (value: number) => string) => {
	if (state === "pending") return "Load…";
	if (state === "error") return "Failed to load";
	if (value === null) return "Unavailable";
	return format(value);
};

export const ageRefreshDelay = (ageMs: number) => {
	const bucketMs = durationBucketMs(ageMs);
	return bucketMs - (ageMs % bucketMs);
};
