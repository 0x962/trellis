import { cx } from "../../utils/cx";
import { Tooltip } from "../Tooltip";

export type ActivityDotProps = {
	label: string;
	// `corner` sits on the top right corner of a `relative` parent, with a
	// ring in the surface color that lifts it off an icon. `inline` takes its
	// own place in a row, such as a trailing slot, and needs no parent.
	placement?: "corner" | "inline";
	tone?: "accent" | "metal";
	tooltip?: boolean;
	focusable?: boolean;
};

export function ActivityDot({
	label,
	placement = "corner",
	tone = "accent",
	tooltip = true,
	focusable = true,
}: ActivityDotProps) {
	const dot = (
		<span
			role="img"
			aria-label={label}
			tabIndex={tooltip && focusable ? 0 : undefined}
			className={cx(
				"size-1.5 rounded-round",
				tone === "metal" ? "metal dot-metal" : "bg-accent",
				placement === "corner" ? "absolute -right-1 -top-1 ring-2 ring-surface" : "relative inline-block shrink-0",
			)}
		/>
	);
	return tooltip ? <Tooltip content={label}>{dot}</Tooltip> : dot;
}
