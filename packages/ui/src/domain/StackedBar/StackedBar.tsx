import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";
import { type ChartTone, chartBgClass, chartToneClass } from "../chartTones";

export type StackedBarSegment = {
	key: string;
	label: string;
	value: number;
	// The formatted value, printed in the legend.
	valueLabel: string;
	tone: ChartTone;
};

export type StackedBarProps = {
	// The accessible name of the bar.
	label: string;
	segments: readonly StackedBarSegment[];
	// The height of the bar: `sm` is 6 px, `md` is 12 px.
	size?: "sm" | "md";
	// False draws the bar alone.
	legend?: boolean;
	className?: string;
};

const barHeightClass = { sm: "h-1.5", md: "h-3" };

// The share of a segment that the legend prints. A segment the bar draws
// holds more than nothing, so a share under half a percent prints "<1%"
// and never "0%".
const formatShare = (value: number, total: number) => {
	const share = (100 * value) / total;
	return share < 0.5 ? "<1%" : `${Math.round(share)}%`;
};

// One bar that shows how a total splits: each segment is as wide as its
// share, and the legend under it names each segment with its value and its
// share. A segment with no value is left out of the bar and the legend.
export function StackedBar({ label, segments, size = "md", legend = true, className }: StackedBarProps) {
	const total = segments.reduce((sum, segment) => sum + segment.value, 0);
	const present = segments.filter((segment) => segment.value > 0);
	const bar = (
		<Tooltip
			content={label}
			description={
				<span className="flex flex-col gap-1">
					{present.map((segment) => (
						<span key={segment.key} className="flex items-center justify-between gap-4">
							<span className="truncate">{segment.label}</span>
							<span className="shrink-0 tabular">{segment.valueLabel}</span>
						</span>
					))}
				</span>
			}
			className="w-56"
		>
			<div
				role="img"
				aria-label={label}
				className={cx("flex w-full overflow-hidden rounded-hairline bg-elevated", barHeightClass[size])}
			>
				{present.map((segment) => (
					<span
						key={segment.key}
						data-segment={segment.key}
						className={cx("block h-full", chartBgClass[segment.tone])}
						style={{ width: `${(100 * segment.value) / total}%` }}
					/>
				))}
			</div>
		</Tooltip>
	);
	return (
		<div className={cx("flex min-w-0 flex-col gap-2", className)}>
			{bar}
			{legend && (
				<ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
					{present.map((segment) => (
						<li key={segment.key} className="inline-flex items-center gap-1.5 text-fg-muted">
							<span
								aria-hidden="true"
								className={cx("inline-block size-2 shrink-0 rounded-hairline bg-current", chartToneClass[segment.tone])}
							/>
							{segment.label}
							<span className="text-fg tabular">{segment.valueLabel}</span>
							<span className="text-xs text-fg-faint tabular">{formatShare(segment.value, total)}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
