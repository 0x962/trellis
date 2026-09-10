import { Skeleton } from "@trellis/ui";
import type { Density } from "../../../../../stores/uiStore";
import { rowHeights } from "../../../Row";

export type TableSkeletonProps = {
	density: Density;
};

const lines = [0, 1, 2, 3, 4, 5, 6, 7];

// Row-shaped lines while the first page loads. Each line is a row's height,
// so the rows replace them with no shift.
export function TableSkeleton({ density }: TableSkeletonProps) {
	return (
		<div aria-hidden="true">
			{lines.map((line) => (
				<div
					key={line}
					style={{ height: `${rowHeights[density]}px` }}
					className="flex items-center gap-3 border-b border-border px-5"
				>
					<Skeleton width="w-4" />
					<Skeleton width="w-16" />
					<Skeleton width="w-1/2" />
				</div>
			))}
		</div>
	);
}
