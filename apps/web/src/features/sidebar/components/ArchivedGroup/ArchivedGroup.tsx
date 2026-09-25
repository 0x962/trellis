import { ArchivedToggle } from "@trellis/ui";
import { type ReactNode, useState } from "react";

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
			<ArchivedToggle expanded={open} onExpandedChange={setOpen} semantics="expanded" count={count} className="pl-2" />
			{open && children}
		</nav>
	);
}
