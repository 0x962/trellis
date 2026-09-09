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

// The ribbon widths in px: `w-16` and `w-8` with the 4 px spacing token.
const widths = { full: 64, mini: 32 } as const;

// The gap between segments in px for a count of checks. A full ribbon keeps
// 2 px gaps up to 16 checks and 1 px gaps up to 32; a mini ribbon keeps 1 px
// gaps up to 16. Above that the segments touch, so the gaps never take the
// width the segments need.
const ribbonGap = (size: "full" | "mini", count: number) => {
	if (size === "mini") return count <= 16 ? 1 : 0;
	if (count <= 16) return 2;
	return count <= 32 ? 1 : 0;
};

// The width in px of one segment in a ribbon of `count` checks. A segment is
// at least 1 px wide, so a failed check stays visible at any count.
export const segmentWidth = (size: "full" | "mini", count: number) =>
	Math.max(1, (widths[size] - (count - 1) * ribbonGap(size, count)) / count);

const gaps = { 2: "gap-0.5", 1: "gap-px", 0: "gap-0" } as const;

const buckets: Record<CheckBucket, string> = {
	pass: "bg-success",
	fail: "bg-danger",
	skipping: "bg-warning",
	pending: "bg-border-strong ribbon-shimmer motion-reduce:animate-none",
};

// One segment per check, in order, colored by its bucket. A pending segment
// shimmers until the check settles. No checks means no ribbon. A segment is
// keyed by its position: GitHub check names repeat (one job in two
// workflows, a matrix re-run), and the position is what a segment stands for.
// The gap shrinks with the count (see `ribbonGap`), and a segment is at
// least 1 px wide, so a failed check stays visible at any count.
export function CheckRibbon({ checks, size = "full", className }: CheckRibbonProps) {
	if (checks.length === 0) return null;
	const count = checks.length === 1 ? "1 check" : `${checks.length} checks`;
	return (
		<span
			title={count}
			className={cx(
				"inline-flex shrink-0",
				size === "mini" ? "h-1.25 w-8" : "h-1.5 w-16",
				gaps[ribbonGap(size, checks.length)],
				className,
			)}
		>
			{checks.map((check, index) => (
				<i
					// biome-ignore lint/suspicious/noArrayIndexKey: the position is the segment's identity
					key={index}
					data-bucket={check.bucket}
					title={`${check.name}: ${check.bucket}`}
					className={cx("block min-w-px flex-1 rounded-hairline", buckets[check.bucket])}
				/>
			))}
		</span>
	);
}
