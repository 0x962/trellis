import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type KbdProps = {
	children: ReactNode;
	// `inverse` is for a Kbd on a saturated fill, such as a primary Button.
	tone?: "default" | "inverse";
	className?: string;
};

// A key cap: mono, 10 px, with a heavier bottom edge.
export function Kbd({ children, tone = "default", className }: KbdProps) {
	return (
		<kbd
			className={cx(
				"inline-flex items-center rounded-sm border border-b-2 px-1 font-mono text-kbd",
				tone === "default"
					? "border-border bg-surface text-fg-muted"
					: "border-on-accent/40 bg-transparent text-on-accent",
				className,
			)}
		>
			{children}
		</kbd>
	);
}
