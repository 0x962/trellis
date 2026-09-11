import type { ReactNode } from "react";

export type RowProps = {
	label: string;
	children: ReactNode;
};

// One property: a 12 px muted label, then the value control. The row is
// at least 30 px tall, so a value that swaps for a picker moves nothing.
// Below 768 px the grid has two columns of about 180 px each, so the label
// takes 64 px, the value is 12 px, and a long value is cut at its column
// edge and never runs into the next column.
export function Row({ label, children }: RowProps) {
	return (
		<div className="flex min-w-0 min-h-7.5 items-center gap-2 max-md:min-h-8">
			<dt className="w-21 shrink-0 text-sm text-fg-muted max-md:w-16">{label}</dt>
			<dd className="flex min-w-0 flex-1 items-center gap-2 text-base text-fg max-md:overflow-hidden max-md:text-sm">
				{children}
			</dd>
		</div>
	);
}
