import { Link } from "@tanstack/react-router";
import { TrellisWordmark } from "@trellis/ui";
import { Inbox, List, Search } from "lucide-react";
import type { ReactNode } from "react";

export type ShellFrameProps = {
	// What the main pane shows: nothing while a cold load waits, the error
	// state when the load failed.
	children?: ReactNode;
};

const rows = [
	{ to: "/needs-you", label: "Needs you", icon: <Inbox /> },
	{ to: "/search", label: "Search", icon: <Search /> },
	{ to: "/all", label: "All tickets", icon: <List /> },
] as const;

// The shell with no data in it: the sidebar header, the three fixed rows,
// the Projects label, and an empty main pane. It reads no query, so it
// paints while the server is slow or down, and the page never flashes white.
export function ShellFrame({ children }: ShellFrameProps) {
	return (
		<div data-shell-frame="" className="flex h-full bg-bg text-fg">
			<aside
				aria-label="Sidebar"
				aria-busy="true"
				className="relative flex h-full w-60 shrink-0 flex-col gap-0.5 bg-bg px-2 py-2 text-base max-md:hidden after:pointer-events-none after:absolute after:top-11 after:right-0 after:bottom-0 after:w-px after:bg-border"
			>
				<div className="mb-1.5 flex h-7 items-center gap-2 pl-2">
					<TrellisWordmark className="h-4.5" />
				</div>
				{rows.map((row) => (
					<Link
						key={row.to}
						to={row.to}
						className="flex h-7 items-center gap-2 rounded-md px-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					>
						<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
							{row.icon}
						</span>
						<span className="flex-1 truncate">{row.label}</span>
					</Link>
				))}
				<div className="flex h-7 items-center pt-3 pb-1 pl-2 text-xs font-medium tracking-[0.04em] text-fg-faint uppercase">
					Projects
				</div>
			</aside>
			<main className="flex min-h-0 min-w-0 flex-1 flex-col bg-pane">{children}</main>
		</div>
	);
}
