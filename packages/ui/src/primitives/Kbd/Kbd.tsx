import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type KbdProps = {
	children: ReactNode;
	// Ignored. Every key cap has one style, on a fill or off it.
	tone?: "default" | "inverse";
	className?: string;
};

// A key cap: 18 px tall, 11 px mono, on the surface with the strong border.
// The cap keeps its own surface, so it reads the same inside a primary
// button as it does in a menu.
export function Kbd({ children, className }: KbdProps) {
	return (
		<kbd
			className={cx(
				"inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border-strong bg-surface px-1 font-mono text-xs leading-none text-fg-muted",
				className,
			)}
		>
			{children}
		</kbd>
	);
}
