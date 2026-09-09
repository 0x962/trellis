import { cx } from "../../utils/cx";

export type CheckBucket = "pass" | "fail" | "pending" | "skipping";

export type Check = {
	name: string;
	bucket: CheckBucket;
};

export type CheckRibbonProps = {
	checks: readonly Check[];
	// `mini` is the 32 px ribbon on a row or a card; `full` is 64 px on a PR row.
	size?: "full" | "mini";
	className?: string;
};

const buckets: Record<CheckBucket, string> = {
	pass: "bg-success",
	fail: "bg-danger",
	skipping: "bg-warning",
	pending: "bg-border-strong ribbon-shimmer motion-reduce:animate-none",
};

// One segment per check, in order, colored by its bucket. A pending segment
// shimmers until the check settles. No checks means no ribbon.
export function CheckRibbon({ checks, size = "full", className }: CheckRibbonProps) {
	if (checks.length === 0) return null;
	const count = checks.length === 1 ? "1 check" : `${checks.length} checks`;
	return (
		<span
			title={count}
			className={cx("inline-flex shrink-0", size === "mini" ? "h-1.25 w-8 gap-px" : "h-1.5 w-16 gap-0.5", className)}
		>
			{checks.map((check) => (
				<i
					key={check.name}
					data-bucket={check.bucket}
					title={`${check.name}: ${check.bucket}`}
					className={cx("block flex-1 rounded-hairline", buckets[check.bucket])}
				/>
			))}
		</span>
	);
}
