import { cx } from "../../utils/cx";
import { type Check, type CheckBucket, checkCountWords, type RibbonSize, ribbonGap, ribbonSegments } from "./segments";

export type { Check, CheckBucket };

export type CheckRibbonProps = {
	checks: readonly Check[];
	// The 192 px `wide` ribbon fits a PR row. Cards use `full` at 64 px or `mini` at 32 px.
	size?: RibbonSize;
	className?: string;
};

const gaps = { 2: "gap-0.5", 1: "gap-px", 0: "gap-0" } as const;

const buckets: Record<CheckBucket, string> = {
	pass: "bg-success",
	fail: "bg-danger",
	cancel: "bg-danger",
	skipping: "bg-warning",
	pending: "bg-border-strong ribbon-shimmer motion-reduce:animate-none",
};

// The segments of `ribbonSegments`, in order, colored by bucket. A pending
// segment shimmers until the check settles. No checks means no ribbon. The
// box keeps its width and clips, so a ribbon never reaches its neighbour. A
// segment is keyed by its position, because GitHub check names repeat (one
// job in two workflows, a matrix re-run). The position is what a segment
// stands for.
export function CheckRibbon({ checks, size = "full", className }: CheckRibbonProps) {
	if (checks.length === 0) return null;
	const count = checks.length === 1 ? "1 check" : `${checks.length} checks`;
	const label = `${count}: ${checkCountWords(checks)}`;
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={cx(
				"inline-flex shrink-0 overflow-hidden",
				size === "mini" ? "h-1.25 w-8" : size === "wide" ? "h-1.5 w-48" : "h-1.5 w-16",
				gaps[ribbonGap(size, checks.length)],
				className,
			)}
		>
			{ribbonSegments(size, checks).map((segment, index) => (
				<i
					// biome-ignore lint/suspicious/noArrayIndexKey: the position is the segment's identity
					key={index}
					data-bucket={segment.bucket}
					title={segment.title}
					style={{ width: segment.width }}
					className={cx("block shrink-0 rounded-hairline", buckets[segment.bucket])}
				/>
			))}
		</span>
	);
}
