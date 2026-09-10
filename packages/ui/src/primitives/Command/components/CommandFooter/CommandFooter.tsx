import type { ReactNode } from "react";

export type CommandFooterProps = {
	children: ReactNode;
};

// The hint bar under a Command list.
export function CommandFooter({ children }: CommandFooterProps) {
	return (
		<div className="flex h-9 shrink-0 items-center gap-4 border-t border-border px-3 text-sm text-fg-muted">
			{children}
		</div>
	);
}
