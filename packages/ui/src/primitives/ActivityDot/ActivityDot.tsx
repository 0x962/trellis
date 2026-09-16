import { cx } from "../../utils/cx";

export type ActivityDotProps = {
	label: string;
	// `corner` sits on the top right corner of a `relative` parent, with a
	// ring in the surface color that lifts it off an icon. `inline` takes its
	// own place in a row, such as a trailing slot, and needs no parent.
	placement?: "corner" | "inline";
};

export function ActivityDot({ label, placement = "corner" }: ActivityDotProps) {
	return (
		<span
			role="img"
			aria-label={label}
			className={cx(
				"size-1.5 rounded-round bg-accent",
				placement === "corner" ? "absolute -right-1 -top-1 ring-2 ring-surface" : "inline-block shrink-0",
			)}
		/>
	);
}
