import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { formatCount } from "../../../../lib/format";

export type ArchivedGroupProps = {
	// The name of the region for a screen reader, such as "Archived projects".
	label: string;
	count: number;
	// The rows of the group. The projects section draws a tree, and the
	// sessions section draws a flat list, so each caller writes its own list.
	children: ReactNode;
};

// The Archived row at the foot of a sidebar section, and the rows it holds.
// The row prints how many rows the group holds, and a press opens it.
export function ArchivedGroup({ label, count, children }: ArchivedGroupProps) {
	const [open, setOpen] = useState(false);
	return (
		<nav aria-label={label} className="pt-1">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="sidebar-row w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg active:bg-elevated focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				<span aria-hidden="true" className="sidebar-leading text-fg-faint *:size-3">
					{open ? <CaretDown /> : <CaretRight />}
				</span>
				<span className="sidebar-label">Archived</span>
				<span className="sidebar-trailing text-fg-faint">{formatCount(count)}</span>
			</button>
			{open && children}
		</nav>
	);
}
