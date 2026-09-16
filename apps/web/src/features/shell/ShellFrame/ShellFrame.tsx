import type { ReactNode } from "react";
import { ShellSidebar } from "../ShellSidebar";

export type ShellFrameProps = {
	// What the main pane shows: nothing while a cold load waits, the error
	// state when the load failed.
	children?: ReactNode;
};

// The shell with no data in it: the sidebar header, the fixed rows,
// the Projects label, and an empty main pane. It reads no query, so it
// paints while the server is slow or down, and the page never flashes white.
export function ShellFrame({ children }: ShellFrameProps) {
	return (
		<div data-shell-frame="" className="flex h-full bg-bg text-fg">
			<ShellSidebar />
			<main className="page-inset flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
				{children ?? <div aria-hidden="true" className="page-card mt-13 flex-1" />}
			</main>
		</div>
	);
}
