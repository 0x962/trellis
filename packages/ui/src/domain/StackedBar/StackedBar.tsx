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
	// The height of the bar: `md` is 12 px, `sm` is 6 px. A band that
	// carries its value in words next to the bar takes `sm`.
	size?: "sm" | "md";
	// False draws the bar alone. Each segment keeps its title, so the
	// values stay readable on hover.
	legend?: boolean;
	className?: string;
};

const barHeightClass = { sm: "h-1.5", md: "h-3" };

// One bar that shows how a total splits: each segment is as wide as its
// share, and the legend under it names each segment with its value and its
// share. A segment with no value is left out of the bar and the legend.
export function StackedBar({ label, segments, size = "md", legend = true, className }: StackedBarProps) {
	const total = segments.reduce((sum, segment) => sum + segment.value, 0);
	const present = segments.filter((segment) => segment.value > 0);
	return (
		<div className={cx("flex min-w-0 flex-col gap-2", className)}>
			<div
				role="img"
				aria-label={label}
				className={cx("flex w-full overflow-hidden rounded-hairline bg-elevated", barHeightClass[size])}
			>
				{present.map((segment) => (
					<span
						key={segment.key}
						data-segment={segment.key}
						title={`${segment.label}: ${segment.valueLabel}`}
						className={cx("block h-full", chartBgClass[segment.tone])}
						style={{ width: `${(100 * segment.value) / total}%` }}
					/>
				))}
			</div>
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
							<span className="text-fg-faint tabular">{Math.round((100 * segment.value) / total)}%</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
