import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export type KbdProps = {
	children: ReactNode;
	// Ignored. Every key cap has one style, on a fill or off it.
	tone?: "default" | "inverse";
	// The Button names its key cap through aria-labelledby, so the cap takes
	// an id.
	id?: string;
	className?: string;
};

// A key cap: 18 px tall, 11 px mono, on the surface with the strong border.
// Every hint in the app draws this element: a row, a menu item, a command
// palette footer, and the shortcut inside a Button.
export function Kbd({ children, id, className }: KbdProps) {
	return (
		<kbd
			id={id}
			className={cx(
				"inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border-strong bg-surface px-1 font-mono text-xs leading-none text-fg-muted",
				className,
			)}
		>
			{children}
		</kbd>
	);
}
