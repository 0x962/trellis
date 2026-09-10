import type { ReactNode } from "react";

export type CommandFooterProps = {
	children: ReactNode;
};

// The hint bar under a Command list: one line. The hints keep their width,
// and the last hint truncates when the bar runs out of room.
export function CommandFooter({ children }: CommandFooterProps) {
	return (
		<div className="flex h-9 shrink-0 items-center gap-4 overflow-hidden border-t border-border px-3 text-sm whitespace-nowrap text-fg-faint *:shrink-0 *:last:min-w-0 *:last:shrink *:last:truncate">
			{children}
		</div>
	);
}
