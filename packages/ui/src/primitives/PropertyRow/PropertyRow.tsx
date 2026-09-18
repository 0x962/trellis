import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type PropertyRowProps = {
	label: string;
	children: ReactNode;
	// The ticket properties rail sets this. Below 768 px that rail is a grid
	// of two columns of about 180 px, so the label takes 64 px, the value
	// is 12 px, and a long value is cut at its column edge.
	compact?: boolean;
	// "start" puts the label beside the first line of a value that wraps.
	// The 7 px of padding keep a one-line value where "center" draws it.
	align?: "center" | "start";
};

// One property in a definition list: a 12 px muted label of 84 px, then
// the value. The row is at least 30 px tall, so a value that swaps for a
// picker moves nothing.
export function PropertyRow({ label, children, compact = false, align = "center" }: PropertyRowProps) {
	return (
		<div
			className={cx(
				"flex min-w-0 gap-2",
				align === "center" ? "min-h-7.5 items-center" : "items-start py-1.75",
				compact && "max-md:min-h-8",
			)}
		>
			<dt className={cx("w-21 shrink-0 text-sm text-fg-muted", compact && "max-md:w-16")}>{label}</dt>
			<dd
				className={cx(
					"flex min-w-0 flex-1 items-center gap-2 text-base text-fg",
					compact && "max-md:overflow-hidden max-md:text-sm",
				)}
			>
				{children}
			</dd>
		</div>
	);
}
