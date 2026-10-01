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
	size?: "default" | "large";
};

export function StatTile({
	label,
	value,
	detail,
	valueClass = "text-fg",
	framed = false,
	className,
	size = "default",
}: StatTileProps) {
	return (
		<dl
			className={cx(
				"flex min-w-0 flex-col gap-0.5",
				framed && "rounded-lg border border-border p-4",
				size === "large" && "gap-1.5",
				className,
			)}
		>
			<dt className={cx("text-xs", size === "default" ? "truncate text-fg-faint" : "text-fg-muted")}>{label}</dt>
			<dd
				className={cx(
					"tabular",
					size === "large" ? "text-metric font-medium tracking-tight max-sm:text-2xl" : "text-xl font-semibold",
					valueClass,
				)}
			>
				{value}
			</dd>
			{detail !== undefined && (
				<dd className={cx("text-xs text-fg-muted tabular", size === "default" && "truncate")}>{detail}</dd>
			)}
		</dl>
	);
}
