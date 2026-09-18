import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { StackedBar, type StackedBarSegment } from "../StackedBar";

export type StackedBarListRow = {
	key: string;
	name: string;
	// A `Badge` after the name, such as Current.
	mark?: ReactNode;
	// The accessible name of the bar of the row.
	barLabel: string;
	segments: readonly StackedBarSegment[];
	// The text at the end of the row, such as `3/11`.
	valueLabel: string;
};

export type StackedBarListProps = {
	// The accessible name of the list.
	label: string;
	rows: readonly StackedBarListRow[];
	className?: string;
};

// One `StackedBar` line per part of a whole, such as the milestones of an
// epic: the name, the bar, and a value. The name column and the value column
// have one width on every row, so the bars start and end on one line. A bar
// has no legend here; the caller prints one legend for the whole list. Below
// 768 px the name takes the free width and the bar keeps a fixed width.
export function StackedBarList({ label, rows, className }: StackedBarListProps) {
	return (
		<ul aria-label={label} className={cx("flex flex-col gap-2", className)}>
			{rows.map((row) => (
				<li key={row.key} className="flex items-center gap-3 max-md:gap-2">
					<span className="flex w-60 min-w-0 shrink-0 items-center gap-2 max-md:w-auto max-md:flex-1 max-md:shrink">
						<span title={row.name} className="truncate text-sm text-fg">
							{row.name}
						</span>
						{row.mark}
					</span>
					<StackedBar
						label={row.barLabel}
						segments={row.segments}
						legend={false}
						className="flex-1 max-md:w-24 max-md:flex-none"
					/>
					<span className="w-12 shrink-0 text-sm text-fg-muted tabular">{row.valueLabel}</span>
				</li>
			))}
		</ul>
	);
}
