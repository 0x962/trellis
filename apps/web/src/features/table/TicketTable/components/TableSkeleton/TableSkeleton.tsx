import { Skeleton } from "@trellis/ui";
import type { Density } from "../../../../../stores/uiStore";
import { rowHeights } from "../../../rowHeights";

export type TableSkeletonProps = {
	density: Density;
};

// The title bar of each line, between 40% and 70% of the title cell, so the
// block reads as text and not as a grid.
const titleWidths = ["w-3/5", "w-2/5", "w-[70%]", "w-1/2", "w-[45%]", "w-[65%]", "w-2/5", "w-[55%]"];

// Row-shaped lines while the first page loads. Each line is a row's height,
// with a 64 px ID bar, so the rows replace them with no shift.
export function TableSkeleton({ density }: TableSkeletonProps) {
	return (
		<div aria-hidden="true" data-table-skeleton="">
			{titleWidths.map((width, line) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: the lines are a fixed list that never reorders.
					key={line}
					style={{ height: `${rowHeights[density]}px` }}
					className="flex items-center gap-3 border-b border-border px-5"
				>
					<Skeleton width="w-4" />
					<Skeleton width="w-16" />
					<div className="min-w-0 flex-1">
						<Skeleton width={width} />
					</div>
				</div>
			))}
		</div>
	);
}
