import { FlowArrow, GitPullRequest, ListBullets, MagnifyingGlass, Sparkle, Tray } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type ShellFrameProps = {
	// What the main pane shows: nothing while a cold load waits, the error
	// state when the load failed.
	children?: ReactNode;
};

const rows = [
	{ to: "/needs-you", label: "Needs you", icon: <Tray /> },
	{ to: "/search", label: "Search", icon: <MagnifyingGlass /> },
	{ to: "/all", label: "All tickets", icon: <ListBullets /> },
	{ to: "/reviews", label: "Pull requests", icon: <GitPullRequest /> },
	{ to: "/ai/personas", label: "Personas", icon: <Sparkle /> },
	{ to: "/ai/flows", label: "Flows", icon: <FlowArrow /> },
] as const;

// The shell with no data in it: the sidebar header, the fixed rows,
// the Projects label, and an empty main pane. It reads no query, so it
// paints while the server is slow or down, and the page never flashes white.
export function ShellFrame({ children }: ShellFrameProps) {
	return (
		<div data-shell-frame="" className="flex h-full bg-bg text-fg">
			<aside
				aria-label="Sidebar"
				aria-busy="true"
				className="relative flex h-full w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-surface px-2 pb-2 text-sm max-md:hidden"
			>
				{/* The loaded sidebar puts its collapse button in a row of this
				    height, so the rows below stay in place when it replaces this frame. */}
				<div className="mb-1 h-13 shrink-0" />
				{rows.map((row) => (
					<Link
						key={row.to}
						to={row.to}
						className="flex h-8 items-center gap-2 rounded-md px-2 text-fg-muted transition-colors duration-hover ease-out hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
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
			<main className="page-inset flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
				{children ?? <div aria-hidden="true" className="page-card mt-13 flex-1" />}
			</main>
		</div>
	);
}
