import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

export function SessionStatusPaneShell({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<aside
			aria-label="Session status"
			className={cx(
				"order-none flex h-full min-h-0 w-93.5 shrink-0 flex-col border-s border-border bg-bg",
				"max-md:order-first max-md:h-auto max-md:max-h-130 max-md:w-full max-md:border-s-0 max-md:border-b",
				className,
			)}
		>
			{children}
		</aside>
	);
}
