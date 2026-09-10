import { formatCount } from "../../../../../lib/format";
import { rowCap } from "../../../utils/listQuery";

export type CapBannerProps = {
	// Focuses the filter bar's Filter button.
	onNarrow: () => void;
};

// The line above the rows when the active pass stopped at the cap.
export function CapBanner({ onNarrow }: CapBannerProps) {
	return (
		<div
			data-cap-banner=""
			className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-warning-soft px-5 text-sm text-fg"
		>
			Showing the first {formatCount(rowCap)} tickets.
			{/* biome-ignore lint/a11y/useValidAnchor: The link moves focus to the table filter control. */}
			<a
				href="#filters"
				onClick={(event) => {
					event.preventDefault();
					onNarrow();
				}}
				className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
			>
				Narrow the filters
			</a>
			to see the rest.
		</div>
	);
}
