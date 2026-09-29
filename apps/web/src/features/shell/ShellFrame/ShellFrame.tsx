import type { ReactNode } from "react";
import { PageTabsHost } from "../PageTabsHost";
import { ShellSidebar } from "../ShellSidebar";

export type ShellFrameProps = {
	children?: ReactNode;
};

// ShellFrame renders the static sidebar and main pane before route data arrives.
export function ShellFrame({ children }: ShellFrameProps) {
	return (
		<div data-shell-frame="" className="flex h-full bg-bg text-fg">
			<ShellSidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<PageTabsHost />
				<main className="page-inset flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
					{children ?? <div aria-hidden="true" className="page-card mt-13 flex-1" />}
				</main>
			</div>
		</div>
	);
}
