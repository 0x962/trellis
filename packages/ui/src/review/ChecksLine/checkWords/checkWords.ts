import type { CheckStatus } from "../../CheckStatusIcon";

export type ChecksLineBucket = "pass" | "fail" | "pending" | "cancel" | "skipping";

export type ChecksLineCheck = {
	key?: string;
	name: string;
	workflow: string | null;
	bucket: ChecksLineBucket;
	link: string | null;
	status?: CheckStatus;
};

type WordBucket = ChecksLineBucket | "unknown";

export const checkDisplay: ReadonlyArray<{
	status: CheckStatus;
	bucket: ChecksLineBucket;
	label: string;
	countAs: WordBucket;
	summaryOrder: number | null;
	defaultForBucket: boolean;
}> = [
	{ status: "failed", bucket: "fail", label: "Failed", countAs: "fail", summaryOrder: 0, defaultForBucket: true },
	{
		status: "running",
		bucket: "pending",
		label: "In progress",
		countAs: "pending",
		summaryOrder: null,
		defaultForBucket: false,
	},
	{
		status: "pending",
		bucket: "pending",
		label: "Pending",
		countAs: "pending",
		summaryOrder: 1,
		defaultForBucket: true,
	},
	{
		status: "canceled",
		bucket: "cancel",
		label: "Canceled",
		countAs: "cancel",
		summaryOrder: 2,
		defaultForBucket: true,
	},
	{
		status: "unknown",
		bucket: "pending",
		label: "Unknown",
		countAs: "unknown",
		summaryOrder: 3,
		defaultForBucket: false,
	},
	{
		status: "neutral",
		bucket: "skipping",
		label: "Neutral",
		countAs: "skipping",
		summaryOrder: null,
		defaultForBucket: false,
	},
	{
		status: "success",
		bucket: "pass",
		label: "Passed",
		countAs: "pass",
		summaryOrder: 4,
		defaultForBucket: true,
	},
	{
		status: "skipped",
		bucket: "skipping",
		label: "Skipped",
		countAs: "skipping",
		summaryOrder: 5,
		defaultForBucket: true,
	},
];

export const displayOf = (check: ChecksLineCheck) =>
	checkDisplay.find((display) =>
		check.status === undefined
			? display.defaultForBucket && display.bucket === check.bucket
			: display.status === check.status,
	)!;

export function checkWords(checks: readonly ChecksLineCheck[]): string {
	const counts = new Map<WordBucket, number>();
	for (const check of checks) {
		const bucket = displayOf(check).countAs;
		counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
	}
	return checkDisplay
		.filter((display) => display.summaryOrder !== null && counts.has(display.countAs))
		.sort((a, b) => a.summaryOrder! - b.summaryOrder!)
		.map((display) => `${counts.get(display.countAs)} ${display.label.toLowerCase()}`)
		.join(" · ");
}
