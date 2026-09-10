import type { ReactNode } from "react";

export type RowProps = {
	label: string;
	children: ReactNode;
};

// One property: a 12 px muted label, then the value control. The row is
// at least 30 px tall, so a value that swaps for a picker moves nothing.
export function Row({ label, children }: RowProps) {
	return (
		<div className="flex min-h-7.5 items-center gap-2">
			<dt className="w-21 shrink-0 text-sm text-fg-muted">{label}</dt>
			<dd className="flex min-w-0 flex-1 items-center gap-2 text-base text-fg">{children}</dd>
		</div>
	);
}
