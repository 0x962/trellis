import type { CheckStatus } from "../../CheckStatusIcon";

export type ChecksLineBucket = "pass" | "fail" | "pending" | "cancel" | "skipping";

export type ChecksLineCheck = {
	key?: string;
	name: string;
	workflow: string | null;
	bucket: ChecksLineBucket;
	link: string | null;
	status?: CheckStatus;
	required?: boolean;
	// When GitHub started the check and when it ended. A check that still
	// runs, and a check the poller read before it stored these two times,
	// carry null and print no duration.
	startedAt?: string | null;
	endedAt?: string | null;
};

type WordBucket = ChecksLineBucket | "unknown";

export const checkDisplay: ReadonlyArray<{
	status: CheckStatus;
	bucket: ChecksLineBucket;
	label: string;
	countAs: WordBucket;
	summaryOrder: number | null;
	defaultForBucket: boolean;
	outcome: string;
}> = [
	{
		status: "failed",
		bucket: "fail",
		label: "Failed",
		countAs: "fail",
		summaryOrder: 0,
		defaultForBucket: true,
		outcome: "Failing",
	},
	{
		status: "running",
		bucket: "pending",
		label: "In progress",
		countAs: "pending",
		summaryOrder: null,
		defaultForBucket: false,
		outcome: "In progress",
	},
	{
		status: "pending",
		bucket: "pending",
		label: "Queued",
		countAs: "pending",
		summaryOrder: 1,
		defaultForBucket: true,
		outcome: "Queued",
	},
	{
		status: "skipped",
		bucket: "skipping",
		label: "Skipped",
		countAs: "skipping",
		summaryOrder: 2,
		defaultForBucket: true,
		outcome: "Skipped",
	},
	{
		status: "neutral",
		bucket: "skipping",
		label: "Neutral",
		countAs: "skipping",
		summaryOrder: null,
		defaultForBucket: false,
		outcome: "Neutral",
	},
	{
		status: "success",
		bucket: "pass",
		label: "Successful",
		countAs: "pass",
		summaryOrder: 3,
		defaultForBucket: true,
		outcome: "Successful",
	},
	{
		status: "canceled",
		bucket: "cancel",
		label: "Canceled",
		countAs: "cancel",
		summaryOrder: 4,
		defaultForBucket: true,
		outcome: "Canceled",
	},
	{
		status: "unknown",
		bucket: "pending",
		label: "Unknown",
		countAs: "unknown",
		summaryOrder: 5,
		defaultForBucket: false,
		outcome: "Unknown",
	},
];

export const displayOf = (check: ChecksLineCheck) =>
	checkDisplay.find((display) =>
		check.status === undefined
			? display.defaultForBucket && display.bucket === check.bucket
			: display.status === check.status,
	)!;

const wordForCount = (bucket: WordBucket, count: number) => {
	if (bucket === "fail") return "failing";
	if (bucket === "pending") return "in progress";
	if (bucket === "pass") return count === 1 ? "successful check" : "successful checks";
	if (bucket === "skipping") return count === 1 ? "skipped" : "skipped";
	if (bucket === "cancel") return count === 1 ? "canceled" : "canceled";
	return "unknown";
};

export function checkWords(checks: readonly ChecksLineCheck[]): string {
	const counts = new Map<WordBucket, number>();
	for (const check of checks) {
		const bucket = displayOf(check).countAs;
		counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
	}
	return checkDisplay
		.filter((display) => display.summaryOrder !== null && counts.has(display.countAs))
		.sort((a, b) => a.summaryOrder! - b.summaryOrder!)
		.map((display) => {
			const count = counts.get(display.countAs)!;
			return `${count} ${wordForCount(display.countAs, count)}`;
		})
		.join(", ");
}
