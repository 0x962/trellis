import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type StatTileProps = {
	// The name of the measure, such as "CPU" or "API-rate cost".
	label: string;
	// The measure itself. It is already formatted, and it draws in tabular
	// figures so a column of tiles lines up.
	value: ReactNode;
	// One line under the value that qualifies it, such as the share of a
	// total or the count the value divides.
	detail?: ReactNode;
	// The color of the value. Pass a text utility to mark a state, such as
	// `text-danger` for a machine under memory pressure. The default is the
	// plain text color.
	valueClass?: string;
	// True draws the tile inside a card. False draws the same type on the
	// page ground, for a row of tiles that needs no frame of its own.
	framed?: boolean;
	className?: string;
};

// One measure: its name, the figure, and one line that qualifies it. Every
// statistic in trellis draws this tile, so two screens that report a number
// report it at one size and one weight.
export function StatTile({ label, value, detail, valueClass = "text-fg", framed = false, className }: StatTileProps) {
	return (
		<dl className={cx("flex min-w-0 flex-col gap-0.5", framed && "rounded-lg border border-border p-4", className)}>
			<dt className="truncate text-xs text-fg-faint">{label}</dt>
			<dd className={cx("text-xl font-semibold tabular", valueClass)}>{value}</dd>
			{detail !== undefined && <dd className="truncate text-xs text-fg-muted tabular">{detail}</dd>}
		</dl>
	);
}
