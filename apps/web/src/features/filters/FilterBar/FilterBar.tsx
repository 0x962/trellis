import type { ReactNode } from "react";

export type FilterBarProps = {
	// The chips: the scope chip, then one chip per active filter.
	children?: ReactNode;
	// The controls on the right: Copy as CLI, Display.
	actions?: ReactNode;
};

// The row of filter chips under the topbar. `g s` focuses it through
// `data-filter-bar`.
export function FilterBar({ children, actions }: FilterBarProps) {
	return (
		<div
			data-filter-bar=""
			tabIndex={-1}
			className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
		>
			{children}
			{actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
		</div>
	);
}
