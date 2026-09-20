import type { Check, CheckBucket } from "@trellis/api";

const bucketOrder: readonly CheckBucket[] = ["fail", "pending", "cancel", "pass", "skipping"];

const bucketWords: Record<CheckBucket, string> = {
	pass: "passed",
	fail: "failed",
	pending: "pending",
	cancel: "canceled",
	skipping: "skipped",
};

export function checkWords(checks: readonly Pick<Check, "bucket">[]): string {
	const counts: Record<CheckBucket, number> = {
		pass: 0,
		fail: 0,
		pending: 0,
		cancel: 0,
		skipping: 0,
	};
	for (const check of checks) counts[check.bucket] += 1;
	return bucketOrder
		.flatMap((bucket) => (counts[bucket] === 0 ? [] : [`${counts[bucket]} ${bucketWords[bucket]}`]))
		.join(" · ");
}
