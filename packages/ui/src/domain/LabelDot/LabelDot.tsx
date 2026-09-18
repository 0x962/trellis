import { cx } from "../../utils/cx";
import type { LabelColor } from "../labelColors";

export type LabelDotProps = {
	color: LabelColor;
	// `dot` is the bare 8 px circle. `icon` centers the circle in a 14 px box.
	// An icon slot, such as the one of a `Command` row, a `Menu` item, or a
	// `Chip`, stretches its child to the slot size. The box takes that stretch,
	// so the circle stays 8 px.
	variant?: "dot" | "icon";
	className?: string;
};

// Tailwind finds a class only when the full name stands in the source, so
// each hue has its class written out.
const fills: Record<LabelColor, string> = {
	gray: "bg-label-gray",
	red: "bg-label-red",
	orange: "bg-label-orange",
	yellow: "bg-label-yellow",
	green: "bg-label-green",
	teal: "bg-label-teal",
	blue: "bg-label-blue",
	purple: "bg-label-purple",
	pink: "bg-label-pink",
};

// The color mark of a ticket label. The label name beside it tells a screen
// reader which label this is, so the mark itself stays hidden from it.
export function LabelDot({ color, variant = "dot", className }: LabelDotProps) {
	if (variant === "icon") {
		return (
			<span aria-hidden="true" className={cx("inline-grid size-3.5 shrink-0 place-items-center", className)}>
				<span className={cx("block size-2 rounded-round", fills[color])} />
			</span>
		);
	}
	return (
		<span aria-hidden="true" className={cx("inline-block size-2 shrink-0 rounded-round", fills[color], className)} />
	);
}
