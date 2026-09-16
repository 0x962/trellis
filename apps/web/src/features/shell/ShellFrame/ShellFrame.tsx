import type { ReactNode } from "react";
import { ShellSidebar } from "../ShellSidebar";

export type ShellFrameProps = {
	// children holds the main pane content. An omitted value shows the loading placeholder.
	children?: ReactNode;
};

// ShellFrame renders the static sidebar and main pane before route data arrives.
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
