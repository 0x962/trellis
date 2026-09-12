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

// A key cap: 18 px tall, 11 px text, with the 3 px hairline corner. The cap
// takes its text, its border, and its fill from the color of the text
// around it. So one style reads on the page, in a menu, in a tooltip, and
// on every button fill, the silver primary and the red danger included.
// Every hint in the app draws this element: a row, a menu item, a command
// palette footer, and the shortcut inside a Button.
export function Kbd({ children, id, className }: KbdProps) {
	return (
		<kbd
			id={id}
			className={cx(
				"inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-hairline border border-current/25 bg-current/8 px-1 text-xs leading-none",
				className,
			)}
		>
			{children}
		</kbd>
	);
}
