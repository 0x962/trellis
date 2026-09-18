import { cx } from "@trellis/ui";
import type { ReactNode } from "react";

export type RowProps = {
	label: string;
	// `top` is for a value that takes several lines, such as the label pills.
	// The label then sits beside the first line of the value, and the value
	// keeps its lines. `center` holds a value of one line in the middle.
	align?: "center" | "top";
	children: ReactNode;
};

// One property: a 12 px muted label, then the value control. The row is
// at least 30 px tall, so a value that swaps for a picker moves nothing.
// Below 768 px the grid has two columns of about 180 px each, so the label
// takes 64 px, the value is 12 px, and a long value is cut at its column
// edge and never runs into the next column.
export function Row({ label, align = "center", children }: RowProps) {
	const top = align === "top";
	return (
		<div className={cx("flex min-h-7.5 min-w-0 gap-2 max-md:min-h-8", top ? "items-start" : "items-center")}>
			{/* The value of a `top` row is 28 px tall on its first line. The 6 px
			    of padding puts the 16 px line of the property name in the middle
			    of that first line. */}
			<dt className={cx("w-21 shrink-0 text-sm text-fg-muted max-md:w-16", top && "pt-1.5")}>{label}</dt>
			<dd
				className={cx(
					"flex min-w-0 flex-1 gap-2 text-base text-fg max-md:overflow-hidden max-md:text-sm",
					top ? "flex-wrap items-start" : "items-center",
				)}
			>
				{children}
			</dd>
		</div>
	);
}
