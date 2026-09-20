import type { Check, CheckBucket } from "@trellis/api";
import type { CheckStatus } from "@trellis/ui/review";

type WordBucket = CheckBucket | "unknown";
type CheckWithStatus = Pick<Check, "bucket"> & { status?: CheckStatus };

const bucketOrder: readonly WordBucket[] = ["fail", "pending", "cancel", "unknown", "pass", "skipping"];

const bucketWords: Record<WordBucket, string> = {
	pass: "passed",
	fail: "failed",
	pending: "pending",
	cancel: "canceled",
	unknown: "unknown",
	skipping: "skipped",
};

export function checkWords(checks: readonly CheckWithStatus[]): string {
	const counts: Record<WordBucket, number> = {
		pass: 0,
		fail: 0,
		pending: 0,
		cancel: 0,
		unknown: 0,
		skipping: 0,
	};
	for (const check of checks) counts[check.status === "unknown" ? "unknown" : check.bucket] += 1;
	return bucketOrder
		.flatMap((bucket) => (counts[bucket] === 0 ? [] : [`${counts[bucket]} ${bucketWords[bucket]}`]))
		.join(" · ");
}
