import type { ReactNode } from "react";
export function FilterBar({ filters, children }: { filters?: ReactNode; children: ReactNode }) {
	return (
		<div data-filter-bar="" className="contents">
			{filters}
			<div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div>
		</div>
	);
}
