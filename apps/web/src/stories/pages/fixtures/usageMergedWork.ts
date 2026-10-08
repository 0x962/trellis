import type { UsageMergedWork } from "@trellis/api";
import { usageMergedWork } from "./usage";

export const emptyMergedWork: UsageMergedWork = {
	computedAt: usageMergedWork.computedAt,
	buckets: usageMergedWork.buckets.map((bucket) => ({
		day: bucket.day,
		prs: 0,
		additions: 0,
		deletions: 0,
		missingAdditions: 0,
		missingDeletions: 0,
	})),
	totals: { prs: 0, additions: 0, deletions: 0, missingAdditions: 0, missingDeletions: 0 },
};
